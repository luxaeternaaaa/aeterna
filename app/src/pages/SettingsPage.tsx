import type { BuildMetadata, FeatureFlags, SnapshotRecord, StartupDiagnostics, SystemSettings } from '../types'
import { Panel } from '../components/Panel'
import { ToggleRow } from '../components/ToggleRow'

interface SettingsPageProps {
  build: BuildMetadata
  diffText: string
  featureFlags: FeatureFlags
  onInspectSnapshot: (id: string) => void
  onRestoreSnapshot: (id: string) => void
  onUpdateAutomationAllowlist: (action: 'process_priority' | 'cpu_affinity' | 'power_plan', enabled: boolean) => void
  onUpdateAutomationMode: (mode: SystemSettings['automation_mode']) => void
  onToggleFlag: (key: keyof FeatureFlags, value: boolean) => void
  onUpdateTelemetryMode: (mode: SystemSettings['telemetry_mode']) => void
  onUpdateProfile: (profile: string) => void
  settings: SystemSettings
  snapshots: SnapshotRecord[]
  startupDiagnostics: StartupDiagnostics | null
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
    onUpdateTelemetryMode,
    settings,
    snapshots,
    startupDiagnostics,
  } = props
  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Panel title="Privacy & Telemetry" subtitle="Every optional capability is off by default until the user explicitly enables it.">
        <div className="space-y-3">
          <ToggleRow checked={featureFlags.telemetry_collect} label="Telemetry collection" description="Stores local telemetry samples for dashboards and ML inputs." onChange={(next) => onToggleFlag('telemetry_collect', next)} />
          <ToggleRow checked={featureFlags.network_optimizer} label="Performance optimizer" description="Applies local scheduler and power-plan recommendations." onChange={(next) => onToggleFlag('network_optimizer', next)} />
          <ToggleRow checked={featureFlags.anomaly_detection} label="Anomaly detection" description="Runs the anomaly model against local session telemetry." onChange={(next) => onToggleFlag('anomaly_detection', next)} />
          <ToggleRow checked={featureFlags.auto_security_scan} label="Automatic security scan" description="Classifies suspicious sessions locally during active play." onChange={(next) => onToggleFlag('auto_security_scan', next)} />
          <ToggleRow checked={featureFlags.cloud_features} label="Cloud features" description="Controls any future outbound synchronization or shared analytics." onChange={(next) => onToggleFlag('cloud_features', next)} />
          <ToggleRow checked={featureFlags.cloud_training} label="Cloud training" description="Keeps model training strictly local until manually enabled." onChange={(next) => onToggleFlag('cloud_training', next)} />
        </div>
        <div className="mt-5 rounded-2xl border border-border px-4 py-4 text-sm text-muted">
          Mode: {settings.privacy_mode} | Telemetry: {settings.telemetry_mode} | Retention: {settings.telemetry_retention_days} days | Sampling: {settings.sampling_interval_seconds}s
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
          Automation mode: <span className="font-medium text-text">{settings.automation_mode.replace('_', ' ')}</span>. Policy-governed automation never bypasses rollback and only runs inside your approved allowlist.
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
          Compatibility mode: no overlays, no DLL injection, no memory edits, and no driver-level changes unless you explicitly opt in to future vendor integrations.
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted">Profile</label>
          <select value={settings.active_profile} onChange={(event) => onUpdateProfile(event.target.value)} className="rounded-full border border-border px-4 py-2 outline-none">
            <option value="balanced">Balanced</option>
            <option value="competitive">Competitive</option>
            <option value="quiet">Quiet</option>
          </select>
          <label className="text-sm text-muted">Telemetry mode</label>
          <select value={settings.telemetry_mode} onChange={(event) => onUpdateTelemetryMode(event.target.value as SystemSettings['telemetry_mode'])} className="rounded-full border border-border px-4 py-2 outline-none">
            <option value="demo">Demo</option>
            <option value="live">Live</option>
            <option value="disabled">Disabled</option>
          </select>
          <label className="text-sm text-muted">Automation mode</label>
          <select value={settings.automation_mode} onChange={(event) => onUpdateAutomationMode(event.target.value as SystemSettings['automation_mode'])} className="rounded-full border border-border px-4 py-2 outline-none">
            <option value="manual">Manual</option>
            <option value="assisted">Assisted</option>
            <option value="trusted_profiles">Trusted profiles</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          <ToggleRow
            checked={settings.automation_allowlist.includes('process_priority')}
            description="Allow pre-approved session automation to raise process priority for detected games with rollback."
            label="Allow automated priority changes"
            onChange={(next) => onUpdateAutomationAllowlist('process_priority', next)}
          />
          <ToggleRow
            checked={settings.automation_allowlist.includes('cpu_affinity')}
            description="Allow automation to apply the balanced affinity preset only during an attached session."
            label="Allow automated CPU affinity"
            onChange={(next) => onUpdateAutomationAllowlist('cpu_affinity', next)}
          />
          <ToggleRow
            checked={settings.automation_allowlist.includes('power_plan')}
            description="Allow automation to switch to an approved existing Windows power plan and restore your original plan after the session ends."
            label="Allow automated power plan switching"
            onChange={(next) => onUpdateAutomationAllowlist('power_plan', next)}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
          Build: v{build.version} | Runtime schema {build.runtime_schema_version} | Sidecar protocol {build.sidecar_protocol_version}
          <br />
          Built: {new Date(build.build_timestamp).toLocaleString()} | Commit: {build.git_commit}
        </div>
        {startupDiagnostics ? (
          <div className="mt-4 rounded-2xl border border-border px-4 py-4 text-sm leading-6 text-muted">
            Startup diagnostics: launch {startupDiagnostics.launch_started_at ?? 'n/a'} | window {startupDiagnostics.window_visible_at ?? 'n/a'} | sidecar {startupDiagnostics.sidecar_ready_at ?? 'n/a'} | backend {startupDiagnostics.backend_ready_at ?? 'n/a'} | bootstrap {startupDiagnostics.bootstrap_loaded_at ?? 'n/a'}
          </div>
        ) : null}
      </Panel>
      <Panel title="Rollback history" subtitle="Snapshots are created before updates to settings and model state.">
        <div className="space-y-3">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded-2xl border border-border px-4 py-4">
              <p className="text-sm font-medium">{snapshot.note}</p>
              <p className="mt-1 text-sm text-muted">
                {snapshot.kind} | {new Date(snapshot.created_at).toLocaleString()}
              </p>
              <div className="mt-3 flex gap-3">
                <button onClick={() => onInspectSnapshot(snapshot.id)} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">Inspect</button>
                <button onClick={() => onRestoreSnapshot(snapshot.id)} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">Restore</button>
              </div>
            </div>
          ))}
        </div>
        <pre className="mt-5 max-h-72 overflow-auto rounded-2xl border border-border bg-[#fcfcfc] p-4 text-xs leading-6 text-muted">{diffText || 'Select a snapshot to inspect the current diff.'}</pre>
      </Panel>
    </div>
  )
}
