import type { FeatureFlags } from '../types'

export type ConsentCopy = {
  description: string
  title: string
}

export const featureConsent: Record<keyof FeatureFlags, ConsentCopy> = {
  telemetry_collect: {
    title: 'Enable telemetry collection',
    description: 'Save local session metrics for dashboards and proof. Nothing is sent anywhere unless you turn that on yourself.',
  },
  network_optimizer: {
    title: 'Enable optimization actions',
    description: 'Allow safe local changes. Every real change creates a rollback snapshot before it runs.',
  },
  anomaly_detection: {
    title: 'Enable anomaly detection',
    description: 'Use the local safety model to flag unusual session behavior on this device.',
  },
  auto_security_scan: {
    title: 'Enable automatic security scan',
    description: 'Run automatic local safety checks while you play. This stays read-only.',
  },
  cloud_features: {
    title: 'Enable cloud features',
    description: 'Allow future sync features. Leave this off if you want Aeterna to stay fully local.',
  },
  cloud_training: {
    title: 'Enable cloud training',
    description: 'Allow future cloud training. Leave this off if you want all model work to stay on-device.',
  },
}
