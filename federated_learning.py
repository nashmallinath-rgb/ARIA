"""
ARIA v4 — Federated Learning (No Ray)
Manual FedAvg | Opacus | 4 hospital nodes | Differential Privacy
Works on Python 3.14. No ray required.
Exposes results via FastAPI on port 8003.
"""

import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from opacus import PrivacyEngine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import threading
import copy
import warnings
warnings.filterwarnings("ignore")

NUM_NODES       = 4
NUM_ROUNDS      = 5
EPOCHS_PER_NODE = 2
BATCH_SIZE      = 16
LEARNING_RATE   = 0.001
MAX_GRAD_NORM   = 1.0
TARGET_EPSILON  = 3.0
TARGET_DELTA    = 1e-5
DATA_PATH       = "data/synthetic_dataset.csv"

FEATURES = [
    "age", "fall_history", "comorbidity_count",
    "sleep_hours", "medication_adherence", "activity_level",
    "social_interactions", "cognitive_score",
    "mobility_score", "mental_health_score",
]
TARGET = "safety_incident"

fl_results = {
    "status": "not_started",
    "rounds_completed": 0,
    "epsilon": None,
    "risk_score": None,
    "anomaly_flags": [],
    "deterioration_flag": False,
    "confidence": None,
    "trend_direction": None,
    "accuracy": None,
}

class RiskModel(nn.Module):
    def __init__(self, input_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )
    def forward(self, x):
        return self.net(x).squeeze()

def fedavg(global_weights, local_weights_list, data_sizes):
    total = sum(data_sizes)
    avg_weights = []
    for layer_idx in range(len(global_weights)):
        layer_avg = sum(
            local_weights_list[i][layer_idx] * (data_sizes[i] / total)
            for i in range(len(local_weights_list))
        )
        avg_weights.append(layer_avg)
    return avg_weights

def get_weights(model):
    return [val.cpu().detach().numpy().copy() for val in model.state_dict().values()]

def set_weights(model, weights):
    state_dict = model.state_dict()
    for key, val in zip(state_dict.keys(), weights):
        state_dict[key] = torch.tensor(val.copy())
    model.load_state_dict(state_dict)

def load_and_split():
    df = pd.read_csv(DATA_PATH)
    df = df[FEATURES + [TARGET]].dropna()
    X = df[FEATURES].values.astype(np.float32)
    y = df[TARGET].values.astype(np.float32)
    scaler = StandardScaler()
    X = scaler.fit_transform(X)
    splits = np.array_split(np.arange(len(X)), NUM_NODES)
    node_data = []
    for idx in splits:
        X_node, y_node = X[idx], y[idx]
        X_tr, X_val, y_tr, y_val = train_test_split(
            X_node, y_node, test_size=0.2, random_state=42
        )
        node_data.append((X_tr, X_val, y_tr, y_val))
    return node_data, scaler, df

def train_node(node_id, global_model, X_train, y_train):
    model = copy.deepcopy(global_model)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    criterion = nn.BCELoss()
    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train))
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    model.train()  # must be in train mode BEFORE Opacus wraps it
    privacy_engine = PrivacyEngine()
    model, optimizer, train_loader = privacy_engine.make_private_with_epsilon(
        module=model,
        optimizer=optimizer,
        data_loader=train_loader,
        epochs=EPOCHS_PER_NODE * NUM_ROUNDS,
        target_epsilon=TARGET_EPSILON,
        target_delta=TARGET_DELTA,
        max_grad_norm=MAX_GRAD_NORM,
    )
    for _ in range(EPOCHS_PER_NODE):
        for X_batch, y_batch in train_loader:
            optimizer.zero_grad()
            preds = model(X_batch)
            loss = criterion(preds, y_batch)
            loss.backward()
            optimizer.step()
    epsilon = privacy_engine.get_epsilon(TARGET_DELTA)
    print(f"  [Node {node_id}] ε = {epsilon:.2f} | Samples: {len(X_train)}")
    return get_weights(model), len(X_train), round(epsilon, 3)

def evaluate_global(model, X_val, y_val):
    model.eval()
    criterion = nn.BCELoss()
    val_ds = TensorDataset(torch.tensor(X_val), torch.tensor(y_val))
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)
    correct, total, total_loss = 0, 0, 0.0
    with torch.no_grad():
        for X_batch, y_batch in val_loader:
            preds = model(X_batch)
            loss = criterion(preds, y_batch)
            total_loss += loss.item()
            predicted = (preds > 0.5).float()
            correct += (predicted == y_batch).sum().item()
            total += len(y_batch)
    return correct / total, total_loss / len(val_loader)

