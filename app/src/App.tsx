import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'

import { ConsentModal } from './components/ConsentModal'
import { Sidebar } from './components/Sidebar'
import { StartupSkeleton } from './components/StartupSkeleton'
import { TweakPreviewModal } from './components/TweakPreviewModal'
import { api } from './lib/api'
import { readStartupCache, writeStartupCache } from './lib/cache'
import { featureConsent } from './lib/consent'
import {
  applyOptimizationTweak,
  attachOptimizationSession,
  endOptimizationSession,
  inspectOptimization,
  rollbackOptimizationTweak,
  runOptimizationInference,
} from './lib/sidecar'
import { getInitialState, getStartupState, toConnection } from './lib/startup'
import { DashboardPage } from './pages/DashboardPage'
import { LogsPage } from './pages/LogsPage'
import { ModelsPage } from './pages/ModelsPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import type {
  ApplyTweakRequest,
  BootstrapPayload,
  BuildMetadata,
  DashboardPayload,
  FeatureFlags,
  LogRecord,
  MlInferencePayload,
  ModelRecord,
  OptimizationSummary,
  OptimizationRuntimeState,
  PageId,
  SecuritySummary,
  SnapshotRecord,
  StartupDiagnostics,
  SystemSettings,
  TelemetryPoint,
} from './types'

type ConnectionState = { title: string; detail: string }
type PendingConsent = { description: string; key: keyof FeatureFlags; title: string }
type LoadedState = { dashboard: boolean; logs: boolean; optimization: boolean; optimizationRuntime: boolean; security: boolean; snapshots: boolean }
type PendingTweak = { changes: string[]; description: string; request: ApplyTweakRequest; risk: string; title: string }

const initialFlags: FeatureFlags = {
  telemetry_collect: false,
  network_optimizer: false,
  anomaly_detection: false,
  auto_security_scan: false,
  cloud_features: false,
  cloud_training: false,
}
const initialSystem: SystemSettings = {
  privacy_mode: 'local-only',
  telemetry_retention_days: 14,
  sampling_interval_seconds: 5,
  active_profile: 'balanced',
  allow_outbound_sync: false,
  telemetry_mode: 'demo',
  automation_mode: 'manual',
  automation_allowlist: [],
}
const initialDashboard: DashboardPayload = { stats: [], history: [], recommendations: [], session_health: 'Loading', mode: 'demo', badge: 'Loading' }
const initialSecurity: SecuritySummary = { status: 'low', label: 'normal-session', confidence: 0.89, auto_scan_enabled: false }
const initialOptimization: OptimizationSummary = { optimizer_enabled: false, risk_label: 'low', spike_probability: 0.18, confidence: 0.62, model_source: 'local-summary' }
const initialOptimizationRuntime: OptimizationRuntimeState = {
  processes: [],
  advanced_processes: [],
  selected_process: null,
  power_plans: [],
  activity: [],
  last_snapshot: null,
  session: {
    state: 'idle',
    active_tweaks: [],
    active_snapshot_ids: [],
    telemetry_source: 'demo',
    auto_restore_pending: false,
    capture_source: 'counters-fallback',
    capture_quality: 'idle',
  },
  detected_game: null,
  capture_status: {
    source: 'counters-fallback',
    available: true,
    quality: 'idle',
    helper_available: false,
    note: null,
  },
}
const initialBuild: BuildMetadata = {
  version: '1.0.0',
  build_timestamp: '1970-01-01T00:00:00Z',
  git_commit: 'development',
  runtime_schema_version: '3.0.0',
  sidecar_protocol_version: '3',
}

function initialConnection(cache: BootstrapPayload | null): ConnectionState {
  if (!cache) return { title: 'Optimization runtime starting', detail: 'Preparing the local sidecar and cached shell state...' }
  return toConnection({ state: 'starting', ready: false, launched_by_app: false }, cache.demo_mode)
}

