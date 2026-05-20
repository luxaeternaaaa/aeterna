from __future__ import annotations

import csv
import math
import random
from pathlib import Path
from typing import Any


TWEAK_COLUMNS = [
    "tweak_affinity",
    "tweak_game_mode",
    "tweak_hags",
    "tweak_low_timer_resolution",
    "tweak_power_plan",
    "tweak_priority",
    "tweak_recording_off",
    "tweak_registry_preset",
    "tweak_service",
]

CPU_MODELS = {
    "Intel Core i5-9400F": {"score": 84, "cores": 6},
    "Intel Core i5-12400F": {"score": 122, "cores": 12},
    "Intel Core i7-12700H": {"score": 132, "cores": 20},
    "Intel Core i7-13700K": {"score": 168, "cores": 24},
    "AMD Ryzen 5 3600": {"score": 104, "cores": 12},
    "AMD Ryzen 5 5600X": {"score": 126, "cores": 12},
    "AMD Ryzen 7 5800X3D": {"score": 156, "cores": 16},
    "AMD Ryzen 7 7840HS": {"score": 142, "cores": 16},
}

GPU_MODELS = {
    "NVIDIA GTX 1060 6GB": {"score": 76, "vram": 6, "modern": 0},
    "NVIDIA GTX 1660 Super": {"score": 95, "vram": 6, "modern": 0},
    "NVIDIA RTX 2060": {"score": 112, "vram": 6, "modern": 1},
    "NVIDIA RTX 3060 Laptop": {"score": 122, "vram": 6, "modern": 1},
    "NVIDIA RTX 4060": {"score": 152, "vram": 8, "modern": 1},
    "NVIDIA RTX 4070": {"score": 188, "vram": 12, "modern": 1},
    "AMD RX 6600": {"score": 130, "vram": 8, "modern": 1},
    "AMD RX 7800 XT": {"score": 210, "vram": 16, "modern": 1},
}

GAMES = {
    "valorant": {"base": 380, "cpu": 1.25, "gpu": 0.55, "streaming": 0.25, "anti_cheat": 1},
    "cs2": {"base": 310, "cpu": 1.35, "gpu": 0.9, "streaming": 0.35, "anti_cheat": 0},
    "fortnite": {"base": 260, "cpu": 1.1, "gpu": 1.25, "streaming": 0.8, "anti_cheat": 0},
    "apex_legends": {"base": 240, "cpu": 0.95, "gpu": 1.35, "streaming": 0.55, "anti_cheat": 0},
    "warzone": {"base": 205, "cpu": 1.05, "gpu": 1.55, "streaming": 0.9, "anti_cheat": 0},
    "cyberpunk_2077": {"base": 150, "cpu": 0.7, "gpu": 1.8, "streaming": 0.75, "anti_cheat": 0},
}

RESOLUTION_SCALE = {"1280x720": 0.72, "1920x1080": 1.0, "2560x1440": 1.55, "3840x2160": 3.1}
PRESET_SCALE = {"low": 0.68, "medium": 0.92, "high": 1.18, "ultra": 1.45}
AA_SCALE = {"off": 0.95, "fxaa": 1.0, "taa": 1.06, "msaa_2x": 1.15, "msaa_4x": 1.32}
QUALITY_SCALE = {"low": 0.82, "medium": 1.0, "high": 1.16, "ultra": 1.32}
EFFECTS_SCALE = {"low": 0.86, "medium": 1.0, "high": 1.18, "ultra": 1.38}


def export_synthetic_fps_csv(path: str | Path, rows: int = 4096, seed: int = 17) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = generate_synthetic_fps_sessions(rows=rows, seed=seed)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(data[0].keys()))
        writer.writeheader()
        writer.writerows(data)
    return path


def generate_synthetic_fps_sessions(rows: int = 4096, seed: int = 17) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    sessions: list[dict[str, Any]] = []
    rows_per_config = 1 + len(TWEAK_COLUMNS) + 3
    config_count = max(1, math.ceil(rows / rows_per_config))

    for config_index in range(config_count):
        config = _sample_config(rng, config_index)
        tweak_sets = [_empty_tweaks()]
        for tweak in TWEAK_COLUMNS:
            tweaks = _empty_tweaks()
            tweaks[tweak] = 1
            tweak_sets.append(tweaks)
        for _ in range(3):
            selected = rng.sample(TWEAK_COLUMNS, k=rng.randint(2, 4))
            tweaks = _empty_tweaks()
            for tweak in selected:
                tweaks[tweak] = 1
            tweak_sets.append(tweaks)

        for variant_index, tweaks in enumerate(tweak_sets):
            if len(sessions) >= rows:
                return sessions
            sessions.append(_build_row(config, tweaks, config_index, variant_index))

    return sessions[:rows]


