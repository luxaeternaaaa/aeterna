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
    build: _build,
    diffText: _diffText,
    featureFlags: _featureFlags,
    onInspectSnapshot: _onInspectSnapshot,
    onRestoreSnapshot: _onRestoreSnapshot,
    onUpdateAdvancedRegistryDetails: _onUpdateAdvancedRegistryDetails,
    onToggleFlag: _onToggleFlag,
    onUpdateAutomationMode: _onUpdateAutomationMode,
    onUpdateProfile: _onUpdateProfile,
    onUpdateTheme: _onUpdateTheme,
    onUpdateTelemetryMode: _onUpdateTelemetryMode,
    settings: _settings,
    snapshots: _snapshots,
    startupDiagnostics: _startupDiagnostics,
    theme: _theme,
  } = props

  const [denyListOpen, setDenyListOpen] = useState(false)
  const [denyList, setDenyList] = useState<Set<string>>(() => loadMlDenyFunctionList())

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
