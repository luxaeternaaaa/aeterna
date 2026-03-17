import type { FeatureFlags } from '../types'

export type ConsentCopy = {
  description: string
  title: string
}

export const featureConsent: Record<keyof FeatureFlags, ConsentCopy> = {
  telemetry_collect: {
    title: 'Enable telemetry collection',
    description: 'Stores local session metrics for dashboards, rollback-safe analytics, and model input windows. No outbound sync is enabled by default.',
  },
  network_optimizer: {
    title: 'Enable optimization actions',
    description: 'Allows safe local optimization presets and recommendations. Every applied change should create a snapshot before execution.',
  },
  anomaly_detection: {
    title: 'Enable anomaly detection',
    description: 'Runs the local anomaly model against session telemetry to highlight unusual patterns and possible driver or system issues.',
  },
  auto_security_scan: {
    title: 'Enable automatic security scan',
    description: 'Checks sessions locally for suspicious patterns. This remains read-only and does not inject code, hooks, or modify game memory.',
  },
  cloud_features: {
    title: 'Enable cloud features',
    description: 'Unlocks future outbound sync capabilities. Keep this disabled for strict local-only operation and privacy-by-default behavior.',
  },
  cloud_training: {
    title: 'Enable cloud training',
    description: 'Allows future remote training workflows. Keep this disabled if you want all model work to stay on-device only.',
  },
}
