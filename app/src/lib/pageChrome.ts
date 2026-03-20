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
import { getAuthorityStage, getEvidenceStage, getModelPosture, getProofStage, getSessionStage, getWorkflowStep } from './productState'

export type ThemeMode = 'dark' | 'light'

type ChromeSignal = {
  detail: string
  label: string
  value: string
}

export type PageChrome = {
  eyebrow: string
  title: string
  subtitle: string
  signals: [ChromeSignal, ChromeSignal, ChromeSignal]
  details: string[]
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
        subtitle: 'See whether the session is healthy, what the app actually knows, and what safe move comes next.',
        signals: [
          { label: 'Current status', value: dashboard.session_health, detail: sessionStage.detail },
          { label: 'Next safe step', value: workflow.label, detail: workflow.detail },
          { label: 'Evidence quality', value: evidence.label, detail: evidence.detail },
        ],
        details: [sessionStage.label, proof.label, authority.label],
      }
    case 'optimization':
      return {
        eyebrow: 'Optimization',
        title: 'Run one safe test',
        subtitle: 'Attach a session, capture proof, and change one thing at a time so every win stays explainable.',
        signals: [
          { label: 'Current status', value: sessionStage.label, detail: sessionStage.detail },
          { label: 'Next safe step', value: workflow.label, detail: workflow.detail },
          { label: 'Authority', value: authority.label, detail: authority.detail },
        ],
        details: [proof.label, evidence.label, connectionTitle],
      }
    case 'security':
      return {
        eyebrow: 'Safety rules',
        title: 'Why this stays trustworthy',
        subtitle: 'This page explains the boundaries behind the product, not the daily workflow itself.',
        signals: [
          { label: 'Current status', value: security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern', detail: 'Local safety signals describe caution, not anti-cheat certainty.' },
          { label: 'Next safe step', value: authority.label, detail: authority.label === 'Blocked' ? authority.detail : 'Stay in Manual or Assisted mode until the product has proof on your machine.' },
          { label: 'Evidence quality', value: 'Local only', detail: 'Logs, scanning, and rollback stay on-device unless you explicitly change policy.' },
        ],
        details: [formatTelemetryMode(settings.telemetry_mode), security.auto_scan_enabled ? 'Auto scan on' : 'Manual scan', proof.label],
      }
    case 'models': {
      const posture = getModelPosture(mlRuntimeTruth, models.length)
      return {
        eyebrow: 'Models',
        title: 'Recommendation posture',
        subtitle: 'Use this page to understand how real the recommendation layer is before you let it influence a session.',
        signals: [
          { label: 'Current status', value: posture.label, detail: posture.detail },
          { label: 'Next safe step', value: 'Trust proof first', detail: 'Benchmark proof still outranks model confidence or catalog metadata.' },
          { label: 'Evidence quality', value: evidence.label, detail: evidence.detail },
        ],
        details: [`${models.length} artifacts`, mlRuntimeTruth?.runtime_mode === 'onnx' ? 'Runtime-backed path' : 'Advisory path', proof.label],
      }
    }
    case 'logs':
      return {
        eyebrow: 'Activity',
        title: 'What changed and how to undo it',
        subtitle: 'Use this page to confirm what actually ran, what is still reversible, and where proof links back to action.',
        signals: [
          { label: 'Current status', value: undoReadyCount > 0 ? 'Undo ready' : 'No undo yet', detail: undoReadyCount > 0 ? `${undoReadyCount} reversible change${undoReadyCount === 1 ? '' : 's'} are still available.` : 'Nothing reversible has been recorded yet.' },
          { label: 'Next safe step', value: workflow.label, detail: workflow.detail },
          { label: 'Evidence quality', value: `${optimizationRuntime.activity.length} events`, detail: `${logs.length} support log${logs.length === 1 ? '' : 's'} stay secondary to the rollback timeline.` },
        ],
        details: [proof.label, authority.label, sessionStage.label],
      }
    case 'settings':
      return {
        eyebrow: 'Settings',
        title: 'Policy before automation',
        subtitle: 'Decide what Aeterna may observe, change, and remember before you ask it to act on your machine.',
        signals: [
          { label: 'Current status', value: authority.label, detail: authority.detail },
          { label: 'Next safe step', value: featureFlags.network_optimizer ? 'Tune policy' : 'Allow safe changes', detail: featureFlags.network_optimizer ? 'Keep automation narrow and rollback-first.' : 'Performance changes stay blocked until you allow them here.' },
          { label: 'Evidence quality', value: formatTelemetryMode(settings.telemetry_mode), detail: `Theme ${theme === 'dark' ? 'Dark' : 'Light'} | ${settings.telemetry_retention_days} day retention.` },
        ],
        details: [formatAutomationMode(settings.automation_mode), settings.active_profile, connectionTitle],
      }
  }
}
