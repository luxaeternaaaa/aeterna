use crate::models::{MlFunctionScore, MlInferenceRequest};

fn push_unique_signal(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|item| item == &value) {
        values.push(value);
    }
}

fn round_score(value: f64) -> f64 {
    (value.clamp(0.0, 0.99) * 1000.0).round() / 1000.0
}

fn round_gain_pct(value: f64) -> f64 {
    (value.max(0.0) * 100.0).round() / 100.0
}

fn metadata_nested_f64(
    metadata: &serde_json::Value,
    section: &str,
    key: &str,
    field: &str,
) -> Option<f64> {
    metadata
        .get(section)
        .and_then(|value| value.get(key))
        .and_then(|value| value.get(field))
        .and_then(serde_json::Value::as_f64)
}

pub fn fps_expected_gain_pct(metadata: &serde_json::Value, key: &str, gain_prior: f64) -> f64 {
    metadata_nested_f64(metadata, "ablation_summary", key, "positive_mean_gain_pct")
        .unwrap_or(gain_prior * 100.0)
}

pub fn fps_metadata_confidence(
    metadata: &serde_json::Value,
    key: &str,
    gain_prior: f64,
    spike_probability: f64,
) -> f64 {
    let mut confidence = 0.55 + gain_prior * 7.0 + spike_probability * 0.18;
    if let Some(roc_auc) = metadata_nested_f64(metadata, "tweak_metrics", key, "roc_auc") {
        if roc_auc >= 0.75 {
            confidence += ((roc_auc - 0.75) * 0.12).min(0.04);
        } else if roc_auc <= 0.55 {
            confidence -= 0.05;
        }
    }
    let has_reliability = metadata
        .get("tweak_reliability")
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_array)
        .map(|rows| !rows.is_empty())
        .unwrap_or(false);
    let useful_rate =
        metadata_nested_f64(metadata, "tweak_metrics", key, "positive_rate").unwrap_or(0.0);
    if !has_reliability && useful_rate <= 0.0 {
        confidence -= 0.05;
    }
    confidence.clamp(0.45, 0.97)
}

pub fn fps_score_signals(
    metadata: &serde_json::Value,
    key: &str,
    spike_probability: f64,
    confidence: f64,
) -> Vec<String> {
    let mut signals = vec![
        format!("Live spike probability {:.0}%.", spike_probability * 100.0),
        format!("Calibrated tweak confidence {:.0}%.", confidence * 100.0),
    ];
    if let Some(roc_auc) = metadata_nested_f64(metadata, "tweak_metrics", key, "roc_auc") {
        signals.push(format!("Tweak ROC-AUC {:.2}.", roc_auc));
    }
    if let Some(useful_rate) = metadata_nested_f64(metadata, "tweak_metrics", key, "positive_rate")
    {
        signals.push(format!("Training useful-rate {:.1}%.", useful_rate * 100.0));
    }
    signals
}

pub fn push_function_score(
    function_scores: &mut Vec<MlFunctionScore>,
    function_id: &str,
    confidence: f64,
    expected_gain_pct: f64,
    reason: String,
    source: &str,
    signals: Vec<String>,
) {
    if let Some(existing) = function_scores
        .iter_mut()
        .find(|item| item.function_id == function_id)
    {
        if confidence > existing.confidence {
            existing.confidence = round_score(confidence);
            existing.reason = reason;
            existing.source = source.into();
        }
        if expected_gain_pct > existing.expected_gain_pct {
            existing.expected_gain_pct = round_gain_pct(expected_gain_pct);
        }
        for signal in signals {
            push_unique_signal(&mut existing.signals, signal);
        }
        return;
    }
    function_scores.push(MlFunctionScore {
        function_id: function_id.into(),
        confidence: round_score(confidence),
        expected_gain_pct: round_gain_pct(expected_gain_pct),
        reason,
        source: source.into(),
        signals,
    });
}

