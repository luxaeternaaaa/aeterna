use std::{collections::BTreeMap, fs, path::Path};

use crate::{
    models::{MlInferencePayload, MlInferenceRequest, MlModelMetadata, MlRuntimeTruth},
    paths::{ml_fps_metadata_path, ml_fps_model_path, ml_metadata_path},
    processes,
};
use tract_onnx::prelude::Framework;

#[derive(Default)]
struct FpsModelStatus {
    available: bool,
    loadable: bool,
    model_source: Option<String>,
    version: Option<String>,
    model_path: Option<String>,
    error: Option<String>,
}

fn sigmoid(value: f64) -> f64 {
    1.0 / (1.0 + (-value).exp())
}

fn default_metadata() -> MlModelMetadata {
    MlModelMetadata {
        version: "fallback-v1".into(),
        updated_at: String::new(),
        model_source: "metadata-fallback".into(),
        metrics: BTreeMap::from([
            ("roc_auc".into(), 0.79),
            ("precision".into(), 0.74),
            ("recall".into(), 0.71),
        ]),
        weights: BTreeMap::from([
            ("cpu_process_pct".into(), 1.05),
            ("cpu_total_pct".into(), 0.4),
            ("gpu_usage_pct".into(), 0.35),
            ("ram_working_set_mb".into(), 0.45),
            ("frametime_avg_ms".into(), 0.9),
            ("frametime_p95_ms".into(), 1.4),
            ("frame_drop_ratio".into(), 1.1),
            ("background_process_count".into(), 0.32),
            ("anomaly_score".into(), 1.25),
        ]),
        intercept: -1.65,
        shap_preview: vec![
            "frametime_p95_ms contributes the most to spike probability.".into(),
            "cpu_process_pct is the strongest scheduler-side pressure signal.".into(),
        ],
        recommendation_map: BTreeMap::from([
            ("cpu_affinity".into(), vec!["High CPU pressure suggests reducing scheduler contention.".into()]),
            ("power_plan".into(), vec!["Lower clocks or power-saving plans can amplify spikes under load.".into()]),
            ("process_priority".into(), vec!["The game may benefit from a higher scheduler share in the next window.".into()]),
        ]),
    }
}

