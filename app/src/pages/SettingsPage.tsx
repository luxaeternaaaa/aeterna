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
  onUpdateRegistryPresetsEnabled: (enabled: boolean) => void
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
    onUpdateRegistryPresetsEnabled,
    onUpdateProfile,
    onUpdateTheme,
    onUpdateTelemetryMode,
    settings,
    snapshots,
    startupDiagnostics,
    theme,
  } = props

  const changesBlocked = !featureFlags.network_optimizer

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="action-stage">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Policy</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">
              {changesBlocked ? 'Changes blocked by policy' : 'Safe changes allowed'}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
              {changesBlocked
                ? 'Aeterna can inspect the session, but performance changes stay off until you allow them.'
                : 'Only the approved, rollback-ready actions below may run.'}
            </p>
            {changesBlocked ? (
              <button className="button-primary mt-6" onClick={() => onToggleFlag('network_optimizer', true)} type="button">
                Allow safe changes
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Telemetry</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-text">{settings.telemetry_mode}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Retention {settings.telemetry_retention_days} days. Sampling every {settings.sampling_interval_seconds}s.</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Automation</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-text">{settings.automation_mode.replace('_', ' ')}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Automation never outranks rollback or approved scope.</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel subtitle="These permissions unlock real changes." title="Permissions" variant="secondary">
        <div className="grid gap-3 xl:grid-cols-2">
          <ToggleRow
            checked={featureFlags.telemetry_collect}
            description="Store local samples for dashboards and recommendations."
            label="Telemetry collection"
            onChange={(next) => onToggleFlag('telemetry_collect', next)}
          />
          <ToggleRow
            checked={featureFlags.network_optimizer}
            description="Allow safe, rollback-ready performance changes."
            label="Safe changes"
            onChange={(next) => onToggleFlag('network_optimizer', next)}
          />
          <ToggleRow
            checked={settings.registry_presets_enabled}
            description="Allow only approved presets that create a rollback snapshot first."
            label="System presets"
            onChange={onUpdateRegistryPresetsEnabled}
          />
        </div>
      </Panel>

      <Panel subtitle="Keep automation narrow and explicit." title="Approved automations" variant="secondary">
        <div className="grid gap-3 xl:grid-cols-2">
          <ToggleRow
            checked={settings.automation_allowlist.includes('process_priority')}
            description="Let approved automation raise process priority with rollback."
            label="Priority changes"
            onChange={(next) => onUpdateAutomationAllowlist('process_priority', next)}
          />
          <ToggleRow
            checked={settings.automation_allowlist.includes('cpu_affinity')}
            description="Let approved automation use the balanced CPU affinity preset."
            label="CPU affinity"
            onChange={(next) => onUpdateAutomationAllowlist('cpu_affinity', next)}
          />
          <ToggleRow
            checked={settings.automation_allowlist.includes('power_plan')}
            description="Let approved automation switch power plans only when the original one can be restored."
            label="Power plan changes"
            onChange={(next) => onUpdateAutomationAllowlist('power_plan', next)}
          />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel subtitle="Defaults for session behavior and display." title="Session defaults" variant="secondary">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="surface-card text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Profile</span>
              <select className="input-shell mt-3" onChange={(event) => onUpdateProfile(event.target.value)} value={settings.active_profile}>
                <option value="balanced">Balanced</option>
                <option value="competitive">Competitive</option>
                <option value="quiet">Quiet</option>
              </select>
            </label>
            <label className="surface-card text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Theme</span>
              <select className="input-shell mt-3" onChange={(event) => onUpdateTheme(event.target.value as 'dark' | 'light')} value={theme}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="surface-card text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Telemetry mode</span>
              <select
                className="input-shell mt-3"
                onChange={(event) => onUpdateTelemetryMode(event.target.value as SystemSettings['telemetry_mode'])}
                value={settings.telemetry_mode}
              >
                <option value="demo">Demo</option>
                <option value="live">Live</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label className="surface-card text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Automation mode</span>
              <select
                className="input-shell mt-3"
                onChange={(event) => onUpdateAutomationMode(event.target.value as SystemSettings['automation_mode'])}
                value={settings.automation_mode}
              >
                <option value="manual">Manual</option>
                <option value="assisted">Assisted</option>
                <option value="trusted_profiles">Trusted profiles</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel subtitle="Restricted or advanced capabilities." title="Advanced and external" variant="secondary">
          <div className="space-y-3">
            <ToggleRow
              checked={featureFlags.cloud_features}
              description="Keep outbound sync and shared analytics off until you explicitly allow them."
              label="Cloud features"
              onChange={(next) => onToggleFlag('cloud_features', next)}
            />
            <ToggleRow
              checked={featureFlags.cloud_training}
              description="Keep model training on-device until you decide otherwise."
              label="Cloud training"
              onChange={(next) => onToggleFlag('cloud_training', next)}
            />
            <ToggleRow
              checked={featureFlags.anomaly_detection}
              description="Run the anomaly model against local session telemetry."
              label="Anomaly detection"
              onChange={(next) => onToggleFlag('anomaly_detection', next)}
            />
            <ToggleRow
              checked={featureFlags.auto_security_scan}
              description="Run local safety checks during active play."
              label="Automatic safety review"
              onChange={(next) => onToggleFlag('auto_security_scan', next)}
            />
            <ToggleRow
              checked={settings.show_advanced_registry_details}
              description="Show exact registry details in preset previews for expert review."
              label="Show advanced registry details"
              onChange={onUpdateAdvancedRegistryDetails}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel subtitle="Build info, startup timings, and saved snapshots." title="Diagnostics" variant="secondary">
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

        <Panel subtitle="Selected snapshot diff or current placeholder." title="Snapshot details" variant="secondary">
          <pre className="max-h-[30rem] overflow-auto rounded-[1.35rem] bg-surface px-4 py-4 text-xs leading-6 text-muted ring-1 ring-inset ring-border/60">
            {diffText || stateCopy.noSnapshot}
          </pre>
        </Panel>
      </div>
    </div>
  )
}
