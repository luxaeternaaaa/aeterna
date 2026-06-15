import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { Minus, MoonStar, RefreshCw, Square, SunMedium, X } from 'lucide-react'

import { useConfirmDialog } from './components/ConfirmDialogContext'
import { ConsentModal } from './components/ConsentModal'
import { Sidebar } from './components/Sidebar'
import { StartupSkeleton } from './components/StartupSkeleton'
import { useThemeMode } from './hooks/useThemeMode'
import { useWindowControls } from './hooks/useWindowControls'
import { api } from './lib/api'
import { readStartupCache, writeStartupCache } from './lib/cache'
import { featureConsent } from './lib/consent'
import {
  initialBuild,
  initialDashboard,
  initialFlags,
  initialOptimizationRuntime,
  initialSecurity,
  initialSystem,
  type LoadedState,
} from './lib/defaultState'
import { getOptimizationLevel } from './lib/optimizationLevel'
import {
  applyOptimizationTweak,
  applyRegistryPreset,
  attachOptimizationSession,
  endOptimizationSession,
  inspectOptimization,
  requestWindowsRestart,
  rollbackOptimizationTweak,
  startBenchmarkCapture,
  stopBenchmarkCapture,
} from './lib/sidecar'
import { getInitialState, getStartupState } from './lib/startup'
import { getWindowsUsername, saveTextFile } from './lib/system'
import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'
import { BackupPage } from './pages/BackupPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import { TestsPage } from './pages/TestsPage'
import type {
  BenchmarkReport,
  BenchmarkEvidenceSummary,
  BenchmarkWindow,
  BootstrapPayload,
  BuildMetadata,
  DashboardPayload,
  FeatureFlags,
  GameProfile,
  OptimizationRuntimeState,
  PageId,
  SecuritySummary,
  SnapshotRecord,
  StartupDiagnostics,
  SystemSettings,
  SystemTelemetryPayload,
  TelemetryPoint,
} from './types'

type PendingConsent = { description: string; key: keyof FeatureFlags; title: string }

const REBOOT_TWEAK_LABELS: Record<string, string> = {
  disable_dynamic_ticks: 'Dynamic Ticks',
  disable_hpet: 'HPET boot flag',
}

const REBOOT_PRESET_LABELS: Record<string, string> = {
  hags_on: 'HAGS',
  memory_integrity_off: 'Memory Integrity',
  mpo_off: 'Multi Plane Overlay',
}

