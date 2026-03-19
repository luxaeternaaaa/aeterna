import type {
  ApplyTweakRequest,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  CaptureStatus,
  DashboardPayload,
  DetectedGame,
  FeatureFlags,
  GameProfile,
  MlInferencePayload,
  OptimizationRuntimeState,
  OptimizationSummary,
} from '../types'
import { Panel } from '../components/Panel'
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
  onPreviewTweak: (request: ApplyTweakRequest) => void
  onRefresh: (processId?: number) => void
  onRollback: (snapshotId: string) => void
  onRunBenchmark: (profileId?: string) => void
  onSelectProcess: (processId: number) => void
  optimization: OptimizationSummary
  profiles: GameProfile[]
  runtimeState: OptimizationRuntimeState
  selectedProcessId: number | null
}

function tweakDisabled(featureFlags: FeatureFlags) {
  return !featureFlags.network_optimizer
}

function captureLabel(status: CaptureStatus) {
  if (status.source === 'presentmon') return 'PresentMon'
  if (status.source === 'demo') return 'Demo'
  return 'Counters fallback'
}

function detectedBanner(detectedGame: DetectedGame | null, disabled: boolean, onAttachSession: (request: AttachSessionRequest) => void) {
  if (!detectedGame) {
    return (
      <div className="rounded-[1.5rem] border border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-muted">
        {stateCopy.noDetectedGame}
      </div>
    )
  }
  return (
    <div className="rounded-[1.5rem] border border-border-strong bg-surface-muted px-4 py-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text">Detected game: {detectedGame.exe_name}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {detectedGame.reason} {detectedGame.recommended_profile_id ? `Recommended profile: ${detectedGame.recommended_profile_id}.` : ''}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
            PID {detectedGame.pid} | observed {(detectedGame.observed_for_ms / 1000).toFixed(0)}s | capture {detectedGame.capture_available ? 'available' : 'fallback only'}
          </p>
        </div>
        <button
          className="rounded-full border border-border-strong bg-surface px-4 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => onAttachSession({ process_id: detectedGame.pid, process_name: detectedGame.exe_name })}
          type="button"
        >
          Attach session
        </button>
      </div>
    </div>
  )
}

function resolveProfile(profiles: GameProfile[], runtimeState: OptimizationRuntimeState) {
  const profileId = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  return profiles.find((profile) => profile.id === profileId) ?? null
}

