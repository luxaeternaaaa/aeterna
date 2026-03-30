import type {
  ApplyRegistryPresetRequest,
  ApplyTweakRequest,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  FeatureFlags,
  GameProfile,
  MlInferencePayload,
  OptimizationRuntimeState,
  OptimizationSummary,
  SystemSettings,
} from '../types'
import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { getAuthorityStage, getEvidenceStage, getProofStage, getSessionStage, getWorkflowStep, type WorkflowAction } from '../lib/productState'
import { stateCopy } from '../lib/stateCopy'

interface OptimizationPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  dashboard: DashboardPayload
  featureFlags: FeatureFlags
  inference: MlInferencePayload | null
  latestBenchmark: BenchmarkReport | null
  onAttachSession: (request: AttachSessionRequest) => void
  onCaptureBaseline: () => void
  onEndSession: () => void
  onOpenSettings: () => void
  onPreviewRegistryPreset: (request: ApplyRegistryPresetRequest) => void
  onPreviewTweak: (request: ApplyTweakRequest) => void
  onRefresh: (processId?: number) => void
  onRollback: (snapshotId: string) => void
  onRunBenchmark: (profileId?: string) => void
  onSelectProcess: (processId: number) => void
  optimization: OptimizationSummary
  profiles: GameProfile[]
  runtimeState: OptimizationRuntimeState
  selectedProcessId: number | null
  settings: SystemSettings
}

function resolveProfile(profiles: GameProfile[], runtimeState: OptimizationRuntimeState) {
  const profileId = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  return profiles.find((profile) => profile.id === profileId) ?? null
}

function benchmarkVerdict(report: BenchmarkReport | null) {
  if (!report) return 'No proof yet'
  if (report.verdict === 'better') return 'Better'
  if (report.verdict === 'worse') return 'Worse'
  if (report.verdict === 'inconclusive') return 'Inconclusive'
  return 'Mixed'
}

function buildPrimaryAction(props: {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  featureFlags: FeatureFlags
  latestBenchmark: BenchmarkReport | null
  onAttachSession: (request: AttachSessionRequest) => void
  onCaptureBaseline: () => void
  onOpenSettings: () => void
  onPreviewTweak: (request: ApplyTweakRequest) => void
  onRefresh: (processId?: number) => void
  onRollback: (snapshotId: string) => void
  onRunBenchmark: (profileId?: string) => void
  optimization: OptimizationSummary
  profileId?: string
  runtimeState: OptimizationRuntimeState
  selectedProcessId: number | null
}): { action: WorkflowAction; disabled: boolean; label: string; onClick: () => void } {
  const {
    benchmarkBaseline,
    benchmarkBusy,
    featureFlags,
    latestBenchmark,
    onAttachSession,
    onCaptureBaseline,
    onOpenSettings,
    onPreviewTweak,
    onRefresh,
    onRollback,
    onRunBenchmark,
    optimization,
    profileId,
    runtimeState,
    selectedProcessId,
  } = props
  const trackedProcessId = runtimeState.session.process_id ?? selectedProcessId
  const nextStep = getWorkflowStep({
    benchmarkBaseline,
    detectedGame: runtimeState.detected_game,
    featureFlags,
    latestBenchmark,
    optimization,
    session: runtimeState.session,
  })

  if (nextStep.action === 'attach-session' && runtimeState.detected_game) {
    return {
      action: nextStep.action,
      label: 'Attach game',
      disabled: false,
      onClick: () => onAttachSession({ process_id: runtimeState.detected_game!.pid, process_name: runtimeState.detected_game!.exe_name }),
    }
  }
  if (nextStep.action === 'capture-baseline') {
    return { action: nextStep.action, label: benchmarkBusy ? 'Capturing…' : 'Capture baseline', disabled: benchmarkBusy, onClick: onCaptureBaseline }
  }
  if (nextStep.action === 'open-settings') {
    return { action: nextStep.action, label: 'Open Settings', disabled: false, onClick: onOpenSettings }
  }
  if (nextStep.action === 'apply-safe-test') {
    return {
      action: nextStep.action,
      label: 'Try safe priority test',
      disabled: !trackedProcessId || runtimeState.session.state === 'idle' || runtimeState.session.state === 'ended',
      onClick: () => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' }),
    }
  }
  if (nextStep.action === 'review-proof') {
    if (runtimeState.session.pending_registry_snapshot_id) {
      return {
        action: nextStep.action,
        label: 'Restore previous preset',
        disabled: false,
        onClick: () => onRollback(runtimeState.session.pending_registry_snapshot_id!),
      }
    }
    return {
      action: nextStep.action,
      label: benchmarkBusy ? 'Comparing…' : 'Compare result',
      disabled: benchmarkBusy || !benchmarkBaseline,
      onClick: () => onRunBenchmark(profileId),
    }
  }
  return { action: nextStep.action, label: 'Refresh detection', disabled: false, onClick: () => onRefresh(trackedProcessId ?? undefined) }
}

