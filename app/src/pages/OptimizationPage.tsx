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
import { getAuthorityStage, getEvidenceStage, getProofStage, getSessionStage, getWorkflowStep } from '../lib/productState'
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
}): { disabled: boolean; label: string; onClick: () => void } {
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
      label: 'Attach session',
      disabled: false,
      onClick: () => onAttachSession({ process_id: runtimeState.detected_game!.pid, process_name: runtimeState.detected_game!.exe_name }),
    }
  }
  if (nextStep.action === 'capture-baseline') {
    return { label: benchmarkBusy ? 'Capturing...' : 'Capture baseline', disabled: benchmarkBusy, onClick: onCaptureBaseline }
  }
  if (nextStep.action === 'open-settings') {
    return { label: 'Open settings', disabled: false, onClick: onOpenSettings }
  }
  if (nextStep.action === 'apply-safe-test') {
    return {
      label: 'Try safe priority boost',
      disabled: !trackedProcessId || runtimeState.session.state === 'idle' || runtimeState.session.state === 'ended',
      onClick: () => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' }),
    }
  }
  if (nextStep.action === 'review-proof') {
    if (runtimeState.session.pending_registry_snapshot_id) {
      return {
        label: 'Restore previous preset',
        disabled: false,
        onClick: () => onRollback(runtimeState.session.pending_registry_snapshot_id!),
      }
    }
    return {
      label: benchmarkBusy ? 'Comparing...' : 'Compare now',
      disabled: benchmarkBusy || !benchmarkBaseline,
      onClick: () => onRunBenchmark(profileId),
    }
  }
  return { label: 'Refresh detection', disabled: false, onClick: () => onRefresh(trackedProcessId ?? undefined) }
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
  const trackedProcessName = runtimeState.session.process_name ?? runtimeState.selected_process?.name ?? 'No attached session'
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

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel title="Current loop" subtitle="The product should reduce this screen to one safe move, not a reading assignment." variant="primary">
          <div className="rounded-[1.7rem] border border-accent/30 bg-accent-soft/60 px-5 py-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Do this next</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{nextStep.label}</p>
            <p className="mt-3 text-sm leading-6 text-muted">{nextStep.detail}</p>
            <button className="button-primary mt-5" disabled={primaryAction.disabled} onClick={primaryAction.onClick} type="button">
              {primaryAction.label}
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Session</p>
              <p className="mt-2 text-base font-semibold text-text">{sessionStage.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{trackedProcessName}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Proof</p>
              <p className="mt-2 text-base font-semibold text-text">{proof.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{proof.detail}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Authority</p>
              <p className="mt-2 text-base font-semibold text-text">{authority.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{authority.detail}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="summary-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Evidence quality</p>
              <p className="mt-2 text-base font-semibold text-text">{evidence.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{evidence.detail}</p>
            </div>
            <div className="summary-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current recommendation</p>
              <p className="mt-2 text-sm leading-6 text-text">{inference?.summary ?? optimization.next_action ?? 'Attach a game or process to start the safe-test loop.'}</p>
            </div>
          </div>

          {runtimeState.detected_game ? (
            <div className="mt-5 summary-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight text-text">{runtimeState.detected_game.exe_name} is ready to attach</p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {runtimeState.detected_game.reason}
                    {runtimeState.detected_game.recommended_profile_id ? ` Recommended profile: ${runtimeState.detected_game.recommended_profile_id}.` : ''}
                  </p>
                </div>
                <span className="status-chip">
                  observed {(runtimeState.detected_game.observed_for_ms / 1000).toFixed(0)}s
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState actionLabel="Refresh detection" description={stateCopy.noDetectedGame} onAction={() => onRefresh()} title="No game is attached yet" />
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-base font-semibold tracking-tight text-text">Safe tests</h3>
            <p className="mt-1 text-sm leading-6 text-muted">Each action stays scoped, explainable, and rollback-safe.</p>
            <div className="mt-4 grid gap-3">
              <button
                className="summary-card text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!featureFlags.network_optimizer || !trackedProcessId || !sessionAttached}
                onClick={() => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' })}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Priority boost</p>
                  <span className="status-chip">Undo ready</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">What changes: Windows scheduler priority for the attached session.</p>
                <p className="mt-1 text-sm leading-6 text-muted">Why try it: a quick, reversible test when background contention is visible.</p>
                <p className="mt-1 text-sm leading-6 text-muted">Constraints: session-scoped only, no game memory access, full rollback snapshot.</p>
              </button>

              <button
                className="summary-card text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!featureFlags.network_optimizer || !trackedProcessId || !sessionAttached}
                onClick={() => onPreviewTweak({ kind: 'cpu_affinity', process_id: trackedProcessId ?? undefined, affinity_preset: 'balanced_threads' })}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Balanced CPU affinity</p>
                  <span className="status-chip">Undo ready</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">What changes: the CPU thread mask for the current session.</p>
                <p className="mt-1 text-sm leading-6 text-muted">Why try it: useful when the machine is stable enough for a reversible scheduling test.</p>
                <p className="mt-1 text-sm leading-6 text-muted">Constraints: balanced preset only, session-scoped only, full rollback snapshot.</p>
              </button>

              {runtimeState.power_plans.slice(0, 2).map((plan) => (
                <button
                  className="summary-card text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!featureFlags.network_optimizer || plan.active || !sessionAttached}
                  key={plan.guid}
                  onClick={() => onPreviewTweak({ kind: 'power_plan', power_plan_guid: plan.guid })}
                  type="button"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-tight text-text">Switch to {plan.name}</p>
                    <span className="status-chip">{plan.active ? 'Active now' : 'Undo ready'}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">What changes: the active Windows power plan for this session.</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Why try it: a low-risk test when power policy is the likely pressure point.</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Constraints: uses an existing plan only and restores the previous one automatically.</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="button-secondary" onClick={() => onRefresh(trackedProcessId ?? undefined)} type="button">
              Refresh state
            </button>
            {sessionAttached ? (
              <button className="button-secondary" onClick={onEndSession} type="button">
                End session
              </button>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Proof before trust" subtitle="Every recommendation should say what changed, why it matters, and how you walk it back." variant="secondary">
            <div className="space-y-3">
              <div className="summary-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Benchmark proof</p>
                  <span className="status-chip">{benchmarkVerdict(latestBenchmark)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {latestBenchmark
                    ? latestBenchmark.summary
                    : benchmarkBaseline
                      ? `Baseline captured for ${benchmarkBaseline.game_name}. The next honest move is one reversible change and then Compare.`
                      : stateCopy.noBenchmark}
                </p>
                {latestBenchmark ? <p className="mt-3 text-sm leading-6 text-muted">{latestBenchmark.recommended_next_step}</p> : null}
                {latestBenchmark ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                <div className="mt-4 flex flex-wrap gap-3">
                  <button className="button-primary" disabled={benchmarkBusy} onClick={onCaptureBaseline} type="button">
                    {benchmarkBusy ? 'Working...' : benchmarkBaseline ? 'Recapture baseline' : 'Capture baseline'}
                  </button>
                  <button className="button-secondary" disabled={benchmarkBusy || !benchmarkBaseline} onClick={() => onRunBenchmark(profile?.id)} type="button">
                    Compare now
                  </button>
                </div>
              </div>

              <div className="summary-card">
                <p className="text-sm font-semibold tracking-tight text-text">Matched profile</p>
                <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.description : stateCopy.noProfile}</p>
                {profile ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-muted">Expected evidence: {profile.benchmark_expectation}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">Risk note: {profile.risk_note}</p>
                  </>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="status-chip">{proof.label}</span>
                  <span className="status-chip">{evidence.label}</span>
                  {activePlan ? <span className="status-chip">{activePlan.name}</span> : null}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Policy-approved presets" subtitle="These stay secondary to the safe-test loop and only matter when the product can explain them clearly." variant="utility">
            <div className="space-y-3">
              {runtimeState.registry_presets.length === 0 ? (
                <EmptyState description="No registry-backed presets are available right now. That keeps the product narrow and easier to trust." title="No presets ready" />
              ) : null}
              {runtimeState.registry_presets.map((preset) => (
                <button
                  key={preset.id}
                  className="summary-card w-full text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!preset.allowed_now}
                  onClick={() => onPreviewRegistryPreset({ preset_id: preset.id, process_id: trackedProcessId ?? undefined })}
                  type="button"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-tight text-text">{preset.title}</p>
                    <span className="status-chip">{preset.allowed_now ? 'Ready to preview' : 'Blocked'}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted">What changes: {preset.target_state}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">Why try it: {preset.expected_benefit}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Constraints: {preset.requires_admin ? 'Admin required. ' : ''}{preset.blocking_reason ?? 'Rollback snapshot is created before the preset runs.'}
                  </p>
                  {!preset.allowed_now && preset.next_action ? <p className="mt-2 text-sm leading-6 text-text">{preset.next_action}</p> : null}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Manual fallback" subtitle="Use this when detection misses. It stays visible, but it should never outrank the main path." variant="secondary">
            <label className="block text-sm text-muted">
              <span className="mb-3 block text-xs uppercase tracking-[0.18em] text-muted">Running process</span>
              <select className="w-full rounded-full border border-border-strong bg-surface px-4 py-3 text-sm text-text outline-none" onChange={(event) => onSelectProcess(Number(event.target.value))} value={selectedProcessId ?? ''}>
                <option value="" disabled>
                  Select a running process
                </option>
                {runtimeState.advanced_processes.map((item) => (
                  <option key={item.pid} value={item.pid}>
                    {item.name} ({item.pid})
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 space-y-3">
              {runtimeState.activity.length === 0 ? (
                <EmptyState actionLabel="Refresh state" description={stateCopy.noActivity} onAction={() => onRefresh(trackedProcessId ?? undefined)} title="No reversible history yet" />
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
          </Panel>
        </div>
      </section>
    </div>
  )
}