export default function App() {
  const cache = useRef(readStartupCache()).current
  const retryTimer = useRef<number | null>(null)
  const bootStarted = useRef(false)
  const bootstrapRef = useRef<BootstrapPayload | null>(cache?.bootstrap ?? null)
  const dashboardRef = useRef<DashboardPayload | null>(cache?.dashboard ?? null)
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const [connection, setConnection] = useState<ConnectionState>(initialConnection(cache?.bootstrap ?? null))
  const [dashboard, setDashboard] = useState(cache?.dashboard ?? initialDashboard)
  const [featureFlags, setFeatureFlags] = useState(cache?.bootstrap?.settings.feature_flags ?? initialFlags)
  const [settings, setSettings] = useState(cache?.bootstrap?.settings.system ?? initialSystem)
  const [models, setModels] = useState<ModelRecord[]>(cache?.bootstrap?.models ?? [])
  const [build, setBuild] = useState<BuildMetadata>(cache?.bootstrap?.build ?? initialBuild)
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>(cache?.bootstrap?.last_snapshot_meta ? [cache.bootstrap.last_snapshot_meta] : [])
  const [security, setSecurity] = useState<SecuritySummary>(initialSecurity)
  const [optimization, setOptimization] = useState<OptimizationSummary>(initialOptimization)
  const [optimizationRuntime, setOptimizationRuntime] = useState<OptimizationRuntimeState>(initialOptimizationRuntime)
  const [session, setSession] = useState(cache?.bootstrap?.session ?? initialOptimizationRuntime.session)
  const [inference, setInference] = useState<MlInferencePayload | null>(null)
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null)
  const [realtime, setRealtime] = useState<TelemetryPoint | null>(cache?.dashboard?.history.at(-1) ?? null)
  const [diffText, setDiffText] = useState('')
  const [startupDiagnostics, setStartupDiagnostics] = useState<StartupDiagnostics | null>(null)
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null)
  const [pendingTweak, setPendingTweak] = useState<PendingTweak | null>(null)
  const [loaded, setLoaded] = useState<LoadedState>({
    dashboard: Boolean(cache?.dashboard),
    logs: false,
    optimization: false,
    optimizationRuntime: false,
    security: false,
    snapshots: Boolean(cache?.bootstrap?.last_snapshot_meta),
  })

  const hydrateShell = useEffectEvent((nextBootstrap: BootstrapPayload, nextDashboard?: DashboardPayload) => {
    bootstrapRef.current = nextBootstrap
    setFeatureFlags(nextBootstrap.settings.feature_flags)
    setSettings(nextBootstrap.settings.system)
    setModels(nextBootstrap.models)
    setBuild(nextBootstrap.build)
    setSession(nextBootstrap.session)
    setSnapshots(nextBootstrap.last_snapshot_meta ? [nextBootstrap.last_snapshot_meta] : [])
    if (nextDashboard) {
      dashboardRef.current = nextDashboard
      setDashboard(nextDashboard)
      setRealtime(nextDashboard.history.at(-1) ?? null)
    }
    writeStartupCache(nextBootstrap, nextDashboard ?? dashboardRef.current)
  })

  const loadDashboard = useEffectEvent(async () => {
    const nextDashboard = await api.dashboard()
    startTransition(() => {
      dashboardRef.current = nextDashboard
      setDashboard(nextDashboard)
      setRealtime((current) => current ?? nextDashboard.history.at(-1) ?? null)
      setLoaded((current) => ({ ...current, dashboard: true }))
    })
    writeStartupCache(bootstrapRef.current, nextDashboard)
  })

  const loadSecurity = useEffectEvent(async () => {
    const nextSecurity = await api.security()
    setSecurity(nextSecurity)
    setLoaded((current) => ({ ...current, security: true }))
  })

  const loadOptimization = useEffectEvent(async () => {
    const [nextOptimization, nextDashboard] = await Promise.all([
      api.optimization(),
      loaded.dashboard ? Promise.resolve(dashboardRef.current ?? dashboard) : api.dashboard(),
    ])
    startTransition(() => {
      setOptimization(nextOptimization)
      if (!loaded.dashboard) {
        dashboardRef.current = nextDashboard
        setDashboard(nextDashboard)
        setRealtime(nextDashboard.history.at(-1) ?? null)
      }
      setLoaded((current) => ({ ...current, dashboard: true, optimization: true }))
    })
    writeStartupCache(bootstrapRef.current, nextDashboard)
  })

  const loadOptimizationRuntime = useEffectEvent(async (processId?: number) => {
    const nextState = await inspectOptimization(processId)
    const sample = realtime ?? dashboardRef.current?.history.at(-1) ?? dashboard.history.at(-1) ?? null
    const nextInference = sample ? await runOptimizationInference(sample) : null
    startTransition(() => {
      setOptimizationRuntime(nextState)
      setSession(nextState.session)
      setInference(nextInference)
      setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    })
  })

  const loadLogs = useEffectEvent(async () => {
    setLogs(await api.logs())
    setLoaded((current) => ({ ...current, logs: true }))
  })

  const loadSettingsData = useEffectEvent(async () => {
    const [nextFlags, nextSettings, nextSnapshots] = await Promise.all([api.featureFlags(), api.system(), api.snapshots()])
    const nextBootstrap = bootstrapRef.current
      ? {
          ...bootstrapRef.current,
          settings: {
            feature_flags: nextFlags,
            system: nextSettings,
          },
          last_snapshot_meta: nextSnapshots[0] ?? null,
        }
      : null
    startTransition(() => {
      setFeatureFlags(nextFlags)
      setSettings(nextSettings)
      setSnapshots(nextSnapshots)
      setLoaded((current) => ({ ...current, snapshots: true }))
    })
    if (nextBootstrap) {
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
  })

  const loadModels = useEffectEvent(async () => {
    const nextModels = await api.models()
    const nextBootstrap = bootstrapRef.current ? { ...bootstrapRef.current, models: nextModels } : null
    setModels(nextModels)
    if (nextBootstrap) {
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
  })

  const mergeSnapshot = useEffectEvent((snapshot: SnapshotRecord | null) => {
    if (!snapshot || ['process-priority', 'cpu-affinity', 'power-plan'].includes(snapshot.kind)) return
    setSnapshots((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, 12))
  })

  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
    let disposed = false

    const boot = async () => {
      try {
        const initial = await getStartupState()
        if (disposed) return
        setConnection(toConnection(initial.sidecar, cache?.bootstrap?.demo_mode ?? true))
        setStartupDiagnostics(initial.sidecar.diagnostics ?? null)
        const fresh = await getInitialState()
        if (disposed) return
        hydrateShell(fresh.bootstrap, fresh.dashboard)
        setStartupDiagnostics(fresh.diagnostics)
        setConnection(toConnection(initial.sidecar, fresh.bootstrap.demo_mode))
        setLoaded((current) => ({ ...current, dashboard: true }))
      } catch {
        if (disposed) return
        setConnection(
          cache?.bootstrap
            ? { title: 'Using cached local data', detail: 'Refreshing the desktop services in background...' }
            : { title: 'Optimization runtime starting', detail: 'Waiting for the local bootstrap to become available...' },
        )
      }
    }

    void boot()
    return () => {
      disposed = true
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    }
  }, [cache?.bootstrap, hydrateShell])

  useEffect(() => {
    if (settings.telemetry_mode !== 'live' || !featureFlags.telemetry_collect) return
    let disposed = false
    const connectStream = () => {
      const socket = api.telemetrySocket(setRealtime)
      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (disposed) return
        retryTimer.current = window.setTimeout(connectStream, 2500)
      }
      return socket
    }
    const socket = connectStream()
    return () => {
      disposed = true
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
      socket.close()
    }
  }, [featureFlags.telemetry_collect, settings.telemetry_mode])

  useEffect(() => {
    if (activePage === 'dashboard' && !loaded.dashboard) void loadDashboard()
    if (activePage === 'optimization' && !loaded.optimization) void loadOptimization()
    if (activePage === 'optimization' && !loaded.optimizationRuntime) void loadOptimizationRuntime(selectedProcessId ?? undefined)
    if (activePage === 'security' && !loaded.security) void loadSecurity()
    if (activePage === 'logs' && !loaded.logs) void loadLogs()
    if (activePage === 'settings' && !loaded.snapshots) void loadSettingsData()
    if (activePage === 'models' && models.length === 0) void loadModels()
  }, [activePage, loaded, loadDashboard, loadLogs, loadModels, loadOptimization, loadOptimizationRuntime, loadSecurity, loadSettingsData, models.length, selectedProcessId])

  const toggleFlag = async (key: keyof FeatureFlags, value: boolean) => {
    await api.updateFeatureFlags({ ...featureFlags, [key]: value })
    await loadSettingsData()
  }

  const requestFlagChange = (key: keyof FeatureFlags, value: boolean) => {
    if (!value) return void toggleFlag(key, value)
    setPendingConsent({ key, ...featureConsent[key] })
  }

  const updateProfile = async (profile: string) => {
    await api.updateSystem({ ...settings, active_profile: profile })
    await loadSettingsData()
  }

  const updateTelemetryMode = async (mode: SystemSettings['telemetry_mode']) => {
    await api.updateSystem({ ...settings, telemetry_mode: mode })
    await loadSettingsData()
    await loadDashboard()
    if (mode !== 'live') {
      setRealtime(dashboardRef.current?.history.at(-1) ?? null)
    }
  }

  const updateAutomationMode = async (mode: SystemSettings['automation_mode']) => {
    await api.updateSystem({ ...settings, automation_mode: mode })
    await loadSettingsData()
  }

  const updateAutomationAllowlist = async (action: 'process_priority' | 'cpu_affinity' | 'power_plan', enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...settings.automation_allowlist, action]))
      : settings.automation_allowlist.filter((item) => item !== action)
    await api.updateSystem({ ...settings, automation_allowlist: next })
    await loadSettingsData()
  }

  const inspectSnapshot = async (id: string) => setDiffText((await api.snapshotDiff(id)).diff)
  const restoreSnapshot = async (id: string) => {
    await api.restoreSnapshot(id)
    await loadSettingsData()
  }

  const previewTweak = (request: ApplyTweakRequest) => {
    if (request.kind === 'process_priority') {
      const name = optimizationRuntime.selected_process?.name ?? 'selected process'
      const currentPriority = optimizationRuntime.selected_process?.priority_label ?? 'Normal'
      return setPendingTweak({
        request,
        title: 'Raise process priority',
        description: `Aeterna will raise ${name} from ${currentPriority} to Above normal priority using the Windows scheduler. This change is session scoped, rollback-safe, and never touches game memory.`,
        risk: 'medium',
        changes: [
          'Create a rollback snapshot of the current priority and affinity state.',
          'Apply Above normal process priority to the attached session only.',
          'Auto-restore the captured state when the tracked process exits or when you end the session.',
        ],
      })
    }
    if (request.kind === 'cpu_affinity') {
      const name = optimizationRuntime.selected_process?.name ?? 'selected process'
      const currentAffinity = optimizationRuntime.selected_process?.affinity_label ?? 'Current affinity'
      return setPendingTweak({
        request,
        title: 'Apply balanced CPU affinity',
        description: `Aeterna will move ${name} from ${currentAffinity} to a reversible balanced affinity preset. Expert one-thread-per-core reduction stays out of the default safe path.`,
        risk: 'medium',
        changes: [
          'Capture the current affinity mask in a rollback snapshot.',
          'Apply a safer balanced affinity preset to the attached session only.',
          'Auto-restore the original affinity when the session ends.',
        ],
      })
    }
    const plan = optimizationRuntime.power_plans.find((item) => item.guid === request.power_plan_guid)
    const activePlan = optimizationRuntime.power_plans.find((item) => item.active)
    setPendingTweak({
      request,
      title: `Switch power plan to ${plan?.name ?? 'selected plan'}`,
      description: `Aeterna will switch Windows from ${activePlan?.name ?? 'the current plan'} to ${plan?.name ?? 'the selected plan'} for the attached session and keep your original scheme in a rollback snapshot.`,
      risk: 'low',
      changes: [
        'Capture the current active power plan.',
        'Switch Windows to the selected existing power plan for the active session.',
        'Auto-restore your original power plan after the session ends or on manual Undo.',
      ],
    })
  }

  const applyTweak = async () => {
    if (!pendingTweak) return
    const result = await applyOptimizationTweak(pendingTweak.request)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    mergeSnapshot(result.snapshot)
    setPendingTweak(null)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
  }

  const rollbackTweak = async (snapshotId: string) => {
    const result = await rollbackOptimizationTweak(snapshotId, selectedProcessId ?? undefined)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
  }

  const renderPage = () => {
    if (activePage === 'dashboard' && !loaded.dashboard && dashboard.stats.length === 0) return <StartupSkeleton />
    if (activePage === 'optimization') {
      return (
        <OptimizationPage
          dashboard={dashboard}
          featureFlags={featureFlags}
          inference={inference}
          onAttachSession={(request) => void attachOptimizationSession(request).then((nextState) => {
            setOptimizationRuntime(nextState)
            setSession(nextState.session)
            setSelectedProcessId(request.process_id)
            setLoaded((current) => ({ ...current, optimizationRuntime: true }))
          })}
          onEndSession={() => void endOptimizationSession().then((nextState) => {
            setOptimizationRuntime(nextState)
            setSession(nextState.session)
            setLoaded((current) => ({ ...current, optimizationRuntime: true }))
          })}
          onPreviewTweak={previewTweak}
          onRefresh={(processId) => void loadOptimizationRuntime(processId)}
          onRollback={(snapshotId) => void rollbackTweak(snapshotId)}
          onSelectProcess={(processId) => {
            setSelectedProcessId(processId)
            void loadOptimizationRuntime(processId)
          }}
          optimization={optimization}
          runtimeState={optimizationRuntime}
          selectedProcessId={selectedProcessId}
        />
      )
    }
    if (activePage === 'security') return <SecurityPage security={security} />
    if (activePage === 'models') {
      return <ModelsPage models={models} onActivate={(id) => void api.activateModel(id).then(loadModels)} onRollback={(id) => void api.rollbackModel(id).then(loadModels)} />
    }
    if (activePage === 'logs') return <LogsPage activity={optimizationRuntime.activity} logs={logs} />
    if (activePage === 'settings') {
      return (
        <SettingsPage
          build={build}
          diffText={diffText}
          featureFlags={featureFlags}
          onInspectSnapshot={(id) => void inspectSnapshot(id)}
          onRestoreSnapshot={(id) => void restoreSnapshot(id)}
          onUpdateAutomationAllowlist={(action, enabled) => void updateAutomationAllowlist(action, enabled)}
          onUpdateAutomationMode={(mode) => void updateAutomationMode(mode)}
          onToggleFlag={(key, value) => requestFlagChange(key, value)}
          onUpdateTelemetryMode={(mode) => void updateTelemetryMode(mode)}
          onUpdateProfile={(profile) => void updateProfile(profile)}
          settings={settings}
          snapshots={snapshots}
          startupDiagnostics={startupDiagnostics}
        />
      )
    }
    return <DashboardPage dashboard={dashboard} realtime={realtime} session={session} />
  }

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 rounded-[2.5rem] border border-border bg-[#fbfbfb] p-4 md:grid-cols-[280px_1fr] md:p-5">
        <Sidebar activePage={activePage} connection={connection} onSelect={setActivePage} />
        <section className="rounded-[2rem] border border-border bg-white p-6 md:p-8">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Machine Learning Based Tool</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Optimization and security for online games</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted">
              Local-first desktop control with lazy startup, cached shell state, rollback, and opt-in machine learning.
            </p>
          </header>
          {renderPage()}
        </section>
      </div>
      {pendingConsent ? (
        <ConsentModal
          description={pendingConsent.description}
          onCancel={() => setPendingConsent(null)}
          onConfirm={() => {
            void toggleFlag(pendingConsent.key, true)
            setPendingConsent(null)
          }}
          title={pendingConsent.title}
        />
      ) : null}
      {pendingTweak ? (
        <TweakPreviewModal
          changes={pendingTweak.changes}
          description={pendingTweak.description}
          onCancel={() => setPendingTweak(null)}
          onConfirm={() => void applyTweak()}
          risk={pendingTweak.risk}
          title={pendingTweak.title}
        />
      ) : null}
    </main>
  )
}
