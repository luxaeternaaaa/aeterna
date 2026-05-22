import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  Gauge,
  Gamepad2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { getMlRuntimeTruth, requestWindowsRestart, runOptimizationInference } from '../lib/sidecar'
import { gameCandidateProcesses, matchingGameProfile } from '../lib/gameDetection'
import {
  dangerWarningForOptimizationFunction,
  HIGH_RISK_FUNCTION_IDS,
  isDangerousOptimizationFunctionId,
  loadMlDenyFunctionList,
  ML_TWEAK_TO_FUNCTION_ID,
  OPTIMIZATION_FUNCTIONS,
  type OptimizationFunctionDefinition,
} from '../lib/optimizationFunctions'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  GameProfile,
  OptimizationRuntimeState,
  ProcessSummary,
  RollbackResponse,
  TelemetryPoint,
} from '../types'

interface DashboardPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  dashboard: DashboardPayload
  latestBenchmark: BenchmarkReport | null
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<OptimizationRuntimeState | unknown> | OptimizationRuntimeState | void
  onOpenLogs: () => void
  onOpenOptimization: () => void
  onRefreshRuntime: () => void | Promise<void>
  onOpenTests: () => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
}

type ScanState = 'idle' | 'analyzing' | 'ready' | 'applying' | 'complete' | 'failed'
type PlanTone = 'safe' | 'balanced' | 'restart' | 'danger'

type PlanRequest =
  | { kind: 'tweak'; payload: ApplyTweakRequest }
  | { kind: 'preset'; payload: ApplyRegistryPresetRequest }

interface MlPlanItem {
  definition: OptimizationFunctionDefinition
  impact: string
  reason: string
  request: PlanRequest
  tone: PlanTone
}

interface AppliedPlanItem {
  id: string
  label: string
  requiresReboot: boolean
  snapshotId: string
}

interface ScanResult {
  confidence: number
  coverage: Array<{ label: string; value: string; detail: string }>
  modelLabel: string
  plan: MlPlanItem[]
  rationale: string[]
  safetyScore: number
  skipped: string[]
  summary: string
}

type InferenceInput = Parameters<typeof runOptimizationInference>[0]

const SAFE_FALLBACK_IDS = [
  'ultimate-power',
  'game-mode-on',
  'windowed-optimizations-on',
  'turn-off-recordings',
  'power-throttling-off',
  'interrupt-affinity-lock',
  'usb-selective-suspend-off',
  'pcie-lspm-off',
  'content-delivery-off',
  'advertising-id-off',
  'feedback-frequency-off',
  'app-launch-tracking-off',
]

const FUNCTION_REASONS: Record<string, string> = {
  'ultimate-power': 'Active power policy is part of the baseline. ML keeps CPU/GPU boost behavior predictable during gaming.',
  'game-mode-on': 'Windows should prioritize the foreground game without touching security-sensitive features.',
  'windowed-optimizations-on': 'Keeps the modern DirectX presentation path enabled for borderless/windowed play.',
  'turn-off-recordings': 'Removes background capture overhead that can create frame-time spikes.',
  'power-throttling-off': 'Stops system-wide power throttling from limiting performance during load.',
  'interrupt-affinity-lock': 'Stabilizes interrupt steering on the active power scheme.',
  'usb-selective-suspend-off': 'Prevents mouse, keyboard, controller, and USB audio latency spikes from power saving.',
  'pcie-lspm-off': 'Reduces PCIe link wake latency for GPU and storage paths.',
  'content-delivery-off': 'Reduces suggested-content background work without disabling core Windows functionality.',
  'advertising-id-off': 'Privacy cleanup with no gaming downside.',
  'feedback-frequency-off': 'Removes feedback prompts and background collection noise.',
  'app-launch-tracking-off': 'Reduces Start personalization tracking with low performance risk.',
  'diagtrack-off': 'Telemetry service is a safe candidate when background CPU pressure is high.',
  'maps-broker-off': 'Offline maps service is not useful for most gaming systems.',
  'low-timer-resolution': 'Frame-time volatility is high enough to justify a tighter timer request.',
  'process-qos-high': 'The detected game can be protected from per-process power throttling.',
  'keep-cores': 'The detected game can use all logical cores without affinity restriction.',
  'max-games': 'The detected game can get a higher process priority for this session.',
  'hags-on': 'GPU scheduling may reduce driver/compositor overhead, but Windows must restart to finish it.',
}

