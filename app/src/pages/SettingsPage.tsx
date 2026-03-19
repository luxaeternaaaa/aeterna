import type { BuildMetadata, FeatureFlags, SnapshotRecord, StartupDiagnostics, SystemSettings } from '../types'
import { Panel } from '../components/Panel'
import { ToggleRow } from '../components/ToggleRow'
import { stateCopy } from '../lib/stateCopy'

interface SettingsPageProps {
  build: BuildMetadata
  diffText: string
  featureFlags: FeatureFlags
  onInspectSnapshot: (id: string) => void
  onRestoreSnapshot: (id: string) => void
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
  return `Build v${build.version} | Runtime schema ${build.runtime_schema_version} | Sidecar protocol ${build.sidecar_protocol_version} | Built ${new Date(build.build_timestamp).toLocaleString()} | Commit ${build.git_commit}`
}

export function SettingsPage(props: SettingsPageProps) {
  const {
    build,
    diffText,
    featureFlags,
    onInspectSnapshot,
    onRestoreSnapshot,
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

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Privacy defaults" subtitle="What the product is allowed to observe, export, and retain." variant="primary">
          <div className="space-y-3">
            <ToggleRow checked={featureFlags.telemetry_collect} label="Telemetry collection" description="Store local telemetry samples for dashboards and ML inputs." onChange={(next) => onToggleFlag('telemetry_collect', next)} />
            <ToggleRow checked={featureFlags.cloud_features} label="Cloud features" description="Keep any future outbound synchronization or shared analytics disabled until explicitly approved." onChange={(next) => onToggleFlag('cloud_features', next)} />
            <ToggleRow checked={featureFlags.cloud_training} label="Cloud training" description="Keep model training strictly on-device until the user decides otherwise." onChange={(next) => onToggleFlag('cloud_training', next)} />
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-muted">
            Mode {settings.privacy_mode} | Telemetry {settings.telemetry_mode} | Retention {settings.telemetry_retention_days} days | Sampling every {settings.sampling_interval_seconds}s
          </div>
        </Panel>
        <Panel title="Automation authority" subtitle="What the product may actually do after you turn automation on." variant="secondary">
          <div className="space-y-3">
            <ToggleRow checked={featureFlags.network_optimizer} label="Performance optimizer" description="Allow local scheduler and power-plan recommendations to become executable actions." onChange={(next) => onToggleFlag('network_optimizer', next)} />
            <ToggleRow checked={settings.automation_allowlist.includes('process_priority')} label="Allow automated priority changes" description="Permit pre-approved session automation to raise process priority for detected games with rollback." onChange={(next) => onUpdateAutomationAllowlist('process_priority', next)} />
            <ToggleRow checked={settings.automation_allowlist.includes('cpu_affinity')} label="Allow automated CPU affinity" description="Permit the balanced affinity preset only during an attached session." onChange={(next) => onUpdateAutomationAllowlist('cpu_affinity', next)} />
            <ToggleRow checked={settings.automation_allowlist.includes('power_plan')} label="Allow automated power plan switching" description="Permit power plan changes only with automatic restoration after the session ends." onChange={(next) => onUpdateAutomationAllowlist('power_plan', next)} />
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-muted">
            Automation mode <span className="font-medium text-text">{settings.automation_mode.replace('_', ' ')}</span>. Policy-governed automation never bypasses rollback and only runs inside your approved allowlist.
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Session behavior" subtitle="Defaults that affect how the product behaves during real gameplay." variant="secondary">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4 text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Profile</span>
              <select value={settings.active_profile} onChange={(event) => onUpdateProfile(event.target.value)} className="mt-3 w-full rounded-full border border-border-strong bg-surface px-4 py-2 text-text outline-none">
                <option value="balanced">Balanced</option>
                <option value="competitive">Competitive</option>
                <option value="quiet">Quiet</option>
              </select>
            </label>
            <label className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4 text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Theme</span>
              <select value={theme} onChange={(event) => onUpdateTheme(event.target.value as 'dark' | 'light')} className="mt-3 w-full rounded-full border border-border-strong bg-surface px-4 py-2 text-text outline-none">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4 text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Telemetry mode</span>
              <select value={settings.telemetry_mode} onChange={(event) => onUpdateTelemetryMode(event.target.value as SystemSettings['telemetry_mode'])} className="mt-3 w-full rounded-full border border-border-strong bg-surface px-4 py-2 text-text outline-none">
                <option value="demo">Demo</option>
                <option value="live">Live</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label className="rounded-[1.5rem] border border-border bg-surface-muted/65 px-4 py-4 text-sm text-muted">
              <span className="block text-xs uppercase tracking-[0.18em] text-muted">Automation mode</span>
              <select value={settings.automation_mode} onChange={(event) => onUpdateAutomationMode(event.target.value as SystemSettings['automation_mode'])} className="mt-3 w-full rounded-full border border-border-strong bg-surface px-4 py-2 text-text outline-none">
                <option value="manual">Manual</option>
                <option value="assisted">Assisted</option>
                <option value="trusted_profiles">Trusted profiles</option>
              </select>
            </label>
          </div>
          <div className="mt-5 space-y-3">
            <ToggleRow checked={featureFlags.anomaly_detection} label="Anomaly detection" description="Run the anomaly model against local session telemetry." onChange={(next) => onToggleFlag('anomaly_detection', next)} />
            <ToggleRow checked={featureFlags.auto_security_scan} label="Automatic security scan" description="Classify suspicious sessions locally during active play." onChange={(next) => onToggleFlag('auto_security_scan', next)} />
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-muted">
            Compatibility mode keeps overlays, DLL injection, memory edits, and driver-level changes out of the current product path.
          </div>
        </Panel>
        <Panel title="Diagnostics and build state" subtitle="Support-facing truth that should never masquerade as user-facing product value." variant="utility">
          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              {buildSummary(build)}
            </div>
            {startupDiagnostics ? (
              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
                Startup diagnostics: launch {startupDiagnostics.launch_started_at ?? 'n/a'} | window {startupDiagnostics.window_visible_at ?? 'n/a'} | sidecar {startupDiagnostics.sidecar_ready_at ?? 'n/a'} | backend {startupDiagnostics.backend_ready_at ?? 'n/a'} | bootstrap {startupDiagnostics.bootstrap_loaded_at ?? 'n/a'}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
                Startup diagnostics are still loading.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <Panel title="Rollback history" subtitle="Snapshots created before settings, model, and reversible runtime changes." variant="secondary">
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            {snapshots.length === 0 ? <p className="text-sm text-muted">{stateCopy.noActivity}</p> : null}
            {snapshots.map((snapshot) => (
              <div key={snapshot.id} className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4">
                <p className="text-sm font-medium">{snapshot.note}</p>
                <p className="mt-1 text-sm text-muted">
                  {snapshot.kind} | {new Date(snapshot.created_at).toLocaleString()}
                </p>
                <div className="mt-3 flex gap-3">
                  <button onClick={() => onInspectSnapshot(snapshot.id)} className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" type="button">
                    Inspect
                  </button>
                  <button onClick={() => onRestoreSnapshot(snapshot.id)} className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" type="button">
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
          <pre className="max-h-80 overflow-auto rounded-[1.5rem] border border-border bg-surface-muted p-4 text-xs leading-6 text-muted">{diffText || stateCopy.noSnapshot}</pre>
        </div>
      </Panel>
    </div>
  )
}
