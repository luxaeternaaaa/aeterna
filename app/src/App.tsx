import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Minus, MoonStar, Square, SunMedium, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

import { ConsentModal } from './components/ConsentModal'
import { Sidebar } from './components/Sidebar'
import { StartupSkeleton } from './components/StartupSkeleton'
import { api } from './lib/api'
import { readStartupCache, writeStartupCache } from './lib/cache'
import { featureConsent } from './lib/consent'
import {
  applyOptimizationTweak,
  applyRegistryPreset,
  attachOptimizationSession,
  endOptimizationSession,
  inspectOptimization,
  rollbackOptimizationTweak,
} from './lib/sidecar'
import { getInitialState, getStartupState, toConnection } from './lib/startup'
import { DashboardPage } from './pages/DashboardPage'
import { LogsPage } from './pages/LogsPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import { TestsPage } from './pages/TestsPage'
import type {
  BenchmarkReport,
  BenchmarkWindow,
  BootstrapPayload,
  BuildMetadata,
  DashboardPayload,
  FeatureFlags,
  GameProfile,
  LogRecord,
  OptimizationRuntimeState,
  PageId,
  SecuritySummary,
  SnapshotRecord,
  StartupDiagnostics,
  SystemSettings,
  TelemetryPoint,
} from './types'

type ConnectionState = { title: string; detail: string }
type ThemeMode = 'dark' | 'light'
type PendingConsent = { description: string; key: keyof FeatureFlags; title: string }
type LoadedState = { dashboard: boolean; logs: boolean; optimizationRuntime: boolean; security: boolean; snapshots: boolean }

const THEME_STORAGE_KEY = 'aeterna-theme'

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

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
  automation_allowlist: ['process_priority', 'cpu_affinity', 'power_plan'],
  registry_presets_enabled: false,
  show_advanced_registry_details: false,
}
const initialDashboard: DashboardPayload = { stats: [], history: [], recommendations: [], session_health: 'Loading', mode: 'demo', badge: 'Loading' }
const initialSecurity: SecuritySummary = { status: 'low', label: 'normal-session', confidence: 0.89, auto_scan_enabled: false }
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
    pending_registry_restore: false,
    pending_registry_snapshot_id: null,
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
  registry_presets: [],
}
const initialBuild: BuildMetadata = {
  version: '1.0.0',
  build_timestamp: '',
  git_commit: 'development',
  runtime_schema_version: '3.0.0',
  sidecar_protocol_version: '3',
}

