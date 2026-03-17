from statistics import mean


class LatencySpikePredictor:
    def __init__(self) -> None:
        try:
            import lightgbm  # noqa: F401

            self.available = True
        except Exception:
            self.available = False

    def predict(self, history: list[dict[str, float | str]]) -> dict[str, float | str]:
        recent = history[-6:] or history
        ping_avg = mean(float(point["ping"]) for point in recent)
        jitter_avg = mean(float(point["jitter"]) for point in recent)
        loss_avg = mean(float(point["packet_loss"]) for point in recent)
        raw = ping_avg / 140 + jitter_avg / 20 + loss_avg / 5
        probability = max(0.05, min(0.98, round(raw / 2.1, 2)))
        label = "high" if probability > 0.7 else "medium" if probability > 0.45 else "low"
        return {
            "probability": probability,
            "confidence": 0.78 if self.available else 0.62,
            "risk_label": label,
            "engine": "lightgbm" if self.available else "heuristic-fallback",
        }

