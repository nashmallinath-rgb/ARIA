import json
import os
import requests
from datetime import datetime

ALERTS_FILE = "alerts.json"
WEARABLE_URL = "http://localhost:8002/wearable/inactivity"

def load_alerts():
    if os.path.exists(ALERTS_FILE):
        with open(ALERTS_FILE, "r") as f:
            return json.load(f)
    return {"alerts": []}

def save_alerts(data):
    with open(ALERTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def check_inactivity():
    try:
        response = requests.get(WEARABLE_URL, timeout=3)
        wearable = response.json()
    except Exception:
        wearable = {
            "inactivity_timer_seconds": 0,
            "inactivity_alert": False,
            "last_active_at": datetime.now().isoformat()
        }

    inactive_seconds = wearable.get("inactivity_timer_seconds", 0)
    inactive_hours = inactive_seconds / 3600
    alert_triggered = wearable.get("inactivity_alert", False)

    if alert_triggered or inactive_hours >= 4:
        level = "emergency"
        message = f"CRITICAL: Patient inactive for {inactive_hours:.1f} hours. Hospital notified."
        action = "notify_hospital"
    elif inactive_hours >= 2:
        level = "warning"
        message = f"WARNING: Patient inactive for {inactive_hours:.1f} hours. Caregiver notified."
        action = "notify_caregiver"
    else:
        level = "normal"
        message = f"Patient active. Last active: {wearable.get('last_active_at', 'unknown')}"
        action = "none"

    alert_entry = {
        "type": "inactivity",
        "level": level,
        "message": message,
        "action": action,
        "inactive_hours": round(inactive_hours, 2),
        "timestamp": datetime.now().isoformat()
    }

    if level != "normal":
        data = load_alerts()
        data["alerts"].append(alert_entry)
        save_alerts(data)

    return alert_entry

def trigger_risk_spike(risk_score: float, anomalies: list, patient_id: str):
    if risk_score >= 0.85:
        level = "emergency"
        message = f"EMERGENCY: Risk score {risk_score} critical. Anomalies: {', '.join(anomalies)}"
        action = "emergency_flag"
    elif risk_score >= 0.7:
        level = "high"
        message = f"HIGH RISK: Score {risk_score}. Anomalies: {', '.join(anomalies)}. Family notified."
        action = "notify_family"
    else:
        level = "moderate"
        message = f"Moderate risk: Score {risk_score}. Monitoring increased."
        action = "increase_monitoring"

    alert_entry = {
        "type": "risk_spike",
        "level": level,
        "risk_score": risk_score,
        "anomalies": anomalies,
        "patient_id": patient_id,
        "message": message,
        "action": action,
        "timestamp": datetime.now().isoformat()
    }

    data = load_alerts()
    data["alerts"].append(alert_entry)
    save_alerts(data)

    return alert_entry

def get_alert_history():
    data = load_alerts()
    alerts = data.get("alerts", [])
    return sorted(alerts, key=lambda x: x["timestamp"], reverse=True)[:20]