function initialConnection(cache: BootstrapPayload | null): ConnectionState {
  if (!cache) return { title: 'Runtime starting', detail: 'Preparing the local sidecar and cached shell state.' }
  return toConnection({ state: 'starting', ready: false, launched_by_app: false }, cache.demo_mode)
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export default function App() {
  const cache = useRef(readStartupCache()).current
  const retryTimer = useRef<number | null>(null)
  const bootStarted = useRef(false)
  const bootstrapRef = useRef<BootstrapPayload | null>(cache?.bootstrap ?? null)
  const dashboardRef = useRef<DashboardPayload | null>(cache?.dashboard ?? null)
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme)
  const [activePage, setActivePage] = useState<PageId>('home')
  const [connection, setConnection] = useState<ConnectionState>(initialConnection(cache?.bootstrap ?? null))
  const [dashboard, setDashboard] = useState(cache?.dashboard ?? initialDashboard)
  const [featureFlags, setFeatureFlags] = useState({ ...initialFlags, ...(cache?.bootstrap?.settings.feature_flags ?? {}) })
  const [settings, setSettings] = useState({ ...initialSystem, ...(cache?.bootstrap?.settings.system ?? {}) })
  const [profiles, setProfiles] = useState<GameProfile[]>(cache?.bootstrap?.profiles ?? [])
  const [build, setBuild] = useState<BuildMetadata>(cache?.bootstrap?.build ?? initialBuild)
  const [benchmarkBaseline, setBenchmarkBaseline] = useState<BenchmarkWindow | null>(cache?.bootstrap?.benchmark_baseline ?? null)
  const [latestBenchmark, setLatestBenchmark] = useState<BenchmarkReport | null>(cache?.bootstrap?.latest_benchmark ?? null)
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>(cache?.bootstrap?.last_snapshot_meta ? [cache.bootstrap.last_snapshot_meta] : [])
  const [security, setSecurity] = useState<SecuritySummary>(initialSecurity)
  const [optimizationRuntime, setOptimizationRuntime] = useState<OptimizationRuntimeState>(initialOptimizationRuntime)
  const [, setSession] = useState(cache?.bootstrap?.session ?? initialOptimizationRuntime.session)
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null)
  const [realtime, setRealtime] = useState<TelemetryPoint | null>(cache?.dashboard?.history.at(-1) ?? null)
  const [diffText, setDiffText] = useState('')
  const [startupDiagnostics, setStartupDiagnostics] = useState<StartupDiagnostics | null>(null)
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null)
  const [benchmarkBusy, setBenchmarkBusy] = useState(false)
  const [lastTweakAtMs, setLastTweakAtMs] = useState<number | null>(null)
  const [stopBusy, setStopBusy] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [loaded, setLoaded] = useState<LoadedState>({
    dashboard: Boolean(cache?.dashboard),
    logs: false,
    optimizationRuntime: false,
    security: false,
    snapshots: Boolean(cache?.bootstrap?.last_snapshot_meta),
  })

  const minimizeWindow = () => {
    if (!isTauriRuntime()) return
    void invoke('minimize_main_window')
  }

  const toggleMaximizeWindow = () => {
    if (!isTauriRuntime()) return
    void invoke<boolean>('toggle_maximize_main_window')
      .then((value) => setIsMaximized(value))
      .catch(() => {})
  }

  const closeWindow = () => {
    if (!isTauriRuntime()) return
    void invoke('close_main_window')
  }

  useEffect(() => {
    if (!isTauriRuntime()) return
    void invoke<boolean>('is_main_window_maximized')
      .then((value) => setIsMaximized(value))
      .catch(() => {})
  }, [])

  const hydrateShell = useEffectEvent((nextBootstrap: BootstrapPayload, nextDashboard?: DashboardPayload) => {
    bootstrapRef.current = nextBootstrap
    setFeatureFlags({ ...initialFlags, ...nextBootstrap.settings.feature_flags })
    setSettings({ ...initialSystem, ...nextBootstrap.settings.system })
    setProfiles(nextBootstrap.profiles)
    setBuild(nextBootstrap.build)
    setBenchmarkBaseline(nextBootstrap.benchmark_baseline)
    setLatestBenchmark(nextBootstrap.latest_benchmark)
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

  const loadOptimizationRuntime = useEffectEvent(async (processId?: number) => {
    const nextState = await inspectOptimization(processId)
    startTransition(() => {
      setOptimizationRuntime(nextState)
      setSession(nextState.session)
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
      setFeatureFlags({ ...initialFlags, ...nextFlags })
      setSettings({ ...initialSystem, ...nextSettings })
      setSnapshots(nextSnapshots)
      setLoaded((current) => ({ ...current, snapshots: true }))
    })
    if (nextBootstrap) {
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
  })

  const loadBenchmarkState = useEffectEvent(async () => {
    const [baseline, latest] = await Promise.all([api.benchmarkBaseline(), api.benchmarkLatest()])
    setBenchmarkBaseline(baseline)
    setLatestBenchmark(latest)
    if (bootstrapRef.current) {
      const nextBootstrap = { ...bootstrapRef.current, benchmark_baseline: baseline, latest_benchmark: latest }
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

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
            ? { title: 'Using cached local data', detail: 'Refreshing desktop services in the background.' }
            : { title: 'Runtime starting', detail: 'Waiting for the local bootstrap to become available.' },
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
    if (activePage === 'home' && !loaded.dashboard) void loadDashboard()
    if ((activePage === 'home' || activePage === 'optimize' || activePage === 'tests') && !loaded.optimizationRuntime)
      void loadOptimizationRuntime(selectedProcessId ?? undefined)
    if ((activePage === 'home' || activePage === 'optimize' || activePage === 'tests') && !benchmarkBaseline && !latestBenchmark)
      void loadBenchmarkState()
    if (activePage === 'safety' && !loaded.security) void loadSecurity()
    if ((activePage === 'history' || activePage === 'optimize') && !loaded.logs) void loadLogs()
    if (activePage === 'settings' && !loaded.snapshots) void loadSettingsData()
  }, [activePage, benchmarkBaseline, latestBenchmark, loaded, loadBenchmarkState, loadDashboard, loadLogs, loadOptimizationRuntime, loadSecurity, loadSettingsData, selectedProcessId])

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
    const defaultAllowlist: Array<'process_priority' | 'cpu_affinity' | 'power_plan'> = [
      'process_priority',
      'cpu_affinity',
      'power_plan',
    ]
    const currentAllowlist =
      settings.automation_allowlist.length > 0 ? settings.automation_allowlist : defaultAllowlist
    const next = enabled
      ? Array.from(new Set([...currentAllowlist, action]))
      : currentAllowlist.filter((item) => item !== action)
    await api.updateSystem({ ...settings, automation_allowlist: next })
    await loadSettingsData()
  }

  const updateAdvancedRegistryDetails = async (enabled: boolean) => {
    await api.updateSystem({ ...settings, show_advanced_registry_details: enabled })
    await loadSettingsData()
    await loadOptimizationRuntime(selectedProcessId ?? undefined)
  }

  const inspectSnapshot = async (id: string) => setDiffText((await api.snapshotDiff(id)).diff)
  const restoreSnapshot = async (id: string) => {
    await api.restoreSnapshot(id)
    await loadSettingsData()
  }

  const stopSessionWithRollback = async () => {
    if (stopBusy) return
    setStopBusy(true)
    try {
      const currentProcessId = selectedProcessId ?? optimizationRuntime.session.process_id ?? undefined
      const snapshotIds = Array.from(
        new Set([
          ...optimizationRuntime.session.active_snapshot_ids,
          ...optimizationRuntime.activity.filter((entry) => entry.can_undo && entry.snapshot_id).map((entry) => entry.snapshot_id ?? ''),
        ]),
      )
        .filter((id) => id.length > 0)
        .reverse()

      let nextState = optimizationRuntime
      for (const snapshotId of snapshotIds) {
        try {
          const result = await rollbackOptimizationTweak(snapshotId, currentProcessId)
          nextState = result.state
        } catch {
          // Continue rollback attempts for remaining snapshots.
        }
      }

      const ended = await endOptimizationSession()
      setOptimizationRuntime(ended)
      setSession(ended.session)
      setLastTweakAtMs(null)
      await loadBenchmarkState()
      setLoaded((current) => ({ ...current, optimizationRuntime: true }))
      if (nextState.session.state === 'active' && ended.session.state === 'active') {
        // keep linter-silencing path explicit when runtime refuses to end
      }
    } finally {
      setStopBusy(false)
    }
  }

  const captureBaseline = async () => {
    setBenchmarkBusy(true)
    try {
      const baseline = await api.captureBenchmarkBaseline(60)
      setBenchmarkBaseline(baseline)
      if (bootstrapRef.current) {
        const nextBootstrap = { ...bootstrapRef.current, benchmark_baseline: baseline }
        bootstrapRef.current = nextBootstrap
        writeStartupCache(nextBootstrap, dashboardRef.current)
      }
    } finally {
      setBenchmarkBusy(false)
    }
  }

  const runBenchmark = async (profileId?: string) => {
    setBenchmarkBusy(true)
    try {
      const report = await api.runBenchmark(profileId, 60)
      setLatestBenchmark(report)
      await loadOptimizationRuntime(selectedProcessId ?? undefined)
      if (bootstrapRef.current) {
        const nextBootstrap = { ...bootstrapRef.current, latest_benchmark: report }
        bootstrapRef.current = nextBootstrap
        writeStartupCache(nextBootstrap, dashboardRef.current)
      }
    } finally {
      setBenchmarkBusy(false)
    }
  }

  const attachSession = async (request: { process_id: number; process_name: string }) => {
    const nextState = await attachOptimizationSession(request)
    setOptimizationRuntime(nextState)
    setSession(nextState.session)
    setSelectedProcessId(request.process_id)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    return nextState
  }

  const applySessionTweak = async (request: Parameters<typeof applyOptimizationTweak>[0]) => {
    const result = await applyOptimizationTweak(request)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLastTweakAtMs(Date.now())
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    return result
  }

  const applySystemPreset = async (request: Parameters<typeof applyRegistryPreset>[0]) => {
    const result = await applyRegistryPreset(request)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLastTweakAtMs(Date.now())
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    return result
  }

  const rollbackSnapshot = async (snapshotId: string, processId?: number) => {
    const result = await rollbackOptimizationTweak(snapshotId, processId)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    return result
  }

  const renderPage = () => {
    if (activePage === 'home' && !loaded.dashboard && dashboard.stats.length === 0) return <StartupSkeleton />
    if (activePage === 'tests') {
      return (
        <TestsPage
          benchmarkBaseline={benchmarkBaseline}
          benchmarkBusy={benchmarkBusy}
          lastTweakAtMs={lastTweakAtMs}
          latestBenchmark={latestBenchmark}
          onAttachSession={(request) => void attachSession(request)}
          onCaptureBaseline={() => void captureBaseline()}
          onClearSessionSelection={() => {
            setSelectedProcessId(null)
            void loadOptimizationRuntime(undefined)
          }}
          onEndSession={() => void endOptimizationSession().then((nextState) => {
            setOptimizationRuntime(nextState)
            setSession(nextState.session)
            setLastTweakAtMs(null)
            setLoaded((current) => ({ ...current, optimizationRuntime: true }))
          })}
          onOpenLogs={() => setActivePage('history')}
          onOpenSettings={() => setActivePage('settings')}
          onRefresh={(processId) => void loadOptimizationRuntime(processId)}
          onRunBenchmark={(profileId) => void runBenchmark(profileId)}
          onSelectProcess={(processId) => {
            setSelectedProcessId(processId)
            void loadOptimizationRuntime(processId)
          }}
          onStopSession={() => void stopSessionWithRollback()}
          profiles={profiles}
          runtimeState={optimizationRuntime}
          stopBusy={stopBusy}
        />
      )
    }
    if (activePage === 'optimize') {
      return (
        <OptimizationPage
          dashboard={dashboard}
          runtimeState={optimizationRuntime}
          onApplyRegistryPreset={applySystemPreset}
          onApplyTweak={applySessionTweak}
          onAttachSession={attachSession}
          onRollbackSnapshot={rollbackSnapshot}
        />
      )
    }
    if (activePage === 'safety') return <SecurityPage security={security} />
    if (activePage === 'history') return <LogsPage activity={optimizationRuntime.activity} logs={logs} onOpenOptimization={() => setActivePage('optimize')} />
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
          onUpdateAdvancedRegistryDetails={(enabled) => void updateAdvancedRegistryDetails(enabled)}
          onToggleFlag={(key, value) => requestFlagChange(key, value)}
          onUpdateTheme={(nextTheme) => setTheme(nextTheme)}
          onUpdateTelemetryMode={(mode) => void updateTelemetryMode(mode)}
          onUpdateProfile={(profile) => void updateProfile(profile)}
          settings={settings}
          snapshots={snapshots}
          startupDiagnostics={startupDiagnostics}
          theme={theme}
        />
      )
    }
    return (
      <DashboardPage
        dashboard={dashboard}
        onApplyRegistryPreset={applySystemPreset}
        onApplyTweak={applySessionTweak}
        onAttachSession={attachSession}
        onOpenLogs={() => setActivePage('history')}
        onOpenOptimization={() => setActivePage('optimize')}
        onOpenTests={() => setActivePage('tests')}
        onRollbackSnapshot={rollbackSnapshot}
        profiles={profiles}
        realtime={realtime}
        runtimeState={optimizationRuntime}
      />
    )
  }

  return (
    <main className="h-screen bg-transparent">
      <div className={`flex h-full w-full flex-col overflow-hidden bg-canvas ${isMaximized ? '' : 'mx-auto max-w-[1280px] rounded-[1.7rem]'}`}>
        <header className="grid h-[62px] grid-cols-[auto_1fr_auto] items-center border-b border-border/70 bg-surface-elevated/95 px-3">
          <div data-tauri-drag-region className="flex items-center gap-3 pl-1">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-surface">
              <span className="text-sm font-semibold tracking-tight text-text">A</span>
            </div>
            <div className="rounded-lg border border-border/70 bg-surface px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted">Session</p>
              <p className="text-sm font-semibold text-text">{connection.title}</p>
            </div>
          </div>

          <div data-tauri-drag-region className="h-10" />

          <div className="window-no-drag flex items-center gap-1">
            <button
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="window-control inline-flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted transition hover:bg-hover hover:text-text"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              type="button"
            >
              {theme === 'dark' ? <SunMedium size={14} /> : <MoonStar size={14} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              aria-label="Minimize"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-text"
              onClick={minimizeWindow}
              type="button"
            >
              <Minus size={18} />
            </button>
            <button
              aria-label="Maximize or restore"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-hover hover:text-text"
              onClick={toggleMaximizeWindow}
              type="button"
            >
              <Square size={14} />
            </button>
            <button
              aria-label="Close"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-danger/25 hover:text-text"
              onClick={closeWindow}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={`grid min-h-0 flex-1 grid-cols-[78px_1fr] ${isMaximized ? 'gap-2 p-1.5' : 'gap-3 p-2.5'}`}>
          <Sidebar activePage={activePage} onSelect={setActivePage} />
          <section className={`min-h-0 overflow-auto bg-surface/95 ${isMaximized ? 'rounded-[1rem] p-4' : 'rounded-[1.5rem] p-4 md:p-5'}`}>{renderPage()}</section>
        </div>
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
    </main>
  )
}