export default function App() {
  const requestConfirmation = useConfirmDialog()
  const cache = useRef(readStartupCache()).current
  const retryTimer = useRef<number | null>(null)
  const bootStarted = useRef(false)
  const benchmarkLoaded = useRef(false)
  const bootstrapRef = useRef<BootstrapPayload | null>(cache?.bootstrap ?? null)
  const dashboardRef = useRef<DashboardPayload | null>(cache?.dashboard ?? null)
  const { setTheme, theme } = useThemeMode()
  const { closeWindow, isMaximized, minimizeWindow, toggleMaximizeWindow } = useWindowControls()
  const [activePage, setActivePage] = useState<PageId>('home')
  const [dashboard, setDashboard] = useState(cache?.dashboard ?? initialDashboard)
  const [featureFlags, setFeatureFlags] = useState({ ...initialFlags, ...(cache?.bootstrap?.settings.feature_flags ?? {}) })
  const [settings, setSettings] = useState({ ...initialSystem, ...(cache?.bootstrap?.settings.system ?? {}) })
  const [profiles, setProfiles] = useState<GameProfile[]>(cache?.bootstrap?.profiles ?? [])
  const [build, setBuild] = useState<BuildMetadata>(cache?.bootstrap?.build ?? initialBuild)
  const [benchmarkBaseline, setBenchmarkBaseline] = useState<BenchmarkWindow | null>(cache?.bootstrap?.benchmark_baseline ?? null)
  const [latestBenchmark, setLatestBenchmark] = useState<BenchmarkReport | null>(cache?.bootstrap?.latest_benchmark ?? null)
  const [benchmarkEvidence, setBenchmarkEvidence] = useState<BenchmarkEvidenceSummary[]>([])
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
  const [systemTelemetry, setSystemTelemetry] = useState<SystemTelemetryPayload | null>(null)
  const [windowsUsername, setWindowsUsername] = useState('Player')
  const [restartNotice, setRestartNotice] = useState<string[]>([])
  const [restartBusy, setRestartBusy] = useState(false)
  const [loaded, setLoaded] = useState<LoadedState>({
    dashboard: Boolean(cache?.dashboard),
    logs: false,
    optimizationRuntime: false,
    security: false,
    snapshots: Boolean(cache?.bootstrap?.last_snapshot_meta),
  })

  const hydrateShell = useCallback((nextBootstrap: BootstrapPayload, nextDashboard?: DashboardPayload) => {
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
  }, [])

  const loadDashboard = useCallback(async () => {
    const nextDashboard = await api.dashboard()
    startTransition(() => {
      dashboardRef.current = nextDashboard
      setDashboard(nextDashboard)
      setRealtime((current) => current ?? nextDashboard.history.at(-1) ?? null)
      setLoaded((current) => ({ ...current, dashboard: true }))
    })
    writeStartupCache(bootstrapRef.current, nextDashboard)
  }, [])

  const loadSecurity = useCallback(async () => {
    const nextSecurity = await api.security()
    setSecurity(nextSecurity)
    setLoaded((current) => ({ ...current, security: true }))
  }, [])

  const loadOptimizationRuntime = useCallback(async (processId?: number) => {
    const nextState = await inspectOptimization(processId)
    startTransition(() => {
      setOptimizationRuntime(nextState)
      setSession(nextState.session)
      setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    })
    return nextState
  }, [])

  const loadSettingsData = useCallback(async () => {
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
  }, [])

  const loadBenchmarkState = useCallback(async () => {
    benchmarkLoaded.current = true
    const [baseline, latest, evidence] = await Promise.all([
      api.benchmarkBaseline(),
      api.benchmarkLatest(),
      api.benchmarkEvidence(),
    ])
    setBenchmarkBaseline(baseline)
    setLatestBenchmark(latest)
    setBenchmarkEvidence(evidence)
    if (bootstrapRef.current) {
      const nextBootstrap = { ...bootstrapRef.current, benchmark_baseline: baseline, latest_benchmark: latest }
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
  }, [])

  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
    let disposed = false

    const boot = async () => {
      try {
        const initial = await getStartupState()
        if (disposed) return
        setStartupDiagnostics(initial.sidecar.diagnostics ?? null)
        const fresh = await getInitialState()
        if (disposed) return
        hydrateShell(fresh.bootstrap, fresh.dashboard)
        setStartupDiagnostics(fresh.diagnostics)
        setLoaded((current) => ({ ...current, dashboard: true }))
      } catch {
        if (disposed) return
      }
    }

    void boot()
    return () => {
      disposed = true
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
    }
  }, [hydrateShell])

  useEffect(() => {
    let disposed = false
    void getWindowsUsername().then((name) => {
      if (!disposed) setWindowsUsername(name)
    })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (activePage !== 'home') return
    let disposed = false
    let busy = false

    const loadSystemTelemetry = async () => {
      if (busy) return
      busy = true
      try {
        const payload = await api.systemTelemetry()
        if (!disposed) setSystemTelemetry(payload)
      } catch {
        // Keep the last sample visible if Windows counters are warming up.
      } finally {
        busy = false
      }
    }

    void loadSystemTelemetry()
    const interval = window.setInterval(() => {
      void loadSystemTelemetry()
    }, 1000)

    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [activePage])

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
    if (
      (activePage === 'home' || activePage === 'ml' || activePage === 'optimize' || activePage === 'tests' || activePage === 'history') &&
      !loaded.optimizationRuntime
    )
      void loadOptimizationRuntime(selectedProcessId ?? undefined)
    if ((activePage === 'home' || activePage === 'ml' || activePage === 'optimize' || activePage === 'tests') && !benchmarkLoaded.current)
      void loadBenchmarkState()
    if (activePage === 'safety' && !loaded.security) void loadSecurity()
    if ((activePage === 'history' || activePage === 'settings') && !loaded.snapshots) void loadSettingsData()
  }, [activePage, benchmarkBaseline, latestBenchmark, loaded, loadBenchmarkState, loadDashboard, loadOptimizationRuntime, loadSecurity, loadSettingsData, selectedProcessId])

  const toggleFlag = async (key: keyof FeatureFlags, value: boolean) => {
    await api.updateFeatureFlags({ ...featureFlags, [key]: value })
    await loadSettingsData()
    if (key === 'network_optimizer') {
      await loadOptimizationRuntime(selectedProcessId ?? undefined)
    }
  }

  const requestFlagChange = (key: keyof FeatureFlags, value: boolean) => {
    if (!value) return void toggleFlag(key, value)
    setPendingConsent({ key, ...featureConsent[key] })
  }

  const updateSystemSettings = async (nextSettings: SystemSettings) => {
    const telemetryModeChanged = nextSettings.telemetry_mode !== settings.telemetry_mode
    const registryDetailChanged =
      nextSettings.show_advanced_registry_details !== settings.show_advanced_registry_details ||
      nextSettings.registry_presets_enabled !== settings.registry_presets_enabled
    await api.updateSystem(nextSettings)
    await loadSettingsData()
    if (telemetryModeChanged) {
      await loadDashboard()
      if (nextSettings.telemetry_mode !== 'live') {
        setRealtime(dashboardRef.current?.history.at(-1) ?? null)
      }
    }
    if (registryDetailChanged) {
      await loadOptimizationRuntime(selectedProcessId ?? undefined)
    }
  }

  const inspectSnapshot = async (id: string) => setDiffText((await api.snapshotDiff(id)).diff)
  const restoreSnapshot = async (id: string) => {
    await api.restoreSnapshot(id)
    await loadSettingsData()
  }
  const createSnapshot = async (note?: string) => {
    await api.createSnapshot(note)
    await loadSettingsData()
  }
  const deleteSnapshot = async (id: string) => {
    await api.deleteSnapshot(id)
    await loadSettingsData()
    setDiffText('')
  }
  const importSnapshot = async (record: unknown) => {
    await api.importSnapshot(record)
    await loadSettingsData()
  }
  const refreshBackup = async () => {
    await Promise.all([loadSettingsData(), loadOptimizationRuntime(selectedProcessId ?? undefined)])
  }

  const captureBaseline = async (sampleLimit = 60, scenarioId?: string) => {
    setBenchmarkBusy(true)
    setBenchmarkBaseline(null)
    setLatestBenchmark(null)
    if (bootstrapRef.current) {
      const nextBootstrap = { ...bootstrapRef.current, benchmark_baseline: null, latest_benchmark: null }
      bootstrapRef.current = nextBootstrap
      writeStartupCache(nextBootstrap, dashboardRef.current)
    }
    try {
      const baseline = await api.captureBenchmarkBaseline(sampleLimit, scenarioId)
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

  const runBenchmark = async (profileId?: string, sampleLimit = 60) => {
    setBenchmarkBusy(true)
    try {
      const report = await api.runBenchmark(profileId, sampleLimit)
      setLatestBenchmark(report)
      setBenchmarkEvidence(await api.benchmarkEvidence())
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

  const startTestCapture = async () => {
    const nextState = await startBenchmarkCapture()
    setOptimizationRuntime(nextState)
    setSession(nextState.session)
  }

  const waitForTestCapture = async (processId: number) => {
    let nextState = optimizationRuntime
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      nextState = await inspectOptimization(processId)
      setOptimizationRuntime(nextState)
      setSession(nextState.session)
      if (nextState.capture_status.source === 'presentmon') return
      if (!nextState.session.capture_requested) {
        throw new Error(nextState.session.capture_reason ?? 'PresentMon capture stopped before it became ready.')
      }
    }

    throw new Error(
      nextState.session.capture_reason ??
        'PresentMon did not receive real frame events. Keep the game in the foreground and try again.',
    )
  }

  const stopTestCapture = async () => {
    const nextState = await stopBenchmarkCapture()
    setOptimizationRuntime(nextState)
    setSession(nextState.session)
  }

  const saveBenchmarkCsv = async (csvId: string, suggestedName: string) => {
    const contents = await api.benchmarkCsvText(csvId)
    return saveTextFile(suggestedName, contents)
  }

  const addRestartNotice = useCallback((label: string) => {
    setRestartNotice((current) => {
      if (current.includes(label)) return current
      return [...current, label]
    })
  }, [])

  const restartWindowsNow = async () => {
    if (restartBusy) return
    const confirmed = await requestConfirmation({
      confirmLabel: 'Restart now',
      description: 'Windows will restart immediately. Save open work before continuing.',
      eyebrow: 'Restart required',
      title: 'Restart Windows now?',
      tone: 'warning',
    })
    if (!confirmed) return
    setRestartBusy(true)
    try {
      await requestWindowsRestart()
    } finally {
      setRestartBusy(false)
    }
  }

  const applySessionTweak = async (request: Parameters<typeof applyOptimizationTweak>[0]) => {
    const result = await applyOptimizationTweak(request)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    const rebootLabel = REBOOT_TWEAK_LABELS[request.kind]
    if (rebootLabel) addRestartNotice(rebootLabel)
    return result
  }

  const applySystemPreset = async (request: Parameters<typeof applyRegistryPreset>[0]) => {
    const result = await applyRegistryPreset(request)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
    const rebootLabel = result.status === 'applied' ? REBOOT_PRESET_LABELS[request.preset_id] : null
    if (rebootLabel) addRestartNotice(rebootLabel)
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
    if (activePage === 'ml') {
      return (
        <DashboardPage
          benchmarkBaseline={benchmarkBaseline}
          dashboard={dashboard}
          latestBenchmark={latestBenchmark}
          onApplyRegistryPreset={applySystemPreset}
          onApplyTweak={applySessionTweak}
          onAttachSession={attachSession}
          onOpenLogs={() => setActivePage('history')}
          onOpenOptimization={() => setActivePage('optimize')}
          onRefreshRuntime={() => loadOptimizationRuntime()}
          onOpenTests={() => setActivePage('tests')}
          onRollbackSnapshot={rollbackSnapshot}
          profiles={profiles}
          realtime={realtime}
          runtimeState={optimizationRuntime}
        />
      )
    }
    if (activePage === 'tests') {
      return (
        <TestsPage
          benchmarkBaseline={benchmarkBaseline}
          benchmarkBusy={benchmarkBusy}
          benchmarkEvidence={benchmarkEvidence}
          latestBenchmark={latestBenchmark}
          onSaveBenchmarkCsv={saveBenchmarkCsv}
          onStartCapture={startTestCapture}
          onWaitForCapture={waitForTestCapture}
          onStopCapture={stopTestCapture}
          onApplyRegistryPreset={applySystemPreset}
          onApplyTweak={applySessionTweak}
          onAttachSession={attachSession}
          onCaptureBaseline={captureBaseline}
          onClearSessionSelection={() => {
            setSelectedProcessId(null)
            void loadOptimizationRuntime(undefined)
          }}
          onEndSession={() =>
            void endOptimizationSession().then((nextState) => {
              setOptimizationRuntime(nextState)
              setSession(nextState.session)
              setLoaded((current) => ({ ...current, optimizationRuntime: true }))
            })
          }
          onOpenLogs={() => setActivePage('history')}
          onOpenSettings={() => setActivePage('settings')}
          onRefresh={(processId) => {
            void Promise.all([loadOptimizationRuntime(processId), loadBenchmarkState()])
          }}
          onRollbackSnapshot={rollbackSnapshot}
          onRunBenchmark={runBenchmark}
          onSelectProcess={(processId) => {
            setSelectedProcessId(processId)
            void loadOptimizationRuntime(processId)
          }}
          profiles={profiles}
          realtime={realtime}
          registryPresetChangesEnabled={settings.registry_presets_enabled}
          runtimeState={optimizationRuntime}
          safeChangesEnabled={featureFlags.network_optimizer}
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
          onRefresh={async () => {
            await loadOptimizationRuntime(selectedProcessId ?? undefined)
          }}
          onRequestRestart={restartWindowsNow}
          onRollbackSnapshot={rollbackSnapshot}
        />
      )
    }
    if (activePage === 'safety') {
      return (
        <SecurityPage
          onClose={() => setActivePage('home')}
          onOpenBackup={() => setActivePage('history')}
          onOpenOptimization={() => setActivePage('optimize')}
          onOpenSettings={() => setActivePage('settings')}
          onVerify={() => loadSecurity()}
          security={security}
        />
      )
    }
    if (activePage === 'history') {
      return (
        <BackupPage
          activity={optimizationRuntime.activity}
          diffText={diffText}
          onCreateSnapshot={(note) => createSnapshot(note)}
          onDeleteSnapshot={(id) => deleteSnapshot(id)}
          onExportSnapshot={(id) => api.exportSnapshot(id)}
          onImportSnapshot={(record) => importSnapshot(record)}
          onInspectSnapshot={(id) => inspectSnapshot(id)}
          onRefresh={refreshBackup}
          onRestoreSnapshot={(id) => restoreSnapshot(id)}
          onRollbackSnapshot={(snapshotId) => rollbackSnapshot(snapshotId, selectedProcessId ?? undefined)}
          snapshots={snapshots}
        />
      )
    }
    if (activePage === 'settings') {
      return (
        <SettingsPage
          build={build}
          featureFlags={featureFlags}
          onToggleFlag={(key, value) => requestFlagChange(key, value)}
          onUpdateSystemSettings={(nextSettings) => updateSystemSettings(nextSettings)}
          onUpdateTheme={(nextTheme) => setTheme(nextTheme)}
          settings={settings}
          startupDiagnostics={startupDiagnostics}
          theme={theme}
        />
      )
    }
    return (
      <HomePage
        build={build}
        dashboard={dashboard}
        onOpenMl={() => setActivePage('ml')}
        onOpenOptimization={() => setActivePage('optimize')}
        onOpenTests={() => setActivePage('tests')}
        realtime={realtime}
        runtimeState={optimizationRuntime}
        systemTelemetry={systemTelemetry}
        username={windowsUsername}
      />
    )
  }

  const optimizationLevel = getOptimizationLevel(optimizationRuntime)

  return (
    <main className="h-screen bg-[#081026]">
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_76%_18%,rgba(38,95,196,0.34),transparent_36%),radial-gradient(circle_at_38%_84%,rgba(84,45,185,0.28),transparent_42%),linear-gradient(135deg,#171251_0%,#0b1b3f_52%,#0d2a4b_100%)] ${
          isMaximized ? '' : 'rounded-[1.7rem]'
        }`}
      >
        <header className="grid h-[58px] grid-cols-[1fr_auto] items-center bg-transparent px-4">
          <div data-tauri-drag-region className="h-full" />

          <div className="window-no-drag flex items-center gap-1">
            <button
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="window-control inline-flex h-9 items-center gap-2 rounded-full bg-[#070b1b]/78 px-3 text-xs font-semibold text-white/82 transition hover:bg-[#111936] hover:text-white"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              type="button"
            >
              {theme === 'dark' ? <SunMedium size={14} /> : <MoonStar size={14} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              aria-label="Minimize"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-black/75 transition hover:bg-white/20 hover:text-black"
              onClick={minimizeWindow}
              type="button"
            >
              <Minus size={18} />
            </button>
            <button
              aria-label="Maximize or restore"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-black/75 transition hover:bg-white/20 hover:text-black"
              onClick={toggleMaximizeWindow}
              type="button"
            >
              <Square size={14} />
            </button>
            <button
              aria-label="Close"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-black/75 transition hover:bg-danger/40 hover:text-black"
              onClick={closeWindow}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div
          className={`grid min-h-0 flex-1 grid-cols-[78px_minmax(0,1fr)] gap-3 lg:grid-cols-[276px_minmax(0,1fr)] lg:gap-5 ${
            isMaximized ? 'p-3 pt-0' : 'p-3 pt-0 lg:p-4 lg:pt-0'
          }`}
        >
          <Sidebar activePage={activePage} optimizationLevel={optimizationLevel} onSelect={setActivePage} />
          <section className="min-h-0 overflow-auto overflow-x-hidden rounded-[1.55rem] bg-transparent p-2 pr-3">{renderPage()}</section>
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
      {restartNotice.length > 0 ? (
        <div className="fixed bottom-5 right-5 z-50 w-[min(460px,calc(100vw-2.5rem))] rounded-[1.2rem] border border-[#ffcf5a]/30 bg-[#070b1b] p-4 text-white shadow-[0_22px_55px_rgba(0,0,0,0.35)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#3b2911] text-[#ffcf5a]">
              <RefreshCw size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black">Restart required</p>
              <p className="mt-1 text-sm leading-6 text-white/62">
                These changes will fully apply after Windows restart: {restartNotice.join(', ')}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-[#315cff] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={restartBusy}
                  onClick={() => void restartWindowsNow()}
                  type="button"
                >
                  {restartBusy ? 'Requesting restart...' : 'Restart now'}
                </button>
                <button className="rounded-xl bg-[#202942] px-4 py-2 text-sm font-bold text-white" onClick={() => setRestartNotice([])} type="button">
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
