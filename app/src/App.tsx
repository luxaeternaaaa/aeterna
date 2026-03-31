import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'
import { Minus, MoonStar, SunMedium, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

import { ConsentModal } from './components/ConsentModal'
import { Sidebar } from './components/Sidebar'
import { StartupSkeleton } from './components/StartupSkeleton'
import { TweakPreviewModal } from './components/TweakPreviewModal'
import { api } from './lib/api'
import { readStartupCache, writeStartupCache } from './lib/cache'
import { featureConsent } from './lib/consent'
import { getPageChrome, type ThemeMode } from './lib/pageChrome'
import {
  applyRegistryPreset,
  applyOptimizationTweak,
  attachOptimizationSession,
  endOptimizationSession,
  getMlRuntimeTruth,
  inspectOptimization,
  rollbackOptimizationTweak,
  runOptimizationInference,
} from './lib/sidecar'
import { getInitialState, getStartupState, toConnection } from './lib/startup'
import { DashboardPage } from './pages/DashboardPage'
import { LogsPage } from './pages/LogsPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { SecurityPage } from './pages/SecurityPage'
import { SettingsPage } from './pages/SettingsPage'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  BenchmarkReport,
  BenchmarkWindow,
  BootstrapPayload,
  BuildMetadata,
  DashboardPayload,
  FeatureFlags,
  GameProfile,
  LogRecord,
  MlInferencePayload,
  OptimizationSummary,
  OptimizationRuntimeState,
  PageId,
  SecuritySummary,
  SnapshotRecord,
  StartupDiagnostics,
  SystemSettings,
  TelemetryPoint,
  TrustStatusPresentation,
} from './types'

