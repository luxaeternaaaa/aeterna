import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, FlaskConical, Loader2, ShieldCheck, Sparkles } from 'lucide-react'

import { EmptyState } from '../components/EmptyState'
import { LineChart } from '../components/LineChart'
import { MetricCard } from '../components/MetricCard'
import { Panel } from '../components/Panel'
import { getMlRuntimeTruth, requestWindowsRestart, runOptimizationInference } from '../lib/sidecar'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'
import type {
  ActivityEntry,
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

const FLOW_STEPS = [
  'Detecting game',
  'Collecting telemetry',
  'Building safe plan',
  'Applying changes',
  'Verifying result',
] as const

function resolveProfile(profiles: GameProfile[], runtimeState: OptimizationRuntimeState, currentSample: TelemetryPoint | null) {
  if (runtimeState.session.recommended_profile_id) {
    const matched = profiles.find((profile) => profile.id === runtimeState.session.recommended_profile_id)
    if (matched) return matched
  }
  const name = (currentSample?.game_name ?? '').toLowerCase()
  return profiles.find((profile) => profile.detection_keywords.some((keyword) => name.includes(keyword)))
}

function findTargetProcess(runtimeState: OptimizationRuntimeState): { pid: number; name: string } | null {
  if (runtimeState.session.process_id && runtimeState.session.process_name) {
    return { pid: runtimeState.session.process_id, name: runtimeState.session.process_name }
  }
  if (runtimeState.selected_process) {
    return { pid: runtimeState.selected_process.pid, name: runtimeState.selected_process.name }
  }
  if (runtimeState.detected_game) {
    return { pid: runtimeState.detected_game.pid, name: runtimeState.detected_game.exe_name }
  }
  return null
}

function highestPerformancePlanGuid(runtimeState: OptimizationRuntimeState): string | null {
  const plan =
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('ultimate performance')) ??
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('high performance')) ??
    null
  return plan?.guid ?? null
}

function stageProgress(state: FlowState, index: number): 'done' | 'active' | 'pending' {
  if (state === 'complete') return 'done'
  if (state === 'failed' || state === 'cancelled' || state === 'idle') return 'pending'
  if (state === 'ready') return index <= 2 ? 'done' : 'pending'
  if (state === 'applying') return index <= 3 ? 'done' : 'active'
  return index === 0 ? 'active' : 'pending'
}