def _sample_config(rng: random.Random, config_index: int) -> dict[str, Any]:
    game_id = rng.choice(list(GAMES))
    cpu_model = rng.choice(list(CPU_MODELS))
    gpu_model = rng.choice(list(GPU_MODELS))
    gpu_laptop_bias = 1 if "Laptop" in gpu_model else 0
    laptop = 1 if rng.random() < (0.34 + gpu_laptop_bias * 0.35) else 0
    ram_gb = rng.choices([8, 12, 16, 24, 32], weights=[0.14, 0.08, 0.45, 0.08, 0.25])[0]
    drive_type = rng.choices(["HDD", "SSD", "NVMe"], weights=[0.12, 0.44, 0.44])[0]
    graphics_preset = rng.choices(["low", "medium", "high", "ultra"], weights=[0.2, 0.34, 0.34, 0.12])[0]
    resolution = rng.choices(["1280x720", "1920x1080", "2560x1440", "3840x2160"], weights=[0.08, 0.58, 0.25, 0.09])[0]
    label_target = rng.choices(["max_fps", "balanced", "quality"], weights=[0.36, 0.46, 0.18])[0]
    if label_target == "max_fps":
        graphics_preset = rng.choices(["low", "medium", graphics_preset], weights=[0.42, 0.42, 0.16])[0]
    elif label_target == "quality":
        graphics_preset = rng.choices([graphics_preset, "high", "ultra"], weights=[0.2, 0.45, 0.35])[0]

    return {
        "session_config_id": f"cfg-{config_index:05d}",
        "game_id": game_id,
        "cpu_model": cpu_model,
        "gpu_model": gpu_model,
        "ram_gb": ram_gb,
        "drive_type": drive_type,
        "laptop": laptop,
        "resolution": resolution,
        "graphics_preset": graphics_preset,
        "vsync": rng.choices(["off", "on"], weights=[0.78, 0.22])[0],
        "antialiasing": rng.choice(list(AA_SCALE)),
        "texture_quality": rng.choice(list(QUALITY_SCALE)),
        "special_effects": rng.choice(list(EFFECTS_SCALE)),
        "npc_count": rng.randint(12, 180),
        "player_actions": rng.randint(35, 210),
        "background_process_count": rng.randint(24, 105),
        "label_target": label_target,
        "noise": rng.uniform(-0.035, 0.035),
    }


def _empty_tweaks() -> dict[str, int]:
    return {column: 0 for column in TWEAK_COLUMNS}


def _build_row(config: dict[str, Any], tweaks: dict[str, int], config_index: int, variant_index: int) -> dict[str, Any]:
    performance = _simulate_performance(config, tweaks)
    row = {
        "session_id": f"synthetic-{config_index:05d}-{variant_index:02d}",
        **{key: value for key, value in config.items() if key != "noise"},
        **tweaks,
        **performance,
    }
    return row