const FUNCTION_IMPACT: Record<string, string> = {
  'ultimate-power': 'Power',
  'game-mode-on': 'Scheduler',
  'windowed-optimizations-on': 'Presentation',
  'turn-off-recordings': 'Background load',
  'power-throttling-off': 'CPU boost',
  'interrupt-affinity-lock': 'Latency',
  'usb-selective-suspend-off': 'Input latency',
  'pcie-lspm-off': 'Device latency',
  'content-delivery-off': 'Debloat',
  'advertising-id-off': 'Privacy',
  'feedback-frequency-off': 'Privacy',
  'app-launch-tracking-off': 'Privacy',
  'diagtrack-off': 'Telemetry',
  'maps-broker-off': 'Services',
  'low-timer-resolution': 'Frame pacing',
  'process-qos-high': 'Game session',
  'keep-cores': 'Game session',
  'max-games': 'Game session',
  'hags-on': 'GPU',
}

function formatUnknownError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

function latestSample(dashboard: DashboardPayload, realtime?: TelemetryPoint | null) {
  return realtime ?? dashboard.history.at(-1) ?? null
}

function activePowerPlan(runtimeState: OptimizationRuntimeState) {
  return runtimeState.power_plans.find((plan) => plan.active)?.name ?? 'Unknown'
}

function isRuntimeState(value: unknown): value is OptimizationRuntimeState {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as OptimizationRuntimeState).processes))
}

function activeFunctionIds(runtimeState: OptimizationRuntimeState) {
  const active = new Set<string>()
  const performancePlan = runtimeState.power_plans.find((plan) => plan.active && /ultimate|high performance/i.test(plan.name))
  if (performancePlan) active.add('ultimate-power')
  for (const tweak of runtimeState.session.active_tweaks) {
    const mapped = ML_TWEAK_TO_FUNCTION_ID[tweak]
    if (mapped) active.add(mapped)
  }
  for (const preset of runtimeState.registry_presets) {
    if (!preset.blocking_reason?.toLowerCase().includes('already active')) continue
    const mapped = ML_TWEAK_TO_FUNCTION_ID[`registry:${preset.id}`]
    if (mapped) active.add(mapped)
  }
  return active
}

function readSystemProfile(runtimeState: OptimizationRuntimeState, sample: TelemetryPoint | null): NonNullable<InferenceInput['system_profile']> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number })
  return {
    logical_cores: nav?.hardwareConcurrency ?? null,
    memory_gb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    discrete_gpu_available: sample?.gpu_usage_pct != null ? sample.gpu_usage_pct > 0 : null,
    active_power_plan: activePowerPlan(runtimeState),
    session_attached: runtimeState.session.state === 'attached' || runtimeState.session.state === 'active',
    active_tweaks: runtimeState.session.active_tweaks,
    active_registry_presets: runtimeState.registry_presets
      .filter((preset) => preset.blocking_reason?.toLowerCase().includes('already active'))
      .map((preset) => preset.id),
    autorun_count: runtimeState.autoruns.length,
    running_process_count: Math.max(runtimeState.processes.length, runtimeState.advanced_processes.length),
  }
}

function buildInferenceInput(
  sample: TelemetryPoint | null,
  runtimeState: OptimizationRuntimeState,
  selectedGame: ProcessSummary,
  selectedProfile: GameProfile | null,
): InferenceInput {
  return {
    fps_avg: sample?.fps_avg ?? 120,
    frametime_avg_ms: sample?.frametime_avg_ms ?? 8.3,
    frametime_p95_ms: sample?.frametime_p95_ms ?? 13.6,
    frame_drop_ratio: sample?.frame_drop_ratio ?? 0.03,
    cpu_process_pct: sample?.cpu_process_pct ?? 0,
    cpu_total_pct: sample?.cpu_total_pct ?? 35,
    gpu_usage_pct: sample?.gpu_usage_pct ?? 0,
    ram_working_set_mb: sample?.ram_working_set_mb ?? 0,
    background_process_count: sample?.background_process_count ?? runtimeState.processes.length,
    anomaly_score: sample?.anomaly_score ?? 0.18,
    system_profile: readSystemProfile(runtimeState, sample),
    game_context: {
      process_id: selectedGame.pid,
      process_name: selectedGame.name,
      profile_id: selectedProfile?.id ?? null,
      profile_title: selectedProfile?.title ?? null,
      allowed_actions: selectedProfile?.allowed_actions ?? [],
    },
  }
}