fn rule_score_for_function(
    function_id: &str,
    payload: &MlInferenceRequest,
    spike_probability: f64,
) -> (f64, f64, String, &'static str, Vec<String>) {
    let has_game = payload.game_context.is_some();
    let mut confidence = 0.58 + spike_probability * 0.2 + if has_game { 0.06 } else { 0.0 };
    let mut expected_gain_pct = 0.8;
    let mut source = "live-safety-rule";
    let mut reason =
        "Selected by the local safety rules after telemetry, OS, and game-context analysis."
            .to_string();
    let mut signals = vec![
        format!(
            "CPU process {:.0}%, CPU total {:.0}%.",
            payload.cpu_process_pct, payload.cpu_total_pct
        ),
        format!(
            "P95 frametime {:.1} ms, frame drops {:.1}%.",
            payload.frametime_p95_ms,
            payload.frame_drop_ratio * 100.0
        ),
        format!(
            "GPU usage {:.0}%, background processes {}.",
            payload.gpu_usage_pct, payload.background_process_count
        ),
    ];

    if let Some(game) = payload.game_context.as_ref() {
        let game_name = game
            .profile_title
            .as_deref()
            .or(game.process_name.as_deref())
            .unwrap_or("selected game");
        signals.push(format!("Game profile context: {game_name}."));
    }

    match function_id {
        "ultimate-power" => {
            confidence += 0.08;
            expected_gain_pct = if payload.gpu_usage_pct >= 70.0 || payload.frametime_p95_ms >= 16.0
            {
                3.8
            } else {
                2.2
            };
            reason = "Power policy is likely limiting sustained CPU/GPU boost behavior during the current workload.".into();
        }
        "max-games" => {
            confidence += 0.08;
            expected_gain_pct =
                if payload.cpu_process_pct >= 45.0 || payload.background_process_count >= 42 {
                    3.1
                } else {
                    1.7
                };
            source = "game-session-rule";
            reason =
                "Foreground game scheduling can improve when CPU pressure or process noise is visible."
                    .into();
        }
        "keep-cores" => {
            confidence += 0.05;
            expected_gain_pct =
                if payload.cpu_process_pct >= 55.0 || payload.frametime_p95_ms >= 12.0 {
                    2.4
                } else {
                    1.2
                };
            source = "game-session-rule";
            reason =
                "The selected game profile allows affinity tuning and the telemetry shows scheduler pressure."
                    .into();
        }
        "hags-on" => {
            confidence += if payload.gpu_usage_pct >= 45.0 {
                0.06
            } else {
                0.01
            };
            expected_gain_pct = 2.0;
            reason =
                "GPU/compositor pressure makes Hardware Accelerated GPU Scheduling a useful restart-gated candidate."
                    .into();
        }
        "low-timer-resolution" => {
            confidence += if payload.frametime_p95_ms >= 18.0 || payload.frame_drop_ratio >= 0.08 {
                0.07
            } else {
                0.02
            };
            expected_gain_pct = 1.1;
            reason =
                "Frame pacing volatility is high enough to justify a tighter timer-resolution request."
                    .into();
        }
        "diagtrack-off"
        | "maps-broker-off"
        | "content-delivery-off"
        | "feedback-frequency-off"
        | "app-launch-tracking-off" => {
            confidence += if payload.background_process_count >= 70 || payload.cpu_total_pct >= 60.0
            {
                0.06
            } else {
                0.0
            };
            expected_gain_pct = 1.0;
            source = "background-noise-rule";
            reason =
                "Background process and service noise is high enough to prefer reversible low-risk cleanup."
                    .into();
        }
        "game-mode-on" => {
            confidence += if has_game { 0.06 } else { 0.0 };
            expected_gain_pct = 1.5;
            source = "game-profile-rule";
            reason = "A detected game session should receive Windows foreground-game scheduling behavior."
                .into();
        }
        "turn-off-recordings" => {
            confidence += if has_game { 0.05 } else { 0.0 };
            expected_gain_pct = 1.6;
            source = "capture-overhead-rule";
            reason =
                "Capture and recording services can reduce GPU headroom during gameplay.".into();
        }
        "windowed-optimizations-on" => {
            confidence += if has_game { 0.04 } else { 0.0 };
            expected_gain_pct = 1.2;
            source = "presentation-rule";
            reason =
                "The selected game can benefit from the modern Windows presentation path.".into();
        }
        "power-throttling-off" | "process-qos-high" => {
            confidence += 0.05;
            expected_gain_pct = 1.7;
            source = "power-qos-rule";
            reason = "The current workload should avoid per-process or system power throttling during a game session.".into();
        }
        "usb-selective-suspend-off"
        | "pcie-lspm-off"
        | "reduce-input-lag"
        | "win32-priority-separation" => {
            confidence += if has_game { 0.04 } else { 0.0 };
            expected_gain_pct = 1.0;
            source = "latency-rule";
            reason =
                "Latency-sensitive device and scheduler settings are useful for the selected game profile."
                    .into();
        }
        _ => {}
    }

    (
        confidence.clamp(0.45, 0.9),
        expected_gain_pct,
        reason,
        source,
        signals,
    )
}

pub fn ensure_rule_scores_for_recommendations(
    payload: &MlInferenceRequest,
    spike_probability: f64,
    recommended_functions: &[String],
    function_scores: &mut Vec<MlFunctionScore>,
) {
    for function_id in recommended_functions {
        let (confidence, expected_gain_pct, reason, source, signals) =
            rule_score_for_function(function_id, payload, spike_probability);
        push_function_score(
            function_scores,
            function_id,
            confidence,
            expected_gain_pct,
            reason,
            source,
            signals,
        );
    }
}

pub fn finalize_function_scores(
    recommended_functions: &[String],
    function_scores: &mut Vec<MlFunctionScore>,
) {
    function_scores.retain(|score| {
        recommended_functions
            .iter()
            .any(|id| id == &score.function_id)
    });
    function_scores.sort_by(|left, right| {
        let left_index = recommended_functions
            .iter()
            .position(|id| id == &left.function_id)
            .unwrap_or(usize::MAX);
        let right_index = recommended_functions
            .iter()
            .position(|id| id == &right.function_id)
            .unwrap_or(usize::MAX);
        left_index.cmp(&right_index)
    });
}