function getActionBrief(action: WorkflowAction, processName: string, proofLabel: string) {
  switch (action) {
    case 'refresh-detection':
      return {
        whatChanges: 'Nothing changes on your system yet.',
        why: 'A real session must be visible before Aeterna can prove anything.',
        safety: 'Read-only. Detection does not touch the game or Windows settings.',
        undo: 'No undo needed yet.',
      }
    case 'attach-session':
      return {
        whatChanges: `Aeterna starts tracking ${processName} as the active session.`,
        why: 'That opens live proof, rollback scope, and safer recommendations.',
        safety: 'Still read-only. No system tweak runs just because you attach.',
        undo: 'You can end the session at any time.',
      }
    case 'capture-baseline':
      return {
        whatChanges: 'Aeterna records the clean before-state for this session.',
        why: 'That gives every later tweak a fair comparison point.',
        safety: 'Benchmark capture reads the session. It does not change Windows settings.',
        undo: 'You can recapture the baseline whenever you need a cleaner starting point.',
      }
    case 'open-settings':
      return {
        whatChanges: 'You unlock safe, rollback-ready changes in Settings.',
        why: 'Aeterna keeps changes blocked until you allow them on purpose.',
        safety: 'Nothing is applied just by opening or changing policy.',
        undo: 'Switch the permission back off whenever you want.',
      }
    case 'apply-safe-test':
      return {
        whatChanges: `Aeterna raises ${processName} to Above normal priority for this session.`,
        why: 'It is the quickest reversible test when background contention is the likely pressure point.',
        safety: 'Session-scoped only. No game memory edits, no anti-cheat-hostile behavior.',
        undo: 'A rollback snapshot is created before the change and can be restored later.',
      }
    case 'review-proof':
      return {
        whatChanges: 'Aeterna compares the latest run against your saved baseline.',
        why: `This turns the current guess into a result you can keep or undo. ${proofLabel === 'Comparison ready' ? 'A result is already waiting.' : ''}`.trim(),
        safety: 'Comparison reads evidence. It does not stack another tweak.',
        undo: 'If the result is not worth keeping, undo the last change.',
      }
  }
}

function stepState(index: number, action: WorkflowAction) {
  const order: WorkflowAction[] = ['refresh-detection', 'attach-session', 'capture-baseline', 'apply-safe-test', 'review-proof']
  const current = order.indexOf(action)
  if (index < current) return 'done'
  if (index === current) return 'active'
  return 'pending'
}

