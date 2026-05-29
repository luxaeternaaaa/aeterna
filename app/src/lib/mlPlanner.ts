import { gameCandidateProcesses, matchingGameProfile } from './gameDetection'
import {
  HIGH_RISK_FUNCTION_IDS,
  loadMlDenyFunctionList,
  ML_TWEAK_TO_FUNCTION_ID,
  OPTIMIZATION_FUNCTIONS,
  type OptimizationFunctionDefinition,
  type OptimizationFunctionRequest,
} from './optimizationFunctions'
import { getMlRuntimeTruth, runOptimizationInference, type MlInferenceInput } from './sidecar'
import type { DashboardPayload, GameProfile, MlFunctionScore, OptimizationRuntimeState, ProcessSummary, TelemetryPoint } from '../types'

export type ScanState = 'idle' | 'analyzing' | 'ready' | 'applying' | 'complete' | 'failed'
export type PlanTone = 'safe' | 'balanced' | 'restart' | 'danger'

export interface MlPlanItem {
  definition: OptimizationFunctionDefinition
  expectedGainPct: number | null
  impact: string
  mlConfidence: number | null
  reason: string
  request: OptimizationFunctionRequest
  scoreSource: string | null
  tone: PlanTone
}

export interface MlCoverageItem {
  label: string
  value: string
  detail: string
}

export interface ScanResult {
  confidence: number
  coverage: MlCoverageItem[]
  modelLabel: string
  plan: MlPlanItem[]
  rationale: string[]
  safetyScore: number
  skipped: string[]
  summary: string
}

interface AnalyzeMlSystemInput {
  dashboard: DashboardPayload
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
  selectedGame: ProcessSummary
}

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

export function latestSample(dashboard: DashboardPayload, realtime?: TelemetryPoint | null) {
  return realtime ?? dashboard.history.at(-1) ?? null
}

export function activePowerPlan(runtimeState: OptimizationRuntimeState) {
  return runtimeState.power_plans.find((plan) => plan.active)?.name ?? 'Unknown'
}

export function isRuntimeState(value: unknown): value is OptimizationRuntimeState {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as OptimizationRuntimeState).processes))
}

export function detectedGameProcesses(runtimeState: OptimizationRuntimeState, profiles: GameProfile[]) {
  return gameCandidateProcesses(runtimeState, profiles)
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

function readSystemProfile(runtimeState: OptimizationRuntimeState, sample: TelemetryPoint | null): NonNullable<MlInferenceInput['system_profile']> {
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
): MlInferenceInput {
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

function scoreSourceLabel(source: string | null) {
  if (!source) return null
  return source
    .split('-')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function makePlanItem(id: string, processId: number | null, runtimeState: OptimizationRuntimeState, score?: MlFunctionScore): MlPlanItem | null {
  const definition = OPTIMIZATION_FUNCTIONS.find((item) => item.id === id)
  if (!definition) return null
  if (definition.processRequired && !processId) return null
  const request = definition.buildRequest({ processId, runtimeState })
  if (!request) return null
  return {
    definition,
    expectedGainPct: typeof score?.expected_gain_pct === 'number' ? score.expected_gain_pct : null,
    impact: FUNCTION_IMPACT[id] ?? 'System',
    mlConfidence: typeof score?.confidence === 'number' ? score.confidence : null,
    reason: score?.reason || FUNCTION_REASONS[id] || definition.description,
    request,
    scoreSource: scoreSourceLabel(score?.source ?? null),
    tone: planTone(definition),
  }
}

export function buildCoverage(
  runtimeState: OptimizationRuntimeState,
  dashboard: DashboardPayload,
  sample: TelemetryPoint | null,
  selectedGame: ProcessSummary | null,
  selectedProfile: GameProfile | null,
  profileCount: number,
): MlCoverageItem[] {
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

export async function analyzeMlSystem({ dashboard, profiles, realtime, runtimeState, selectedGame }: AnalyzeMlSystemInput): Promise<ScanResult> {
  const sample = latestSample(dashboard, realtime)
  const selectedProfile = matchingGameProfile(selectedGame.name, profiles)
  const inferenceInput = buildInferenceInput(sample, runtimeState, selectedGame, selectedProfile)
  const [runtimeTruth, inference] = await Promise.all([getMlRuntimeTruth(), runOptimizationInference(inferenceInput)])
  const denied = loadMlDenyFunctionList()
  const processId = selectedGame.pid
  const alreadyActive = activeFunctionIds(runtimeState)
  const selectedIds = new Set<string>()
  const skipped: string[] = []

  const modelFunctionIds = inference?.recommended_functions ?? []
  const scoreByFunction = new Map((inference?.function_scores ?? []).map((score) => [score.function_id, score]))
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
    const item = makePlanItem(id, processId, runtimeState, scoreByFunction.get(id))
    if (item) plan.push(item)
  }
  plan.sort((left, right) => (right.mlConfidence ?? 0) - (left.mlConfidence ?? 0))

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
    `Function source: ${useFallbackPlan ? 'safe fallback rules' : `${modelFunctionIds.length} model-ranked function(s), ${scoreByFunction.size} scored action(s)`}.`,
    `Telemetry source: ${sample ? `${sample.capture_source}, ${sample.session_state}` : 'no live sample, system profile and process state only'}.`,
    `Balanced mode: ${plan.length} action(s), ${rebootCount} restart-required action(s), ${skipped.length} high-risk/blocked action(s) skipped.`,
  ]

  return {
    confidence,
    coverage: buildCoverage(runtimeState, dashboard, sample, selectedGame, selectedProfile, profiles.length),
    modelLabel: runtimeTruth?.active_label ?? (fallback ? 'Heuristic fallback' : 'ML runtime'),
    plan,
    rationale,
    safetyScore,
    skipped,
    summary,
  }
}
