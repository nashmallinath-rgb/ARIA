"""
ARIA v4 — Report Extraction Module (Manual Entry)
No external API. Frontend sends parsed values directly.
Backend flags out-of-range values and saves to patient profile.
Called by POST /report/extract in main.py
"""

from patient_store import load_profile, save_profile

# ─────────────────────────────────────────────
# NORMAL RANGES
# (low_critical, normal_low, normal_high, high_critical, label, unit)
# ─────────────────────────────────────────────
RANGES = {
    "hba1c":                    (0,    4.0,  5.6,  6.5,   "HbA1c",           "%"),
    "creatinine":               (0,    0.5,  1.2,  1.5,   "Creatinine",      "mg/dL"),
    "blood_glucose":            (50,   70,   99,   126,   "Blood Glucose",   "mg/dL"),
    "cholesterol":              (0,    100,  200,  240,   "Cholesterol",     "mg/dL"),
    "hemoglobin":               (8,    12,   17.5, 20,    "Hemoglobin",      "g/dL"),
    "blood_pressure_systolic":  (80,   90,   130,  140,   "Systolic BP",     "mmHg"),
    "blood_pressure_diastolic": (50,   60,   80,   90,    "Diastolic BP",    "mmHg"),
    "urea":                     (0,    7,    20,   40,    "Blood Urea",      "mg/dL"),
    "sodium":                   (120,  136,  145,  150,   "Sodium",          "mEq/L"),
    "potassium":                (2.5,  3.5,  5.0,  6.0,   "Potassium",       "mEq/L"),
    "tsh":                      (0,    0.4,  4.0,  10,    "TSH",             "mIU/L"),
    "wbc":                      (2,    4,    11,   20,    "WBC",             "x10^3/uL"),
    "rbc":                      (2,    4.5,  5.5,  7,     "RBC",             "x10^6/uL"),
    "platelets":                (50,   150,  400,  600,   "Platelets",       "x10^3/uL"),
}


def _flag_values(values: dict) -> list:
    flags = []
    for key, (low_crit, normal_low, normal_high, high_crit, label, unit) in RANGES.items():
        val = values.get(key)
        if val is None:
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue

        if val >= high_crit:
            flags.append(f"{label} CRITICALLY HIGH ({val} {unit})")
        elif val > normal_high:
            flags.append(f"{label} borderline elevated ({val} {unit})")
        elif val <= low_crit:
            flags.append(f"{label} CRITICALLY LOW ({val} {unit})")
        elif val < normal_low:
            flags.append(f"{label} below normal ({val} {unit})")

    return flags


def _build_summary(values: dict, flags: list) -> str:
    if not flags:
        return "All reported values within normal range. No immediate concerns detected."
    critical = [f for f in flags if "CRITICALLY" in f]
    elevated = [f for f in flags if "elevated" in f or "borderline" in f]
    parts = []
    if critical:
        parts.append(f"Critical findings: {', '.join(critical)}.")
    if elevated:
        parts.append(f"Borderline: {', '.join(elevated)}.")
    return " ".join(parts) + " Review recommended."


def extract_report_from_values(values: dict) -> dict:
    """
    Takes a dict of lab values from the frontend form.
    Flags out-of-range values, saves to patient profile, returns result.
    """
    metadata_keys = {"report_type", "report_date", "doctor_name", "notes"}
    metadata = {k: values.get(k) for k in metadata_keys if values.get(k)}
    numeric = {k: v for k, v in values.items() if k not in metadata_keys and v is not None}

    clean = {}
    for k, v in numeric.items():
        try:
            clean[k] = float(v)
        except (TypeError, ValueError):
            pass

    flags   = _flag_values(clean)
    summary = _build_summary(clean, flags)

    profile = load_profile()
    profile["last_report"] = {**clean, **metadata, "flags": flags, "summary": summary}
    save_profile(profile)

    return {
        "extracted_values": clean,
        "flags":            flags,
        "summary":          summary,
        "metadata":         metadata,
        "saved_to_profile": True,
    }