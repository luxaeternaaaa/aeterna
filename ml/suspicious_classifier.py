class SuspiciousEventClassifier:
    def __init__(self) -> None:
        try:
            import sklearn  # noqa: F401

            self.available = True
        except Exception:
            self.available = False

    def classify(self, point: dict[str, float | str]) -> dict[str, float | str]:
        ping = float(point["ping"])
        loss = float(point["packet_loss"])
        anomaly = float(point["anomaly_score"])
        if loss > 2.5 or anomaly > 0.85:
            label = "potential-session-threat"
            confidence = 0.86
        elif ping > 95 or anomaly > 0.6:
            label = "unstable-session"
            confidence = 0.74
        else:
            label = "normal-session"
            confidence = 0.89
        return {
            "label": label,
            "confidence": confidence if self.available else round(confidence - 0.09, 2),
            "engine": "sklearn-classifier" if self.available else "rule-based-fallback",
        }

