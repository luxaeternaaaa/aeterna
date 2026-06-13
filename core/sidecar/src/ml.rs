use std::{collections::BTreeMap, fs, path::Path};

use crate::{
    ml_scoring::{
        ensure_rule_scores_for_recommendations, finalize_function_scores, fps_expected_gain_pct,
        fps_metadata_confidence, fps_score_signals, push_function_score,
    },
    models::{
        MlFunctionScore, MlInferencePayload, MlInferenceRequest, MlModelMetadata, MlRuntimeTruth,
    },
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
        model_source: "heuristic-rules".into(),
        metrics: BTreeMap::new(),
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
            "Heuristic factor: frametime_p95_ms has the largest configured weight.".into(),
            "Heuristic factor: cpu_process_pct is a scheduler-pressure input.".into(),
        ],
        recommendation_map: BTreeMap::from([
            (
                "cpu_affinity".into(),
                vec!["High CPU pressure suggests reducing scheduler contention.".into()],
            ),
            (
                "power_plan".into(),
                vec!["Lower clocks or power-saving plans can amplify spikes under load.".into()],
            ),
            (
                "process_priority".into(),
                vec![
                    "The game may benefit from a higher scheduler share in the next window.".into(),
                ],
            ),
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
    value
        .get(key)
        .and_then(|item| item.as_str())
        .map(str::to_owned)
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
        model_source: metadata
            .as_ref()
            .and_then(|value| metadata_string(value, "model_source")),
        version: metadata
            .as_ref()
            .and_then(|value| metadata_string(value, "version")),
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

fn runtime_mode(_source: &str) -> &'static str {
    "fallback"
}

fn fps_recommendations_released(metadata: &serde_json::Value) -> bool {
    metadata
        .get("recommendation_release")
        .and_then(|value| value.get("enabled"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

pub fn runtime_truth() -> MlRuntimeTruth {
    let metadata = load_metadata();
    let mode = runtime_mode(&metadata.model_source);
    let fps_status = fps_model_status();
    let active_label = if fps_status.loadable {
        "FPS ONNX artifact verified; heuristic pressure runtime active".into()
    } else {
        "Heuristic pressure runtime active".into()
    };
    let mut summary = format!(
        "The sidecar currently uses heuristic telemetry rules from {}. Benchmark comparisons are the proof path.",
        metadata.version
    );
    if fps_status.loadable {
        summary.push_str(
            " The FPS ONNX artifact is structurally loadable but is not executed by this endpoint.",
        );
        if let Some(fps_metadata) = load_fps_metadata_value() {
            if fps_recommendations_released(&fps_metadata) {
                summary.push_str(
                    " Independently validated tweak priors are released for advisory metadata ranking.",
                );
            } else {
                summary.push_str(
                    " Its synthetic or internally validated tweak priors are blocked from runtime ranking.",
                );
            }
        }
    } else if fps_status.available {
        let error = fps_status
            .error
            .as_deref()
            .unwrap_or("unknown ONNX load error");
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

fn fps_recommendation_reason(metadata: &serde_json::Value, key: &str) -> String {
    metadata
        .get("recommendation_map")
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_array)
        .and_then(|items| items.first())
        .and_then(serde_json::Value::as_str)
        .unwrap_or("The trained FPS model metadata marks this tweak as a useful candidate.")
        .to_string()
}

fn push_fps_metadata_factor(
    factors: &mut Vec<String>,
    metadata: &serde_json::Value,
    key: &str,
    gain: f64,
) {
    let reason = fps_recommendation_reason(metadata, key);
    let expected_gain_pct = fps_expected_gain_pct(metadata, key, gain);
    factors.push(format!(
        "{} prior from FPS model metadata: expected useful gain {:.1}%. {}",
        key.replace("tweak_", "").replace('_', " "),
        expected_gain_pct,
        reason
    ));
}

fn push_fps_metadata_score(
    function_scores: &mut Vec<MlFunctionScore>,
    metadata: &serde_json::Value,
    key: &str,
    gain: f64,
    spike_probability: f64,
    confidence: f64,
    function_ids: &[&str],
) {
    let reason = fps_recommendation_reason(metadata, key);
    let expected_gain_pct = fps_expected_gain_pct(metadata, key, gain);
    let signals = fps_score_signals(metadata, key, spike_probability, confidence);
    for function_id in function_ids {
        push_function_score(
            function_scores,
            function_id,
            confidence,
            expected_gain_pct,
            reason.clone(),
            "fps-metadata-prior",
            signals.clone(),
        );
    }
}

fn game_allows(payload: &MlInferenceRequest, action: &str) -> bool {
    payload
        .game_context
        .as_ref()
        .map(|game| {
            game.allowed_actions.is_empty()
                || game.allowed_actions.iter().any(|item| item == action)
        })
        .unwrap_or(false)
}

fn fps_metadata_ranked_tweaks(metadata: &serde_json::Value) -> Vec<(String, f64)> {
    if !fps_recommendations_released(metadata) {
        return Vec::new();
    }
    let released = metadata
        .get("recommendation_release")
        .and_then(|value| value.get("released_tweaks"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let Some(priors) = metadata
        .get("tweak_gain_priors")
        .and_then(serde_json::Value::as_object)
    else {
        return Vec::new();
    };
    let mut rows = priors
        .iter()
        .filter(|(key, _)| {
            released
                .iter()
                .any(|released_key| *released_key == key.as_str())
        })
        .filter_map(|(key, value)| value.as_f64().map(|gain| (key.clone(), gain)))
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        right
            .1
            .partial_cmp(&left.1)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    rows
}

fn apply_fps_metadata_recommendations(
    payload: &MlInferenceRequest,
    fps_metadata: Option<&serde_json::Value>,
    spike_probability: f64,
    recommended_tweaks: &mut Vec<String>,
    recommended_functions: &mut Vec<String>,
    function_scores: &mut Vec<MlFunctionScore>,
    factors: &mut Vec<String>,
) {
    let Some(metadata) = fps_metadata else {
        return;
    };
    if !fps_recommendations_released(metadata) {
        factors.push(
            "FPS artifact priors are blocked because no independent validation release is recorded."
                .into(),
        );
        return;
    }
    let ranked = fps_metadata_ranked_tweaks(metadata);
    if ranked.is_empty() {
        return;
    }
    let threshold = metadata
        .get("confidence_threshold")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.62);
    factors.push(format!(
        "FPS model metadata contributes {} trained tweak prior(s) with confidence threshold {:.2}.",
        ranked.len(),
        threshold
    ));
    let discrete_gpu_absent = payload
        .system_profile
        .as_ref()
        .and_then(|profile| profile.discrete_gpu_available)
        == Some(false);

    for (key, gain) in ranked {
        let confidence = fps_metadata_confidence(metadata, &key, gain, spike_probability);
        let strong_signal = confidence >= threshold || spike_probability >= 0.42;
        match key.as_str() {
            "tweak_power_plan"
                if strong_signal
                    && (payload.frametime_p95_ms >= 10.0 || payload.gpu_usage_pct >= 45.0) =>
            {
                push_unique(recommended_tweaks, "power_plan");
                push_unique(recommended_functions, "ultimate-power");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["ultimate-power"],
                );
            }
            "tweak_priority"
                if strong_signal
                    && payload.game_context.is_some()
                    && (payload.cpu_process_pct >= 25.0
                        || payload.background_process_count >= 35) =>
            {
                push_unique(recommended_tweaks, "process_priority");
                push_unique(recommended_functions, "max-games");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["max-games"],
                );
            }
            "tweak_affinity"
                if strong_signal
                    && game_allows(payload, "cpu_affinity")
                    && (payload.cpu_process_pct >= 35.0 || payload.frametime_p95_ms >= 12.0) =>
            {
                push_unique(recommended_tweaks, "cpu_affinity");
                push_unique(recommended_functions, "keep-cores");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["keep-cores"],
                );
            }
            "tweak_recording_off" if strong_signal && payload.game_context.is_some() => {
                push_unique(recommended_functions, "turn-off-recordings");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["turn-off-recordings"],
                );
            }
            "tweak_hags"
                if strong_signal && !discrete_gpu_absent && payload.gpu_usage_pct >= 45.0 =>
            {
                push_unique(recommended_functions, "hags-on");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["hags-on"],
                );
            }
            "tweak_game_mode" if strong_signal && payload.game_context.is_some() => {
                push_unique(recommended_functions, "game-mode-on");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["game-mode-on"],
                );
            }
            "tweak_low_timer_resolution"
                if strong_signal
                    && (payload.frametime_p95_ms >= 16.0
                    || payload.frame_drop_ratio >= 0.05
                    || payload.anomaly_score >= 0.25) =>
            {
                push_unique(recommended_functions, "low-timer-resolution");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["low-timer-resolution"],
                );
            }
            "tweak_service"
                if strong_signal
                    && (payload.background_process_count >= 70
                        || payload.cpu_total_pct >= 60.0) =>
            {
                push_unique(recommended_functions, "diagtrack-off");
                push_unique(recommended_functions, "maps-broker-off");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &["diagtrack-off", "maps-broker-off"],
                );
            }
            "tweak_registry_preset" if strong_signal => {
                push_unique(recommended_functions, "power-throttling-off");
                push_unique(recommended_functions, "windowed-optimizations-on");
                push_unique(recommended_functions, "reduce-input-lag");
                push_fps_metadata_factor(factors, metadata, &key, gain);
                push_fps_metadata_score(
                    function_scores,
                    metadata,
                    &key,
                    gain,
                    spike_probability,
                    confidence,
                    &[
                        "power-throttling-off",
                        "windowed-optimizations-on",
                        "reduce-input-lag",
                    ],
                );
            }
            _ => {}
        }
    }
}

