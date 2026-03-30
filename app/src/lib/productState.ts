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
  PageId,
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

export interface SurfaceState {
  optionalSecondaryStatus?: ProductSignal<string>
  primaryStatus: ProductSignal<string>
  proofState: ProductSignal<string>
}

export function getEvidenceStage(mode: DashboardPayload['mode'], capture?: CaptureStatus | SessionState): ProductSignal<EvidenceStage> {
  if (mode === 'disabled') {
    return { label: 'Unavailable', detail: 'Telemetry is off. Turn it back on when you want proof.' }
  }
  if (mode === 'demo') {
    return { label: 'Demo', detail: 'You are looking at practice data, not a live session.' }
  }
  if (!capture) {
    return { label: 'Unavailable', detail: 'Live capture is not attached to a game yet.' }
  }
  const source = 'capture_source' in capture ? capture.capture_source : capture.source
  const quality = 'capture_quality' in capture ? capture.capture_quality : capture.quality

  if (source === 'presentmon') {
    return {
      label: quality === 'warming' ? 'Degraded' : 'Live',
      detail: quality === 'warming' ? 'Live capture is warming up and will settle in a moment.' : 'Live capture is attached to the current session.',
    }
  }
  return {
    label: quality === 'idle' ? 'Unavailable' : 'Degraded',
    detail:
      quality === 'idle'
        ? 'No live evidence is attached yet.'
        : 'A lighter capture path is active. It is safe, but less precise than full live capture.',
  }
}

export function getSessionStage(session: SessionState, runtimeState?: OptimizationRuntimeState): ProductSignal<SessionStageLabel> {
  if (runtimeState?.session.pending_registry_restore) {
    return { label: 'Blocked', detail: 'Finish restoring the last system change before you try another one.' }
  }
  if (session.state === 'restored') {
    return { label: 'Restored', detail: 'The last session change has already been walked back.' }
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
    return { label: 'Inconclusive', detail: 'You have a result, but it is not strong enough to trust yet.' }
  }
  if (latestBenchmark || optimization.proof_state === 'comparison-ready') {
    return { label: 'Comparison ready', detail: 'A before-and-after result is ready to review.' }
  }
  if (benchmarkBaseline || optimization.proof_state === 'baseline-ready') {
    return { label: 'Ready to test', detail: 'Your clean baseline is saved. Test one change, then compare.' }
  }
  return { label: 'No baseline', detail: 'Capture a clean baseline first so every change has proof behind it.' }
}

export function getAuthorityStage(featureFlags: FeatureFlags, settings: SystemSettings): ProductSignal<AuthorityStageLabel> {
  if (!featureFlags.network_optimizer) {
    return { label: 'Blocked', detail: 'Aeterna can inspect the session, but changes stay off until you allow them.' }
  }
  if (settings.automation_mode === 'trusted_profiles') {
    return { label: 'Trusted', detail: 'Only policy-approved, rollback-safe actions may run automatically.' }
  }
  if (settings.automation_mode === 'assisted') {
    return { label: 'Assisted', detail: 'Aeterna can suggest changes, but you still confirm the final move.' }
  }
  return { label: 'Manual', detail: 'Every change requires an explicit user decision.' }
}

export function getModelPosture(runtimeTruth: MlRuntimeTruth | null, modelCount: number) {
  if (runtimeTruth?.runtime_mode === 'onnx') {
    return { label: 'Runtime-backed', detail: 'Recommendations are backed by a real local runtime path.' }
  }
  if (runtimeTruth?.runtime_mode === 'fallback') {
    return { label: 'Advisory only', detail: 'Recommendations are still guidance, not proof.' }
  }
  return {
    label: 'Unavailable',
    detail: modelCount > 0 ? 'Artifacts exist, but the runtime path is not ready yet.' : 'No local model path is ready yet.',
  }
}

export function getSurfaceState(input: {
  activePage: PageId
  authority: ProductSignal<AuthorityStageLabel>
  evidence: ProductSignal<EvidenceStage>
  proof: ProductSignal<ProofStageLabel>
  sessionStage: ProductSignal<SessionStageLabel>
}): SurfaceState {
  const { activePage, authority, evidence, proof, sessionStage } = input

  if (activePage === 'home') {
    return { primaryStatus: sessionStage, proofState: proof, optionalSecondaryStatus: evidence }
  }
  if (activePage === 'optimize') {
    return { primaryStatus: sessionStage, proofState: proof, optionalSecondaryStatus: authority }
  }
  if (activePage === 'history') {
    return { primaryStatus: proof, proofState: sessionStage, optionalSecondaryStatus: authority }
  }

  return { primaryStatus: sessionStage, proofState: proof, optionalSecondaryStatus: evidence }
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
      detail: 'Finish restoring the last preset before you try another system-level change.',
    }
  }
  if (!sessionAttached && detectedGame) {
    return {
      action: 'attach-session',
      label: 'Attach the game',
      detail: `Attach ${detectedGame.exe_name} to start a real session with proof and undo.`,
    }
  }
  if (!sessionAttached) {
    return {
      action: 'refresh-detection',
      label: 'Find a game to attach',
      detail: 'Keep a supported game in the foreground, refresh detection, then attach it.',
    }
  }
  if (!benchmarkBaseline) {
    return {
      action: 'capture-baseline',
      label: 'Capture a baseline',
      detail: 'Save a clean before-state first so every result has something real to compare against.',
    }
  }
  if (!featureFlags.network_optimizer) {
    return {
      action: 'open-settings',
      label: 'Allow safe changes',
      detail: 'Turn on safe changes in Settings before you try a reversible tweak.',
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