export function DashboardPage({
  dashboard,
  onApplyRegistryPreset,
  onApplyTweak,
  onAttachSession,
  onOpenLogs,
  onOpenOptimization,
  onOpenTests,
  onRollbackSnapshot,
  profiles,
  realtime,
  runtimeState,
}: DashboardPageProps) {
  const values = dashboard.history.map((point) => point.frametime_p95_ms || point.frametime_avg_ms || point.ping)
  const currentSample = realtime ?? dashboard.history.at(-1) ?? null
  const stats = dashboard.stats.slice(0, 4)
  const profile = resolveProfile(profiles, runtimeState, currentSample)

  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [flowError, setFlowError] = useState<string | null>(null)
  const [plan, setPlan] = useState<OneClickPlan | null>(null)
  const [applied, setApplied] = useState<AppliedItem[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [rebootPending, setRebootPending] = useState(false)
  const [precheck, setPrecheck] = useState<string[]>([])
  const [restartBusy, setRestartBusy] = useState(false)
  const cancelRequestedRef = useRef(false)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const isBusy = flowState === 'analyzing' || flowState === 'applying'

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
      const target = findTargetProcess(runtimeState)
      if (!target) {
        setFlowState('failed')
        setFlowError('Game not detected. Launch a game, then run one-click optimization.')
        return
      }
      if (!runtimeState.session.process_id) {
        await Promise.resolve(onAttachSession({ process_id: target.pid, process_name: target.name }))
      }
      checks.push(`Game target: ${target.name}`)
      checks.push(`Capture mode: ${runtimeState.capture_status.source}`)

      if (cancelRequestedRef.current) {
        setFlowState('cancelled')
        return
      }

      const sample = currentSample
      if (!sample) {
        setFlowState('failed')
        setFlowError('Telemetry missing. Play for a few seconds, then retry.')
        return
      }
      checks.push(`Telemetry sample: FPS ${sample.fps_avg.toFixed(0)}, p95 ${sample.frametime_p95_ms.toFixed(1)} ms`)

      if (cancelRequestedRef.current) {
        setFlowState('cancelled')
        return
      }

      const [runtimeTruth, inference] = await Promise.all([getMlRuntimeTruth(), runOptimizationInference(sample)])
      const fallbackUsed = !inference || runtimeTruth?.runtime_mode === 'unavailable'

      const rationale = fallbackUsed
        ? ['Model path unavailable; using stable heuristic profile.', 'Priority and affinity are selected as low-risk defaults.']
        : [
            ...(inference?.factors ?? []).slice(0, 2),
            ...((inference?.shap_preview ?? []).slice(0, 1)),
          ]

      const processId = target.pid
      const actions: PlanAction[] = []
      const recommended = inference?.recommended_tweaks ?? ['process_priority', 'cpu_affinity']
      if (recommended.includes('process_priority')) {
        actions.push({
          id: 'process_priority',
          label: 'Set game priority to High',
          requiresReboot: false,
          request: { kind: 'tweak', payload: { kind: 'process_priority', process_id: processId, priority: 'high' } },
        })
      }
      if (recommended.includes('cpu_affinity')) {
        actions.push({
          id: 'cpu_affinity',
          label: 'Apply balanced CPU affinity',
          requiresReboot: false,
          request: { kind: 'tweak', payload: { kind: 'cpu_affinity', process_id: processId, affinity_preset: 'balanced_threads' } },
        })
      }
      const planGuid = highestPerformancePlanGuid(runtimeState)
      if (planGuid && recommended.includes('power_plan')) {
        actions.push({
          id: 'power_plan',
          label: 'Switch to High/Ultimate power plan',
          requiresReboot: false,
          request: { kind: 'tweak', payload: { kind: 'power_plan', power_plan_guid: planGuid, process_id: processId } },
        })
      }
      actions.push({
        id: 'game_mode_on',
        label: 'Force Game Mode on',
        requiresReboot: false,
        request: { kind: 'preset', payload: { preset_id: 'game_mode_on', process_id: processId } },
      })
      actions.push({
        id: 'game_capture_overhead_off',
        label: 'Disable Game DVR capture overhead',
        requiresReboot: false,
        request: { kind: 'preset', payload: { preset_id: 'game_capture_overhead_off', process_id: processId } },
      })

      const unique = Array.from(new Map(actions.map((item) => [item.id, item])).values()).slice(0, 5)
      if (unique.length === 0) {
        setFlowState('failed')
        setFlowError('Planner produced no safe actions. Run Custom Optimization manually.')
        return
      }

      const confidence = fallbackUsed ? 0.72 : inference?.confidence ?? 0.8
      const risk = (fallbackUsed ? 'medium' : inference?.risk_label ?? 'medium') as 'low' | 'medium' | 'high'
      const summary = fallbackUsed
        ? 'Model error. System is using stable heuristic fallback.'
        : inference?.summary ?? 'Model generated a bounded optimization plan.'
      setPrecheck(checks)
      setPlan({ actions: unique, confidence, risk, rationale, summary, fallbackUsed })
      setFlowState('ready')
      setToast({ message: 'Analysis complete. Review and apply the plan.' })
    } catch (error) {
      setFlowState('failed')
      setFlowError(error instanceof Error ? error.message : 'One-click analysis failed.')
    }
  }

  const cancelFlow = () => {
    if (flowState === 'applying') return
    cancelRequestedRef.current = true
    setFlowState('cancelled')
    setToast({ message: 'One-click flow cancelled before apply.' })
  }

  const applyPlan = async () => {
    if (!plan || flowState !== 'ready') return
    setFlowState('applying')
    setFlowError(null)
    const appliedItems: AppliedItem[] = []
    try {
      for (const action of plan.actions) {
        if (action.request.kind === 'tweak') {
          const result = await onApplyTweak(action.request.payload)
          appliedItems.push({
            id: action.id,
            label: action.label,
            snapshotId: result.snapshot.id,
            requiresReboot: action.requiresReboot,
          })
        } else {
          const result = await onApplyRegistryPreset(action.request.payload)
          if (result.status === 'applied' && result.snapshot) {
            appliedItems.push({
              id: action.id,
              label: action.label,
              snapshotId: result.snapshot.id,
              requiresReboot: action.requiresReboot,
            })
          }
        }
      }
      setApplied(appliedItems)
      const hasRebootActions = appliedItems.some((item) => item.requiresReboot)
      setRebootPending(hasRebootActions)
      setFlowState('complete')
      setToast({
        message: hasRebootActions
          ? 'Optimization applied. Some changes are pending reboot.'
          : 'Optimization applied successfully.',
      })
    } catch (error) {
      setFlowState('failed')
      setFlowError(error instanceof Error ? error.message : 'Apply phase failed.')
    }
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
    setToast({ message: 'Applied one-click changes were rolled back.' })
    setFlowState('idle')
    setPlan(null)
  }

  const keepChanges = () => {
    setToast({ message: 'Changes kept. You can revert later from logs or new session controls.' })
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
              void runOneClickAnalysis()
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

      {flowState !== 'idle' ? (
        <Panel title="One-Click ML Optimization" variant="secondary">
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
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-muted">
                    <span className="font-semibold text-text">Confidence:</span> {(plan.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-sm text-muted">
                    <span className="font-semibold text-text">Risk:</span> {plan.risk}
                  </div>
                </div>
                <ul className="space-y-1 text-sm text-muted">
                  {plan.actions.map((item) => (
                    <li key={item.id}>- {item.label}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button className="button-primary" onClick={() => void applyPlan()} type="button">
                    Apply one-click plan
                  </button>
                  <button className="button-secondary" onClick={cancelFlow} type="button">
                    Cancel
                  </button>
                </div>
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
                      <button
                        className="button-secondary"
                        onClick={() => {
                          setRebootPending(false)
                        }}
                        type="button"
                      >
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
              <div className="flex flex-wrap gap-2">
                <button className="button-primary" onClick={() => void runOneClickAnalysis()} type="button">
                  Retry one-click optimization
                </button>
                <button className="button-secondary" onClick={onOpenOptimization} type="button">
                  Open custom optimization
                </button>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Session Snapshot" variant="secondary">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-text">Frametime trend</p>
                {currentSample ? <span className="status-chip">p95 {currentSample.frametime_p95_ms.toFixed(1)} ms</span> : null}
              </div>
              <div className="mt-5">
                <LineChart values={values} />
              </div>
              {!currentSample ? <p className="mt-4 text-sm leading-6 text-muted">{stateCopy.chartEmpty}</p> : null}
            </div>

            <div className="grid gap-3">
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Game</p>
                <p className="mt-2 text-base font-semibold text-text">{currentSample?.game_name ?? 'No attached session yet'}</p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Background CPU</p>
                <p className="mt-2 text-base font-semibold text-text">
                  {currentSample ? `${currentSample.background_cpu_pct.toFixed(0)}%` : 'Waiting for live data'}
                </p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Matched profile</p>
                <p className="mt-2 text-sm text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
              </div>
            </div>
          </div>

          {stats.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              {stats.map((item) => (
                <MetricCard key={item.label} {...item} />
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Quick Actions" variant="secondary">
          <div className="space-y-3">
            <button className="button-secondary w-full justify-start" onClick={onOpenOptimization} type="button">
              Open custom optimization
            </button>
            <button className="button-secondary w-full justify-start" onClick={onOpenTests} type="button">
              Run controlled test
            </button>
            <button className="button-secondary w-full justify-start" onClick={onOpenLogs} type="button">
              Open full logs
            </button>
            {dashboard.recommendations.length ? (
              dashboard.recommendations.slice(0, 2).map((item) => (
                <div key={item.title} className="surface-card">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-tight text-text">{item.title}</p>
                    <span className="status-chip">{item.impact}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
                </div>
              ))
            ) : (
              <EmptyState
                actionLabel="Open custom optimization"
                description="Recommendations become sharper after more telemetry."
                onAction={onOpenOptimization}
                title="No recommendation yet"
              />
            )}
            <div className="surface-card">
              <div className="flex items-center gap-2 text-sm text-text">
                <ShieldCheck size={14} />
                Safety note
              </div>
              <p className="mt-2 text-sm text-muted">
                One-click always creates rollback snapshots. High-risk or reboot-level changes remain user-confirmed.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Logs" variant="secondary">
        <div className="space-y-3">
          {runtimeState.activity.length === 0 ? (
            <div className="surface-card text-sm text-muted">No logs yet.</div>
          ) : (
            runtimeState.activity.slice(0, 4).map((item: ActivityEntry) => (
              <div key={item.id} className="surface-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text">{item.action}</p>
                  <span className="status-chip">{item.risk}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{item.detail}</p>
                <p className="mt-2 text-xs text-muted">{formatTimestamp(item.timestamp)}</p>
              </div>
            ))
          )}
          <div>
            <button className="button-secondary" onClick={onOpenLogs} type="button">
              Open all logs
            </button>
          </div>
        </div>
      </Panel>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-border/70 bg-surface px-4 py-3 shadow-float">
          <p className="text-sm text-text">{toast.message}</p>
          <button className="mt-2 text-xs font-semibold text-muted underline underline-offset-2 hover:text-text" onClick={onOpenLogs} type="button">
            View log
          </button>
        </div>
      ) : null}
    </div>
  )
}
