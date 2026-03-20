import type {
  AuthorityStageLabel,
  BenchmarkReport,
  BenchmarkWindow,
  CaptureStatus,
  DashboardPayload,
  DetectedGame,
  EvidenceStage,
  FeatureFlags,
  MlRuntimeTruth,
  OptimizationRuntimeState,
  OptimizationSummary,
  ProofStageLabel,
  SessionStageLabel,
  SessionState,
  SystemSettings,
} from '../types'

type ProductSignal<T extends string> = {
  detail: string
  label: T
}

export type WorkflowAction =
  | 'refresh-detection'
  | 'attach-session'
  | 'capture-baseline'
  | 'open-settings'
  | 'apply-safe-test'
  | 'review-proof'

export interface WorkflowStep {
  action: WorkflowAction
  detail: string
  label: string
}

export function getEvidenceStage(mode: DashboardPayload['mode'], capture?: CaptureStatus | SessionState): ProductSignal<EvidenceStage> {
  if (mode === 'disabled') {
    return { label: 'Unavailable', detail: 'Telemetry is off, so the app cannot prove what changed.' }
  }
  if (mode === 'demo') {
    return { label: 'Demo', detail: 'The screen is showing practice data, not your live session.' }
  }
  if (!capture) {
    return { label: 'Unavailable', detail: 'Live capture is not attached to a session yet.' }
  }
  const source = 'capture_source' in capture ? capture.capture_source : capture.source
  const quality = 'capture_quality' in capture ? capture.capture_quality : capture.quality

  if (source === 'presentmon') {
    return {
      label: quality === 'warming' ? 'Degraded' : 'Live',
      detail: quality === 'warming' ? 'Live capture is starting up and still settling.' : 'Live capture is attached to the current session.',
    }
  }
  return {
    label: quality === 'idle' ? 'Unavailable' : 'Degraded',
    detail:
      quality === 'idle'
        ? 'No live evidence is attached yet.'
        : 'A safe counters path is active, but the reading is weaker than full live capture.',
  }
}

export function getSessionStage(session: SessionState, runtimeState?: OptimizationRuntimeState): ProductSignal<SessionStageLabel> {
  if (runtimeState?.session.pending_registry_restore) {
    return { label: 'Blocked', detail: 'A previous system preset is still active and must be restored first.' }
  }
  if (session.state === 'restored') {
    return { label: 'Restored', detail: 'Aeterna has already walked the last session-scoped change back.' }
  }
  if (session.state === 'active') {
    return { label: 'Testing', detail: 'A live session is running. Stick to one reversible change at a time.' }
  }
  if (session.state === 'attached') {
    return { label: 'Attached', detail: 'A session is attached and ready for a baseline or a safe test.' }
  }
  return { label: 'No session', detail: 'No game session is attached yet.' }
}

export function getProofStage(
  optimization: OptimizationSummary,
  benchmarkBaseline: BenchmarkWindow | null,
  latestBenchmark: BenchmarkReport | null,
): ProductSignal<ProofStageLabel> {
  if (latestBenchmark?.verdict === 'inconclusive') {
    return { label: 'Inconclusive', detail: 'You have evidence, but it still does not justify trust.' }
  }
  if (latestBenchmark || optimization.proof_state === 'comparison-ready') {
    return { label: 'Comparison ready', detail: 'A before-and-after result is available for inspection.' }
  }
  if (benchmarkBaseline || optimization.proof_state === 'baseline-ready') {
    return { label: 'Ready to test', detail: 'The baseline is captured. Apply one safe change, then compare.' }
  }
  return { label: 'No baseline', detail: 'Nothing has been proven yet.' }
}

export function getAuthorityStage(featureFlags: FeatureFlags, settings: SystemSettings): ProductSignal<AuthorityStageLabel> {
  if (!featureFlags.network_optimizer) {
    return { label: 'Blocked', detail: 'Aeterna can inspect the session, but changes stay off until you allow them.' }
  }
  if (settings.automation_mode === 'trusted_profiles') {
    return { label: 'Trusted', detail: 'Only policy-approved, rollback-safe actions may run automatically.' }
  }
  if (settings.automation_mode === 'assisted') {
    return { label: 'Assisted', detail: 'Aeterna can suggest and preview changes, but you stay in control.' }
  }
  return { label: 'Manual', detail: 'Every change requires an explicit user decision.' }
}

export function getModelPosture(runtimeTruth: MlRuntimeTruth | null, modelCount: number) {
  if (runtimeTruth?.runtime_mode === 'onnx') {
    return { label: 'Runtime-backed', detail: 'Recommendations are backed by a local runtime path.' }
  }
  if (runtimeTruth?.runtime_mode === 'fallback') {
    return { label: 'Advisory only', detail: 'Recommendations are still ranking guidance, not proof.' }
  }
  return {
    label: 'Unavailable',
    detail: modelCount > 0 ? 'Artifacts exist, but the runtime path is not ready yet.' : 'No local model path is ready yet.',
  }
}

export function getWorkflowStep(input: {
  benchmarkBaseline: BenchmarkWindow | null
  detectedGame: DetectedGame | null
  featureFlags: FeatureFlags
  latestBenchmark: BenchmarkReport | null
  optimization: OptimizationSummary
  session: SessionState
}): WorkflowStep {
  const { benchmarkBaseline, detectedGame, featureFlags, latestBenchmark, optimization, session } = input
  const sessionAttached = session.state === 'attached' || session.state === 'active'

  if (session.pending_registry_restore) {
    return {
      action: 'review-proof',
      label: 'Restore the last preset',
      detail: 'Finish the pending restore before you stack another registry-backed change.',
    }
  }
  if (!sessionAttached && detectedGame) {
    return {
      action: 'attach-session',
      label: 'Attach the game',
      detail: `Attach ${detectedGame.exe_name} and turn this into a real, inspectable session.`,
    }
  }
  if (!sessionAttached) {
    return {
      action: 'refresh-detection',
      label: 'Find a game to attach',
      detail: 'Keep a supported game in the foreground or refresh detection, then attach it.',
    }
  }
  if (!benchmarkBaseline) {
    return {
      action: 'capture-baseline',
      label: 'Capture a baseline',
      detail: 'Record the clean before-state first so every later result has something honest to compare against.',
    }
  }
  if (!featureFlags.network_optimizer) {
    return {
      action: 'open-settings',
      label: 'Allow safe changes',
      detail: 'Turn on Performance optimizer in Settings before you try a reversible tweak.',
    }
  }
  if (!latestBenchmark) {
    return {
      action: 'apply-safe-test',
      label: 'Run one safe test',
      detail: optimization.next_action ?? 'Apply one reversible change, then compare it against the baseline.',
    }
  }
  return {
    action: 'review-proof',
    label: 'Review the result',
    detail: latestBenchmark.recommended_next_step || 'Decide whether to keep the change or walk it back.',
  }
}
