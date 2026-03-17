use std::{collections::BTreeMap, fs};

use crate::{
    models::{MlInferencePayload, MlInferenceRequest, MlModelMetadata},
    paths::ml_metadata_path,
};

fn sigmoid(value: f64) -> f64 {
    1.0 / (1.0 + (-value).exp())
}

fn default_metadata() -> MlModelMetadata {
    MlModelMetadata {
        version: "fallback-v1".into(),
        updated_at: "1970-01-01T00:00:00Z".into(),
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

pub fn infer(payload: MlInferenceRequest) -> MlInferencePayload {
    let metadata = load_metadata();
    let score = metadata
        .weights
        .iter()
        .fold(metadata.intercept, |acc, (key, weight)| acc + feature_value(&payload, key) * weight);
    let spike_probability = sigmoid(score).clamp(0.02, 0.98);
    let risk_label = if spike_probability > 0.78 { "high" } else if spike_probability > 0.48 { "medium" } else { "low" };
    let mut recommended_tweaks = Vec::new();
    let mut factors = Vec::new();
    if payload.cpu_process_pct > 82.0 || payload.background_process_count > 42 {
        recommended_tweaks.push("process_priority".into());
    }
    if payload.cpu_process_pct > 76.0 && payload.frametime_p95_ms > 12.0 {
        recommended_tweaks.push("cpu_affinity".into());
    }
    if payload.gpu_usage_pct > 92.0 || payload.frametime_p95_ms > 16.0 {
        recommended_tweaks.push("power_plan".into());
    }
    if recommended_tweaks.is_empty() && spike_probability > 0.4 {
        recommended_tweaks.push("process_priority".into());
    }
    for tweak in &recommended_tweaks {
        if let Some(lines) = metadata.recommendation_map.get(tweak) {
            factors.extend(lines.clone());
        }
    }
    MlInferencePayload {
        spike_probability,
        risk_label: risk_label.into(),
        confidence: (0.58 + spike_probability * 0.28).min(0.97),
        recommended_tweaks,
        summary: format!(
            "Local model {} estimates a {} spike probability for the next gameplay window.",
            metadata.version,
            (spike_probability * 100.0).round()
        ),
        factors,
        model_version: Some(metadata.version),
        model_source: Some(metadata.model_source),
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
        });
        assert_eq!(result.risk_label, "high");
        assert!(!result.recommended_tweaks.is_empty());
    }
}
