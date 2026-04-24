import { useState } from 'react'

import type { BuildMetadata, FeatureFlags, SnapshotRecord, StartupDiagnostics, SystemSettings } from '../types'
import { Panel } from '../components/Panel'
import {
  loadMlDenyFunctionList,
  OPTIMIZATION_FUNCTIONS,
  saveMlDenyFunctionList,
} from '../lib/optimizationFunctions'

interface SettingsPageProps {
  build: BuildMetadata
  diffText: string
  featureFlags: FeatureFlags
  onInspectSnapshot: (id: string) => void
  onRestoreSnapshot: (id: string) => void
  onUpdateAdvancedRegistryDetails: (enabled: boolean) => void
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

export function SettingsPage(props: SettingsPageProps) {
  const {
    build,
    diffText,
    featureFlags,
    onInspectSnapshot,
    onRestoreSnapshot,
    onUpdateAdvancedRegistryDetails,
    onToggleFlag,
    onUpdateAutomationMode,
    onUpdateProfile,
    onUpdateTheme,
    onUpdateTelemetryMode,
    settings,
    snapshots,
    startupDiagnostics,
    theme,
  } = props

  const [denyListOpen, setDenyListOpen] = useState(false)
  const [denyList, setDenyList] = useState<Set<string>>(() => loadMlDenyFunctionList())
  const featureRows: Array<{ key: keyof FeatureFlags; label: string; detail: string }> = [
    { key: 'network_optimizer', label: 'Safe changes', detail: 'Allow bounded, reversible optimizer actions.' },
    { key: 'telemetry_collect', label: 'Live telemetry', detail: 'Collect local session evidence for proof.' },
    { key: 'anomaly_detection', label: 'Anomaly review', detail: 'Show local risk signals during a session.' },
    { key: 'auto_security_scan', label: 'Safety review', detail: 'Run local checks before risky actions.' },
  ]

  const toggleDeniedFunction = (functionId: string, denied: boolean) => {
    setDenyList((current) => {
      const next = new Set(current)
      if (denied) next.add(functionId)
      else next.delete(functionId)
      saveMlDenyFunctionList(next)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <Panel title="Authority" subtitle="Changes stay explicit, bounded, and reversible." variant="secondary">
        <div className="grid gap-3 md:grid-cols-2">
          {featureRows.map((row) => (
            <label key={row.key} className="surface-card flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold text-text">{row.label}</span>
                <span className="mt-1 block text-sm leading-6 text-muted">{row.detail}</span>
              </span>
              <input
                checked={featureFlags[row.key]}
                className="mt-1 h-5 w-5 accent-[rgb(var(--color-accent))]"
                onChange={(event) => onToggleFlag(row.key, event.target.checked)}
                type="checkbox"
              />
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Operating mode" subtitle="Choose the proof source and automation boundary." variant="secondary">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="surface-card">
            <span className="block text-xs uppercase text-muted">Telemetry</span>
            <select
              className="input-shell mt-3"
              onChange={(event) => onUpdateTelemetryMode(event.target.value as SystemSettings['telemetry_mode'])}
              value={settings.telemetry_mode}
            >
              <option value="demo">Demo</option>
              <option value="live">Live</option>
              <option value="disabled">Off</option>
            </select>
          </label>
          <label className="surface-card">
            <span className="block text-xs uppercase text-muted">Automation</span>
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
          <label className="surface-card">
            <span className="block text-xs uppercase text-muted">Theme</span>
            <select className="input-shell mt-3" onChange={(event) => onUpdateTheme(event.target.value as 'dark' | 'light')} value={theme}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="surface-card">
            <span className="block text-xs uppercase text-muted">Profile</span>
            <select className="input-shell mt-3" onChange={(event) => onUpdateProfile(event.target.value)} value={settings.active_profile}>
              <option value="balanced">Balanced</option>
              <option value="performance">Performance</option>
              <option value="quiet">Quiet</option>
            </select>
          </label>
          <label className="surface-card flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold text-text">Advanced registry details</span>
              <span className="mt-1 block text-sm leading-6 text-muted">Show exact affected values before system presets.</span>
            </span>
            <input
              checked={settings.show_advanced_registry_details}
              className="mt-1 h-5 w-5 accent-[rgb(var(--color-accent))]"
              onChange={(event) => onUpdateAdvancedRegistryDetails(event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
      </Panel>

      <Panel title="ML Automation Rules" variant="secondary">
        <div className="surface-card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text">Deny Function List</p>
            <p className="mt-1 text-sm text-text/85">Blocked for auto-ML: {denyList.size} of {OPTIMIZATION_FUNCTIONS.length}</p>
          </div>
          <button className="button-secondary" onClick={() => setDenyListOpen(true)} type="button">
            Open Deny Function List
          </button>
        </div>
      </Panel>

      <Panel title="Restore points" subtitle="Every applied change should leave a visible way back." variant="secondary">
        {snapshots.length ? (
          <div className="grid gap-2">
            {snapshots.slice(0, 5).map((snapshot) => (
              <div key={snapshot.id} className="surface-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">{snapshot.note || snapshot.kind}</p>
                  <p className="mt-1 text-xs text-muted">{snapshot.created_at} | {snapshot.id}</p>
                </div>
                <div className="flex gap-2">
                  <button className="button-secondary px-3 py-2 text-xs" onClick={() => onInspectSnapshot(snapshot.id)} type="button">
                    Inspect
                  </button>
                  <button className="button-primary px-3 py-2 text-xs" onClick={() => onRestoreSnapshot(snapshot.id)} type="button">
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state text-sm text-muted">No restore point yet. Apply one safe change to create the first snapshot.</div>
        )}
        {diffText ? <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-surface-muted p-4 text-xs leading-5 text-text">{diffText}</pre> : null}
      </Panel>

      <Panel title="Runtime" variant="secondary">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="surface-card">
            <p className="text-xs uppercase text-muted">Build</p>
            <p className="mt-2 font-semibold text-text">{build.version}</p>
            <p className="mt-1 text-muted">{build.git_commit}</p>
          </div>
          <div className="surface-card">
            <p className="text-xs uppercase text-muted">Schema</p>
            <p className="mt-2 font-semibold text-text">{build.runtime_schema_version}</p>
            <p className="mt-1 text-muted">Sidecar protocol {build.sidecar_protocol_version}</p>
          </div>
          <div className="surface-card">
            <p className="text-xs uppercase text-muted">Startup</p>
            <p className="mt-2 font-semibold text-text">{startupDiagnostics?.sidecar_ready_at ? 'Sidecar ready' : 'Waiting for sidecar'}</p>
            <p className="mt-1 text-muted">{startupDiagnostics?.backend_ready_at ? 'Backend ready' : 'Backend lazy-start'}</p>
          </div>
        </div>
      </Panel>

      {denyListOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-float">
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Deny Function List ({denyList.size} blocked)
              </h3>
              <button className="button-secondary px-3 py-2" onClick={() => setDenyListOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-2 md:grid-cols-2">
                {OPTIMIZATION_FUNCTIONS.map((item) => {
                  const blocked = denyList.has(item.id)
                  return (
                    <label key={item.id} className="rounded-xl border border-border/65 bg-surface-muted px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-text">{item.title}</p>
                          <p className="mt-1 text-text/85">{item.description}</p>
                        </div>
                        <div className="mt-1 text-right">
                          <input
                            checked={blocked}
                            onChange={(event) => toggleDeniedFunction(item.id, event.target.checked)}
                            type="checkbox"
                          />
                          <p className="mt-1 text-xs text-text/85">Block for auto-ML</p>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
