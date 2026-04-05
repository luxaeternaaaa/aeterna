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
        title: 'Session',
        subtitle: 'State, next step, proof.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Evidence', value: evidence.label, detail: evidence.detail },
      }
    case 'optimize':
      return {
        eyebrow: 'Optimize',
        title: 'Optimize',
        subtitle: 'Attach, baseline, one safe test.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Policy', value: authority.label, detail: authority.detail },
      }
    case 'tests':
      return {
        eyebrow: 'Tests',
        title: 'Tests',
        subtitle: 'Attach, baseline, compare, and verify.',
        primaryStatus: { label: 'Status', value: surfaceState.primaryStatus.label, detail: sessionStage.detail },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Proof', value: surfaceState.proofState.label, detail: proof.detail },
        optionalSecondaryStatus: { label: 'Evidence', value: evidence.label, detail: evidence.detail },
      }
    case 'safety':
      return {
        eyebrow: 'Safety',
        title: 'Safety',
        subtitle: 'Permissions, scope, rollback.',
        primaryStatus: {
          label: 'Status',
          value: security.status === 'high' ? 'Stop and inspect' : security.status === 'medium' ? 'Proceed carefully' : 'Low concern',
          detail: 'Local safety signals.',
        },
        primaryAction: {
          label: 'Next step',
          value: authority.label === 'Blocked' ? 'Review Settings' : 'Keep control manual',
          detail: authority.label === 'Blocked' ? authority.detail : 'Use proof before automation.',
        },
        proofState: { label: 'Data path', value: 'Local only', detail: 'On-device until policy changes.' },
        optionalSecondaryStatus: { label: 'Telemetry', value: formatTelemetryMode(settings.telemetry_mode), detail: security.auto_scan_enabled ? 'Auto review: on' : 'Auto review: off' },
      }
    case 'history':
      return {
        eyebrow: 'History',
        title: 'History',
        subtitle: 'Changes, proof, undo.',
        primaryStatus: {
          label: 'Undo',
          value: undoReadyCount > 0 ? 'Undo ready' : 'History empty',
          detail: undoReadyCount > 0 ? `${undoReadyCount} reversible change${undoReadyCount === 1 ? '' : 's'} ready.` : 'Run one safe test.',
        },
        primaryAction: { label: 'Next step', value: workflow.label, detail: workflow.detail },
        proofState: { label: 'Recorded', value: `${optimizationRuntime.activity.length} event${optimizationRuntime.activity.length === 1 ? '' : 's'}`, detail: `${logs.length} log${logs.length === 1 ? '' : 's'} stored.` },
        optionalSecondaryStatus: { label: 'Proof', value: proof.label, detail: proof.detail },
      }
    case 'settings':
      return {
        eyebrow: 'Settings',
        title: 'Settings',
        subtitle: 'Policy before automation.',
        primaryStatus: { label: 'Policy', value: authority.label, detail: authority.detail },
        primaryAction: {
          label: 'Next step',
          value: featureFlags.network_optimizer ? 'Review allowed actions' : 'Allow safe changes',
          detail: featureFlags.network_optimizer ? 'Keep scope narrow and reversible.' : 'Performance changes are blocked.',
        },
        proofState: { label: 'Telemetry', value: formatTelemetryMode(settings.telemetry_mode), detail: `${settings.telemetry_retention_days} day retention | ${theme}.` },
        optionalSecondaryStatus: { label: 'Mode', value: formatAutomationMode(settings.automation_mode), detail: `${settings.active_profile} | ${connectionTitle}` },
      }
  }
}