fn load_metadata() -> MlModelMetadata {
    fs::read(ml_metadata_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(default_metadata)
}

fn load_fps_metadata_value() -> Option<serde_json::Value> {
    fs::read(ml_fps_metadata_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn metadata_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(|item| item.as_str()).map(str::to_owned)
}

fn validate_onnx_artifact(path: &Path) -> Result<(), String> {
    tract_onnx::onnx()
        .model_for_path(path)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn fps_model_status() -> FpsModelStatus {
    let model_path = ml_fps_model_path();
    let metadata = load_fps_metadata_value();
    let mut status = FpsModelStatus {
        available: model_path.exists(),
        model_path: Some(model_path.display().to_string()),
        model_source: metadata.as_ref().and_then(|value| metadata_string(value, "model_source")),
        version: metadata.as_ref().and_then(|value| metadata_string(value, "version")),
        ..FpsModelStatus::default()
    };

    if status.available {
        match validate_onnx_artifact(&model_path) {
            Ok(()) => status.loadable = true,
            Err(error) => status.error = Some(error),
        }
    }
    status
}

fn runtime_mode(source: &str) -> &'static str {
    if source.contains("onnx") {
        "onnx"
    } else if source.contains("fallback") {
        "fallback"
    } else {
        "unavailable"
    }
}

pub fn runtime_truth() -> MlRuntimeTruth {
    let metadata = load_metadata();
    let mode = runtime_mode(&metadata.model_source);
    let fps_status = fps_model_status();
    let active_label = if fps_status.loadable {
        format!(
            "FPS ONNX ready; {}",
            match mode {
                "onnx" => format!("runtime {}", metadata.version),
                "fallback" => "fallback pressure model active".into(),
                _ => "pressure model unavailable".into(),
            }
        )
    } else {
        match mode {
            "onnx" => format!("ONNX runtime {}", metadata.version),
            "fallback" => "Fallback runtime available".into(),
            _ => "No runtime recommendation path".into(),
        }
    };
    let mut summary = match mode {
        "onnx" => format!(
            "Local runtime-backed inference is available via {}. Treat compare results as proof, and ML as advisory ranking.",
            metadata.version
        ),
        "fallback" => format!(
            "Fallback inference is available via {}. It can rank likely session pressure, but it does not replace benchmark proof.",
            metadata.version
        ),
        _ => "No runtime recommendation path is currently available.".into(),
    };
    if fps_status.loadable {
        summary.push_str(" FPS prediction artifact aeterna_fps_model.onnx is present, loadable, and includes DatasetLoader preprocessing; the current optimization endpoint still uses telemetry-pressure fallback until it can supply the raw game, hardware, graphics, and tweak inputs required by that graph.");
    } else if fps_status.available {
        let error = fps_status.error.as_deref().unwrap_or("unknown ONNX load error");
        summary.push_str(&format!(
            " FPS prediction artifact is present but could not be loaded by the sidecar ONNX runtime: {error}."
        ));
    }
    MlRuntimeTruth {
        runtime_mode: mode.into(),
        model_source: if fps_status.available {
            format!(
                "{}+fps-{}",
                metadata.model_source,
                fps_status.model_source.as_deref().unwrap_or("artifact")
            )
        } else {
            metadata.model_source
        },
        model_version: Some(metadata.version),
        active_label,
        summary,
        fps_model_available: fps_status.available,
        fps_model_loadable: fps_status.loadable,
        fps_model_source: fps_status.model_source,
        fps_model_version: fps_status.version,
        fps_model_path: fps_status.model_path,
    }
}

fn feature_value(payload: &MlInferenceRequest, key: &str) -> f64 {
    match key {
        "cpu_process_pct" => payload.cpu_process_pct / 100.0,
        "cpu_total_pct" => payload.cpu_total_pct / 100.0,
        "gpu_usage_pct" => payload.gpu_usage_pct / 100.0,
        "ram_working_set_mb" => payload.ram_working_set_mb / 12_000.0,
        "frametime_avg_ms" => payload.frametime_avg_ms / 30.0,
        "frametime_p95_ms" => payload.frametime_p95_ms / 45.0,
        "frame_drop_ratio" => payload.frame_drop_ratio,
        "background_process_count" => payload.background_process_count as f64 / 120.0,
        "anomaly_score" => payload.anomaly_score,
        _ => 0.0,
    }
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    if !values.iter().any(|item| item == value) {
        values.push(value.into());
    }
}

fn game_allows(payload: &MlInferenceRequest, action: &str) -> bool {
    payload
        .game_context
        .as_ref()
        .map(|game| game.allowed_actions.is_empty() || game.allowed_actions.iter().any(|item| item == action))
        .unwrap_or(false)
}

pub fn infer(payload: MlInferenceRequest) -> MlInferencePayload {
    let metadata = load_metadata();
    let mode = runtime_mode(&metadata.model_source);
    let fps_status = fps_model_status();
    let score = metadata
        .weights
        .iter()
        .fold(metadata.intercept, |acc, (key, weight)| acc + feature_value(&payload, key) * weight);
    let mut spike_probability = sigmoid(score).clamp(0.02, 0.98);
    let mut recommended_tweaks = Vec::new();
    let mut recommended_functions = Vec::new();
    let mut factors = Vec::new();
    factors.push(format!("OS runtime signal: {}.", std::env::consts::OS));
    if fps_status.loadable {
        factors.push("FPS ONNX artifact is loadable and includes preprocessing; this endpoint keeps using pressure-model recommendations until raw game, hardware, graphics, and tweak inputs are available for FPS inference.".into());
    } else if fps_status.available {
        factors.push("FPS model artifact was found, but telemetry fallback remains active for this inference call.".into());
    }
    if let Some(profile) = payload.system_profile.as_ref() {
        let cores = profile
            .logical_cores
            .unwrap_or_else(|| processes::logical_processor_count() as u32);
        if cores <= 8 {
            spike_probability = (spike_probability + 0.04).min(0.98);
            factors.push(format!("Detected {cores} logical cores. Scheduler pressure can rise faster under burst load."));
        } else if cores >= 12 {
            spike_probability = (spike_probability - 0.02).max(0.02);
            factors.push(format!("Detected {cores} logical cores. Core headroom may absorb transient spikes better."));
        }
        if let Some(memory_gb) = profile.memory_gb.or_else(processes::system_memory_total_gb) {
            if memory_gb <= 8.0 {
                spike_probability = (spike_probability + 0.03).min(0.98);
                factors.push(format!("Detected {memory_gb:.0} GB memory profile. Background pressure can impact frametime consistency."));
            } else if memory_gb >= 16.0 {
                factors.push(format!("Detected {memory_gb:.0} GB memory profile. Memory headroom favors stable frame delivery."));
            }
        }
        if let Some(power_plan) = profile.active_power_plan.as_deref() {
            factors.push(format!("Active power plan signal: {power_plan}."));
        }
        if profile.discrete_gpu_available == Some(false) {
            factors.push("Discrete GPU signal is absent; avoid forcing GPU-only assumptions.".into());
        }
        if !profile.active_tweaks.is_empty() || !profile.active_registry_presets.is_empty() {
            factors.push(format!(
                "Current state includes {} active session tweak(s) and {} active system preset(s).",
                profile.active_tweaks.len(),
                profile.active_registry_presets.len()
            ));
        }
        if profile.running_process_count >= 80 {
            push_unique(&mut recommended_functions, "content-delivery-off");
            push_unique(&mut recommended_functions, "feedback-frequency-off");
            factors.push(format!(
                "{} running processes were observed. The plan favors background-noise reduction.",
                profile.running_process_count
            ));
        }
        if profile.autorun_count >= 8 {
            factors.push(format!(
                "{} autorun entries were observed. Startup noise can be cleaned manually from Autoruns.",
                profile.autorun_count
            ));
        }
        if !profile.active_power_plan.as_deref().unwrap_or_default().to_ascii_lowercase().contains("performance") {
            push_unique(&mut recommended_functions, "ultimate-power");
        }
    } else {
        let cores = processes::logical_processor_count() as u32;
        factors.push(format!("Detected {cores} logical cores from sidecar system inspection."));
        if let Some(memory_gb) = processes::system_memory_total_gb() {
            factors.push(format!("Detected {memory_gb:.0} GB RAM from sidecar system inspection."));
        }
    }
    if let Some(game) = payload.game_context.as_ref() {
        let game_name = game
            .profile_title
            .as_deref()
            .or(game.process_name.as_deref())
            .unwrap_or("selected game");
        factors.push(format!("Game-aware context selected: {game_name}."));
        push_unique(&mut recommended_functions, "turn-off-recordings");
        push_unique(&mut recommended_functions, "game-mode-on");
        push_unique(&mut recommended_functions, "windowed-optimizations-on");
        push_unique(&mut recommended_functions, "power-throttling-off");
        push_unique(&mut recommended_functions, "usb-selective-suspend-off");
        push_unique(&mut recommended_functions, "pcie-lspm-off");
        push_unique(&mut recommended_functions, "reduce-input-lag");
        if game_allows(&payload, "process_priority") || payload.cpu_process_pct > 45.0 || payload.background_process_count > 42 {
            push_unique(&mut recommended_tweaks, "process_priority");
            push_unique(&mut recommended_functions, "max-games");
        }
        if game_allows(&payload, "power_plan") || payload.gpu_usage_pct > 70.0 || payload.frametime_p95_ms > 16.0 {
            push_unique(&mut recommended_tweaks, "power_plan");
            push_unique(&mut recommended_functions, "ultimate-power");
        }
        if game_allows(&payload, "cpu_affinity") && (payload.cpu_process_pct > 55.0 || payload.frametime_p95_ms > 12.0) {
            push_unique(&mut recommended_tweaks, "cpu_affinity");
            push_unique(&mut recommended_functions, "keep-cores");
        }
        if payload.cpu_total_pct > 70.0 || payload.frametime_p95_ms > 18.0 {
            push_unique(&mut recommended_functions, "process-qos-high");
        }
        if payload.frametime_p95_ms >= 18.0 || payload.frame_drop_ratio >= 0.08 || payload.anomaly_score >= 0.32 {
            push_unique(&mut recommended_functions, "low-timer-resolution");
        }
        if payload.gpu_usage_pct >= 45.0 {
            push_unique(&mut recommended_functions, "hags-on");
        }
        let profile_id = game.profile_id.as_deref().unwrap_or_default();
        if profile_id.contains("valorant") {
            recommended_functions.retain(|id| id != "keep-cores" && id != "low-timer-resolution");
            factors.push("Valorant profile keeps the plan compatibility-first around anti-cheat-sensitive changes.".into());
        } else if profile_id.contains("fortnite") || profile_id.contains("warzone") {
            push_unique(&mut recommended_functions, "diagtrack-off");
            push_unique(&mut recommended_functions, "maps-broker-off");
            factors.push("Large streaming titles get additional background-service noise reduction.".into());
        } else if profile_id.contains("cs2") {
            push_unique(&mut recommended_functions, "win32-priority-separation");
            factors.push("CS2 profile emphasizes scheduler responsiveness and input latency.".into());
        }
    }
    if payload.cpu_process_pct > 82.0 || payload.background_process_count > 42 {
        push_unique(&mut recommended_tweaks, "process_priority");
        push_unique(&mut recommended_functions, "max-games");
    }
    if payload.cpu_process_pct > 76.0 && payload.frametime_p95_ms > 12.0 && game_allows(&payload, "cpu_affinity") {
        push_unique(&mut recommended_tweaks, "cpu_affinity");
        push_unique(&mut recommended_functions, "keep-cores");
    }
    if payload.gpu_usage_pct > 92.0 || payload.frametime_p95_ms > 16.0 {
        push_unique(&mut recommended_tweaks, "power_plan");
        push_unique(&mut recommended_functions, "ultimate-power");
    }
    if recommended_tweaks.is_empty() && spike_probability > 0.4 {
        push_unique(&mut recommended_tweaks, "process_priority");
        if payload.game_context.is_some() {
            push_unique(&mut recommended_functions, "max-games");
        }
    }
    if payload.background_process_count > 70 || payload.cpu_total_pct > 65.0 {
        push_unique(&mut recommended_functions, "diagtrack-off");
        push_unique(&mut recommended_functions, "maps-broker-off");
        push_unique(&mut recommended_functions, "app-launch-tracking-off");
    }
    let risk_label = if spike_probability > 0.78 { "high" } else if spike_probability > 0.48 { "medium" } else { "low" };
    for tweak in &recommended_tweaks {
        if let Some(lines) = metadata.recommendation_map.get(tweak) {
            factors.extend(lines.clone());
        }
    }
    let confidence_bonus = if payload.system_profile.is_some() { 0.04 } else { 0.0 };
    let signal_scope = if payload.game_context.is_some() {
        "telemetry, system profile, and selected game signals"
    } else if payload.system_profile.is_some() {
        "telemetry and system profile signals"
    } else {
        "telemetry and sidecar system inspection"
    };

    MlInferencePayload {
        spike_probability,
        risk_label: risk_label.into(),
        confidence: (0.58 + spike_probability * 0.28 + confidence_bonus).min(0.97),
        recommended_tweaks,
        recommended_functions,
        summary: format!(
            "Local model {} estimates a {} spike probability using {}.",
            metadata.version,
            (spike_probability * 100.0).round(),
            signal_scope
        ),
        factors,
        model_version: Some(metadata.version),
        model_source: Some(if mode == "unavailable" { "unavailable".into() } else { metadata.model_source }),
        shap_preview: metadata.shap_preview,
    }
}

#[cfg(test)]
mod tests {
    use super::infer;
    use crate::models::MlInferenceRequest;

    #[test]
    fn flags_high_pressure_sessions() {
        let result = infer(MlInferenceRequest {
            fps_avg: 61.0,
            frametime_avg_ms: 16.4,
            frametime_p95_ms: 28.0,
            frame_drop_ratio: 0.21,
            cpu_process_pct: 92.0,
            cpu_total_pct: 88.0,
            gpu_usage_pct: 94.0,
            ram_working_set_mb: 8800.0,
            background_process_count: 64,
            anomaly_score: 0.88,
            system_profile: None,
            game_context: None,
        });
        assert_eq!(result.risk_label, "high");
        assert!(!result.recommended_tweaks.is_empty());
        assert!(!result.recommended_functions.is_empty());
    }
}