function benchmarkVerdict(report: BenchmarkReport | null) {
  if (!report) return 'No proof yet'
  if (report.verdict === 'improved') return 'Improved'
  if (report.verdict === 'regressed') return 'Regressed'
  return 'Mixed'
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
    onPreviewTweak,
    onRefresh,
    onRollback,
    onRunBenchmark,
    onSelectProcess,
    optimization,
    profiles,
    runtimeState,
    selectedProcessId,
  } = props
  const activePlan = runtimeState.power_plans.find((plan) => plan.active)
  const disabled = tweakDisabled(featureFlags)
  const sessionAttached = runtimeState.session.state === 'attached' || runtimeState.session.state === 'active'
  const trackedProcessId = runtimeState.session.process_id ?? selectedProcessId
  const trackedProcessName = runtimeState.session.process_name ?? runtimeState.selected_process?.name ?? 'No attached session'
  const primaryRecommendation = dashboard.recommendations[0] ?? null
  const profile = resolveProfile(profiles, runtimeState)

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Panel
          title="Attach and operate"
          subtitle="The product should make the main workflow obvious: detect, attach, inspect, test, restore."
          variant="primary"
        >
          {detectedBanner(runtimeState.detected_game, disabled, onAttachSession)}
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Policy status</p>
              <p className="mt-2 text-base font-medium text-text">{disabled ? 'Blocked by settings' : 'Allowed manually'}</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Tracked session</p>
              <p className="mt-2 text-base font-medium text-text">{trackedProcessName}</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Restore pending</p>
              <p className="mt-2 text-base font-medium text-text">{runtimeState.session.auto_restore_pending ? 'Yes' : 'No'}</p>
            </div>
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
            {runtimeState.selected_process
              ? `${runtimeState.selected_process.name} | Priority ${runtimeState.selected_process.priority_label} | Affinity ${runtimeState.selected_process.affinity_label}`
              : stateCopy.selectedProcessPending}
          </div>
          <div className="mt-5 grid gap-3">
            <button
              className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || !trackedProcessId || !sessionAttached}
              onClick={() => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' })}
              type="button"
            >
              <p className="text-sm font-medium text-text">Raise process priority</p>
              <p className="mt-2 text-sm leading-6 text-muted">Use Windows scheduling to prioritize the attached session without touching game memory.</p>
            </button>
            <button
              className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || !trackedProcessId || !sessionAttached}
              onClick={() => onPreviewTweak({ kind: 'cpu_affinity', process_id: trackedProcessId ?? undefined, affinity_preset: 'balanced_threads' })}
              type="button"
            >
              <p className="text-sm font-medium text-text">Apply balanced CPU affinity</p>
              <p className="mt-2 text-sm leading-6 text-muted">Start with the safer preset first. Expert reduction is not the default path.</p>
            </button>
            {runtimeState.power_plans.map((plan) => (
              <button
                className="rounded-[1.5rem] border border-border bg-surface-muted/60 px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled || plan.active || !sessionAttached}
                key={plan.guid}
                onClick={() => onPreviewTweak({ kind: 'power_plan', power_plan_guid: plan.guid })}
                type="button"
              >
                <p className="text-sm font-medium text-text">Switch to {plan.name}</p>
                <p className="mt-2 text-sm leading-6 text-muted">Use an existing Windows power plan for the session and restore the original one afterward.</p>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" onClick={() => onRefresh(trackedProcessId ?? undefined)} type="button">
              Refresh state
            </button>
            {sessionAttached ? (
              <button className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" onClick={onEndSession} type="button">
                End session
              </button>
            ) : null}
          </div>
          {disabled ? <p className="mt-4 text-sm text-muted">Performance optimizer is disabled in Settings, so the product is correctly refusing to apply tweaks.</p> : null}
        </Panel>

        <div className="space-y-6">
          <Panel title="Best next test" subtitle="This block should answer what is worth trying before the user starts clicking around." variant="secondary">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Spike probability</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{(optimization.spike_probability * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Capture quality</p>
                <p className="mt-2 text-base font-medium text-text">{captureLabel(runtimeState.capture_status)} | {runtimeState.capture_status.quality}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Power plan</p>
                <p className="mt-2 text-base font-medium text-text">{activePlan ? activePlan.name : 'Unavailable'}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Recommended profile</p>
                <p className="mt-2 text-base font-medium text-text">
                  {profile ? profile.title : stateCopy.noProfile}
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-[1.5rem] border border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-muted">
              {inference ? inference.summary : primaryRecommendation?.summary ?? 'Inference will populate after the runtime inspects the latest telemetry point.'}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                {(inference?.model_source ?? optimization.model_source).replace('-', ' ')}
              </span>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                confidence {((inference?.confidence ?? optimization.confidence) * 100).toFixed(0)}%
              </span>
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                rollback safe
              </span>
            </div>
          </Panel>

          <Panel title="Trust and proof" subtitle="Make the product prove itself before you trust a preset or wider automation." variant="utility">
            <div className="grid gap-3">
              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Profile</p>
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {profile ? profile.game : 'Generic'}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{profile ? profile.safe_preset : stateCopy.noProfile}</p>
                {profile ? (
                  <p className="mt-3 text-sm leading-6 text-muted">{profile.risk_note}</p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-text">Benchmark proof</p>
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {benchmarkVerdict(latestBenchmark)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {latestBenchmark
                    ? latestBenchmark.summary
                    : benchmarkBaseline
                      ? `Baseline captured for ${benchmarkBaseline.game_name}. Run a comparison after testing a preset.`
                      : stateCopy.noBenchmark}
                </p>
                {latestBenchmark ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[1.25rem] border border-border bg-surface-muted/70 px-3 py-3 text-sm text-muted">
                      FPS delta {latestBenchmark.delta.fps_avg > 0 ? '+' : ''}
                      {latestBenchmark.delta.fps_avg.toFixed(2)}
                    </div>
                    <div className="rounded-[1.25rem] border border-border bg-surface-muted/70 px-3 py-3 text-sm text-muted">
                      p95 delta {latestBenchmark.delta.frametime_p95_ms > 0 ? '+' : ''}
                      {latestBenchmark.delta.frametime_p95_ms.toFixed(2)} ms
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={benchmarkBusy}
                    onClick={onCaptureBaseline}
                    type="button"
                  >
                    {benchmarkBusy ? 'Working...' : benchmarkBaseline ? 'Recapture baseline' : 'Capture baseline'}
                  </button>
                  <button
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={benchmarkBusy || !benchmarkBaseline}
                    onClick={() => onRunBenchmark(profile?.id)}
                    type="button"
                  >
                    Compare now
                  </button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <p className="text-sm font-semibold tracking-tight text-text">Manual tools and rollback</p>
                <p className="mt-2 text-sm leading-6 text-muted">Use this only when game detection misses. It should feel like a fallback, not the main product path.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <select className="min-w-[240px] rounded-full border border-border-strong bg-surface px-4 py-2 text-sm outline-none" onChange={(event) => onSelectProcess(Number(event.target.value))} value={selectedProcessId ?? ''}>
                    <option value="" disabled>
                      Select a running process
                    </option>
                    {runtimeState.advanced_processes.map((item) => (
                      <option key={item.pid} value={item.pid}>
                        {item.name} ({item.pid})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 space-y-3">
                  {runtimeState.activity.length === 0 ? <p className="text-sm text-muted">{stateCopy.noActivity}</p> : null}
                  {runtimeState.activity.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-[1.25rem] border border-border bg-surface-muted/65 px-4 py-4">
                      <p className="text-sm font-medium text-text">{item.action}</p>
                      <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
                      {item.can_undo && item.snapshot_id ? (
                        <button className="mt-3 rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" onClick={() => onRollback(item.snapshot_id!)} type="button">
                          Undo
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </section>
    </div>
  )
}
