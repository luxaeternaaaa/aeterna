import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, FlaskConical, Loader2, Sparkles } from 'lucide-react'

import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { getMlRuntimeTruth, requestWindowsRestart, runOptimizationInference } from '../lib/sidecar'
import {
  getOptimizationFunctionById,
  loadMlDenyFunctionList,
  ML_TWEAK_TO_FUNCTION_ID,
  OPTIMIZATION_FUNCTIONS,
} from '../lib/optimizationFunctions'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  DashboardPayload,
  GameProfile,
  OptimizationRuntimeState,
  RollbackResponse,
  TelemetryPoint,
} from '../types'

interface DashboardPageProps {
  dashboard: DashboardPayload
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<unknown> | void
  onOpenLogs: () => void
  onOpenOptimization: () => void
  onOpenTests: () => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
}

type FlowState = 'idle' | 'analyzing' | 'ready' | 'applying' | 'complete' | 'failed' | 'cancelled'

interface PlanAction {
  id: string
  label: string
  requiresReboot: boolean
  request:
    | { kind: 'tweak'; payload: ApplyTweakRequest }
    | { kind: 'preset'; payload: ApplyRegistryPresetRequest }
}

interface OneClickPlan {
  actions: PlanAction[]
  confidence: number
  risk: 'low' | 'medium' | 'high'
  rationale: string[]
  summary: string
  fallbackUsed: boolean
}

interface AppliedItem {
  id: string
  label: string
  snapshotId: string
  requiresReboot: boolean
}

interface ToastState {
  message: string
}

const FLOW_STEPS = ['Preparing ML input', 'Building safe plan', 'Applying changes', 'Verifying result', 'Finalizing'] as const

function stageProgress(state: FlowState, index: number): 'done' | 'active' | 'pending' {
  if (state === 'complete') return 'done'
  if (state === 'failed' || state === 'cancelled' || state === 'idle') return 'pending'
  if (state === 'ready') return index <= 1 ? 'done' : 'pending'
  if (state === 'applying') return index <= 2 ? 'done' : index === 3 ? 'active' : 'pending'
  return index === 0 ? 'active' : 'pending'
}

type InferenceInput = Parameters<typeof runOptimizationInference>[0]

function readSystemProfile(runtimeState: OptimizationRuntimeState, sample: TelemetryPoint | null): NonNullable<InferenceInput['system_profile']> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number })
  const powerPlan =
    runtimeState.power_plans.find((row) => row.active)?.name ??
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('ultimate performance'))?.name ??
    null

  return {
    logical_cores: nav?.hardwareConcurrency ?? null,
    memory_gb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    discrete_gpu_available: sample?.gpu_usage_pct != null ? sample.gpu_usage_pct > 0 : null,
    active_power_plan: powerPlan,
    session_attached: runtimeState.session.state === 'attached' || runtimeState.session.state === 'active',
  }
}

function buildInferenceInput(
  sample: TelemetryPoint | null,
  runtimeState: OptimizationRuntimeState,
): { input: InferenceInput; sourceLabel: string; sampleLabel: string; profileLabel: string } {
  const systemProfile = readSystemProfile(runtimeState, sample)
  const profileLabel = `System profile: cores ${systemProfile.logical_cores ?? 'n/a'}, memory ${systemProfile.memory_gb ?? 'n/a'} GB, power ${
    systemProfile.active_power_plan ?? 'unknown'
  }`

  if (sample) {
    return {
      input: {
        fps_avg: sample.fps_avg,
        frametime_avg_ms: sample.frametime_avg_ms,
        frametime_p95_ms: sample.frametime_p95_ms,
        frame_drop_ratio: sample.frame_drop_ratio,
        cpu_process_pct: sample.cpu_process_pct,
        cpu_total_pct: sample.cpu_total_pct,
        gpu_usage_pct: sample.gpu_usage_pct ?? 0,
        ram_working_set_mb: sample.ram_working_set_mb,
        background_process_count: sample.background_process_count,
        anomaly_score: sample.anomaly_score,
        system_profile: systemProfile,
      },
      sourceLabel: 'Live telemetry sample',
      sampleLabel: `FPS ${sample.fps_avg.toFixed(0)}, p95 ${sample.frametime_p95_ms.toFixed(1)} ms`,
      profileLabel,
    }
  }
  return {
    input: {
      fps_avg: 120,
      frametime_avg_ms: 8.3,
      frametime_p95_ms: 12.6,
      frame_drop_ratio: 0.03,
      cpu_process_pct: 28,
      cpu_total_pct: 58,
      gpu_usage_pct: 74,
      ram_working_set_mb: 5400,
      background_process_count: 95,
      anomaly_score: 0.21,
      system_profile: systemProfile,
    },
    sourceLabel: 'System baseline (no game session required)',
    sampleLabel: 'Default baseline for system-level ML optimization',
    profileLabel,
  }
}

