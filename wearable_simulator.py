"""
ARIA v4 — Wearable Data Simulator
Simulates a real-time wearable feed for elderly patient monitoring.
Outputs: heart_rate, step_count, sleep_hours, calories_burned,
         activity_type, inactivity_timer
Updates every 30 seconds. Exposes via FastAPI.
"""

import random
import time
import threading
from datetime import datetime, timedelta
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="ARIA Wearable Simulator", version="1.0")

# ─────────────────────────────────────────────
# PATIENT CONFIG (simulate one elderly patient)
# ─────────────────────────────────────────────
PATIENT_ID = "patient_001"
INACTIVITY_ALERT_THRESHOLD_SECONDS = 4 * 60 * 60  # 4 hours = alert

# ─────────────────────────────────────────────
# SHARED STATE (updated by background thread)
# ─────────────────────────────────────────────
wearable_state = {
    "patient_id": PATIENT_ID,
    "timestamp": datetime.now().isoformat(),
    "heart_rate_bpm": 72,
    "step_count": 0,
    "sleep_hours": 0.0,
    "calories_burned": 0,
    "activity_type": "resting",
    "inactivity_timer_seconds": 0,
    "inactivity_alert": False,
    "last_active_at": datetime.now().isoformat(),
}

# ─────────────────────────────────────────────
# ACTIVITY PROFILES (realistic for elderly)
# ─────────────────────────────────────────────
ACTIVITY_PROFILES = {
    "sleeping": {
        "heart_rate": (52, 62),
        "steps_per_tick": (0, 0),
        "calories_per_tick": (1, 2),
    },
    "resting": {
        "heart_rate": (65, 78),
        "steps_per_tick": (0, 10),
        "calories_per_tick": (2, 4),
    },
    "light_walking": {
        "heart_rate": (78, 95),
        "steps_per_tick": (40, 80),
        "calories_per_tick": (5, 9),
    },
    "moderate_activity": {
        "heart_rate": (95, 118),
        "steps_per_tick": (80, 130),
        "calories_per_tick": (10, 16),
    },
}

# Weighted schedule: elderly patients mostly rest/sleep
ACTIVITY_WEIGHTS = {
    "sleeping": 0.30,
    "resting": 0.45,
    "light_walking": 0.20,
    "moderate_activity": 0.05,
}

def pick_activity():
    activities = list(ACTIVITY_WEIGHTS.keys())
    weights = list(ACTIVITY_WEIGHTS.values())
    return random.choices(activities, weights=weights, k=1)[0]

def add_anomaly(heart_rate: int) -> int:
    """Occasionally inject a realistic anomaly (e.g., brief tachycardia)."""
    if random.random() < 0.04:  # 4% chance per tick
        return heart_rate + random.randint(20, 40)
    return heart_rate

# ─────────────────────────────────────────────
# BACKGROUND SIMULATION THREAD
# ─────────────────────────────────────────────
def simulate_wearable():
    global wearable_state

    # Seed realistic daily sleep hours (generated once per day in real use)
    sleep_hours = round(random.uniform(4.5, 8.5), 1)
    step_accumulator = 0
    calorie_accumulator = 0

    while True:
        activity = pick_activity()
        profile = ACTIVITY_PROFILES[activity]

        # Generate vitals
        hr = random.randint(*profile["heart_rate"])
        hr = add_anomaly(hr)
        steps_this_tick = random.randint(*profile["steps_per_tick"])
        cals_this_tick = random.randint(*profile["calories_per_tick"])

        step_accumulator += steps_this_tick
        calorie_accumulator += cals_this_tick

        # Inactivity tracking
        is_active = steps_this_tick > 5 or activity in ("light_walking", "moderate_activity")

        if is_active:
            wearable_state["last_active_at"] = datetime.now().isoformat()
            wearable_state["inactivity_timer_seconds"] = 0
            wearable_state["inactivity_alert"] = False
        else:
            last_active = datetime.fromisoformat(wearable_state["last_active_at"])
            inactive_duration = (datetime.now() - last_active).total_seconds()
            wearable_state["inactivity_timer_seconds"] = int(inactive_duration)
            wearable_state["inactivity_alert"] = inactive_duration >= INACTIVITY_ALERT_THRESHOLD_SECONDS

        # Update shared state
        wearable_state.update({
            "timestamp": datetime.now().isoformat(),
            "heart_rate_bpm": hr,
            "step_count": step_accumulator,
            "sleep_hours": sleep_hours,
            "calories_burned": calorie_accumulator,
            "activity_type": activity,
        })

        print(
            f"[{wearable_state['timestamp']}] "
            f"HR: {hr} bpm | Steps: {step_accumulator} | "
            f"Activity: {activity} | Inactive: {wearable_state['inactivity_timer_seconds']}s | "
            f"Alert: {wearable_state['inactivity_alert']}"
        )

        time.sleep(30)  # tick every 30 seconds

# Start simulator in background
thread = threading.Thread(target=simulate_wearable, daemon=True)
thread.start()

# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/wearable/current")
def get_current_wearable():
    """Returns the latest wearable snapshot."""
    return wearable_state

@app.get("/wearable/inactivity")
def get_inactivity_status():
    """Returns just inactivity info — used by alert system."""
    return {
        "patient_id": wearable_state["patient_id"],
        "inactivity_timer_seconds": wearable_state["inactivity_timer_seconds"],
        "inactivity_alert": wearable_state["inactivity_alert"],
        "last_active_at": wearable_state["last_active_at"],
        "threshold_seconds": INACTIVITY_ALERT_THRESHOLD_SECONDS,
    }

@app.get("/wearable/health")
def health_check():
    return {"status": "running", "patient_id": PATIENT_ID}

# ─────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("🩺 ARIA Wearable Simulator starting...")
    print("📡 Endpoints:")
    print("   GET /wearable/current     → full wearable snapshot")
    print("   GET /wearable/inactivity  → inactivity alert status")
    print("   GET /wearable/health      → health check")
    uvicorn.run(app, host="0.0.0.0", port=8002)