def _simulate_performance(config: dict[str, Any], tweaks: dict[str, int]) -> dict[str, float]:
    game = GAMES[config["game_id"]]
    cpu = CPU_MODELS[config["cpu_model"]]
    gpu = GPU_MODELS[config["gpu_model"]]
    ram_gb = float(config["ram_gb"])
    laptop = int(config["laptop"])
    background = float(config["background_process_count"])

    resolution_pressure = RESOLUTION_SCALE[config["resolution"]]
    preset_pressure = PRESET_SCALE[config["graphics_preset"]]
    aa_pressure = AA_SCALE[config["antialiasing"]]
    texture_pressure = QUALITY_SCALE[config["texture_quality"]]
    effects_pressure = EFFECTS_SCALE[config["special_effects"]]
    npc_pressure = 1.0 + float(config["npc_count"]) / 230.0 * game["cpu"]
    action_pressure = 1.0 + float(config["player_actions"]) / 320.0 * game["cpu"]
    background_pressure = max(0.0, (background - 35.0) / 85.0)

    cpu_limit = game["base"] * (cpu["score"] / 112.0) / (game["cpu"] * npc_pressure * action_pressure)
    gpu_limit = game["base"] * (gpu["score"] / 118.0) / (
        game["gpu"] * resolution_pressure * preset_pressure * aa_pressure * effects_pressure
    )
    streaming_penalty = game["streaming"] * (0.05 if config["drive_type"] == "SSD" else 0.12 if config["drive_type"] == "HDD" else 0.025)
    ram_penalty = 0.1 if ram_gb <= 8 else 0.04 if ram_gb <= 12 else 0.0
    laptop_penalty = 0.08 if laptop else 0.0
    vram_pressure = max(0.0, (resolution_pressure * preset_pressure * texture_pressure * 3.2 - gpu["vram"]) / 8.0)

    blended_limit = 1.0 / (0.58 / max(cpu_limit, 1.0) + 0.42 / max(gpu_limit, 1.0))
    base_fps = blended_limit * (1.0 - streaming_penalty - ram_penalty - laptop_penalty - vram_pressure * 0.08)
    base_fps *= 1.0 - min(0.16, background_pressure * 0.12)
    base_fps *= 1.0 + float(config["noise"])

    cpu_bound = 1.0 if cpu_limit < gpu_limit * 0.92 else 0.0
    gpu_bound = 1.0 if gpu_limit < cpu_limit * 0.92 else 0.0
    thermal_pressure = laptop * (0.35 + 0.45 * gpu_bound + 0.25 * cpu_bound)
    low_ram_pressure = 1.0 if ram_gb <= 12 else 0.0
    anti_cheat = float(game["anti_cheat"])
    modern_gpu = float(gpu["modern"])

    mean_gain = 0.0
    low_gain = 0.0
    if tweaks["tweak_priority"]:
        gain = 0.018 + 0.036 * cpu_bound + 0.03 * background_pressure
        mean_gain += gain
        low_gain += gain + 0.028 * background_pressure
    if tweaks["tweak_affinity"]:
        gain = (0.01 + 0.045 * cpu_bound + 0.018 * (cpu["cores"] <= 12)) * (1.0 - 0.8 * anti_cheat)
        if cpu["cores"] >= 20 and cpu_bound < 0.5:
            gain -= 0.018
        mean_gain += gain
        low_gain += gain + 0.018 * cpu_bound
    if tweaks["tweak_power_plan"]:
        gain = 0.024 + 0.04 * thermal_pressure + 0.02 * laptop + 0.018 * max(cpu_bound, gpu_bound)
        mean_gain += gain
        low_gain += gain + 0.015 * thermal_pressure
    if tweaks["tweak_registry_preset"]:
        gain = 0.012 + 0.02 * cpu_bound + 0.018 * game["streaming"]
        mean_gain += gain
        low_gain += gain + 0.014 * game["streaming"]
    if tweaks["tweak_service"]:
        gain = 0.012 + 0.05 * background_pressure + 0.02 * low_ram_pressure + (0.015 if config["drive_type"] == "HDD" else 0.0)
        mean_gain += gain
        low_gain += gain + 0.025 * background_pressure
    if tweaks["tweak_hags"]:
        gain = (0.01 + 0.035 * gpu_bound + 0.012 * modern_gpu) * modern_gpu - 0.008 * (1.0 - modern_gpu)
        mean_gain += gain
        low_gain += gain + 0.012 * gpu_bound
    if tweaks["tweak_game_mode"]:
        gain = 0.01 + 0.025 * background_pressure + 0.012 * cpu_bound
        mean_gain += gain
        low_gain += gain + 0.02 * background_pressure
    if tweaks["tweak_recording_off"]:
        gain = 0.016 + 0.038 * gpu_bound + 0.02 * vram_pressure
        mean_gain += gain
        low_gain += gain + 0.018 * max(gpu_bound, vram_pressure)
    if tweaks["tweak_low_timer_resolution"]:
        gain = (0.004 + 0.01 * cpu_bound) * (1.0 - 0.65 * anti_cheat)
        mean_gain += gain
        low_gain += gain + (0.035 * cpu_bound + 0.022 * background_pressure) * (1.0 - anti_cheat)

    # Diminishing returns prevent every tweak combination from looking perfect.
    enabled_count = sum(tweaks.values())
    if enabled_count > 1:
        dampening = 1.0 - min(0.28, 0.045 * (enabled_count - 1))
        mean_gain *= dampening
        low_gain *= dampening

    mean_fps = max(24.0, base_fps * (1.0 + mean_gain))
    if config["vsync"] == "on":
        mean_fps = min(mean_fps, 144.0 if config["resolution"] in {"1280x720", "1920x1080"} else 60.0)
    fps_1pct = max(18.0, mean_fps * (0.68 + 0.08 * (1.0 - background_pressure) + low_gain * 0.9))
    fps_0_1pct = max(12.0, fps_1pct * (0.72 + 0.08 * (1.0 - thermal_pressure)))

    cpu_util = min(99.0, 42.0 + 46.0 * cpu_bound + background_pressure * 18.0 - mean_gain * 28.0)
    gpu_util = min(99.0, 48.0 + 44.0 * gpu_bound + resolution_pressure * 4.0)
    vram_util = min(99.0, 38.0 + vram_pressure * 75.0 + texture_pressure * 8.0)
    temperature = min(97.0, 56.0 + laptop * 9.0 + thermal_pressure * 16.0 + max(cpu_bound, gpu_bound) * 8.0)

    return {
        "mean_fps": round(mean_fps, 2),
        "fps_1pct": round(fps_1pct, 2),
        "fps_0_1pct": round(fps_0_1pct, 2),
        "mean_frametime": round(1000.0 / mean_fps, 3),
        "frametime_p95": round(1000.0 / max(fps_1pct, 1.0), 3),
        "cpu_util": round(cpu_util, 2),
        "gpu_util": round(gpu_util, 2),
        "vram_util": round(vram_util, 2),
        "temperature": round(temperature, 2),
    }
