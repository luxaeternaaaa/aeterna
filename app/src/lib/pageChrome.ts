import type {
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  FeatureFlags,
  LogRecord,
  OptimizationRuntimeState,
  OptimizationSummary,
  PageId,
  SecuritySummary,
  SessionState,
  SystemSettings,
} from '../types'
import { getAuthorityStage, getEvidenceStage, getProofStage, getSessionStage, getSurfaceState, getWorkflowStep } from './productState'

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
    case 'home':
      return {
        eyebrow: 'Home',
        title: 'Current session',
        subtitle: 'See the state, the next move, and the latest proof at a glance.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Evidence', value: evidence.label, detail: evidence.detail },
      }
    case 'optimize':
      return {
        eyebrow: 'Optimize',
        title: 'Run one measured test',
        subtitle: 'Attach a game, capture a baseline, then change one thing at a time.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Policy', value: authority.label, detail: authority.detail },
      }
    case 'safety':
      return {
        eyebrow: 'Safety',
        title: 'Trust and boundaries',
        subtitle: 'See what Aeterna may read, change, block, and roll back.',
        primaryStatus: {
          label: 'Safety status',
          value: security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern',
          detail: 'Local safety signals tell you when to slow down.',
        },
        primaryAction: {
          label: 'Next step',
          value: authority.label === 'Blocked' ? 'Review Settings' : 'Keep control manual',
          detail: authority.label === 'Blocked' ? authority.detail : 'Use proof and rollback before you trust automation.',
        },
        proofState: { label: 'Data path', value: 'Local only', detail: 'Logs, scanning, and rollback stay on-device unless you change policy.' },
        optionalSecondaryStatus: { label: 'Telemetry', value: formatTelemetryMode(settings.telemetry_mode), detail: security.auto_scan_enabled ? 'Automatic safety review is on.' : 'Safety review stays manual by default.' },
      }
    case 'history':
      return {
        eyebrow: 'History',
        title: 'Timeline and undo',
        subtitle: 'See what changed, what was measured, and what can still be reverted.',
        primaryStatus: {
          label: 'Undo status',
          value: undoReadyCount > 0 ? 'Undo ready' : 'History empty',
          detail: undoReadyCount > 0 ? `${undoReadyCount} reversible change${undoReadyCount === 1 ? '' : 's'} can still be undone.` : 'Run one safe test and undo will appear here.',
        },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
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
