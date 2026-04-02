import uvicorn
import math
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any

# Import your logic
from aria_brain import ARIABrain
from causal_engine import compute_query, get_dag, recommend_appointment
from patient_store import (
    load_profile, save_profile, add_log, check_refill_alerts,
    init_medicines, get_medicines, update_medicine_action
)
from alerts import check_inactivity
from reminders import schedule_reminder, get_pending_reminders, respond_reminder
from report_extract import extract_report_from_values

app = FastAPI(title="ARIA Master Unified Backend", version="8.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════
# PYDANTIC MODELS — all fields Optional where
# safe so no validation errors on partial POSTs
# ═══════════════════════════════════════════════

# Shared config: ignore unknown fields, never fail on missing ones
class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")

class ManualLog(_Base):
    medication_taken: Optional[bool] = None
    medication_name: Optional[str] = None
    mood: Optional[int] = None
    pain_level: Optional[int] = None
    activity_done: Optional[str] = None
    symptoms: Optional[List[str]] = []

class ReportExtract(_Base):
    raw_text: Optional[str] = None
    hba1c: Optional[float] = None
    creatinine: Optional[float] = None
    blood_pressure_systolic: Optional[float] = None
    blood_pressure_diastolic: Optional[float] = None
    cholesterol: Optional[float] = None
    hemoglobin: Optional[float] = None
    blood_glucose: Optional[float] = None
    notes: Optional[str] = None

class CausalQuery(_Base):
    treatment: Optional[str] = "ARIA"
    outcome: Optional[str] = "independence_score"
    confounders: Optional[List[str]] = []

class RefillRisk(_Base):
    medicine: Optional[str] = None
    days_remaining: Optional[int] = None

class AppointmentRecommend(_Base):
    risk_score: Optional[float] = None
    anomalies: Optional[List[str]] = []
    root_cause: Optional[str] = None

class MedicineInit(_Base):
    medicines: Optional[List[dict]] = []

class MedicineAction(_Base):
    medicine_name: Optional[str] = None
    action: Optional[str] = None   # "taken" | "snooze" | "skip"

class ReminderSchedule(_Base):
    medicine_name: Optional[str] = None
    time: Optional[str] = None
    dose: Optional[str] = None

class ReminderRespond(_Base):
    reminder_id: Optional[str] = None
    action: Optional[str] = None   # "taken" | "snooze" | "skip"

class RiskSpikeAlert(_Base):
    risk_score: Optional[float] = None
    reason: Optional[str] = None
    notify_family: Optional[bool] = False


# ═══════════════════════════════════════════════
# HELPER — safe ITE extraction
# ═══════════════════════════════════════════════

def _safe_ite(causal: dict) -> float:
    val = causal.get("ite", 0.18)
    if not isinstance(val, (int, float)) or math.isnan(val):
        return 0.18
    return round(float(val), 4)


# ═══════════════════════════════════════════════
# 1. CORE STATUS
# ═══════════════════════════════════════════════

@app.get("/status")
async def get_status():
    """Quick health-check — is ARIA alive?"""
    return {"status": "ok", "version": "8.0", "service": "ARIA Master Backend"}


@app.get("/aria/status")
async def get_aria_status():
    """Full patient + AI status payload consumed by the dashboard."""
    try:
        profile = load_profile()
        causal = compute_query(profile, "Control", "ARIA")
        ite_val = _safe_ite(causal)
        brain = ARIABrain()

        return {
            "summary": {
                "message": brain.synthesize(ite_val, profile),
                "patient_id": profile.get("patient_id"),
                "age": profile.get("age"),
                "living_situation": profile.get("living_situation"),
            },
            "causal_analysis": {
                "ite_score": ite_val,
                "predicted_independence": causal.get("counterfactual_outcome"),
                "root_cause": causal.get("root_cause"),
                "reasoning": causal.get("reasoning"),
            },
            "health_matrix": {
                "vitals": {
                    "mood": profile.get("mood"),
                    "pain": profile.get("pain_level"),
                    "cognitive": profile.get("cognitive_score"),
                    "mental_health": profile.get("mental_health_score"),
                },
                "activity": {
                    "steps": profile.get("activity_level"),
                    "mobility": profile.get("mobility_score"),
                    "sleep": profile.get("sleep_hours"),
                },
            },
            "clinical_record": {
                "medications": profile.get("medications", []),
                "current_symptoms": profile.get("symptoms", []),
                "lab_results": profile.get("last_report", {}),
                "history_logs": profile.get("logs", []),
            },
            "alerts": {
                "refills": check_refill_alerts(),
                "inactivity": check_inactivity(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 2. LOGGING
# ═══════════════════════════════════════════════

@app.post("/log/manual")
async def post_manual_log(log: Optional[ManualLog] = Body(default=None)):
    """Receives manual health logs from the frontend."""
    try:
        data = log.dict(exclude_none=True) if log else {}
        if data:
            add_log(data)
        return {"status": "success", "message": "Log updated in profile"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/report/extract")
async def extract_report(report: Optional[ReportExtract] = Body(default=None)):
    """
    Receives lab values from the frontend manual entry form.
    Flags out-of-range values and saves to patient profile.
    """
    try:
        values = report.dict(exclude_none=True) if report else {}
        result = extract_report_from_values(values)
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 3. CAUSAL ENGINE
# ═══════════════════════════════════════════════

@app.get("/causal/status")
async def get_causal_status():
    """Returns current causal inference output for the loaded patient."""
    try:
        profile = load_profile()
        causal = compute_query(profile, "Control", "ARIA")
        ite_val = _safe_ite(causal)
        return {
            "status": "ok",
            "ite_score": ite_val,
            "root_cause": causal.get("root_cause"),
            "best_intervention": causal.get("best_intervention"),
            "counterfactual_outcome": causal.get("counterfactual_outcome"),
            "reasoning": causal.get("reasoning"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/causal/dag")
async def get_causal_dag():
    """Returns the causal DAG structure for visualization."""
    try:
        return get_dag()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/causal/query")
async def post_causal_query(query: Optional[CausalQuery] = Body(default=None)):
    """Run a custom causal query with specified treatment/outcome."""
    try:
        profile = load_profile()
        treatment = query.treatment if query else "ARIA"
        outcome = query.outcome if query else "independence_score"
        causal = compute_query(profile, treatment, outcome)
        ite_val = _safe_ite(causal)
        return {
            "status": "ok",
            "treatment": treatment,
            "outcome": outcome,
            "ite_score": ite_val,
            "root_cause": causal.get("root_cause"),
            "counterfactual_outcome": causal.get("counterfactual_outcome"),
            "reasoning": causal.get("reasoning"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/causal/refill_risk")
async def post_refill_risk(body: Optional[RefillRisk] = Body(default=None)):
    """
    Predicts the causal risk increase if a specific medicine runs out.
    """
    try:
        profile = load_profile()
        medicine = (body.medicine if body else None) or "Unknown"
        days = (body.days_remaining if body else None)
        if days is None:
            days = 5

        # Run causal query treating medication disruption as intervention
        causal = compute_query(profile, "Control", "ARIA")
        ite_val = _safe_ite(causal)

        # Simple urgency mapping
        if days <= 2:
            urgency = "critical"
            risk_increase = round(ite_val * 1.8, 3)
        elif days <= 5:
            urgency = "high"
            risk_increase = round(ite_val * 1.2, 3)
        else:
            urgency = "moderate"
            risk_increase = round(ite_val * 0.6, 3)

        return {
            "medicine": medicine,
            "days_remaining": days,
            "predicted_risk_increase": risk_increase,
            "urgency": urgency,
            "reasoning": (
                f"Based on causal model: disrupting {medicine} is predicted "
                f"to increase patient risk by {risk_increase:.2f} points. "
                f"ITE baseline: {ite_val}."
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 4. APPOINTMENT MANAGER
# ═══════════════════════════════════════════════

@app.post("/appointment/recommend")
async def post_appointment_recommend(body: Optional[AppointmentRecommend] = Body(default=None)):
    """Auto-generate specialist appointment recommendation."""
    try:
        profile = load_profile()
        causal = compute_query(profile, "Control", "ARIA")
        risk = (body.risk_score if body else None)
        if risk is None:
            risk = _safe_ite(causal)
        result = recommend_appointment(
            risk_score=risk,
            anomalies=(body.anomalies if body else None) or [],
            root_cause=(body.root_cause if body else None) or causal.get("root_cause", "Unknown"),
            patient_profile=profile
        )
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 5. MEDICINE TRACKER
# ═══════════════════════════════════════════════

@app.post("/medicines/init")
async def post_init_medicines(body: Optional[MedicineInit] = Body(default=None)):
    """Initialize or reset the patient's medicine schedule."""
    try:
        medicines = (body.medicines if body else None) or []
        result = init_medicines(medicines)
        return {"status": "success", "medicines_loaded": len(result), "medicines": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/medicines")
async def get_all_medicines():
    """Get the current medicine list with status, streaks, supply."""
    try:
        return {"status": "ok", "medicines": get_medicines()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/medicines/action")
async def post_medicine_action(body: Optional[MedicineAction] = Body(default=None)):
    """Mark a medicine as taken / snoozed / skipped."""
    try:
        medicine_name = body.medicine_name if body else None
        action = body.action if body else None
        if not medicine_name:
            raise HTTPException(status_code=400, detail="medicine_name is required")
        if action not in ("taken", "snooze", "skip"):
            raise HTTPException(status_code=400, detail="action must be 'taken', 'snooze', or 'skip'")
        result = update_medicine_action(medicine_name, action)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Medicine '{body.medicine_name}' not found")
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/medicines/refill-alerts")
async def get_medicine_refill_alerts():
    """Returns medicines with 5 or fewer days of supply remaining."""
    try:
        alerts = check_refill_alerts()
        return {"status": "ok", "alerts": alerts, "count": len(alerts)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 6. REMINDERS
# ═══════════════════════════════════════════════

@app.post("/reminders/schedule")
async def post_schedule_reminder(body: Optional[ReminderSchedule] = Body(default=None)):
    """Create a new medicine reminder."""
    try:
        result = schedule_reminder(
            medicine_name=(body.medicine_name if body else None) or "",
            time=(body.time if body else None) or "",
            dose=(body.dose if body else None) or ""
        )
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/reminders/pending")
async def get_pending():
    """Get all pending (unfired or snoozed) reminders."""
    try:
        reminders = get_pending_reminders()
        return {"status": "ok", "reminders": reminders, "count": len(reminders)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reminders/respond")
async def post_reminder_respond(body: Optional[ReminderRespond] = Body(default=None)):
    """Respond to a reminder — taken / snooze / skip."""
    try:
        reminder_id = body.reminder_id if body else None
        action = body.action if body else None
        if not reminder_id:
            raise HTTPException(status_code=400, detail="reminder_id is required")
        if action not in ("taken", "snooze", "skip"):
            raise HTTPException(status_code=400, detail="action must be 'taken', 'snooze', or 'skip'")
        result = respond_reminder(reminder_id, action)
        return {"status": "ok", **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# 7. ALERTS
# ═══════════════════════════════════════════════

@app.get("/alerts/inactivity")
async def get_inactivity_alert():
    """Check if patient has been inactive beyond threshold."""
    try:
        result = check_inactivity()
        return {"status": "ok", "inactivity": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/alerts/risk-spike")
async def post_risk_spike(body: Optional[RiskSpikeAlert] = Body(default=None)):
    """Manually fire a risk spike alert (e.g. from federated model)."""
    try:
        profile = load_profile()
        risk = (body.risk_score if body else None) or 0.0
        reason = (body.reason if body else None) or "Risk spike detected"
        notify_family = (body.notify_family if body else None) or False

        alert_level = (
            "emergency" if risk >= 0.85
            else "high" if risk >= 0.65
            else "moderate"
        )

        alert = {
            "alert_level": alert_level,
            "risk_score": risk,
            "reason": reason,
            "patient_id": profile.get("patient_id"),
            "notify_family": notify_family or (risk >= 0.65),
            "message": (
                f"⚠️ Risk spike for patient {profile.get('patient_id')}: "
                f"{reason} (score: {risk:.2f})"
            ),
        }

        # Log alert into profile history
        logs = profile.get("alert_history", [])
        from datetime import datetime
        logs.append({**alert, "timestamp": datetime.now().isoformat()})
        profile["alert_history"] = logs[-50:]   # keep last 50
        save_profile(profile)

        return {"status": "ok", "alert": alert}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/alerts/history")
async def get_alert_history():
    """Returns the last 50 alerts fired for this patient."""
    try:
        profile = load_profile()
        history = profile.get("alert_history", [])
        return {"status": "ok", "alerts": history, "count": len(history)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════

if __name__ == "__main__":
    print("🚀 ARIA UNIFIED MASTER v8.0 STARTING ON PORT 8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)