export function OptimizationPage(props: OptimizationPageProps) {
  const {
    benchmarkBaseline,
    benchmarkBusy,
    dashboard,
    featureFlags,
    inference,
    latestBenchmark,
    onAttachSession,
    onCaptureBaseline,
    onEndSession,
    onOpenSettings,
    onPreviewRegistryPreset,
    onPreviewTweak,
    onRefresh,
    onRollback,
    onRunBenchmark,
    onSelectProcess,
    optimization,
    profiles,
    runtimeState,
    selectedProcessId,
    settings,
  } = props

  const sessionAttached = runtimeState.session.state === 'attached' || runtimeState.session.state === 'active'
  const trackedProcessId = runtimeState.session.process_id ?? selectedProcessId
  const trackedProcessName = runtimeState.session.process_name ?? runtimeState.selected_process?.name ?? 'this session'
  const activePlan = runtimeState.power_plans.find((plan) => plan.active)
  const profile = resolveProfile(profiles, runtimeState)
  const evidence = getEvidenceStage(dashboard.mode, runtimeState.capture_status)
  const proof = getProofStage(optimization, benchmarkBaseline, latestBenchmark)
  const authority = getAuthorityStage(featureFlags, settings)
  const sessionStage = getSessionStage(runtimeState.session, runtimeState)
  const nextStep = getWorkflowStep({
    benchmarkBaseline,
    detectedGame: runtimeState.detected_game,
    featureFlags,
    latestBenchmark,
    optimization,
    session: runtimeState.session,
  })
  const primaryAction = buildPrimaryAction({
    benchmarkBaseline,
    benchmarkBusy,
    featureFlags,
    latestBenchmark,
    onAttachSession,
    onCaptureBaseline,
    onOpenSettings,
    onPreviewTweak,
    onRefresh,
    onRollback,
    onRunBenchmark,
    optimization,
    profileId: profile?.id,
    runtimeState,
    selectedProcessId,
  })
  const actionBrief = getActionBrief(primaryAction.action, trackedProcessName, proof.label)

  const workflow = [
    { label: 'Detect', detail: 'Find a valid game session.' },
    { label: 'Attach', detail: 'Track one session.' },
    { label: 'Baseline', detail: 'Capture a clean before-state.' },
    { label: 'Apply', detail: 'Run one safe change.' },
    { label: 'Compare', detail: 'Measure the result.' },
  ]

  return (
    <div className="space-y-5">
      <Panel variant="primary">
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="action-stage">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current step</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text md:text-[2.35rem]">{nextStep.label}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">{nextStep.detail}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="status-chip">{sessionStage.label}</span>
                <span className="status-chip">{proof.label}</span>
                <span className="status-chip">{authority.label}</span>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button className="button-primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick} type="button">
                  {primaryAction.label}
                </button>
                <button className="button-secondary" onClick={() => onRefresh(trackedProcessId ?? undefined)} type="button">
                  Refresh
                </button>
                {sessionAttached ? (
                  <button className="button-quiet" onClick={onEndSession} type="button">
                    End session
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="summary-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">What changes</p>
                <p className="mt-3 text-sm leading-6 text-muted">{actionBrief.whatChanges}</p>
              </div>
              <div className="summary-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Why this helps</p>
                <p className="mt-3 text-sm leading-6 text-muted">{actionBrief.why}</p>
              </div>
              <div className="summary-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Safety boundary</p>
                <p className="mt-3 text-sm leading-6 text-muted">{actionBrief.safety}</p>
              </div>
              <div className="summary-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Undo path</p>
                <p className="mt-3 text-sm leading-6 text-muted">{actionBrief.undo}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="summary-card">
              <p className="text-sm font-semibold tracking-tight text-text">Workflow</p>
              <div className="mt-4 grid gap-3 md:grid-cols-5 xl:grid-cols-1">
                {workflow.map((item, index) => {
                  const state = stepState(index, primaryAction.action)
                  return (
                    <div key={item.label} className="surface-card">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${state === 'active' ? 'bg-accent text-white' : state === 'done' ? 'bg-success text-white' : 'bg-surface text-muted ring-1 ring-inset ring-border/70'}`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold tracking-tight text-text">{item.label}</p>
                          <p className="text-sm leading-6 text-muted">{item.detail}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Current session</p>
                <p className="mt-2 text-base font-semibold tracking-tight text-text">{trackedProcessName}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{sessionStage.detail}</p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Evidence</p>
                <p className="mt-2 text-base font-semibold tracking-tight text-text">{evidence.label}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{evidence.detail}</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel subtitle="Baseline, latest result, and the current guidance." title="Proof and guidance" variant="secondary">
          <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="summary-card">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-tight text-text">Current proof</p>
                <span className="status-chip">{benchmarkVerdict(latestBenchmark)}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {latestBenchmark
                  ? latestBenchmark.summary
                  : benchmarkBaseline
                    ? `Baseline captured for ${benchmarkBaseline.game_name}. Run one safe change, then compare it.`
                    : stateCopy.noBenchmark}
              </p>
              {latestBenchmark ? <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark.recommended_next_step}</p> : null}
              {latestBenchmark ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="surface-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">FPS delta</p>
                    <p className="mt-2 text-base font-semibold text-text">
                      {latestBenchmark.delta.fps_avg > 0 ? '+' : ''}
                      {latestBenchmark.delta.fps_avg.toFixed(2)}
                    </p>
                  </div>
                  <div className="surface-card">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">p95 delta</p>
                    <p className="mt-2 text-base font-semibold text-text">
                      {latestBenchmark.delta.frametime_p95_ms > 0 ? '+' : ''}
                      {latestBenchmark.delta.frametime_p95_ms.toFixed(2)} ms
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="button-secondary" disabled={benchmarkBusy} onClick={onCaptureBaseline} type="button">
                  {benchmarkBusy ? 'Working…' : benchmarkBaseline ? 'Recapture baseline' : 'Capture baseline'}
                </button>
                <button className="button-secondary" disabled={benchmarkBusy || !benchmarkBaseline} onClick={() => onRunBenchmark(profile?.id)} type="button">
                  Compare result
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="summary-card">
                <p className="text-sm font-semibold tracking-tight text-text">Current guidance</p>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {inference?.summary ?? optimization.next_action ?? 'Attach a game or process to start the safe-test loop.'}
                </p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Matched profile</p>
                <p className="mt-2 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
              </div>
              <div className="surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Policy</p>
                <p className="mt-2 text-sm leading-6 text-muted">{authority.detail}</p>
              </div>
              {activePlan ? (
                <div className="surface-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Active power plan</p>
                  <p className="mt-2 text-sm font-semibold text-text">{activePlan.name}</p>
                </div>
              ) : null}
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel subtitle="Safe alternatives and policy-approved presets." title="Safe actions" variant="secondary">
            <div className="space-y-3">
              {runtimeState.detected_game ? (
                <div className="summary-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-text">{runtimeState.detected_game.exe_name} is ready</p>
                      <p className="mt-2 text-sm leading-6 text-muted">{runtimeState.detected_game.reason}</p>
                    </div>
                    <button
                      className="button-secondary"
                      onClick={() => onAttachSession({ process_id: runtimeState.detected_game!.pid, process_name: runtimeState.detected_game!.exe_name })}
                      type="button"
                    >
                      Attach
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState actionLabel="Refresh detection" actionVariant="secondary" description={stateCopy.noDetectedGame} onAction={() => onRefresh()} title="No game ready yet" />
              )}

              <div className="surface-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-text">Priority boost</p>
                    <p className="mt-2 text-sm leading-6 text-muted">Raise Windows scheduler priority for the attached session only.</p>
                  </div>
                  <button
                    className="button-secondary"
                    disabled={!featureFlags.network_optimizer || !trackedProcessId || !sessionAttached}
                    onClick={() => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' })}
                    type="button"
                  >
                    Preview
                  </button>
                </div>
              </div>

              <div className="surface-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-text">Balanced CPU affinity</p>
                    <p className="mt-2 text-sm leading-6 text-muted">Apply a reversible balanced thread layout for this session.</p>
                  </div>
                  <button
                    className="button-secondary"
                    disabled={!featureFlags.network_optimizer || !trackedProcessId || !sessionAttached}
                    onClick={() => onPreviewTweak({ kind: 'cpu_affinity', process_id: trackedProcessId ?? undefined, affinity_preset: 'balanced_threads' })}
                    type="button"
                  >
                    Preview
                  </button>
                </div>
              </div>

              {runtimeState.power_plans.slice(0, 2).map((plan) => (
                <div key={plan.guid} className="surface-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-text">Switch to {plan.name}</p>
                      <p className="mt-2 text-sm leading-6 text-muted">Use an existing Windows power plan for this session, then restore the original one.</p>
                    </div>
                    <button
                      className="button-secondary"
                      disabled={!featureFlags.network_optimizer || plan.active || !sessionAttached}
                      onClick={() => onPreviewTweak({ kind: 'power_plan', power_plan_guid: plan.guid })}
                      type="button"
                    >
                      {plan.active ? 'Active' : 'Preview'}
                    </button>
                  </div>
                </div>
              ))}

              {runtimeState.registry_presets.map((preset) => (
                <div key={preset.id} className="surface-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold tracking-tight text-text">{preset.title}</p>
                        <span className="status-chip">{preset.allowed_now ? 'Ready' : 'Blocked'}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted">{preset.expected_benefit}</p>
                      {!preset.allowed_now && preset.next_action ? <p className="mt-2 text-sm leading-6 text-muted">{preset.next_action}</p> : null}
                    </div>
                    <button
                      className="button-secondary"
                      disabled={!preset.allowed_now}
                      onClick={() => onPreviewRegistryPreset({ preset_id: preset.id, process_id: trackedProcessId ?? undefined })}
                      type="button"
                    >
                      Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel subtitle="Use this only if detection missed the game." title="Manual fallback" variant="secondary">
            <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
              <label className="surface-card text-sm text-muted">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted">Running process</span>
                <select className="input-shell mt-3" onChange={(event) => onSelectProcess(Number(event.target.value))} value={selectedProcessId ?? ''}>
                  <option value="" disabled>
                    Select a running process
                  </option>
                  {runtimeState.advanced_processes.map((item) => (
                    <option key={item.pid} value={item.pid}>
                      {item.name} ({item.pid})
                    </option>
                  ))}
                </select>
                <p className="mt-3 text-sm leading-6 text-muted">{stateCopy.selectedProcessPending}</p>
              </label>

              <div className="space-y-3">
                {runtimeState.activity.length === 0 ? (
                  <EmptyState actionLabel="Refresh state" actionVariant="secondary" description={stateCopy.noActivity} onAction={() => onRefresh(trackedProcessId ?? undefined)} title="History is still empty" />
                ) : null}
                {runtimeState.activity.slice(0, 3).map((item) => (
                  <div key={item.id} className="summary-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold tracking-tight text-text">{item.action}</p>
                      <span className="status-chip">{item.can_undo ? 'Undo ready' : 'Recorded'}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
                    {item.can_undo && item.snapshot_id ? (
                      <button className="button-secondary mt-4" onClick={() => onRollback(item.snapshot_id!)} type="button">
                        Undo this change
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
