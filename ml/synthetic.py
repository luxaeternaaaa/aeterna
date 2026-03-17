import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


GAMES = ["Valorant", "Counter-Strike 2", "Fortnite", "Apex Legends"]


def _threat_level(score: float) -> str:
    if score > 0.8:
        return "high"
    if score > 0.52:
        return "medium"
    return "low"


def generate_dataset(points: int = 180, seed: int = 7) -> list[dict[str, float | int | str | None]]:
    random.seed(seed)
    start = datetime.now(timezone.utc) - timedelta(seconds=points * 5)
    game = random.choice(GAMES)
    rows: list[dict[str, float | int | str | None]] = []
    for index in range(points):
        if index % 60 == 0:
            game = random.choice(GAMES)
        spike = random.random() < 0.12
        background_heavy = random.random() < 0.18
        thermal_risk = random.random() < 0.08
        cpu = random.uniform(34, 74) + (18 if spike else 0) + (10 if background_heavy else 0)
        gpu = random.uniform(42, 88) + (8 if spike else 0)
        ram = random.uniform(4800, 9200) + (900 if background_heavy else 0)
        background = int(random.uniform(12, 34) + (18 if background_heavy else 0))
        fps = max(52.0, 230.0 - cpu * 1.1 - gpu * 0.72 - background * 0.55 - (18 if thermal_risk else 0))
        frametime = 1000.0 / fps
        anomaly = min(0.99, 0.16 + (0.36 if spike else 0) + (0.18 if background_heavy else 0) + (0.22 if thermal_risk else 0))
        rows.append(
            {
                "timestamp": (start + timedelta(seconds=index * 5)).isoformat(),
                "source": "demo",
                "mode": "demo",
                "game": game,
                "session_state": "active",
                "fps_estimate": round(fps, 2),
                "frametime_ms": round(frametime, 2),
                "cpu_usage": round(cpu, 2),
                "gpu_usage": round(gpu, 2),
                "ram_usage": round(ram, 2),
                "background_process_count": background,
                "temperature_c": round(random.uniform(56, 76) + (8 if thermal_risk else 0), 2),
                "ping": round(random.uniform(18, 42), 2),
                "jitter": round(random.uniform(1, 5) + (2 if spike else 0), 2),
                "packet_loss": round(random.uniform(0.0, 0.3), 2),
                "anomaly_score": round(anomaly, 2),
                "threat_level": _threat_level(anomaly),
            }
        )
    return rows


def export_dataset(path: Path, points: int = 180, seed: int = 7) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(generate_dataset(points=points, seed=seed), handle, indent=2)
    return path