function planTone(definition: OptimizationFunctionDefinition): PlanTone {
  if (definition.risk === 'high') return 'danger'
  if (definition.requiresReboot) return 'restart'
  if (definition.processRequired) return 'balanced'
  return 'safe'
}

function toneClass(tone: PlanTone) {
  if (tone === 'danger') return 'bg-[#45131a] text-[#ff7b85]'
  if (tone === 'restart') return 'bg-[#3b2911] text-[#ffcf5a]'
  if (tone === 'balanced') return 'bg-[#152b5c] text-[#7ba2ff]'
  return 'bg-[#123d2d] text-[#4dff9b]'
}

function makePlanItem(id: string, processId: number | null, runtimeState: OptimizationRuntimeState): MlPlanItem | null {
  const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
  if (!definition) return null
  if (definition.processRequired && !processId) return null
  const request = definition.buildRequest({ processId, runtimeState })
  if (!request) return null
  return {
    definition,
    impact: FUNCTION_IMPACT[id] ?? 'System',
    reason: FUNCTION_REASONS[id] ?? definition.description,
    request,
    tone: planTone(definition),
  }
}

function buildCoverage(
  runtimeState: OptimizationRuntimeState,
  dashboard: DashboardPayload,
  sample: TelemetryPoint | null,
  selectedGame: ProcessSummary | null,
  selectedProfile: GameProfile | null,
  profileCount: number,
) {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number })
  const osLabel = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows') ? 'Windows' : 'Desktop'
  const activeTweaks = runtimeState.session.active_tweaks.length
  const activePresetCount = runtimeState.registry_presets.filter((preset) => preset.blocking_reason?.toLowerCase().includes('already active')).length

  return [
    {
      label: 'OS',
      value: osLabel,
      detail: `${runtimeState.capture_status.source} telemetry, ${dashboard.mode} mode`,
    },
    {
      label: 'CPU',
      value: `${nav?.hardwareConcurrency ?? 'n/a'} threads`,
      detail: `System load ${sample ? `${sample.cpu_total_pct.toFixed(0)}%` : 'not sampled'}`,
    },
    {
      label: 'Memory',
      value: `${typeof nav?.deviceMemory === 'number' ? `${nav.deviceMemory} GB` : 'n/a'}`,
      detail: `Pressure ${sample ? `${sample.memory_pressure_pct.toFixed(0)}%` : 'not sampled'}`,
    },
    {
      label: 'GPU',
      value: sample?.gpu_usage_pct == null ? 'Unknown' : `${sample.gpu_usage_pct.toFixed(0)}% load`,
      detail: sample?.gpu_usage_pct == null ? 'No GPU counter available' : 'GPU counter is available',
    },
    {
      label: 'Settings',
      value: activePowerPlan(runtimeState),
      detail: `${activePresetCount} system preset(s) already active`,
    },
    {
      label: 'Tweaks',
      value: `${activeTweaks} active`,
      detail: `${runtimeState.autoruns.length} autorun entries, ${runtimeState.activity.length} activity records`,
    },
    {
      label: 'Game profile',
      value: selectedProfile?.game ?? selectedGame?.name ?? 'No game selected',
      detail: selectedProfile ? selectedProfile.title : `${profileCount} supported game profile(s) loaded`,
    },
  ]
}

