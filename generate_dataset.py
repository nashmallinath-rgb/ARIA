"""
ARIA v4 — Synthetic Dataset Generator
Generates 500 rows of realistic elderly patient monitoring data.
Run once: python generate_dataset.py
Output: data/synthetic_dataset.csv
"""

import pandas as pd
import numpy as np
import os

np.random.seed(42)
N = 500

# ─────────────────────────────────────────────
# BASE DEMOGRAPHICS
# ─────────────────────────────────────────────
patient_ids = [f"P{str(i).zfill(4)}" for i in range(1, N + 1)]
ages = np.random.randint(65, 91, N)
genders = np.random.choice(["M", "F"], N, p=[0.45, 0.55])
living_situations = np.random.choice(
    ["alone", "with_family", "assisted_living", "nursing_home"],
    N, p=[0.30, 0.40, 0.20, 0.10]
)
fall_history = np.random.choice([0, 1], N, p=[0.65, 0.35])
comorbidity_count = np.random.choice([0, 1, 2, 3, 4], N, p=[0.10, 0.25, 0.30, 0.25, 0.10])

# ─────────────────────────────────────────────
# HEALTH BEHAVIOURS (correlated realistically)
# ─────────────────────────────────────────────
# Sleep: worse with more comorbidities
sleep_hours = np.clip(
    np.random.normal(6.5, 1.2, N) - 0.15 * comorbidity_count,
    3.0, 9.5
).round(1)

# Medication adherence: lower with more comorbidities and living alone
base_adherence = np.random.beta(5, 2, N)  # skewed toward higher adherence
adherence_penalty = (living_situations == "alone") * 0.08 + comorbidity_count * 0.02
medication_adherence = np.clip(base_adherence - adherence_penalty, 0.1, 1.0).round(2)

# Activity level: lower with age and comorbidities
activity_level = np.clip(
    np.random.normal(5.0, 1.8, N) - 0.05 * (ages - 65) - 0.3 * comorbidity_count,
    1.0, 10.0
).round(1)

# Social interactions per week
social_interactions = np.clip(
    np.random.poisson(4, N) - (living_situations == "alone") * 2,
    0, 14
)

# ─────────────────────────────────────────────
# OUTCOME SCORES (causally derived)
# ─────────────────────────────────────────────
# Cognitive score (0-10): driven by sleep, social, medication adherence
cognitive_score = np.clip(
    2.0
    + 0.4 * sleep_hours
    + 0.3 * social_interactions
    + 2.5 * medication_adherence
    + np.random.normal(0, 0.5, N),
    1.0, 10.0
).round(1)

# Mobility score (0-10): driven by activity, sleep, age
mobility_score = np.clip(
    8.0
    + 0.3 * activity_level
    + 0.2 * sleep_hours
    - 0.06 * (ages - 65)
    - 0.4 * comorbidity_count
    - 1.5 * fall_history
    + np.random.normal(0, 0.5, N),
    1.0, 10.0
).round(1)

# Mental health score (0-10): driven by social, activity, living situation
mental_health_score = np.clip(
    3.0
    + 0.4 * social_interactions
    + 0.3 * activity_level
    - 1.0 * (living_situations == "alone")
    + np.random.normal(0, 0.6, N),
    1.0, 10.0
).round(1)

# ─────────────────────────────────────────────
# INTERVENTIONS
# ─────────────────────────────────────────────
intervention_type = np.random.choice(
    ["none", "medication_reminder", "activity_prompt", "social_program", "combined"],
    N, p=[0.20, 0.25, 0.20, 0.15, 0.20]
)

# Intervention boosts outcomes
adherence_boost = (intervention_type == "medication_reminder") * 0.12 + \
                  (intervention_type == "combined") * 0.10
activity_boost  = (intervention_type == "activity_prompt") * 1.2 + \
                  (intervention_type == "combined") * 1.0
social_boost    = (intervention_type == "social_program") * 1.5 + \
                  (intervention_type == "combined") * 1.2

medication_adherence = np.clip(medication_adherence + adherence_boost, 0.1, 1.0).round(2)
activity_level       = np.clip(activity_level + activity_boost, 1.0, 10.0).round(1)
social_interactions  = np.clip(social_interactions + social_boost, 0, 14).astype(int)

# ─────────────────────────────────────────────
# FINAL OUTCOMES
# ─────────────────────────────────────────────
# Independence score (0-10): composite of cognitive, mobility, mental health
independence_score = np.clip(
    0.35 * cognitive_score
    + 0.35 * mobility_score
    + 0.30 * mental_health_score
    + np.random.normal(0, 0.3, N),
    1.0, 10.0
).round(1)

# Safety incident (binary): higher risk with low independence, fall history, living alone
safety_prob = np.clip(
    0.05
    + 0.08 * fall_history
    + 0.06 * (living_situations == "alone")
    + 0.05 * comorbidity_count
    - 0.04 * independence_score,
    0.02, 0.60
)
safety_incident = np.random.binomial(1, safety_prob, N)

# ─────────────────────────────────────────────
# ASSEMBLE DATAFRAME
# ─────────────────────────────────────────────
df = pd.DataFrame({
    "patient_id":           patient_ids,
    "age":                  ages,
    "gender":               genders,
    "living_situation":     living_situations,
    "fall_history":         fall_history,
    "comorbidity_count":    comorbidity_count,
    "sleep_hours":          sleep_hours,
    "medication_adherence": medication_adherence,
    "activity_level":       activity_level,
    "social_interactions":  social_interactions,
    "cognitive_score":      cognitive_score,
    "mobility_score":       mobility_score,
    "mental_health_score":  mental_health_score,
    "intervention_type":    intervention_type,
    "independence_score":   independence_score,
    "safety_incident":      safety_incident,
})

# ─────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────
os.makedirs("data", exist_ok=True)
df.to_csv("data/synthetic_dataset.csv", index=False)

print("✅ Dataset generated: data/synthetic_dataset.csv")
print(f"   Rows: {len(df)}")
print(f"   Columns: {list(df.columns)}")
print("\n📊 Quick stats:")
print(df.describe().round(2))