type ConnectionState = { title: string; detail: string }
type PendingConsent = { description: string; key: keyof FeatureFlags; title: string }
type LoadedState = { dashboard: boolean; logs: boolean; optimization: boolean; optimizationRuntime: boolean; security: boolean; snapshots: boolean }
type PendingAction =
  | { changes: string[]; description: string; request: ApplyTweakRequest; risk: string; title: string; trust: TrustStatusPresentation; kind: 'tweak' }
  | { changes: string[]; description: string; request: ApplyRegistryPresetRequest; risk: string; title: string; trust: TrustStatusPresentation; kind: 'registry' }

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
  automation_allowlist: [],
  registry_presets_enabled: false,
  show_advanced_registry_details: false,
}
const initialDashboard: DashboardPayload = { stats: [], history: [], recommendations: [], session_health: 'Loading', mode: 'demo', badge: 'Loading' }
const initialSecurity: SecuritySummary = { status: 'low', label: 'normal-session', confidence: 0.89, auto_scan_enabled: false }
const initialOptimization: OptimizationSummary = {
  optimizer_enabled: false,
  risk_label: 'low',
  spike_probability: 0.18,
  confidence: 0.62,
  model_source: 'local-summary',
  next_action: 'Attach a game session and capture a baseline before testing a safe preset.',
  primary_blocker: 'Performance optimizer is disabled in Settings.',
  proof_state: 'blocked',
}
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
  const [optimization, setOptimization] = useState<OptimizationSummary>(initialOptimization)
  const [optimizationRuntime, setOptimizationRuntime] = useState<OptimizationRuntimeState>(initialOptimizationRuntime)
  const [session, setSession] = useState(cache?.bootstrap?.session ?? initialOptimizationRuntime.session)
  const [inference, setInference] = useState<MlInferencePayload | null>(null)
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null)
  const [realtime, setRealtime] = useState<TelemetryPoint | null>(cache?.dashboard?.history.at(-1) ?? null)
  const [diffText, setDiffText] = useState('')
  const [startupDiagnostics, setStartupDiagnostics] = useState<StartupDiagnostics | null>(null)
  const [pendingConsent, setPendingConsent] = useState<PendingConsent | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [benchmarkBusy, setBenchmarkBusy] = useState(false)
  const [loaded, setLoaded] = useState<LoadedState>({
    dashboard: Boolean(cache?.dashboard),
    logs: false,
    optimization: false,
    optimizationRuntime: false,
    security: false,
    snapshots: Boolean(cache?.bootstrap?.last_snapshot_meta),
  })
  const undoReadyCount = optimizationRuntime.activity.filter((entry) => entry.can_undo).length
  const pageChrome = getPageChrome({
    activePage,
    benchmarkBaseline,
    connectionTitle: connection.title,
    dashboard,
    featureFlags,
    latestBenchmark,
    logs,
    optimization,
    optimizationRuntime,
    security,
    session,
    settings,
    theme,
    undoReadyCount,
  })
  const chromeStatuses = [pageChrome.primaryStatus, pageChrome.proofState, pageChrome.optionalSecondaryStatus].filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  )
  const compactStatuses = chromeStatuses.slice(0, 2)
  const showPageMeta = activePage !== 'home'

  const minimizeWindow = () => {
    if (!isTauriRuntime()) return
    void invoke('minimize_main_window')
  }

  const closeWindow = () => {
    if (!isTauriRuntime()) return
    void invoke('close_main_window')
  }

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
    const [nextInference] = await Promise.all([
      sample ? runOptimizationInference(sample) : Promise.resolve(null),
      getMlRuntimeTruth(),
    ])
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
    if ((activePage === 'home' || activePage === 'optimize') && !loaded.optimization) void loadOptimization()
    if (activePage === 'optimize' && !loaded.optimizationRuntime) void loadOptimizationRuntime(selectedProcessId ?? undefined)
    if ((activePage === 'home' || activePage === 'optimize') && !benchmarkBaseline && !latestBenchmark) void loadBenchmarkState()
    if (activePage === 'safety' && !loaded.security) void loadSecurity()
    if (activePage === 'history' && !loaded.logs) void loadLogs()
    if (activePage === 'settings' && !loaded.snapshots) void loadSettingsData()
  }, [activePage, benchmarkBaseline, latestBenchmark, loaded, loadBenchmarkState, loadDashboard, loadLogs, loadOptimization, loadOptimizationRuntime, loadSecurity, loadSettingsData, selectedProcessId])

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

  const updateRegistryPresetsEnabled = async (enabled: boolean) => {
    await api.updateSystem({ ...settings, registry_presets_enabled: enabled })
    await loadSettingsData()
    await loadOptimizationRuntime(selectedProcessId ?? undefined)
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

  const previewTweak = (request: ApplyTweakRequest) => {
    if (request.kind === 'process_priority') {
      const name = optimizationRuntime.selected_process?.name ?? 'selected process'
      const currentPriority = optimizationRuntime.selected_process?.priority_label ?? 'Normal'
      return setPendingAction({
        kind: 'tweak',
        request,
        title: 'Raise process priority',
        description: `Aeterna will raise ${name} from ${currentPriority} to Above normal priority using the Windows scheduler. This change is session scoped, rollback-safe, and never touches game memory.`,
        risk: 'medium',
        changes: [
          'Create a rollback snapshot of the current priority and affinity state.',
          'Apply Above normal process priority to the attached session only.',
          'Auto-restore the captured state when the tracked process exits or when you end the session.',
        ],
        trust: {
          current_state: `${name} at ${currentPriority}`,
          target_state: `${name} at Above normal priority`,
          policy_status: settings.automation_allowlist.includes('process_priority') ? 'allowed inside policy' : 'manual-only unless allowlisted',
          rollback_available: true,
          blocking_reason: null,
          admin_required: false,
          scope: 'session',
        },
      })
    }
    if (request.kind === 'cpu_affinity') {
      const name = optimizationRuntime.selected_process?.name ?? 'selected process'
      const currentAffinity = optimizationRuntime.selected_process?.affinity_label ?? 'Current affinity'
      return setPendingAction({
        kind: 'tweak',
        request,
        title: 'Apply balanced CPU affinity',
        description: `Aeterna will move ${name} from ${currentAffinity} to a reversible balanced affinity preset. Expert one-thread-per-core reduction stays out of the default safe path.`,
        risk: 'medium',
        changes: [
          'Capture the current affinity mask in a rollback snapshot.',
          'Apply a safer balanced affinity preset to the attached session only.',
          'Auto-restore the original affinity when the session ends.',
        ],
        trust: {
          current_state: `${name} using ${currentAffinity}`,
          target_state: `${name} using balanced affinity`,
          policy_status: settings.automation_allowlist.includes('cpu_affinity') ? 'allowed inside policy' : 'manual-only unless allowlisted',
          rollback_available: true,
          blocking_reason: null,
          admin_required: false,
          scope: 'session',
        },
      })
    }
    const plan = optimizationRuntime.power_plans.find((item) => item.guid === request.power_plan_guid)
    const activePlan = optimizationRuntime.power_plans.find((item) => item.active)
    setPendingAction({
      kind: 'tweak',
      request,
      title: `Switch power plan to ${plan?.name ?? 'selected plan'}`,
      description: `Aeterna will switch Windows from ${activePlan?.name ?? 'the current plan'} to ${plan?.name ?? 'the selected plan'} for the attached session and keep your original scheme in a rollback snapshot.`,
      risk: 'low',
      changes: [
        'Capture the current active power plan.',
        'Switch Windows to the selected existing power plan for the active session.',
        'Auto-restore your original power plan after the session ends or on manual Undo.',
      ],
      trust: {
        current_state: activePlan?.name ?? 'Current power plan',
        target_state: plan?.name ?? 'Selected plan',
        policy_status: settings.automation_allowlist.includes('power_plan') ? 'allowed inside policy' : 'manual-only unless allowlisted',
        rollback_available: true,
        blocking_reason: null,
        admin_required: false,
        scope: 'session',
      },
    })
  }

  const previewRegistryPreset = (request: ApplyRegistryPresetRequest) => {
    const preset = optimizationRuntime.registry_presets.find((item) => item.id === request.preset_id)
    if (!preset) return
    setPendingAction({
      kind: 'registry',
      request,
      title: preset.title,
      description: `${preset.expected_benefit} This preset is allowlisted, reversible, and should only be trusted after a baseline and comparison.`,
      risk: preset.risk,
      changes: [
        `Create an exact rollback snapshot for ${preset.affected_values_count} registry value${preset.affected_values_count === 1 ? '' : 's'}.`,
        `Apply the preset at ${preset.scope}.`,
        preset.requires_admin ? 'Request administrator approval only for this one action.' : 'Apply the preset without machine-wide elevation.',
        ...preset.advanced_details,
      ],
      trust: {
        current_state: preset.current_state,
        target_state: preset.target_state,
        policy_status: preset.allowed_now ? 'allowed inside policy' : 'blocked by policy',
        rollback_available: true,
        blocking_reason: preset.blocking_reason ?? null,
        next_action: preset.next_action ?? null,
        admin_required: preset.requires_admin,
        scope: preset.scope,
      },
    })
  }

  const applyTweak = async () => {
    if (!pendingAction) return
    const result: ApplyTweakResponse | ApplyRegistryPresetResponse =
      pendingAction.kind === 'tweak'
        ? await applyOptimizationTweak(pendingAction.request)
        : await applyRegistryPreset(pendingAction.request)
    if (pendingAction.kind === 'registry' && 'status' in result && result.status === 'blocked') {
      setOptimizationRuntime(result.state)
      setSession(result.state.session)
      await loadOptimization()
      setPendingAction((current) =>
        current && current.kind === 'registry'
          ? {
              ...current,
              trust: {
                ...current.trust,
                blocking_reason: result.blocking_reason ?? current.trust.blocking_reason,
                next_action: result.next_action ?? current.trust.next_action,
              },
            }
          : current,
      )
      return
    }
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    await loadOptimization()
    await loadBenchmarkState()
    setPendingAction(null)
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
  }

  const rollbackTweak = async (snapshotId: string) => {
    const result = await rollbackOptimizationTweak(snapshotId, selectedProcessId ?? undefined)
    setOptimizationRuntime(result.state)
    setSession(result.state.session)
    await loadOptimization()
    await loadBenchmarkState()
    setLoaded((current) => ({ ...current, optimizationRuntime: true }))
  }

  const captureBaseline = async () => {
    setBenchmarkBusy(true)
    try {
      const baseline = await api.captureBenchmarkBaseline()
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
      const report = await api.runBenchmark(profileId)
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

  const renderPage = () => {
    if (activePage === 'home' && !loaded.dashboard && dashboard.stats.length === 0) return <StartupSkeleton />
    if (activePage === 'optimize') {
      return (
        <OptimizationPage
          benchmarkBaseline={benchmarkBaseline}
          benchmarkBusy={benchmarkBusy}
          dashboard={dashboard}
          featureFlags={featureFlags}
          inference={inference}
          latestBenchmark={latestBenchmark}
          onAttachSession={(request) => void attachOptimizationSession(request).then((nextState) => {
            setOptimizationRuntime(nextState)
            setSession(nextState.session)
            setSelectedProcessId(request.process_id)
            setLoaded((current) => ({ ...current, optimizationRuntime: true }))
          })}
          onCaptureBaseline={() => void captureBaseline()}
          onEndSession={() => void endOptimizationSession().then((nextState) => {
            setOptimizationRuntime(nextState)
            setSession(nextState.session)
            setLoaded((current) => ({ ...current, optimizationRuntime: true }))
          })}
          onOpenSettings={() => setActivePage('settings')}
          onPreviewTweak={previewTweak}
          onPreviewRegistryPreset={previewRegistryPreset}
          onRefresh={(processId) => void loadOptimizationRuntime(processId)}
          onRollback={(snapshotId) => void rollbackTweak(snapshotId)}
          onRunBenchmark={(profileId) => void runBenchmark(profileId)}
          onSelectProcess={(processId) => {
            setSelectedProcessId(processId)
            void loadOptimizationRuntime(processId)
          }}
          optimization={optimization}
          profiles={profiles}
          runtimeState={optimizationRuntime}
          selectedProcessId={selectedProcessId}
          settings={settings}
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
          onUpdateRegistryPresetsEnabled={(enabled) => void updateRegistryPresetsEnabled(enabled)}
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
        benchmarkBaseline={benchmarkBaseline}
        dashboard={dashboard}
        latestBenchmark={latestBenchmark}
        onOpenOptimization={() => setActivePage('optimize')}
        optimization={optimization}
        profiles={profiles}
        realtime={realtime}
        session={session}
      />
    )
  }

  return (
    <main className="h-screen bg-transparent">
      <div className="mx-auto flex h-full max-w-[1280px] flex-col overflow-hidden rounded-[1.7rem] bg-canvas">
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
              aria-label="Close"
              className="window-control grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-danger/25 hover:text-text"
              onClick={closeWindow}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[78px_1fr] gap-3 p-2.5">
          <Sidebar activePage={activePage} connection={connection} onSelect={setActivePage} />
          <section className="min-h-0 overflow-auto rounded-[1.5rem] border border-border/80 bg-surface/95 p-4 md:p-5">
            <header className="mb-5">
              {showPageMeta ? <p className="text-[10px] uppercase tracking-[0.24em] text-muted">{pageChrome.eyebrow}</p> : null}
              <div className="mt-2 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-start">
                <div className="max-w-[56rem]">
                  <h2 className={`font-semibold tracking-tight text-text ${activePage === 'home' ? 'text-[2rem] leading-[0.98] md:text-[2.35rem]' : 'text-[1.7rem] leading-[1.02] md:text-[1.95rem]'}`}>
                    {pageChrome.title}
                  </h2>
                  {showPageMeta ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{pageChrome.subtitle}</p> : null}
                </div>
                <div className="grid gap-2 xl:w-[21rem]">
                  <div className="rounded-xl border border-border/70 bg-surface-muted/80 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{pageChrome.primaryAction.label}</p>
                    <p className="mt-1.5 text-sm font-semibold tracking-tight text-text">{pageChrome.primaryAction.value}</p>
                    <p className="mt-1 text-sm leading-5 text-muted">{pageChrome.primaryAction.detail}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {compactStatuses.map((item) => (
                      <div key={`${item.label}-${item.value}`} className="rounded-xl border border-border/70 bg-surface-muted/80 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{item.label}</p>
                        <p className="mt-1.5 text-sm font-semibold tracking-tight text-text">{item.value}</p>
                        <p className="mt-1 text-sm leading-5 text-muted">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </header>
            {renderPage()}
          </section>
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
      {pendingAction ? (
        <TweakPreviewModal
          changes={pendingAction.changes}
          description={pendingAction.description}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void applyTweak()}
          risk={pendingAction.risk}
          title={pendingAction.title}
          trust={pendingAction.trust}
        />
      ) : null}
    </main>
  )
}
