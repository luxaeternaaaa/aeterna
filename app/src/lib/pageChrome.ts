import type {
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  FeatureFlags,
  LogRecord,
  MlRuntimeTruth,
  ModelRecord,
  OptimizationRuntimeState,
  OptimizationSummary,
  PageId,
  SecuritySummary,
  SessionState,
  SystemSettings,
} from '../types'
import { getAuthorityStage, getEvidenceStage, getModelPosture, getProofStage, getSessionStage, getSurfaceState, getWorkflowStep } from './productState'

export type ThemeMode = 'dark' | 'light'

type ChromeSurface = {
  detail: string
  label: string
  value: string
}

export type PageChrome = {
  eyebrow: string
  optionalSecondaryStatus?: ChromeSurface
  primaryAction: ChromeSurface
  primaryStatus: ChromeSurface
  proofState: ChromeSurface
  subtitle: string
  title: string
}

type PageChromeInput = {
  activePage: PageId
  benchmarkBaseline: BenchmarkWindow | null
  connectionTitle: string
  dashboard: DashboardPayload
  featureFlags: FeatureFlags
  latestBenchmark: BenchmarkReport | null
  logs: LogRecord[]
  mlRuntimeTruth: MlRuntimeTruth | null
  models: ModelRecord[]
  optimization: OptimizationSummary
  optimizationRuntime: OptimizationRuntimeState
  security: SecuritySummary
  session: SessionState
  settings: SystemSettings
  theme: ThemeMode
  undoReadyCount: number
}

function formatAutomationMode(mode: SystemSettings['automation_mode']) {
  return mode === 'trusted_profiles' ? 'Trusted profiles' : mode.charAt(0).toUpperCase() + mode.slice(1)
}

function formatTelemetryMode(mode: SystemSettings['telemetry_mode']) {
  if (mode === 'live') return 'Live telemetry'
  if (mode === 'demo') return 'Demo telemetry'
  return 'Telemetry off'
}

export function getPageChrome(input: PageChromeInput): PageChrome {
  const {
    activePage,
    benchmarkBaseline,
    connectionTitle,
    dashboard,
    featureFlags,
    latestBenchmark,
    logs,
    mlRuntimeTruth,
    models,
    optimization,
    optimizationRuntime,
    security,
    session,
    settings,
    theme,
    undoReadyCount,
  } = input
  const evidence = getEvidenceStage(dashboard.mode, optimizationRuntime.capture_status)
  const proof = getProofStage(optimization, benchmarkBaseline, latestBenchmark)
  const sessionStage = getSessionStage(session, optimizationRuntime)
  const authority = getAuthorityStage(featureFlags, settings)
  const surfaceState = getSurfaceState({ activePage, authority, evidence, proof, sessionStage })
  const workflow = getWorkflowStep({
    benchmarkBaseline,
    detectedGame: optimizationRuntime.detected_game,
    featureFlags,
    latestBenchmark,
    optimization,
    session,
  })

  switch (activePage) {
    case 'dashboard':
      return {
        eyebrow: 'Dashboard',
        title: 'Current session',
        subtitle: 'See what is happening and take one safe next step.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Evidence', value: evidence.label, detail: evidence.detail },
      }
    case 'optimization':
      return {
        eyebrow: 'Optimization',
        title: 'Run one safe test',
        subtitle: 'Attach a game, capture proof, then change one thing at a time.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Authority', value: authority.label, detail: authority.detail },
      }
    case 'security':
      return {
        eyebrow: 'Safety',
        title: 'Trust and boundaries',
        subtitle: 'Keep every session reversible, local, and safe for games.',
        primaryStatus: {
          label: 'Safety status',
          value: security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern',
          detail: 'Local safety signals tell you when to slow down.',
        },
        primaryAction: {
          label: 'Best next step',
          value: authority.label === 'Blocked' ? 'Review Settings' : 'Stay in manual control',
          detail: authority.label === 'Blocked' ? authority.detail : 'Use proof and undo before you trust automation.',
        },
        proofState: { label: 'Data path', value: 'Local only', detail: 'Logs, scanning, and rollback stay on-device unless you change policy.' },
        optionalSecondaryStatus: { label: 'Telemetry', value: formatTelemetryMode(settings.telemetry_mode), detail: security.auto_scan_enabled ? 'Automatic safety review is on.' : 'Safety review stays manual by default.' },
      }
    case 'models': {
      const posture = getModelPosture(mlRuntimeTruth, models.length)
      return {
        eyebrow: 'Models',
        title: 'Recommendations',
        subtitle: 'Treat model advice as guidance until proof says otherwise.',
        primaryStatus: { label: 'Model status', value: posture.label, detail: posture.detail },
        primaryAction: { label: 'Best next step', value: 'Trust proof first', detail: 'Benchmark proof outranks confidence scores or catalog hints.' },
        proofState: { label: 'Evidence', value: evidence.label, detail: evidence.detail },
        optionalSecondaryStatus: { label: 'Catalog', value: `${models.length} artifact${models.length === 1 ? '' : 's'}`, detail: mlRuntimeTruth?.runtime_mode === 'onnx' ? 'A runtime-backed path is available.' : 'Recommendations are still advisory.' },
      }
    }
    case 'logs':
      return {
        eyebrow: 'Activity',
        title: 'History and undo',
        subtitle: 'See what changed and walk it back when needed.',
        primaryStatus: {
          label: 'Undo status',
          value: undoReadyCount > 0 ? 'Undo ready' : 'History empty',
          detail: undoReadyCount > 0 ? `${undoReadyCount} reversible change${undoReadyCount === 1 ? '' : 's'} can still be undone.` : 'Run one safe test and undo will appear here.',
        },
        primaryAction: { label: 'Best next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Recorded', value: `${optimizationRuntime.activity.length} event${optimizationRuntime.activity.length === 1 ? '' : 's'}`, detail: `${logs.length} support log${logs.length === 1 ? '' : 's'} stay secondary to the undo trail.` },
        optionalSecondaryStatus: { label: 'Proof', value: proof.label, detail: proof.detail },
      }
    case 'settings':
      return {
        eyebrow: 'Settings',
        title: 'Safe changes',
        subtitle: 'Choose what Aeterna may change before automation begins.',
        primaryStatus: { label: 'Change policy', value: authority.label, detail: authority.detail },
        primaryAction: {
          label: 'Best next step',
          value: featureFlags.network_optimizer ? 'Review allowed actions' : 'Allow safe changes',
          detail: featureFlags.network_optimizer ? 'Keep automation narrow and rollback-first.' : 'Performance changes stay blocked until you allow them here.',
        },
        proofState: { label: 'Telemetry', value: formatTelemetryMode(settings.telemetry_mode), detail: `Theme ${theme === 'dark' ? 'Dark' : 'Light'} | ${settings.telemetry_retention_days} day retention.` },
        optionalSecondaryStatus: { label: 'Session mode', value: formatAutomationMode(settings.automation_mode), detail: `${settings.active_profile} profile | ${connectionTitle}` },
      }
  }
}
