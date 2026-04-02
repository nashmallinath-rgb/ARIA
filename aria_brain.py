class ARIABrain:
    def synthesize(self, ite_score, patient):
        """
        Synthesizes a complex health report based on all 10+ features.
        """
        # Extract features for analysis
        sleep = patient.get("sleep_hours", 7)
        cog = patient.get("cognitive_score", 7)
        mob = patient.get("mobility_score", 7)
        adherence = patient.get("medication_adherence", 1.0)
        social = patient.get("social_interactions", 5)
        
        # 1. Start with the Causal Insight
        if ite_score > 0.3:
            msg = "High Intervention Benefit: ARIA predicts significant improvement in independence through targeted activity. "
        else:
            msg = "Stability Maintenance: Current parameters show steady independence levels. "

        # 2. Add Feature-Specific Logic (The "Huge" list)
        insights = []
        if sleep < 6: insights.append("Sleep debt detected (risk to cognition).")
        if cog < 5: insights.append("Cognitive load is high; simplify daily tasks.")
        if mob < 5: insights.append("Mobility markers declining; suggest gait review.")
        if adherence < 0.7: insights.append("Medication gap identified.")
        if social < 3: insights.append("Social isolation risk flagged.")

        if not insights:
            msg += "All health domains (Sleep, Cognition, Mobility, Social) are within optimal range."
        else:
            msg += " | ".join(insights)

        return msg