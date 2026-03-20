import type { LogRecord, MlRuntimeTruth, ModelRecord, OptimizationRuntimeState, PageId, SecuritySummary, SessionState, SystemSettings } from '../types'

export type ThemeMode = 'dark' | 'light'

export type PageChrome = {
  eyebrow: string
  title: string
  subtitle: string
  question: string
  badges: string[]
}

type PageChromeInput = {
  activePage: PageId
  connectionTitle: string
  logs: LogRecord[]
  mlRuntimeTruth: MlRuntimeTruth | null
  models: ModelRecord[]
  optimizationRuntime: OptimizationRuntimeState
  security: SecuritySummary
  session: SessionState
  settings: SystemSettings
  theme: ThemeMode
  undoReadyCount: number
}

function formatAutomationMode(mode: SystemSettings['automation_mode']) {
  return mode === 'trusted_profiles' ? 'trusted profiles' : mode
}

function telemetryBadge(mode: SystemSettings['telemetry_mode']) {
  if (mode === 'live') return 'Live telemetry'
  if (mode === 'demo') return 'Demo telemetry'
  return 'Telemetry off'
}

export function getPageChrome(input: PageChromeInput): PageChrome {
  const { activePage, connectionTitle, logs, mlRuntimeTruth, models, optimizationRuntime, security, session, settings, theme, undoReadyCount } = input
  const onnxModels = models.filter((model) => model.inference_mode === 'onnx').length
  const fallbackModels = models.filter((model) => model.inference_mode !== 'onnx').length

  switch (activePage) {
    case 'dashboard':
      return {
        eyebrow: 'Dashboard',
        title: 'Control room',
        subtitle: 'Read the session, find the pressure point, and decide the next safe move without scrolling through policy screens.',
        question: 'Is this session healthy enough to keep playing, or does it need intervention now?',
        badges: [telemetryBadge(settings.telemetry_mode), `Session ${session.state}`, connectionTitle],
      }
    case 'optimization':
      return {
        eyebrow: 'Optimization',
        title: 'Operate the session',
        subtitle: 'Attach a game, inspect the current machine state, and apply only the changes that can be explained and rolled back.',
        question: 'What is attached, what is blocked, and which reversible test is worth trying next?',
        badges: [
          `Automation ${formatAutomationMode(settings.automation_mode)}`,
          `Capture ${optimizationRuntime.capture_status.quality}`,
          `Restore ${optimizationRuntime.session.auto_restore_pending ? 'pending' : 'ready'}`,
        ],
      }
    case 'security':
      return {
        eyebrow: 'Security',
        title: 'Trust posture',
        subtitle: 'Show the boundaries, current local classification, and the product rules that stop the optimizer from becoming shady.',
        question: 'Can this product be trusted on a real gaming machine with real anti-cheat risk?',
        badges: [`Status ${security.status}`, security.auto_scan_enabled ? 'Automatic scan' : 'Manual scan', 'Local only'],
      }
    case 'models':
      return {
        eyebrow: 'Models',
        title: 'ML reality check',
        subtitle: 'Separate real runtime-backed inference from fallback behavior so the interface never oversells the ML layer.',
        question: 'What is actually real here, and should I trust the model output yet?',
        badges: [
          `${models.length} registered`,
          mlRuntimeTruth ? `Runtime ${mlRuntimeTruth.runtime_mode}` : `${onnxModels} ONNX`,
          `${fallbackModels} fallback`,
        ],
      }
    case 'logs':
      return {
        eyebrow: 'Activity',
        title: 'Activity & rollback',
        subtitle: 'Track runtime changes, proof events, and restores so the optimizer feels inspectable and recoverable instead of magical.',
        question: 'What changed, what can still be undone, and what failed without explanation?',
        badges: [`${optimizationRuntime.activity.length} activity`, `${undoReadyCount} undo-ready`, `${logs.length} diagnostics`],
      }
    case 'settings':
      return {
        eyebrow: 'Settings',
        title: 'Policy and defaults',
        subtitle: 'Decide what the product may observe, automate, and store before any optional capability is allowed to act.',
        question: 'How much authority has this app been given, and is that authority still justified?',
        badges: [settings.active_profile, `Automation ${formatAutomationMode(settings.automation_mode)}`, `${theme === 'dark' ? 'Dark' : 'Light'} theme`],
      }
  }
}