async function analyzeSystem(props: DashboardPageProps, selectedGame: ProcessSummary, runtimeState: OptimizationRuntimeState): Promise<ScanResult> {
  const sample = latestSample(props.dashboard, props.realtime)
  const selectedProfile = matchingGameProfile(selectedGame.name, props.profiles)
  const inferenceInput = buildInferenceInput(sample, runtimeState, selectedGame, selectedProfile)
  const [runtimeTruth, inference] = await Promise.all([getMlRuntimeTruth(), runOptimizationInference(inferenceInput)])
  const denied = loadMlDenyFunctionList()
  const processId = selectedGame.pid
  const alreadyActive = activeFunctionIds(runtimeState)
  const selectedIds = new Set<string>()
  const skipped: string[] = []

  const modelFunctionIds = inference?.recommended_functions ?? []
  const useFallbackPlan = !inference || modelFunctionIds.length === 0 || runtimeTruth?.runtime_mode === 'unavailable'

  for (const id of useFallbackPlan ? SAFE_FALLBACK_IDS : modelFunctionIds) selectedIds.add(id)
  if ((inference?.recommended_tweaks ?? []).includes('power_plan')) selectedIds.add('ultimate-power')
  if ((inference?.recommended_tweaks ?? []).includes('cpu_affinity')) selectedIds.add('keep-cores')
  if ((inference?.recommended_tweaks ?? []).includes('process_priority')) selectedIds.add('max-games')

  if (useFallbackPlan) {
    selectedIds.add('process-qos-high')
    selectedIds.add('max-games')
  }
  if (useFallbackPlan && (!selectedProfile || selectedProfile.allowed_actions.includes('cpu_affinity'))) {
    selectedIds.add('keep-cores')
  }
  if (useFallbackPlan && ((sample?.background_cpu_pct ?? 0) >= 8 || (sample?.background_process_count ?? 0) >= 90)) {
    selectedIds.add('diagtrack-off')
    selectedIds.add('maps-broker-off')
    selectedIds.add('background-apps-off')
    selectedIds.add('store-auto-updates-off')
    selectedIds.add('delivery-optimization-off')
    selectedIds.add('edge-background-off')
  }
  if (useFallbackPlan && ((sample?.frametime_p95_ms ?? 0) >= 18 || (sample?.frame_drop_ratio ?? 0) >= 0.08 || (sample?.anomaly_score ?? 0) >= 0.32)) {
    selectedIds.add('low-timer-resolution')
  }
  if (useFallbackPlan && (sample?.gpu_usage_pct != null || inferenceInput.system_profile?.discrete_gpu_available)) {
    selectedIds.add('hags-on')
  }

  for (const id of HIGH_RISK_FUNCTION_IDS) {
    if (selectedIds.has(id)) selectedIds.delete(id)
    const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
    if (definition) skipped.push(`${definition.title}: too risky for balanced ML mode.`)
  }

  const plan: MlPlanItem[] = []
  for (const id of selectedIds) {
    if (alreadyActive.has(id)) {
      const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
      skipped.push(`${definition?.title ?? id}: already active on this system.`)
      continue
    }
    if (denied.has(id)) {
      const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
      skipped.push(`${definition?.title ?? id}: blocked by ML deny list.`)
      continue
    }
    const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
    if (definition?.processRequired && !processId) {
      skipped.push(`${definition.title}: waiting for a selected game session.`)
      continue
    }
    const item = makePlanItem(id, processId, runtimeState)
    if (item) plan.push(item)
  }

  const rebootCount = plan.filter((item) => item.definition.requiresReboot).length
  const fallback = !inference || runtimeTruth?.runtime_mode === 'unavailable'
  const confidence = fallback ? 0.74 : inference.confidence
  const safetyScore = Math.max(70, Math.min(96, 94 - rebootCount * 7 - plan.filter((item) => item.tone === 'balanced').length * 2))
  const summary =
    useFallbackPlan
      ? 'Runtime inference did not return a concrete function list, so Aeterna selected a conservative fallback plan from safe, reversible tuning rules.'
      : 'ML selected a game-aware balanced plan that avoids high-risk boot and security downgrades, favors reversible system settings, and flags restart-only changes before they are trusted.'
  const rationale = [
    `Model path: ${runtimeTruth?.active_label ?? (fallback ? 'Heuristic fallback' : 'Runtime model')}.`,
    `Selected game: ${selectedProfile?.title ?? selectedGame.name} (PID ${selectedGame.pid}).`,
    `Function source: ${useFallbackPlan ? 'safe fallback rules' : `${modelFunctionIds.length} model-ranked function(s)`}.`,
    `Telemetry source: ${sample ? `${sample.capture_source}, ${sample.session_state}` : 'no live sample, system profile and process state only'}.`,
    `Balanced mode: ${plan.length} action(s), ${rebootCount} restart-required action(s), ${skipped.length} high-risk/blocked action(s) skipped.`,
  ]

  return {
    confidence,
    coverage: buildCoverage(runtimeState, props.dashboard, sample, selectedGame, selectedProfile, props.profiles.length),
    modelLabel: runtimeTruth?.active_label ?? (fallback ? 'Heuristic fallback' : 'ML runtime'),
    plan,
    rationale,
    safetyScore,
    skipped,
    summary,
  }
}

