import type {
  ApplyTweakRequest,
  AttachSessionRequest,
  CaptureStatus,
  DashboardPayload,
  DetectedGame,
  FeatureFlags,
  MlInferencePayload,
  OptimizationRuntimeState,
  OptimizationSummary,
} from '../types'
import { Panel } from '../components/Panel'

interface OptimizationPageProps {
  dashboard: DashboardPayload
  featureFlags: FeatureFlags
  inference: MlInferencePayload | null
  onAttachSession: (request: AttachSessionRequest) => void
  onEndSession: () => void
  onPreviewTweak: (request: ApplyTweakRequest) => void
  onRefresh: (processId?: number) => void
  onRollback: (snapshotId: string) => void
  onSelectProcess: (processId: number) => void
  optimization: OptimizationSummary
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
      <div className="rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
        No stable game candidate has been detected yet. Keep a supported game in the foreground for a few seconds or use Advanced process tools as a fallback.
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4">
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
          className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => onAttachSession({ process_id: detectedGame.pid, process_name: detectedGame.exe_name })}
        >
          Attach session
        </button>
      </div>
    </div>
  )
}

export function OptimizationPage(props: OptimizationPageProps) {
  const { dashboard, featureFlags, inference, onAttachSession, onEndSession, onPreviewTweak, onRefresh, onRollback, onSelectProcess, optimization, runtimeState, selectedProcessId } = props
  const activePlan = runtimeState.power_plans.find((plan) => plan.active)
  const disabled = tweakDisabled(featureFlags)
  const sessionAttached = runtimeState.session.state === 'attached' || runtimeState.session.state === 'active'
  const trackedProcessId = runtimeState.session.process_id ?? selectedProcessId
  const trackedProcessName = runtimeState.session.process_name ?? runtimeState.selected_process?.name ?? 'No attached session'

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-6">
        <Panel title="Optimization control" subtitle="Safe, opt-in Windows tweaks with rollback snapshots before every change.">
          {detectedBanner(runtimeState.detected_game, disabled, onAttachSession)}
          <div className="space-y-4 text-sm text-muted">
            <p>Enabled: {optimization.optimizer_enabled ? 'Yes' : 'No'}</p>
            <p>Spike probability: {(optimization.spike_probability * 100).toFixed(0)}%</p>
            <p>Baseline confidence: {(optimization.confidence * 100).toFixed(0)}%</p>
            <p>Current power plan: {activePlan ? activePlan.name : 'Unavailable'}</p>
            <p>Tracked session: {trackedProcessName}</p>
            <p>Capture quality: {captureLabel(runtimeState.capture_status)} | {runtimeState.capture_status.quality}</p>
            <p>Automation restore pending: {runtimeState.session.auto_restore_pending ? 'Yes' : 'No'}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover" onClick={() => onRefresh(trackedProcessId ?? undefined)}>
              Refresh
            </button>
            {sessionAttached ? (
              <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover" onClick={onEndSession}>
                End session
              </button>
            ) : null}
          </div>
          <div className="mt-5 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm text-muted">
            {runtimeState.selected_process ? (
              <>
                {runtimeState.selected_process.name} | Priority: {runtimeState.selected_process.priority_label} | Affinity: {runtimeState.selected_process.affinity_label}
              </>
            ) : (
              <>Attach a game session to inspect live priority, affinity, and rollback-safe automation state.</>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-border px-4 py-4 text-sm leading-6 text-muted">
            {sessionAttached ? (
              <>
                Session scope is active for <span className="font-medium text-text">{trackedProcessName}</span>. Tweaks applied now stay reversible and auto-restore when the tracked process exits or when you end the session manually.
              </>
            ) : (
              <>Default flow is session-first. Advanced process tools remain available below, but tweaks stay disabled until you attach a session.</>
            )}
          </div>
          <div className="mt-5 grid gap-3">
            <button className="rounded-2xl border border-border px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || !trackedProcessId || !sessionAttached} onClick={() => onPreviewTweak({ kind: 'process_priority', process_id: trackedProcessId ?? undefined, priority: 'above_normal' })}>
              <p className="text-sm font-medium text-text">Raise process priority</p>
              <p className="mt-2 text-sm leading-6 text-muted">Move the attached game session to Above normal scheduling priority without touching memory or injecting code.</p>
            </button>
            <button className="rounded-2xl border border-border px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || !trackedProcessId || !sessionAttached} onClick={() => onPreviewTweak({ kind: 'cpu_affinity', process_id: trackedProcessId ?? undefined, affinity_preset: 'balanced_threads' })}>
              <p className="text-sm font-medium text-text">Apply balanced CPU affinity</p>
              <p className="mt-2 text-sm leading-6 text-muted">Use a safer distributed affinity preset first, then test expert one-thread-per-core only if needed.</p>
            </button>
            {runtimeState.power_plans.map((plan) => (
              <button className="rounded-2xl border border-border px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || plan.active || !sessionAttached} key={plan.guid} onClick={() => onPreviewTweak({ kind: 'power_plan', power_plan_guid: plan.guid })}>
                <p className="text-sm font-medium text-text">Switch to {plan.name}</p>
                <p className="mt-2 text-sm leading-6 text-muted">Temporarily activate this existing Windows power plan. A rollback snapshot captures the previous active scheme.</p>
              </button>
            ))}
          </div>
          {disabled ? <p className="mt-4 text-sm text-muted">Enable Performance optimizer in Settings before applying desktop performance tweaks.</p> : null}
          <div className="mt-5 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4">
            <p className="text-sm font-medium text-text">Advanced process tools</p>
            <p className="mt-2 text-sm leading-6 text-muted">Fallback process inspection stays available here, but the default product flow is attach first, then apply reversible tweaks to the tracked session.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <select className="min-w-[240px] rounded-full border border-border px-4 py-2 text-sm outline-none" onChange={(event) => onSelectProcess(Number(event.target.value))} value={selectedProcessId ?? ''}>
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
          </div>
        </Panel>
        <Panel title="Activity & Undo" subtitle="Every applied tweak writes a local activity entry and exposes a one-click rollback.">
          <div className="space-y-3">
            {runtimeState.activity.length === 0 ? <p className="text-sm text-muted">No tweak activity recorded yet.</p> : null}
            {runtimeState.activity.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
                <p className="text-sm font-medium text-text">{item.action}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.detail}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">{new Date(item.timestamp).toLocaleString()} | Risk {item.risk}</p>
                {item.can_undo && item.snapshot_id ? (
                  <button className="mt-3 rounded-full border border-border px-4 py-2 text-sm hover:bg-hover" onClick={() => onRollback(item.snapshot_id!)}>
                    Undo
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="space-y-6">
        <Panel title="Embedded inference" subtitle="Lightweight on-device inference ranks which safe tweak is worth testing first.">
          <div className="space-y-3 text-sm text-muted">
            <p>Latency risk label: {optimization.risk_label}</p>
            <p>Current session health: {dashboard.session_health}</p>
            <p>Recommended profile: {runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id ?? 'No known game profile yet'}</p>
            {inference ? (
              <>
                <p>Sidecar risk label: {inference.risk_label}</p>
                <p>Spike probability: {(inference.spike_probability * 100).toFixed(0)}%</p>
                <p>Inference confidence: {(inference.confidence * 100).toFixed(0)}%</p>
                <p>Model source: {inference.model_source ?? optimization.model_source}</p>
                <p>{inference.summary}</p>
              </>
            ) : (
              <p>Inference will populate after the optimization runtime inspects the latest telemetry point.</p>
            )}
          </div>
          {inference?.shap_preview?.length ? (
            <div className="mt-4 space-y-3">
              {inference.shap_preview.map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
          {inference?.factors?.length ? (
            <div className="mt-4 space-y-3">
              {inference.factors.map((item) => (
                <div key={item} className="rounded-2xl border border-border px-4 py-4 text-sm leading-6 text-muted">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
        <Panel title="Suggested adjustments" subtitle="Model-guided local recommendations and current dashboard advice.">
          <div className="space-y-4">
            {dashboard.recommendations.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border px-4 py-4">
                <p className="text-sm font-medium text-text">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
              </div>
            ))}
            {inference?.recommended_tweaks?.map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm leading-6 text-muted">
                Sidecar recommends testing <span className="font-medium text-text">{item.replaceAll('_', ' ')}</span> for the next session.
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
