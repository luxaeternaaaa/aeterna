import type { BuildMetadata, FeatureFlags, SnapshotRecord, StartupDiagnostics, SystemSettings } from '../types'
import { Panel } from '../components/Panel'
import { ToggleRow } from '../components/ToggleRow'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'

interface SettingsPageProps {
  build: BuildMetadata
  diffText: string
  featureFlags: FeatureFlags
  onInspectSnapshot: (id: string) => void
  onRestoreSnapshot: (id: string) => void
  onUpdateAdvancedRegistryDetails: (enabled: boolean) => void
  onUpdateAutomationAllowlist: (action: 'process_priority' | 'cpu_affinity' | 'power_plan', enabled: boolean) => void
  onUpdateAutomationMode: (mode: SystemSettings['automation_mode']) => void
  onToggleFlag: (key: keyof FeatureFlags, value: boolean) => void
  onUpdateTheme: (theme: 'dark' | 'light') => void
  onUpdateTelemetryMode: (mode: SystemSettings['telemetry_mode']) => void
  onUpdateProfile: (profile: string) => void
  settings: SystemSettings
  snapshots: SnapshotRecord[]
  startupDiagnostics: StartupDiagnostics | null
  theme: 'dark' | 'light'
}

function buildSummary(build: BuildMetadata) {
  if (!build.build_timestamp) return stateCopy.buildPending
  return `v${build.version} | Runtime schema ${build.runtime_schema_version} | Sidecar ${build.sidecar_protocol_version} | Built ${formatTimestamp(build.build_timestamp, 'Build time not recorded')}`
}

export function SettingsPage(props: SettingsPageProps) {
  const {
    build,
    diffText,
    featureFlags,
    onInspectSnapshot,
    onRestoreSnapshot,
    onUpdateAdvancedRegistryDetails,
    onToggleFlag,
    onUpdateAutomationAllowlist,
    onUpdateAutomationMode,
    onUpdateProfile,
    onUpdateTheme,
    onUpdateTelemetryMode,
    settings,
    snapshots,
    startupDiagnostics,
    theme,
  } = props

  const approvedAutomationDefaults: Array<'process_priority' | 'cpu_affinity' | 'power_plan'> = [
    'process_priority',
    'cpu_affinity',
    'power_plan',
  ]
  const effectiveAllowlist =
    settings.automation_allowlist.length > 0 ? settings.automation_allowlist : approvedAutomationDefaults

  return (
    <div className="space-y-5">
      <Panel title="Approved automations" variant="secondary">
        <div className="grid gap-3 xl:grid-cols-2">
          <ToggleRow
            checked={effectiveAllowlist.includes('process_priority')}
            label="Priority changes"
            onChange={(next) => onUpdateAutomationAllowlist('process_priority', next)}
          />
          <ToggleRow
            checked={effectiveAllowlist.includes('cpu_affinity')}
            label="CPU affinity"
            onChange={(next) => onUpdateAutomationAllowlist('cpu_affinity', next)}
          />
          <ToggleRow
            checked={effectiveAllowlist.includes('power_plan')}
            label="Power plan changes"
            onChange={(next) => onUpdateAutomationAllowlist('power_plan', next)}
          />
        </div>
      </Panel>

      <div className="grid gap-5">
        <Panel title="Advanced" variant="secondary">
          <div className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-2">
              <ToggleRow
                checked={featureFlags.anomaly_detection}
                label="Anomaly detection"
                onChange={(next) => onToggleFlag('anomaly_detection', next)}
              />
              <ToggleRow
                checked={featureFlags.auto_security_scan}
                label="Automatic safety review"
                onChange={(next) => onToggleFlag('auto_security_scan', next)}
              />
              <ToggleRow
                checked={settings.show_advanced_registry_details}
                label="Show advanced registry details"
                onChange={onUpdateAdvancedRegistryDetails}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="surface-card text-sm text-muted">
                <span className="block text-sm font-medium text-text">Telemetry mode</span>
                <select
                  className="input-shell mt-2"
                  onChange={(event) => onUpdateTelemetryMode(event.target.value as SystemSettings['telemetry_mode'])}
                  value={settings.telemetry_mode}
                >
                  <option value="demo">Demo</option>
                  <option value="live">Live</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <label className="surface-card text-sm text-muted">
                <span className="block text-sm font-medium text-text">Automation mode</span>
                <select
                  className="input-shell mt-2"
                  onChange={(event) => onUpdateAutomationMode(event.target.value as SystemSettings['automation_mode'])}
                  value={settings.automation_mode}
                >
                  <option value="manual">Manual</option>
                  <option value="assisted">Assisted</option>
                  <option value="trusted_profiles">Trusted profiles</option>
                </select>
              </label>

              <label className="surface-card text-sm text-muted">
                <span className="block text-sm font-medium text-text">Theme</span>
                <select className="input-shell mt-2" onChange={(event) => onUpdateTheme(event.target.value as 'dark' | 'light')} value={theme}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label className="surface-card text-sm text-muted">
                <span className="block text-sm font-medium text-text">Profile</span>
                <select className="input-shell mt-2" onChange={(event) => onUpdateProfile(event.target.value)} value={settings.active_profile}>
                  <option value="balanced">Balanced</option>
                  <option value="competitive">Competitive</option>
                  <option value="quiet">Quiet</option>
                </select>
              </label>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel title="Diagnostics" variant="secondary">
          <div className="space-y-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Build</p>
              <p className="mt-3 text-sm leading-6 text-muted">{buildSummary(build)}</p>
            </div>

            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Startup diagnostics</p>
              <p className="mt-3 text-sm leading-6 text-muted">
                {startupDiagnostics
                  ? `Launch ${formatTimestamp(startupDiagnostics.launch_started_at, 'not recorded')} | Window ${formatTimestamp(startupDiagnostics.window_visible_at, 'not recorded')} | Sidecar ${formatTimestamp(startupDiagnostics.sidecar_ready_at, 'not recorded')} | Backend ${formatTimestamp(startupDiagnostics.backend_ready_at, 'not recorded')}`
                  : 'Startup diagnostics are still loading.'}
              </p>
            </div>

            <div className="space-y-3">
              {snapshots.length === 0 ? <div className="surface-card text-sm text-muted">{stateCopy.noConfigSnapshots}</div> : null}
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="summary-card">
                  <p className="text-sm font-semibold tracking-tight text-text">{snapshot.note}</p>
                  <p className="mt-1 text-sm text-muted">
                    {snapshot.surface ?? 'config'} snapshot | {snapshot.kind} | {formatTimestamp(snapshot.created_at)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="button-secondary" onClick={() => onInspectSnapshot(snapshot.id)} type="button">
                      Inspect
                    </button>
                    <button className="button-secondary" onClick={() => onRestoreSnapshot(snapshot.id)} type="button">
                      Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Snapshot details" variant="secondary">
          <pre className="h-[22rem] overflow-auto rounded-[1.35rem] bg-surface px-4 py-4 text-xs leading-6 text-muted ring-1 ring-inset ring-border/60">
            {diffText || stateCopy.noSnapshot}
          </pre>
        </Panel>
      </div>
    </div>
  )
}