pub fn infer(payload: MlInferenceRequest) -> MlInferencePayload {
    let metadata = load_metadata();
    let mode = runtime_mode(&metadata.model_source);
    let fps_status = fps_model_status();
    let fps_metadata = if fps_status.loadable {
        load_fps_metadata_value()
    } else {
        None
    };
    let score = metadata
        .weights
        .iter()
        .fold(metadata.intercept, |acc, (key, weight)| {
            acc + feature_value(&payload, key) * weight
        });
    let mut spike_probability = sigmoid(score).clamp(0.02, 0.98);
    let mut recommended_tweaks = Vec::new();
    let mut recommended_functions = Vec::new();
    let mut function_scores = Vec::new();
    let mut factors = Vec::new();
    factors.push(format!("OS runtime signal: {}.", std::env::consts::OS));
    if fps_status.loadable {
        factors.push(
            "FPS ONNX artifact is structurally loadable but is not executed by this endpoint."
                .into(),
        );
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
            factors.push(format!(
                "Detected {cores} logical cores. Core headroom may absorb transient spikes better."
            ));
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
            factors
                .push("Discrete GPU signal is absent; avoid forcing GPU-only assumptions.".into());
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
        if !profile
            .active_power_plan
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .contains("performance")
        {
            push_unique(&mut recommended_functions, "ultimate-power");
        }
    } else {
        let cores = processes::logical_processor_count() as u32;
        factors.push(format!(
            "Detected {cores} logical cores from sidecar system inspection."
        ));
        if let Some(memory_gb) = processes::system_memory_total_gb() {
            factors.push(format!(
                "Detected {memory_gb:.0} GB RAM from sidecar system inspection."
            ));
        }
    }
    apply_fps_metadata_recommendations(
        &payload,
        fps_metadata.as_ref(),
        spike_probability,
        &mut recommended_tweaks,
        &mut recommended_functions,
        &mut function_scores,
        &mut factors,
    );
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
        if game_allows(&payload, "process_priority")
            || payload.cpu_process_pct > 45.0
            || payload.background_process_count > 42
        {
            push_unique(&mut recommended_tweaks, "process_priority");
            push_unique(&mut recommended_functions, "max-games");
        }
        if game_allows(&payload, "power_plan")
            || payload.gpu_usage_pct > 70.0
            || payload.frametime_p95_ms > 16.0
        {
            push_unique(&mut recommended_tweaks, "power_plan");
            push_unique(&mut recommended_functions, "ultimate-power");
        }
        if game_allows(&payload, "cpu_affinity")
            && (payload.cpu_process_pct > 55.0 || payload.frametime_p95_ms > 12.0)
        {
            push_unique(&mut recommended_tweaks, "cpu_affinity");
            push_unique(&mut recommended_functions, "keep-cores");
        }
        if payload.cpu_total_pct > 70.0 || payload.frametime_p95_ms > 18.0 {
            push_unique(&mut recommended_functions, "process-qos-high");
        }
        if payload.frametime_p95_ms >= 18.0
            || payload.frame_drop_ratio >= 0.08
            || payload.anomaly_score >= 0.32
        {
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
            factors.push(
                "Large streaming titles get additional background-service noise reduction.".into(),
            );
        } else if profile_id.contains("cs2") {
            push_unique(&mut recommended_functions, "win32-priority-separation");
            factors
                .push("CS2 profile emphasizes scheduler responsiveness and input latency.".into());
        }
    }
    if payload.cpu_process_pct > 82.0 || payload.background_process_count > 42 {
        push_unique(&mut recommended_tweaks, "process_priority");
        push_unique(&mut recommended_functions, "max-games");
    }
    if payload.cpu_process_pct > 76.0
        && payload.frametime_p95_ms > 12.0
        && game_allows(&payload, "cpu_affinity")
    {
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
    ensure_rule_scores_for_recommendations(
        &payload,
        spike_probability,
        &recommended_functions,
        &mut function_scores,
    );
    finalize_function_scores(&recommended_functions, &mut function_scores);
    let risk_label = if spike_probability > 0.78 {
        "high"
    } else if spike_probability > 0.48 {
        "medium"
    } else {
        "low"
    };
    for tweak in &recommended_tweaks {
        if let Some(lines) = metadata.recommendation_map.get(tweak) {
            factors.extend(lines.clone());
        }
    }
    let confidence_bonus = if payload.system_profile.is_some() {
        0.04
    } else {
        0.0
    };
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
        function_scores,
        summary: format!(
            "Heuristic runtime {} estimates a {} pressure score using {}.",
            metadata.version,
            (spike_probability * 100.0).round(),
            signal_scope
        ),
        factors,
        model_version: Some(metadata.version),
        model_source: Some(if mode == "unavailable" {
            "unavailable".into()
        } else if fps_status.loadable
            && fps_metadata
                .as_ref()
                .map(fps_recommendations_released)
                .unwrap_or(false)
        {
            format!("{}+validated-fps-metadata-prior", metadata.model_source)
        } else {
            metadata.model_source
        }),
        shap_preview: metadata.shap_preview,
    }
}