export function DashboardPage({
  dashboard,
  onApplyRegistryPreset,
  onApplyTweak,
  onAttachSession: _onAttachSession,
  onOpenLogs: _onOpenLogs,
  onOpenOptimization,
  onOpenTests,
  onRollbackSnapshot,
  profiles: _profiles,
  realtime,
  runtimeState,
}: DashboardPageProps) {
  const currentSample = realtime ?? dashboard.history.at(-1) ?? null

  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [flowError, setFlowError] = useState<string | null>(null)
  const [plan, setPlan] = useState<OneClickPlan | null>(null)
  const [applied, setApplied] = useState<AppliedItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [rebootPending, setRebootPending] = useState(false)
  const [precheck, setPrecheck] = useState<string[]>([])
  const [restartBusy, setRestartBusy] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [introAccepted, setIntroAccepted] = useState(false)
  const cancelRequestedRef = useRef(false)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const isBusy = flowState === 'analyzing' || flowState === 'applying'

  const applyPlannedActions = async (nextPlan: OneClickPlan) => {
    setFlowState('applying')
    setFlowError(null)
    const appliedItems: AppliedItem[] = []
    let alreadyActiveCount = 0

    try {
      for (const action of nextPlan.actions) {
        if (action.request.kind === 'tweak') {
          const result = await onApplyTweak(action.request.payload)
          appliedItems.push({
            id: action.id,
            label: action.label,
            snapshotId: result.snapshot.id,
            requiresReboot: action.requiresReboot,
          })
          continue
        }

        const result = await onApplyRegistryPreset(action.request.payload)
        if (result.status !== 'applied' || !result.snapshot) {
          const reason = (result.blocking_reason ?? '').toLowerCase()
          if (reason.includes('already active')) {
            alreadyActiveCount += 1
            continue
          }
          throw new Error(result.blocking_reason ?? `Action ${action.label} was blocked by policy.`)
        }
        appliedItems.push({
          id: action.id,
          label: action.label,
          snapshotId: result.snapshot.id,
          requiresReboot: action.requiresReboot,
        })
      }

      setApplied(appliedItems)
      const hasRebootActions = appliedItems.some((item) => item.requiresReboot)
      setRebootPending(hasRebootActions)
      setFlowState('complete')
      if (appliedItems.length === 0 && alreadyActiveCount > 0) {
        setToast({ message: 'No changes were needed. Recommended settings are already active.' })
      } else {
        setToast({
          message: hasRebootActions
            ? 'Optimization applied. Some changes are pending reboot.'
            : 'Optimization applied successfully.',
        })
      }
    } catch (error) {
      setFlowState('failed')
      setFlowError(error instanceof Error ? error.message : 'Apply phase failed.')
    }
  }

  const runOneClickAnalysis = async () => {
    if (isBusy) return
    setFlowState('analyzing')
    setFlowError(null)
    setPlan(null)
    setApplied([])
    setDetailsOpen(false)
    setRebootPending(false)
    cancelRequestedRef.current = false
    const checks: string[] = []

    try {
      const seed = buildInferenceInput(currentSample, runtimeState)
      const deniedList = loadMlDenyFunctionList()
      checks.push(`Input source: ${seed.sourceLabel}`)
      checks.push(`Input snapshot: ${seed.sampleLabel}`)
      checks.push(seed.profileLabel)
      if (deniedList.size > 0) {
        checks.push(`Deny Function List active: ${deniedList.size} function(s) are blocked for auto-ML.`)
      }

      if (cancelRequestedRef.current) {
        setFlowState('cancelled')
        return
      }

      const [runtimeTruth, inference] = await Promise.all([getMlRuntimeTruth(), runOptimizationInference(seed.input)])
      const fallbackUsed = !inference || runtimeTruth?.runtime_mode === 'unavailable'

      const rationale = fallbackUsed
        ? ['Model path unavailable; using stable heuristic profile.', 'System-level safe actions were selected without game-session dependency.']
        : [...(inference?.factors ?? []).slice(0, 2), ...((inference?.shap_preview ?? []).slice(0, 1))]

      const recommendedFunctionIds = new Set<string>()
      const sessionProcessId = runtimeState.session.process_id ?? runtimeState.detected_game?.pid ?? null
      for (const tweak of inference?.recommended_tweaks ?? ['power_plan']) {
        const functionId = ML_TWEAK_TO_FUNCTION_ID[tweak]
        if (functionId) recommendedFunctionIds.add(functionId)
      }
      recommendedFunctionIds.add('interrupt-affinity-lock')
      recommendedFunctionIds.add('usb-selective-suspend-off')
      if ((inference?.risk_label ?? 'medium') === 'high') recommendedFunctionIds.add('low-timer-resolution')
      if ((seed.input.system_profile?.logical_cores ?? 0) >= 12) recommendedFunctionIds.add('pcie-lspm-off')
      if ((currentSample?.background_cpu_pct ?? 0) >= 12) recommendedFunctionIds.add('turn-off-recordings')

      const availableDefinitions = OPTIMIZATION_FUNCTIONS.filter((definition) => {
        if (deniedList.has(definition.id)) return false
        if (definition.processRequired && !sessionProcessId) return false
        return definition.buildRequest({ processId: sessionProcessId, runtimeState }) !== null
      })

      const minimumTarget = availableDefinitions.length === 0 ? 0 : Math.max(1, Math.ceil(availableDefinitions.length * 0.9))
      if (minimumTarget > 0 && recommendedFunctionIds.size < minimumTarget) {
        const fillOrder = [
          ...availableDefinitions.filter((definition) => definition.mlDefault),
          ...availableDefinitions.filter((definition) => !definition.mlDefault),
        ]
        for (const definition of fillOrder) {
          recommendedFunctionIds.add(definition.id)
          if (recommendedFunctionIds.size >= minimumTarget) break
        }
      }

      const actions: PlanAction[] = []
      for (const functionId of recommendedFunctionIds) {
        if (deniedList.has(functionId)) continue
        const definition = getOptimizationFunctionById(functionId)
        if (!definition) continue
        if (definition.processRequired && !sessionProcessId) {
          checks.push(`Skipped "${definition.title}" (requires attached game session, available in Tests/Optimization).`)
          continue
        }
        const request = definition.buildRequest({ processId: sessionProcessId, runtimeState })
        if (!request) {
          checks.push(`Skipped "${definition.title}" (not available on this system state).`)
          continue
        }
        actions.push({
          id: definition.id,
          label: definition.title,
          requiresReboot: Boolean(definition.requiresReboot),
          request,
        })
      }

      const unique = Array.from(new Map(actions.map((item) => [item.id, item])).values())
      if (unique.length === 0) {
        setFlowState('failed')
        setFlowError('Planner produced no safe actions. Open Custom Optimization for manual tuning.')
        return
      }

      const confidence = fallbackUsed ? 0.72 : inference?.confidence ?? 0.8
      const risk = (fallbackUsed ? 'medium' : inference?.risk_label ?? 'medium') as 'low' | 'medium' | 'high'
      const summary = fallbackUsed
        ? 'Model unavailable. Using a stable fallback plan with rollback snapshots.'
        : inference?.summary ?? 'Model generated a bounded optimization plan.'
      const nextPlan: OneClickPlan = { actions: unique, confidence, risk, rationale, summary, fallbackUsed }

      setPrecheck(checks)
      setPlan(nextPlan)
      setFlowState('ready')
      setToast({ message: 'Choice confirmed. Optimization starts automatically.' })

      await applyPlannedActions(nextPlan)
    } catch (error) {
      setFlowState('failed')
      setFlowError(error instanceof Error ? error.message : 'One-click analysis failed.')
    }
  }

  const cancelFlow = () => {
    if (flowState === 'applying') return
    cancelRequestedRef.current = true
    setFlowState('cancelled')
    setToast({ message: 'Automatic ML flow cancelled.' })
  }

  const rollbackApplied = async () => {
    if (applied.length === 0) return
    const processId = runtimeState.session.process_id ?? runtimeState.detected_game?.pid ?? undefined
    const reversed = [...applied].reverse()
    for (const item of reversed) {
      await onRollbackSnapshot(item.snapshotId, processId)
    }
    setApplied([])
    setRebootPending(false)
    setToast({ message: 'Applied ML changes were rolled back.' })
    setFlowState('idle')
    setPlan(null)
  }

  const keepChanges = () => {
    setToast({ message: 'Changes kept. Rollback remains available in history/logs.' })
    setFlowState('idle')
    setPlan(null)
    setApplied([])
    setRebootPending(false)
    setDetailsOpen(false)
  }

  const restartNow = async () => {
    if (restartBusy) return
    const confirmed = window.confirm('Windows will restart immediately. Continue?')
    if (!confirmed) return
    setRestartBusy(true)
    try {
      await requestWindowsRestart()
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Restart request failed.' })
    } finally {
      setRestartBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="Choose Your Mode" variant="secondary">
        <div className="grid gap-4 lg:grid-cols-3">
          <button
            className="surface-card group text-left transition hover:border-border-strong/70"
            disabled={isBusy}
            onClick={() => {
              setIntroOpen(true)
              setIntroAccepted(false)
            }}
            type="button"
          >
            <div className="flex items-start justify-between">
              <Bot className="text-text" size={22} />
              <ChevronRight className="text-muted transition group-hover:translate-x-0.5" size={18} />
            </div>
            <p className="mt-4 text-base font-semibold text-text">Start one-click optimization</p>
            <p className="mt-2 text-sm text-muted">ML-assisted safe plan with bounded automation and rollback.</p>
          </button>

          <button className="surface-card group text-left transition hover:border-border-strong/70" onClick={onOpenOptimization} type="button">
            <div className="flex items-start justify-between">
              <Sparkles className="text-text" size={22} />
              <ChevronRight className="text-muted transition group-hover:translate-x-0.5" size={18} />
            </div>
            <p className="mt-4 text-base font-semibold text-text">Open custom optimization</p>
            <p className="mt-2 text-sm text-muted">Manual function-by-function control for advanced tuning.</p>
          </button>

          <button className="surface-card group text-left transition hover:border-border-strong/70" onClick={onOpenTests} type="button">
            <div className="flex items-start justify-between">
              <FlaskConical className="text-text" size={22} />
              <ChevronRight className="text-muted transition group-hover:translate-x-0.5" size={18} />
            </div>
            <p className="mt-4 text-base font-semibold text-text">Run controlled test</p>
            <p className="mt-2 text-sm text-muted">Baseline/compare path for empirical validation.</p>
          </button>
        </div>
      </Panel>

      {introOpen ? (
        <Panel title="Before You Start ML Automation" variant="secondary">
          <div className="space-y-4">
            <div className="surface-card text-sm text-muted">
              <p className="font-semibold text-text">How this works</p>
              <ul className="mt-2 space-y-1">
                <li>- The function builds an ML-assisted safe action plan and applies it automatically after confirmation.</li>
                <li>- Every applied action creates rollback snapshots so changes can be reverted.</li>
                <li>- A game session is not required for optimization on Home. Session attach is used only in controlled tests.</li>
              </ul>
            </div>
            <label className="surface-card flex items-start gap-3 text-sm text-muted">
              <input
                checked={introAccepted}
                className="mt-0.5"
                onChange={(event) => setIntroAccepted(event.target.checked)}
                type="checkbox"
              />
              <span>I reviewed the function description and confirm automatic optimization start.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="button-primary"
                disabled={!introAccepted || isBusy}
                onClick={() => {
                  setIntroOpen(false)
                  void runOneClickAnalysis()
                }}
                type="button"
              >
                Confirm choice and start
              </button>
              <button
                className="button-secondary"
                onClick={() => {
                  setIntroOpen(false)
                  setIntroAccepted(false)
                }}
                type="button"
              >
                Back
              </button>
            </div>
          </div>
        </Panel>
      ) : null}

      {flowState !== 'idle' ? (
        <Panel title="Automatic ML Optimization" variant="secondary">
          <div className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="surface-card">
                <p className="text-sm font-semibold text-text">Pre-check</p>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {precheck.length === 0 ? <li>Waiting for validation...</li> : precheck.map((line) => <li key={line}>- {line}</li>)}
                </ul>
              </div>
              <div className="surface-card">
                <p className="text-sm font-semibold text-text">Flow status</p>
                <p className="mt-2 text-sm text-muted">State: {flowState}</p>
                {flowError ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-warning">
                    <AlertTriangle size={14} />
                    {flowError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="surface-card">
              <div className="grid gap-2 md:grid-cols-5">
                {FLOW_STEPS.map((step, index) => {
                  const state = stageProgress(flowState, index)
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        state === 'done'
                          ? 'border-success/40 bg-success/10 text-text'
                          : state === 'active'
                            ? 'border-border-strong/65 bg-surface-muted text-text'
                            : 'border-border/60 bg-surface text-muted'
                      }`}
                    >
                      {state === 'active' ? <Loader2 className="mb-1 animate-spin" size={12} /> : null}
                      {step}
                    </div>
                  )
                })}
              </div>
            </div>

            {flowState === 'ready' && plan ? (
              <div className="surface-card space-y-3">
                <p className="text-sm font-semibold text-text">Plan ready</p>
                <p className="text-sm text-muted">{plan.summary}</p>
                <p className="text-sm text-muted">Auto-apply is in progress. No additional confirmation is required.</p>
              </div>
            ) : null}

            {flowState === 'analyzing' ? (
              <div className="flex items-center gap-2">
                <button className="button-secondary" onClick={cancelFlow} type="button">
                  Cancel
                </button>
              </div>
            ) : null}

            {flowState === 'complete' && plan ? (
              <div className="surface-card space-y-3">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 size={16} />
                  <p className="text-sm font-semibold text-text">Optimization complete</p>
                </div>
                <p className="text-sm text-muted">{plan.summary}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-muted">
                    <span className="font-semibold text-text">Confidence:</span> {(plan.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-muted">
                    <span className="font-semibold text-text">Risk:</span> {plan.risk}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">What changed</p>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {applied.map((item) => (
                      <li key={item.snapshotId}>- {item.label}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">Why this was selected</p>
                  <ul className="mt-2 space-y-1 text-sm text-muted">
                    {plan.rationale.slice(0, 3).map((line) => (
                      <li key={line}>- {line}</li>
                    ))}
                  </ul>
                  {plan.fallbackUsed ? (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-warning">
                      <AlertTriangle size={14} />
                      Model error. System is using stable heuristic fallback.
                    </p>
                  ) : null}
                </div>
                {rebootPending ? (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                    <p>Pending reboot changes detected.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="button-secondary" disabled={restartBusy} onClick={() => void restartNow()} type="button">
                        {restartBusy ? 'Requesting restart...' : 'Restart now'}
                      </button>
                      <button className="button-secondary" onClick={() => setRebootPending(false)} type="button">
                        Later
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button className="button-secondary" onClick={keepChanges} type="button">
                    Keep changes
                  </button>
                  <button className="button-secondary" onClick={() => void rollbackApplied()} type="button">
                    Rollback
                  </button>
                  <button className="button-secondary" onClick={() => setDetailsOpen((value) => !value)} type="button">
                    {detailsOpen ? 'Hide details' : 'Open details'}
                  </button>
                </div>
                {detailsOpen ? (
                  <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-muted">
                    <p className="font-semibold text-text">Traceability</p>
                    <ul className="mt-2 space-y-1">
                      {applied.map((item) => (
                        <li key={item.snapshotId}>
                          - {item.label} (snapshot: {item.snapshotId})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {flowState === 'failed' ? (
              <EmptyState
                actionLabel="Retry automatic ML optimization"
                description={flowError ?? 'Automatic flow failed before completion.'}
                onAction={() => {
                  void runOneClickAnalysis()
                }}
                title="Optimization was not completed"
              />
            ) : null}
          </div>
        </Panel>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-border/70 bg-surface px-4 py-3 shadow-float">
          <p className="text-sm text-text">{toast.message}</p>
        </div>
      ) : null}
    </div>
  )
}
