import json
import os
import uuid
from datetime import datetime, timedelta

REMINDERS_FILE = "reminders.json"


def load_reminders():
    if os.path.exists(REMINDERS_FILE):
        with open(REMINDERS_FILE, "r") as f:
            return json.load(f)
    return {"reminders": [], "history": []}


def save_reminders(data):
    with open(REMINDERS_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ─────────────────────────────────────────────
# schedule_reminder(medicine_name, time, dose)
# Called by POST /reminders/schedule in main.py
# ─────────────────────────────────────────────
def schedule_reminder(medicine_name: str, time: str, dose: str = ""):
    """
    Creates or updates a reminder for a medicine.
    `time` is a single "HH:MM" string.
    """
    data = load_reminders()

    # If reminder for this medicine already exists, update it
    existing = next(
        (r for r in data["reminders"] if r["medicine_name"].lower() == medicine_name.lower()),
        None
    )

    if existing:
        # Add time to schedule if not already present
        if time and time not in existing["times"]:
            existing["times"].append(time)
        if dose:
            existing["dose"] = dose
        save_reminders(data)
        return {
            "reminder_id": existing["reminder_id"],
            "medicine_name": existing["medicine_name"],
            "times": existing["times"],
            "dose": existing["dose"],
            "message": f"Reminder updated for {medicine_name}",
        }

    # Create new reminder
    new_reminder = {
        "reminder_id": str(uuid.uuid4())[:8],
        "medicine_name": medicine_name,
        "dose": dose,
        "times": [time] if time else [],
        "supply": 30,       # default supply — update via /medicines/action
        "streak": 0,
        "missed_today": 0,
        "created_at": datetime.now().isoformat(),
    }
    data["reminders"].append(new_reminder)
    save_reminders(data)
    return {
        "reminder_id": new_reminder["reminder_id"],
        "medicine_name": medicine_name,
        "times": new_reminder["times"],
        "dose": dose,
        "message": f"Reminder scheduled for {medicine_name} at {time}",
    }


# ─────────────────────────────────────────────
# get_pending_reminders()
# Called by GET /reminders/pending in main.py
# ─────────────────────────────────────────────
def get_pending_reminders():
    """
    Returns reminders due within the last 30 minutes
    that haven't been responded to today.
    """
    data = load_reminders()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    pending = []

    for r in data["reminders"]:
        for t in r.get("times", []):
            # Check if already responded today
            already_done = any(
                h["medicine_name"] == r["medicine_name"]
                and h["scheduled_time"] == t
                and h["date"] == today
                for h in data["history"]
            )
            if already_done:
                continue

            try:
                hour, minute = map(int, t.split(":"))
                scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                diff_minutes = (now - scheduled).total_seconds() / 60

                if 0 <= diff_minutes <= 30:
                    pending.append({
                        "reminder_id": r.get("reminder_id", ""),
                        "medicine_name": r["medicine_name"],
                        "dose": r.get("dose", ""),
                        "scheduled_time": t,
                        "supply_remaining": r.get("supply", 0),
                        "streak": r.get("streak", 0),
                        "message": f"Time for {r['medicine_name']} {r.get('dose', '')}".strip(),
                    })
            except (ValueError, AttributeError):
                continue

    return pending


# ─────────────────────────────────────────────
# respond_reminder(reminder_id, action)
# Called by POST /reminders/respond in main.py
# ─────────────────────────────────────────────
def respond_reminder(reminder_id: str, action: str):
    """
    action: "taken" | "snooze" | "skip"
    Matches by reminder_id.
    """
    data = load_reminders()
    now = datetime.now()

    target = next(
        (r for r in data["reminders"] if r.get("reminder_id") == reminder_id),
        None
    )

    if not target:
        return {
            "action": action,
            "reminder_id": reminder_id,
            "message": "Reminder not found",
            "timestamp": now.isoformat(),
        }

    medicine_name = target["medicine_name"]
    message = ""

    if action == "taken":
        target["supply"] = max(0, target.get("supply", 1) - 1)
        target["streak"] = target.get("streak", 0) + 1
        target["missed_today"] = 0
        message = f"✅ {medicine_name} marked taken! Streak: {target['streak']} days 🔥"
        if target["supply"] <= 5:
            message += f" — ⚠️ Only {target['supply']} days left, refill soon!"

    elif action == "skip":
        target["streak"] = 0
        target["missed_today"] = target.get("missed_today", 0) + 1
        message = f"❌ {medicine_name} skipped. Streak reset."
        if target["missed_today"] >= 2:
            message += " ⚠️ Missed twice today — caregiver will be notified."

    elif action == "snooze":
        snooze_until = (now + timedelta(minutes=30)).isoformat()
        target["snoozed_until"] = snooze_until
        message = f"⏰ {medicine_name} snoozed 30 mins."

    # Log to history
    data["history"].append({
        "reminder_id": reminder_id,
        "medicine_name": medicine_name,
        "scheduled_time": target.get("times", ["?"])[0],
        "date": now.strftime("%Y-%m-%d"),
        "action": action,
        "timestamp": now.isoformat(),
    })

    # Keep history to last 200 entries
    data["history"] = data["history"][-200:]

    save_reminders(data)

    return {
        "action": action,
        "reminder_id": reminder_id,
        "medicine_name": medicine_name,
        "streak": target.get("streak", 0),
        "supply_remaining": target.get("supply", 0),
        "caregiver_alert": target.get("missed_today", 0) >= 2,
        "refill_alert": target.get("supply", 99) <= 5,
        "message": message,
        "timestamp": now.isoformat(),
    }