#[cfg(test)]
mod tests {
    use super::{fps_metadata_ranked_tweaks, infer};
    use crate::models::{MlGameContext, MlInferenceRequest, MlSystemProfile};

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
        assert!(!result.function_scores.is_empty());
        assert!(result.function_scores.iter().all(|score| result
            .recommended_functions
            .iter()
            .any(|id| id == &score.function_id)));
    }

    #[test]
    fn explains_game_aware_function_scores() {
        let result = infer(MlInferenceRequest {
            fps_avg: 96.0,
            frametime_avg_ms: 12.8,
            frametime_p95_ms: 24.0,
            frame_drop_ratio: 0.12,
            cpu_process_pct: 68.0,
            cpu_total_pct: 81.0,
            gpu_usage_pct: 78.0,
            ram_working_set_mb: 6200.0,
            background_process_count: 91,
            anomaly_score: 0.46,
            system_profile: Some(MlSystemProfile {
                logical_cores: Some(8),
                memory_gb: Some(16.0),
                discrete_gpu_available: Some(true),
                active_power_plan: Some("Balanced".into()),
                session_attached: Some(true),
                active_tweaks: Vec::new(),
                active_registry_presets: Vec::new(),
                autorun_count: 9,
                running_process_count: 94,
            }),
            game_context: Some(MlGameContext {
                process_id: Some(4242),
                process_name: Some("cs2.exe".into()),
                profile_id: Some("cs2".into()),
                profile_title: Some("Counter-Strike 2".into()),
                allowed_actions: vec![
                    "process_priority".into(),
                    "power_plan".into(),
                    "cpu_affinity".into(),
                ],
            }),
        });

        assert!(result
            .recommended_functions
            .iter()
            .any(|id| id == "ultimate-power" || id == "max-games"));
        let score = result
            .function_scores
            .iter()
            .find(|score| score.function_id == "ultimate-power" || score.function_id == "max-games")
            .expect("expected an ML score for a primary game recommendation");
        assert!(score.confidence >= 0.6);
        assert!(score.expected_gain_pct > 0.0);
        assert!(!score.reason.is_empty());
        assert!(!score.signals.is_empty());
    }

    #[test]
    fn blocks_unreleased_fps_metadata_priors() {
        let metadata = serde_json::json!({
            "tweak_gain_priors": {
                "tweak_power_plan": 0.08
            },
            "recommendation_release": {
                "enabled": false,
                "released_tweaks": []
            }
        });
        assert!(fps_metadata_ranked_tweaks(&metadata).is_empty());

        let released = serde_json::json!({
            "tweak_gain_priors": {
                "tweak_power_plan": 0.08,
                "tweak_game_mode": 0.02
            },
            "recommendation_release": {
                "enabled": true,
                "released_tweaks": ["tweak_power_plan"]
            }
        });
        assert_eq!(
            fps_metadata_ranked_tweaks(&released),
            vec![("tweak_power_plan".into(), 0.08)]
        );
    }
}