def run_federated_learning():
    global fl_results
    fl_results["status"] = "training"
    print("\n🏥 ARIA Federated Learning — 4 Hospital Nodes")
    print(f"   Rounds: {NUM_ROUNDS} | ε target: {TARGET_EPSILON}\n")

    node_data, scaler, df = load_and_split()
    global_model = RiskModel(input_dim=len(FEATURES))
    global_weights = get_weights(global_model)
    losses_per_round = []
    last_epsilon = None
    last_acc = 0.0

    for round_num in range(1, NUM_ROUNDS + 1):
        print(f"🔄 Round {round_num}/{NUM_ROUNDS}")
        local_weights_list, data_sizes, epsilons = [], [], []

        for node_id in range(NUM_NODES):
            X_tr, _, y_tr, _ = node_data[node_id]
            set_weights(global_model, global_weights)
            weights, n, eps = train_node(node_id, global_model, X_tr, y_tr)
            local_weights_list.append(weights)
            data_sizes.append(n)
            epsilons.append(eps)

        global_weights = fedavg(global_weights, local_weights_list, data_sizes)
        set_weights(global_model, global_weights)
        last_epsilon = max(epsilons)

        X_val = node_data[0][1]
        y_val = node_data[0][3]
        last_acc, loss = evaluate_global(global_model, X_val, y_val)
        losses_per_round.append(loss)
        fl_results["rounds_completed"] = round_num
        fl_results["epsilon"] = last_epsilon
        print(f"   ✅ Round {round_num} | Acc: {last_acc:.3f} | Loss: {loss:.4f} | ε: {last_epsilon}\n")

    global_model.eval()
    sample = df[FEATURES].mean().values.astype(np.float32)
    sample_scaled = scaler.transform([sample])[0]
    sample_tensor = torch.tensor(sample_scaled.astype(np.float32)).unsqueeze(0)
    with torch.no_grad():
        risk = global_model(sample_tensor).item()

    anomaly_flags = []
    if df["medication_adherence"].mean() < 0.6:
        anomaly_flags.append("low_medication_adherence")
    if df["sleep_hours"].mean() < 5.5:
        anomaly_flags.append("poor_sleep")
    if df["activity_level"].mean() < 3.0:
        anomaly_flags.append("low_activity")
    if risk > 0.7:
        anomaly_flags.append("high_risk_score")

    trend = "improving" if losses_per_round[-1] < losses_per_round[0] else "stable"

    fl_results.update({
        "status": "complete",
        "risk_score": round(risk, 4),
        "anomaly_flags": anomaly_flags,
        "deterioration_flag": risk > 0.65,
        "confidence": round(last_acc, 4),
        "trend_direction": trend,
        "accuracy": round(last_acc, 4),
        "epsilon": last_epsilon,
    })

    print("🎉 Federated Learning complete!")
    print(f"   Risk Score:    {fl_results['risk_score']}")
    print(f"   Anomalies:     {fl_results['anomaly_flags']}")
    print(f"   Deterioration: {fl_results['deterioration_flag']}")
    print(f"   Confidence:    {fl_results['confidence']}")
    print(f"   Epsilon (DP):  {fl_results['epsilon']}")
    print(f"   Trend:         {fl_results['trend_direction']}")

api = FastAPI(title="ARIA Federated Learning", version="1.0")
api.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@api.get("/fl/results")
def get_fl_results():
    return fl_results

@api.post("/fl/run")
def trigger_fl():
    if fl_results["status"] == "training":
        return {"status": "already_training"}
    thread = threading.Thread(target=run_federated_learning, daemon=True)
    thread.start()
    return {"status": "started"}

@api.get("/fl/health")
def fl_health():
    return {"status": "running", "port": 8003}

if __name__ == "__main__":
    fl_thread = threading.Thread(target=run_federated_learning, daemon=True)
    fl_thread.start()
    print("📡 FL API on port 8003:")
    print("   GET  /fl/results → outputs")
    print("   POST /fl/run     → retrain")
    uvicorn.run(api, host="0.0.0.0", port=8003)
