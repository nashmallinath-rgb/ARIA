import json
import os
from datetime import datetime

STORE_FILE = "patient_profile.json"

def load_profile():
    if os.path.exists(STORE_FILE):
        with open(STORE_FILE, "r") as f:
            return json.load(f)
    return {
        "patient_id": "P0001",
        "age": 72,
        "gender": "female",
        "living_situation": "alone",
        "fall_history": 1,
        "comorbidity_count": 2,
        "sleep_hours": 6.5,
        "medication_adherence": 0.8,
        "activity_level": 3000,
        "social_interactions": 4,
        "cognitive_score": 7.0,
        "mobility_score": 6.5,
        "mental_health_score": 6.8,
        "medications": [],
        "symptoms": [],
        "mood": None,
        "pain_level": None,
        "logs": []
    }

def save_profile(profile):
    with open(STORE_FILE, "w") as f:
        json.dump(profile, f, indent=2)

def add_log(entry: dict):
    profile = load_profile()
    entry["timestamp"] = datetime.now().isoformat()
    profile["logs"].append(entry)
    profile.update({k: v for k, v in entry.items() 
                   if k in profile and k != "timestamp"})
    save_profile(profile)
    return profile
# ── Medicine Tracker ─────────────────────────────────────────────

def init_medicines(medicines: list):
    """Load medicines from simulator/manual log into profile."""
    profile = load_profile()
    profile["medications"] = []
    for med in medicines:
        profile["medications"].append({
            "name": med["name"],
            "dose": med.get("dose", ""),
            "schedule_times": med.get("schedule_times", []),
            "supply_days": med.get("supply_days", 30),
            "streak": 0,
            "taken_today": [],
            "snoozed_until": None,
            "missed_today": [],
            "status": "pending"
        })
    save_profile(profile)
    return profile["medications"]

def get_medicines():
    profile = load_profile()
    return profile.get("medications", [])

def update_medicine_action(medicine_name: str, action: str):
    """
    action: 'taken' | 'snooze' | 'skip'
    """
    profile = load_profile()
    medicines = profile.get("medications", [])
    now = datetime.now()
    result = None

    for med in medicines:
        if med["name"].lower() == medicine_name.lower():
            if action == "taken":
                med["status"] = "taken"
                med["taken_today"].append(now.isoformat())
                med["supply_days"] = max(0, med["supply_days"] - 1)
                med["streak"] += 1
                result = {
                    "status": "taken",
                    "message": f"✅ {med['name']} marked as taken!",
                    "streak": med["streak"],
                    "supply_days": med["supply_days"],
                    "refill_alert": med["supply_days"] <= 5
                }

            elif action == "snooze":
                from datetime import timedelta
                med["status"] = "snoozed"
                med["snoozed_until"] = (now + timedelta(minutes=30)).isoformat()
                result = {
                    "status": "snoozed",
                    "message": f"⏰ Reminder snoozed 30 mins for {med['name']}",
                    "snoozed_until": med["snoozed_until"]
                }

            elif action == "skip":
                med["status"] = "skipped"
                med["missed_today"].append(now.isoformat())
                med["streak"] = 0  # reset streak on skip
                missed_count = len(med["missed_today"])
                result = {
                    "status": "skipped",
                    "message": f"❌ {med['name']} skipped.",
                    "missed_today": missed_count,
                    "caregiver_alert": missed_count >= 2  # flag if missed 2+ today
                }
            break

    save_profile(profile)
    return result

def check_refill_alerts():
    """Returns medicines with 5 or fewer days supply."""
    medicines = get_medicines()
    alerts = []
    for med in medicines:
        if med["supply_days"] <= 5:
            alerts.append({
                "name": med["name"],
                "supply_days": med["supply_days"],
                "urgency": "critical" if med["supply_days"] <= 2 else "low"
            })
    return alerts