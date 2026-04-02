"""
ARIA v4 — FastAPI Gateway
Central hub: receives wearable data, manual logs, and report extractions
from Person B, then merges everything into a unified patient profile JSON.

Runs on port 8000.
Exposes patient profile to:
  - Federated Learning (local)
  - Causal Inference Engine (Person B at port 8001)
  - ARIA Brain (local)
  - Frontend (Person C)
"""

import httpx
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from dotenv import load_dotenv
import uvicorn

load_dotenv()

app = FastAPI(title="ARIA Gateway", version="1.0")

# ─────────────────────────────────────────────
# CORS — allow Person C's Next.js frontend
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

WEARABLE_URL = "http://localhost:8002/wearable/current"

# ─────────────────────────────────────────────
# IN-MEMORY STORE
# (replace with a DB if time permits)
# ─────────────────────────────────────────────
patient_store: dict = {}      # patient_id → full profile
history_store: dict = {}      # patient_id → list of last 30 days logs

# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────

class ManualLog(BaseModel):
    patient_id: str
    medication_taken: bool
    mood: int                        # 1-5
    pain_level: int                  # 1-10
    activity_done: Optional[str]     # e.g. "walked 10 mins"
    symptoms: Optional[List[str]]    # e.g. ["dizziness", "fatigue"]
    notes: Optional[str]

class ReportExtraction(BaseModel):
    """Received from Person B after they extract from PDF/image via Claude API."""
    patient_id: str
    report_type: str                 # blood, ecg, prescription, radiology, discharge
    extracted_values: dict           # free-form key-value from Claude extraction
    extracted_at: str

class PatientProfile(BaseModel):
    patient_id: str

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def init_patient(patient_id: str):
    """Create a blank patient profile if not exists."""
    if patient_id not in patient_store:
        patient_store[patient_id] = {
            "patient_id": patient_id,
            "last_updated": datetime.now().isoformat(),
            "vitals": {},
            "activity": {},
            "medications": {
                "taken_today": False,
                "adherence_streak": 0,
                "supply_days_remaining": 30,
            },
            "symptoms": [],
            "mood": None,
            "pain_level": None,
            "reports": [],
            "history_30days": [],
        }
    if patient_id not in history_store:
        history_store[patient_id] = []

def snapshot_to_history(patient_id: str):
    """Save current profile snapshot into 30-day history."""
    if patient_id not in patient_store:
        return
    snapshot = {
        "timestamp": datetime.now().isoformat(),
        **patient_store[patient_id],
    }
    history_store[patient_id].append(snapshot)
    # Keep only last 30 days worth (assuming ~48 snapshots/day = 1440)
    history_store[patient_id] = history_store[patient_id][-1440:]

# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ARIA Gateway running", "port": 8000}


@app.post("/log/manual")
def receive_manual_log(log: ManualLog):
    """
    Receives manual logs from Person B's form.
    Updates patient profile with mood, pain, medication, symptoms.
    """
    init_patient(log.patient_id)
    profile = patient_store[log.patient_id]

    profile["medications"]["taken_today"] = log.medication_taken
    if log.medication_taken:
        profile["medications"]["adherence_streak"] += 1
    else:
        profile["medications"]["adherence_streak"] = 0

    profile["mood"] = log.mood
    profile["pain_level"] = log.pain_level
    profile["symptoms"] = log.symptoms or []
    profile["last_updated"] = datetime.now().isoformat()

    if log.activity_done:
        profile["activity"]["latest_logged"] = log.activity_done

    snapshot_to_history(log.patient_id)

    return {"status": "manual log received", "patient_id": log.patient_id}


@app.post("/log/report")
def receive_report_extraction(report: ReportExtraction):
    """
    Receives extracted report values from Person B.
    Appends to patient's reports list.
    """
    init_patient(report.patient_id)
    profile = patient_store[report.patient_id]

    profile["reports"].append({
        "report_type": report.report_type,
        "extracted_values": report.extracted_values,
        "extracted_at": report.extracted_at,
    })
    # Keep last 10 reports
    profile["reports"] = profile["reports"][-10:]
    profile["last_updated"] = datetime.now().isoformat()

    snapshot_to_history(report.patient_id)

    return {"status": "report received", "patient_id": report.patient_id}


@app.get("/patient/{patient_id}/profile")
async def get_patient_profile(patient_id: str):
    """
    Core endpoint — returns unified patient profile JSON.
    Fetches latest wearable data and merges with stored profile.
    Called by: Federated Learning, ARIA Brain, Person B's causal engine, Person C's frontend.
    """
    init_patient(patient_id)
    profile = patient_store[patient_id]

    # Pull latest wearable data
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(WEARABLE_URL, timeout=3.0)
            wearable = resp.json()
            profile["vitals"] = {
                "heart_rate_bpm": wearable.get("heart_rate_bpm"),
                "calories_burned": wearable.get("calories_burned"),
                "sleep_hours": wearable.get("sleep_hours"),
            }
            profile["activity"] = {
                **profile.get("activity", {}),
                "step_count": wearable.get("step_count"),
                "activity_type": wearable.get("activity_type"),
                "inactivity_timer_seconds": wearable.get("inactivity_timer_seconds"),
                "inactivity_alert": wearable.get("inactivity_alert"),
            }
    except Exception:
        # Wearable simulator not running — use last known values
        pass

    profile["history_30days"] = history_store.get(patient_id, [])[-30:]
    profile["last_updated"] = datetime.now().isoformat()

    return profile


@app.get("/patient/{patient_id}/inactivity")
async def get_inactivity(patient_id: str):
    """Quick check — is this patient inactive for too long?"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "http://localhost:8002/wearable/inactivity", timeout=3.0
            )
            return resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Wearable simulator not reachable")


@app.get("/patients")
def list_patients():
    """List all active patient IDs."""
    return {"patients": list(patient_store.keys())}


# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("🚀 ARIA Gateway starting on port 8000...")
    print("📡 Key endpoints:")
    print("   POST /log/manual              → receive manual logs from Person B")
    print("   POST /log/report              → receive report extractions from Person B")
    print("   GET  /patient/{id}/profile    → unified patient profile JSON")
    print("   GET  /patient/{id}/inactivity → inactivity alert status")
    print("   GET  /patients                → list all patients")
    uvicorn.run(app, host="0.0.0.0", port=8000)
