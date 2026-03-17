import type { SecuritySummary } from '../types'
import { Panel } from '../components/Panel'

interface SecurityPageProps {
  security: SecuritySummary
}

export function SecurityPage({ security }: SecurityPageProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Session security" subtitle="Suspicious session classification stays local unless cloud features are enabled.">
        <div className="space-y-4 text-sm text-muted">
          <p>Status: {security.status}</p>
          <p>Detected label: {security.label}</p>
          <p>Confidence: {(security.confidence * 100).toFixed(0)}%</p>
          <p>Automatic scanning: {security.auto_scan_enabled ? 'Enabled' : 'Disabled by default'}</p>
        </div>
      </Panel>
      <Panel title="Privacy posture" subtitle="The default operating mode is strictly local and opt-in.">
        <ul className="space-y-4 text-sm leading-6 text-muted">
          <li>No outbound sync is allowed unless a user enables it.</li>
          <li>Security logs are stored in local SQLite only.</li>
          <li>Cloud training and telemetry export remain disabled by default.</li>
        </ul>
      </Panel>
    </div>
  )
}