function StatusBadge({ children, tone }: { children: string; tone: PlanTone }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${toneClass(tone)}`}>{children}</span>
}

function confirmDangerousMlApply(items: MlPlanItem[]): boolean {
  const risky = items.filter((item) => isDangerousOptimizationFunctionId(item.definition.id))
  if (risky.length === 0) return true
  const labels = risky.map((item) => `- ${item.definition.title}`).join('\n')
  const details = risky
    .slice(0, 3)
    .map((item) => dangerWarningForOptimizationFunction(item.definition))
    .join('\n\n')
  return window.confirm(
    `Dangerous tweak warning\n\nYou are about to apply ${risky.length} selected risky function(s):\n${labels}\n\nContinue only if you understand what each function does, what can stop working, and how rollback/restart affects the system.\n\n${details}`,
  )
}

export function DashboardPage(props: DashboardPageProps) {
  const sample = latestSample(props.dashboard, props.realtime)
  const gameProcesses = useMemo(() => gameCandidateProcesses(props.runtimeState, props.profiles), [props.profiles, props.runtimeState])
  const [selectedGamePid, setSelectedGamePid] = useState<number | null>(gameProcesses[0]?.pid ?? null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<AppliedPlanItem[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)
  const [restartNeeded, setRestartNeeded] = useState<string[]>([])
  const [restartBusy, setRestartBusy] = useState(false)

  const selectedPlan = useMemo(
    () => scan?.plan.filter((item) => selectedIds.has(item.definition.id)) ?? [],
    [scan?.plan, selectedIds],
  )
  const selectedGame = useMemo(
    () => gameProcesses.find((process) => process.pid === selectedGamePid) ?? gameProcesses[0] ?? null,
    [gameProcesses, selectedGamePid],
  )
  const selectedProfile = selectedGame ? matchingGameProfile(selectedGame.name, props.profiles) : null
  const rebootSelected = selectedPlan.filter((item) => item.definition.requiresReboot)

  useEffect(() => {
    if (selectedGamePid && gameProcesses.some((process) => process.pid === selectedGamePid)) return
    setSelectedGamePid(gameProcesses[0]?.pid ?? null)
  }, [gameProcesses, selectedGamePid])

  const refreshGames = async () => {
    if (scanState === 'analyzing' || scanState === 'applying') return
    setErrorText(null)
    await props.onRefreshRuntime()
  }

  const startScan = async () => {
    if (scanState === 'analyzing' || scanState === 'applying') return
    if (!selectedGame) {
      setScanState('idle')
      setErrorText('No running games found. Start a supported game, refresh the game list, then run ML analysis again.')
      setScan(null)
      setSelectedIds(new Set())
      setApplied([])
      setRestartNeeded([])
      await props.onRefreshRuntime()
      return
    }
    setScanState('analyzing')
    setErrorText(null)
    setApplied([])
    setRestartNeeded([])
    try {
      const attached = await props.onAttachSession({ process_id: selectedGame.pid, process_name: selectedGame.name })
      const runtimeState = isRuntimeState(attached) ? attached : props.runtimeState
      const result = await analyzeSystem(props, selectedGame, runtimeState)
      setScan(result)
      setSelectedIds(new Set(result.plan.map((item) => item.definition.id)))
      setScanState('ready')
    } catch (error) {
      setScanState('failed')
      setErrorText(formatUnknownError(error, 'System analysis failed.'))
    }
  }

  const applyPlan = async () => {
    if (!scan || scanState === 'applying' || selectedPlan.length === 0) return
    if (!confirmDangerousMlApply(selectedPlan)) return
    setScanState('applying')
    setErrorText(null)
    const nextApplied: AppliedPlanItem[] = []
    const failed: string[] = []

    try {
      for (const item of selectedPlan) {
        try {
          if (item.request.kind === 'tweak') {
            const result = await props.onApplyTweak(item.request.payload)
            nextApplied.push({
              id: item.definition.id,
              label: item.definition.title,
              requiresReboot: Boolean(item.definition.requiresReboot),
              snapshotId: result.snapshot.id,
            })
            continue
          }

          const result = await props.onApplyRegistryPreset(item.request.payload)
          if (result.status !== 'applied' || !result.snapshot) {
            const reason = result.blocking_reason ?? 'System policy blocked this setting.'
            if (reason.toLowerCase().includes('already active')) continue
            failed.push(`${item.definition.title}: ${reason}`)
            continue
          }
          nextApplied.push({
            id: item.definition.id,
            label: item.definition.title,
            requiresReboot: Boolean(item.definition.requiresReboot),
            snapshotId: result.snapshot.id,
          })
        } catch (error) {
          failed.push(`${item.definition.title}: ${formatUnknownError(error, 'apply failed')}`)
        }
      }

      await props.onRefreshRuntime()
      setApplied(nextApplied)
      const rebootItems = nextApplied.filter((item) => item.requiresReboot).map((item) => item.label)
      setRestartNeeded(rebootItems)
      setScanState('complete')
      if (failed.length > 0) setErrorText(`Applied ${nextApplied.length} setting(s). Failed: ${failed.join(', ')}`)
    } catch (error) {
      setScanState('failed')
      setErrorText(formatUnknownError(error, 'ML plan apply failed.'))
    }
  }

  const rollbackApplied = async () => {
    if (applied.length === 0 || scanState === 'applying') return
    const processId = props.runtimeState.session.process_id ?? props.runtimeState.detected_game?.pid ?? undefined
    for (const item of [...applied].reverse()) {
      await props.onRollbackSnapshot(item.snapshotId, processId)
    }
    setApplied([])
    setRestartNeeded([])
    setScanState('ready')
  }

  const restartNow = async () => {
    if (restartBusy) return
    const confirmed = window.confirm('Windows will restart immediately. Continue?')
    if (!confirmed) return
    setRestartBusy(true)
    try {
      await requestWindowsRestart()
    } finally {
      setRestartBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-5 px-2 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">ML Tweaks</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">
            Select a running game, analyze Windows and hardware state, then let the local model pick the best safe tweaks.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <button
            className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#315cff] px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55"
            disabled={scanState === 'analyzing' || scanState === 'applying'}
            onClick={() => void (selectedGame ? startScan() : refreshGames())}
            type="button"
          >
            {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
            <span>{scanState === 'analyzing' ? 'Analyzing' : selectedGame ? 'Analyze System' : 'Refresh Games'}</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={props.onOpenOptimization} type="button">
            <Sparkles size={17} />
            <span>Custom</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={props.onOpenTests} type="button">
            <BarChart3 size={17} />
            <span>Tests</span>
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-5">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#315cff]/18 text-[#7ba2ff]">
                <Gamepad2 size={25} />
              </span>
              <div>
                <h2 className="text-xl font-black">Running games</h2>
                <p className="mt-1 text-sm leading-5 text-white/52">Only real detected game processes are listed here.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {gameProcesses.length > 0 ? (
                gameProcesses.map((process) => {
                  const active = selectedGame?.pid === process.pid
                  const profile = matchingGameProfile(process.name, props.profiles)
                  return (
                    <button
                      key={process.pid}
                      className={`w-full rounded-xl px-4 py-3 text-left transition ${
                        active ? 'bg-[#315cff] text-white' : 'bg-[#111936] text-white/86 hover:bg-[#172145]'
                      }`}
                      onClick={() => {
                        setSelectedGamePid(process.pid)
                        setScanState('idle')
                        setScan(null)
                        setSelectedIds(new Set())
                        setApplied([])
                        setRestartNeeded([])
                        setErrorText(null)
                      }}
                      type="button"
                    >
                      <span className="block truncate text-base font-black">{process.name}</span>
                      <span className={`mt-1 block text-xs font-semibold ${active ? 'text-white/72' : 'text-white/42'}`}>
                        PID {process.pid}
                        {profile ? ` | ${profile.title}` : ' | game signature'}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-xl bg-[#111936] px-4 py-4 text-sm font-semibold leading-6 text-white/54">
                  No running games found. Start a game, then refresh the game list.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#315cff]/18 text-[#7ba2ff]">
                <Bot size={25} />
              </span>
              <div>
                <h2 className="text-xl font-black">Balanced ML mode</h2>
                <p className="mt-1 text-sm leading-5 text-white/52">Performance gains with rollback, safety gates, and restart warnings.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Confidence</p>
                <p className="mt-2 text-2xl font-black">{scan ? `${(scan.confidence * 100).toFixed(0)}%` : 'n/a'}</p>
              </div>
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Safety</p>
                <p className="mt-2 text-2xl font-black">{scan ? `${scan.safetyScore}%` : 'n/a'}</p>
              </div>
            </div>
            <button
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#315cff] px-4 text-base font-bold disabled:cursor-not-allowed disabled:bg-white/30"
              disabled={scanState === 'analyzing' || scanState === 'applying'}
              onClick={() => void (selectedGame ? startScan() : refreshGames())}
              type="button"
            >
              {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={18} /> : <Gauge size={18} />}
              <span>{scanState === 'analyzing' ? 'Scanning system' : selectedGame ? 'Start ML Analysis' : 'Refresh game list'}</span>
            </button>
            <button
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#202942] px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!scan || selectedPlan.length === 0 || scanState === 'applying' || scanState === 'analyzing'}
              onClick={() => void applyPlan()}
              type="button"
            >
              {scanState === 'applying' ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              <span>{scanState === 'applying' ? 'Applying plan' : `Apply Selected (${selectedPlan.length})`}</span>
            </button>
            {rebootSelected.length > 0 ? (
              <p className="mt-3 rounded-xl bg-[#3b2911] px-4 py-3 text-sm font-semibold text-[#ffcf5a]">
                {rebootSelected.length} selected setting(s) will need Windows restart after apply.
              </p>
            ) : null}
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <h2 className="text-xl font-black">Current system</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Selected game</span>
                <span className="max-w-[190px] truncate font-bold">{selectedGame?.name ?? 'None'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Telemetry</span>
                <span className="font-bold">{props.dashboard.mode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Power plan</span>
                <span className="max-w-[190px] truncate font-bold">{activePowerPlan(props.runtimeState)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Active tweaks</span>
                <span className="font-bold">{props.runtimeState.session.active_tweaks.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">CPU load</span>
                <span className="font-bold">{sample ? `${sample.cpu_total_pct.toFixed(0)}%` : 'n/a'}</span>
              </div>
            </div>
          </section>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-5">
          <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">System analysis</h2>
                <p className="mt-1 text-sm text-white/48">The model checks hardware, OS state, active settings, enabled tweaks, autoruns, telemetry, and game context.</p>
              </div>
              <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">{scan?.modelLabel ?? 'Waiting for scan'}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-4">
              {(scan?.coverage ?? buildCoverage(props.runtimeState, props.dashboard, sample, selectedGame, selectedProfile, props.profiles.length)).map((item) => (
                <article key={item.label} className="rounded-[1rem] bg-[#111936] p-4">
                  <p className="text-xs font-bold uppercase text-white/36">{item.label}</p>
                  <p className="mt-2 truncate text-lg font-black">{item.value}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {scanState === 'idle' ? (
            <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-7">
              <div className="flex items-start gap-4">
                <Sparkles className="mt-1 text-[#7ba2ff]" size={28} />
                <div>
                  <h2 className="text-2xl font-black">Start with system analysis</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
                    Pick a running game on the left. Aeterna will attach to that process, scan the OS, hardware, active presets, autoruns, telemetry, and current game profile, then select the safest useful plan.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {scanState === 'analyzing' ? (
            <section className="rounded-[1.35rem] bg-[#10255b] p-6 shadow-[inset_0_0_0_1px_rgba(123,162,255,0.22)]">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin text-[#7ba2ff]" size={26} />
                <div>
                  <h2 className="text-xl font-black">Analyzing full system</h2>
                  <p className="mt-1 text-sm text-white/64">
                    Checking OS state, components, power policy, registry presets, active tweaks, telemetry quality, and selected game profile.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {scan ? (
            <section className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Balanced plan</h2>
                  <p className="mt-1 text-sm text-white/48">{scan.summary}</p>
                </div>
                <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">
                  {selectedPlan.length}/{scan.plan.length} selected
                </span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {scan.plan.map((item) => {
                  const active = selectedIds.has(item.definition.id)
                  return (
                    <button
                      key={item.definition.id}
                      className={`rounded-[1.2rem] px-4 py-4 text-left transition ${
                        active ? 'bg-[#16285d] ring-1 ring-[#315cff]/80' : 'bg-[#070b1b]/88 opacity-70 hover:opacity-100'
                      }`}
                      disabled={scanState === 'applying'}
                      onClick={() => {
                        setSelectedIds((current) => {
                          const next = new Set(current)
                          if (next.has(item.definition.id)) next.delete(item.definition.id)
                          else next.add(item.definition.id)
                          return next
                        })
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${active ? 'bg-[#315cff]' : 'bg-[#202942]'}`}>
                            {active ? <Check size={16} /> : null}
                          </span>
                          <div>
                            <h3 className="text-base font-black">{item.definition.title}</h3>
                            <p className="mt-1 text-sm leading-5 text-white/56">{item.reason}</p>
                          </div>
                        </div>
                        <StatusBadge tone={item.tone}>{item.tone === 'danger' ? 'Risk' : item.tone === 'restart' ? 'Restart' : item.tone}</StatusBadge>
                      </div>
                      <p className="mt-3 text-xs font-bold uppercase text-white/36">{item.impact}</p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <article className="rounded-[1.2rem] bg-[#070b1b]/88 p-4">
                  <h3 className="text-base font-black">Why this plan</h3>
                  <div className="mt-3 space-y-2">
                    {scan.rationale.map((line) => (
                      <p key={line} className="flex gap-2 text-sm leading-6 text-white/58">
                        <ShieldCheck className="mt-1 shrink-0 text-[#4dff9b]" size={15} />
                        <span>{line}</span>
                      </p>
                    ))}
                  </div>
                </article>
                <article className="rounded-[1.2rem] bg-[#070b1b]/88 p-4">
                  <h3 className="text-base font-black">Skipped for safety</h3>
                  <div className="mt-3 space-y-2">
                    {scan.skipped.slice(0, 5).map((line) => (
                      <p key={line} className="flex gap-2 text-sm leading-6 text-white/58">
                        <AlertTriangle className="mt-1 shrink-0 text-[#ffcf5a]" size={15} />
                        <span>{line}</span>
                      </p>
                    ))}
                    {scan.skipped.length === 0 ? <p className="text-sm text-white/52">No safety skips in this scan.</p> : null}
                  </div>
                </article>
              </div>

              {scanState === 'complete' ? (
                <section className="mt-4 rounded-[1.35rem] bg-[#070b1b]/88 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 text-[#4dff9b]" size={23} />
                    <div>
                      <h2 className="text-xl font-black">ML plan applied</h2>
                      <p className="mt-1 text-sm leading-6 text-white/60">
                        Applied {applied.length} setting(s). Rollback snapshots were created for applied changes.
                      </p>
                    </div>
                  </div>
                  {restartNeeded.length > 0 ? (
                    <div className="mt-4 rounded-xl bg-[#3b2911] px-4 py-3 text-sm text-[#ffcf5a]">
                      <p className="font-black">Restart required to finish: {restartNeeded.join(', ')}.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="rounded-xl bg-[#315cff] px-4 py-2 font-bold text-white" disabled={restartBusy} onClick={() => void restartNow()} type="button">
                          {restartBusy ? 'Requesting restart...' : 'Restart now'}
                        </button>
                        <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold text-white" onClick={() => setRestartNeeded([])} type="button">
                          Later
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold" disabled={applied.length === 0} onClick={() => void rollbackApplied()} type="button">
                      <RotateCcw className="mr-2 inline" size={16} />
                      Rollback applied
                    </button>
                    <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold" onClick={props.onOpenTests} type="button">
                      Run controlled test
                    </button>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {errorText ? (
            <section className="rounded-[1rem] bg-[#3d1218]/80 px-4 py-3 text-sm font-semibold text-[#ff8a8f]">
              <AlertTriangle className="mr-2 inline" size={17} />
              {errorText}
            </section>
          ) : null}
        </section>
      </main>
    </div>
  )
}
