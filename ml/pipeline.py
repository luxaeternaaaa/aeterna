from ml.autoencoder_detector import AutoencoderAnomalyDetector
from ml.lightgbm_latency import LatencySpikePredictor
from ml.suspicious_classifier import SuspiciousEventClassifier


class LocalMlPipeline:
    def __init__(self) -> None:
        self.latency = LatencySpikePredictor()
        self.anomaly = AutoencoderAnomalyDetector()
        self.classifier = SuspiciousEventClassifier()

    def summarize(self, history: list[dict[str, float | str]]) -> dict[str, dict[str, float | str]]:
        latest = history[-1]
        return {
            "latency_prediction": self.latency.predict(history),
            "anomaly_detection": self.anomaly.score(latest),
            "classification": self.classifier.classify(latest),
        }

