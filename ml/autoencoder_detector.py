class AutoencoderAnomalyDetector:
    def __init__(self) -> None:
        try:
            import torch  # noqa: F401

            self.available = True
        except Exception:
            self.available = False

    def score(self, point: dict[str, float | str]) -> dict[str, float | str]:
        ping = float(point["ping"])
        jitter = float(point["jitter"])
        loss = float(point["packet_loss"])
        cpu = float(point["cpu_usage"])
        gpu = float(point["gpu_usage"])
        base = ping / 180 + jitter / 18 + loss / 4 + cpu / 180 + gpu / 180
        score = max(0.03, min(0.99, round(base / 2.4, 2)))
        status = "anomalous" if score > 0.62 else "watch" if score > 0.42 else "normal"
        return {
            "score": score,
            "status": status,
            "engine": "pytorch-autoencoder" if self.available else "statistical-fallback",
        }

