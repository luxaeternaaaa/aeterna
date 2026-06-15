import { useMemo, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  Cpu,
  Download,
  Gauge,
  Gamepad2,
  Layers,
  MemoryStick,
  MonitorUp,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  evidenceKeyForOptimizationRequest,
  loadMlDenyFunctionList,
  OPTIMIZATION_FUNCTIONS,
  type OptimizationFunctionDefinition,
} from '../lib/optimizationFunctions'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  BenchmarkDelta,
  BenchmarkEvidenceSummary,
  BenchmarkReport,
  BenchmarkWindow,
  GameProfile,
  OptimizationRuntimeState,
  ProcessSummary,
  RollbackResponse,
  TelemetryPoint,
} from '../types'

type TestMode = 'baseline' | 'optimized'
type TestPhase = 'idle' | 'ready' | 'countdown' | 'running' | 'baseline_ready' | 'completed' | 'failed'
type SetupStep = 'game' | 'duration'
type DurationPreset = 15 | 30 | 45 | 60 | 'custom'

interface TestsPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  benchmarkEvidence: BenchmarkEvidenceSummary[]
  latestBenchmark: BenchmarkReport | null
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<unknown> | void
  onCaptureBaseline: (sampleLimit: number, scenarioId?: string) => Promise<void>
  onClearSessionSelection: () => void
  onEndSession: () => void
  onOpenLogs: () => void
  onOpenSettings: () => void
  onRefresh: (processId?: number) => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  onRunBenchmark: (profileId?: string, sampleLimit?: number) => Promise<void>
  onSaveBenchmarkCsv: (csvId: string, suggestedName: string) => Promise<string | null>
  onSelectProcess: (processId: number) => void
  onStartCapture: () => Promise<void>
  onWaitForCapture: (processId: number) => Promise<void>
  onStopCapture: () => Promise<void>
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  registryPresetChangesEnabled: boolean
  runtimeState: OptimizationRuntimeState
  safeChangesEnabled: boolean
}

const DURATION_PRESETS: DurationPreset[] = [15, 30, 45, 60, 'custom']
const MAX_DURATION_SECONDS = 300
const TEST_START_DELAY_SECONDS = 3
const TESTABLE_FUNCTIONS = OPTIMIZATION_FUNCTIONS.filter((item) => !item.requiresReboot && item.benchmarkSafe)

function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function recommendedBenchmarkTweakId() {
  const deny = loadMlDenyFunctionList()
  return TESTABLE_FUNCTIONS.find((item) => item.mlDefault && !deny.has(item.id))?.id ?? null
}

const EXCLUDED_PROCESS_NAMES = new Set([
  'aeterna',
  'aeterna-core',
  'aeterna-sidecar',
  'applicationframehost',
  'battle.net',
  'cargo',
  'chrome',
  'cmd',
  'codex',
  'conhost',
  'cursor',
  'discord',
  'epicgameslauncher',
  'explorer',
  'firefox',
  'msedge',
  'node',
  'npm',
  'obs64',
  'powershell',
  'pwsh',
  'python',
  'pythonw',
  'riotclientservices',
  'searchhost',
  'steam',
  'tauri',
  'tsserver',
  'windows-terminal',
])

const KNOWN_GAME_PATTERNS: Array<(value: string) => boolean> = [
  (value) => value === 'cs2' || value === 'csgo' || value.includes('counterstrike'),
  (value) => value === 'valorant' || value.includes('valorantwin64shipping'),
  (value) => value.includes('fortniteclient'),
  (value) => value === 'r5apex' || value === 'apex' || value.includes('apexlegends'),
  (value) => value === 'dota2' || value.includes('dota2'),
  (value) => value === 'leagueoflegends' || value === 'leagueoflegendsclient',
  (value) => value === 'gta5' || value === 'gta_sa' || value === 'gtaiv',
  (value) => value === 'pubg' || value === 'tslgame',
  (value) => value === 'destiny2',
  (value) => value === 'rustclient',
  (value) => value === 'escapefromtarkov' || value.includes('tarkov'),
  (value) => value === 'eldenring',
  (value) => value === 'cyberpunk2077',
  (value) => value.includes('overwatch'),
  (value) => value === 'warzone' || value.includes('modernwarfare') || value.includes('callofduty') || /^cod\d*$/.test(value),
]

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '')
}

function matchesProfileKeyword(processName: string, keyword: string) {
  const value = normalizeName(processName)
  const marker = normalizeName(keyword)
  if (!marker || marker.length < 2) return false
  if (marker === 'cod') return value === 'cod' || /^cod\d*$/.test(value) || value.includes('callofduty')
  if (marker.length <= 3) return value === marker
  return value.includes(marker)
}

function isRealGameProcess(process: ProcessSummary | { name: string }, profiles: GameProfile[]) {
  const normalized = normalizeName(process.name)
  if (!normalized || EXCLUDED_PROCESS_NAMES.has(normalized)) return false
  if (profiles.some((profile) => profile.detection_keywords.some((keyword) => matchesProfileKeyword(process.name, keyword)))) return true
  return KNOWN_GAME_PATTERNS.some((test) => test(normalized))
}

function uniqueProcesses(runtimeState: OptimizationRuntimeState): ProcessSummary[] {
  const seen = new Set<number>()
  return [runtimeState.selected_process, ...runtimeState.processes, ...runtimeState.advanced_processes].filter((item): item is ProcessSummary => {
    if (!item || seen.has(item.pid)) return false
    seen.add(item.pid)
    return true
  })
}

function gameCandidateProcesses(runtimeState: OptimizationRuntimeState, profiles: GameProfile[]): ProcessSummary[] {
  const byPid = new Map<number, ProcessSummary>()

  if (runtimeState.detected_game) {
    const detected = {
      pid: runtimeState.detected_game.pid,
      name: runtimeState.detected_game.exe_name,
      priority_label: 'detected',
      affinity_label: 'detected',
    }
    if (isRealGameProcess(detected, profiles)) byPid.set(detected.pid, detected)
  }

  for (const process of uniqueProcesses(runtimeState)) {
    if (isRealGameProcess(process, profiles)) byPid.set(process.pid, process)
  }

  return Array.from(byPid.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function durationValue(preset: DurationPreset, customDuration: string) {
  if (preset !== 'custom') return preset
  const parsed = Number.parseInt(customDuration, 10)
  if (!Number.isFinite(parsed)) return 60
  return Math.max(1, Math.min(MAX_DURATION_SECONDS, parsed))
}

function waitForSeconds(seconds: number, onTick: (left: number) => void) {
  return new Promise<void>((resolve) => {
    let left = seconds
    onTick(left)
    const timer = window.setInterval(() => {
      left -= 1
      onTick(Math.max(left, 0))
      if (left <= 0) {
        window.clearInterval(timer)
        resolve()
      }
    }, 1000)
  })
}

async function minimizeAppWindow() {
  if (typeof window === 'undefined' || !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return
  await invoke('minimize_main_window')
}

function resolveProfileId(profiles: GameProfile[], selectedGame: ProcessSummary | null, runtimeState: OptimizationRuntimeState) {
  const recommended = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  if (recommended) return recommended
  const processName = selectedGame?.name ?? runtimeState.session.process_name ?? ''
  return profiles.find((profile) => profile.detection_keywords.some((keyword) => matchesProfileKeyword(processName, keyword)))?.id
}

function baselineBelongsToGame(baseline: BenchmarkWindow | null, selectedGame: ProcessSummary | null) {
  if (!baseline || !selectedGame) return false
  if (baseline.process_id != null) return baseline.process_id === selectedGame.pid
  return matchesProfileKeyword(baseline.game_name, selectedGame.name) || matchesProfileKeyword(selectedGame.name, baseline.game_name)
}

function formatMetric(value: number | null | undefined, unit = '', digits = 1) {
  if (value == null || Number.isNaN(value)) return 'n/a'
  return `${value.toFixed(digits)}${unit}`
}

function metricDelta(delta: BenchmarkDelta | null, key: keyof BenchmarkDelta, unit = '', digits = 1, multiplier = 1) {
  if (!delta) return 'baseline'
  const value = Number(delta[key]) * multiplier
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${unit}`
}

function isMetricBetter(delta: BenchmarkDelta | null, key: keyof BenchmarkDelta, higherIsBetter: boolean) {
  if (!delta) return null
  const value = Number(delta[key])
  if (Math.abs(value) < 0.001) return null
  return higherIsBetter ? value > 0 : value < 0
}

const DELTA_KEYS: Record<string, keyof BenchmarkDelta> = {
  'Average FPS': 'fps_avg',
  '1% Low FPS': 'fps_p1_low',
  '0.1% Low FPS': 'fps_p01_low',
  'Average frame time': 'frametime_avg_ms',
  'P95 frame time': 'frametime_p95_ms',
  'P99 frame time': 'frametime_p99_ms',
  'Frame drops': 'frame_drop_ratio',
  'Game CPU': 'cpu_process_pct',
  'Total CPU': 'cpu_total_pct',
  'GPU load': 'gpu_usage_pct',
  'RAM working set': 'ram_working_set_mb',
  Latency: 'ping',
  Jitter: 'jitter',
  'Packet loss': 'packet_loss',
  'Background CPU': 'background_cpu_pct',
}

function MetricCard({
  baseline,
  current,
  delta,
  higherIsBetter,
  icon: Icon,
  label,
  unit,
  digits = 1,
  multiplier = 1,
}: {
  baseline: number | null | undefined
  current: number | null | undefined
  delta: BenchmarkDelta | null
  higherIsBetter: boolean
  icon: LucideIcon
  label: string
  unit?: string
  digits?: number
  multiplier?: number
}) {
  const deltaKey = DELTA_KEYS[label]
  const better = deltaKey ? isMetricBetter(delta, deltaKey, higherIsBetter) : null
  const currentValue = current == null ? null : current * multiplier
  const baselineValue = baseline == null ? null : baseline * multiplier

  return (
    <article className="rounded-[1.15rem] bg-[#070b1b]/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(49,92,255,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className="text-white/90" size={22} />
          <div>
            <p className="text-sm font-semibold text-white/70">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{formatMetric(currentValue, unit, digits)}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            better == null ? 'bg-[#202942] text-white/60' : better ? 'bg-[#123d2d] text-[#4dff9b]' : 'bg-[#3d1218] text-[#ff6268]'
          }`}
        >
          {deltaKey ? metricDelta(delta, deltaKey, unit, digits, multiplier) : 'n/a'}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase text-white/36">Baseline {formatMetric(baselineValue, unit, digits)}</p>
    </article>
  )
}

function TogglePill({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`min-h-10 rounded-xl px-4 text-sm font-bold transition ${
        active ? 'bg-[#315cff] text-white shadow-[0_10px_25px_rgba(49,92,255,0.28)]' : 'bg-[#202942] text-white/76 hover:bg-[#2b3658]'
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function TweakRow({
  active,
  disabled,
  item,
  onToggle,
}: {
  active: boolean
  disabled: boolean
  item: OptimizationFunctionDefinition
  onToggle: () => void
}) {
  return (
    <button
      className={`flex w-full items-start gap-3 rounded-[1rem] px-4 py-3 text-left transition ${
        active ? 'bg-[#16285d] ring-1 ring-[#315cff]/80' : 'bg-[#070b1b]/88 hover:bg-[#101936]'
      } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${active ? 'bg-[#315cff]' : 'bg-[#202942]'}`}>
        {active ? <Check size={15} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-white">{item.title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/54">{item.description}</span>
        {item.processRequired ? <span className="mt-2 inline-block rounded-md bg-[#315cff]/55 px-2 py-0.5 text-[11px] font-black">GAME</span> : null}
      </span>
    </button>
  )
}

function ModeButton({
  active,
  description,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  description: string
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-4 text-left transition ${
        active ? 'bg-[#315cff] text-white shadow-[0_18px_35px_rgba(49,92,255,0.25)]' : 'bg-[#111936] text-white/82 hover:bg-[#1a2550]'
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10">
        <Icon size={22} />
      </span>
      <span>
        <span className="block text-base font-black">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-white/58">{description}</span>
      </span>
    </button>
  )
}

function CsvDownloadLink({
  csvId,
  onSave,
  label,
  suggestedName,
}: {
  csvId?: string | null
  label: string
  onSave: (csvId: string, suggestedName: string) => void
  suggestedName: string
}) {
  if (!csvId) return null
  return (
    <button
      className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#202942] px-3 text-xs font-black text-[#8fb0ff] transition hover:bg-[#2b3658]"
      onClick={() => onSave(csvId, suggestedName)}
      type="button"
    >
      <Download size={15} />
      <span>{label}</span>
    </button>
  )
}

const EVIDENCE_METRIC_LABELS: Record<string, string> = {
  fps_1pct: '1% Low FPS',
  frametime_p95: 'P95 frame time',
  frametime_p99: 'P99 frame time',
}

function signedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function EvidenceCard({ evidence }: { evidence: BenchmarkEvidenceSummary }) {
  const statusTone =
    evidence.status === 'consistent-improvement'
      ? 'text-[#4dff9b]'
      : evidence.status === 'consistent-regression'
        ? 'text-[#ff6268]'
        : 'text-[#ffcf5a]'
  return (
    <article className="rounded-[1.35rem] bg-[#0d1530] px-5 py-4 ring-1 ring-[#315cff]/35">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7ba2ff]">Repeated evidence</p>
          <h3 className="mt-1 text-lg font-black text-white">{evidence.action_title}</h3>
          <p className="mt-1 text-sm text-white/52">{evidence.game_name}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-black ${statusTone}`}>{evidence.status.replaceAll('-', ' ')}</p>
          <p className="mt-1 text-xs font-bold text-white/46">
            {evidence.trial_count}/{evidence.minimum_trials_required} A/B pairs · {evidence.window_seconds}s · {evidence.evidence_level}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/66">{evidence.summary}</p>
      <p className="mt-2 text-xs font-semibold text-white/42">
        Scenario: {evidence.scenario_id} · protocol {evidence.protocol_version} · environment {evidence.environment_fingerprint}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/36">
        Environment fingerprint covers the local OS build and CPU architecture. GPU driver version and exact scene execution still require manual control.
      </p>
      <p className="mt-1 text-xs leading-5 text-white/36">
        The Student-t interval assumes independent, comparable A/B pairs. It is local repeatability evidence, not proof for other systems.
      </p>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {evidence.metrics.map((metric) => (
          <div className="rounded-xl bg-[#070b1b]/88 px-3 py-3" key={metric.metric}>
            <p className="text-xs font-bold uppercase text-white/38">{EVIDENCE_METRIC_LABELS[metric.metric] ?? metric.metric}</p>
            <p className="mt-1 text-lg font-black text-white">{signedPercent(metric.mean_effect_pct)}</p>
            <p className="mt-1 text-xs text-white/48">
              {metric.ci95_low_pct == null || metric.ci95_high_pct == null
                ? '95% CI after a second pair'
                : `95% CI ${signedPercent(metric.ci95_low_pct)} to ${signedPercent(metric.ci95_high_pct)}`}
            </p>
            <p className="mt-1 text-xs font-semibold text-white/42">{metric.direction_consistency_pct.toFixed(0)}% direction consistency</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-white/48">{evidence.recommended_next_step}</p>
    </article>
  )
}

function phaseLabel(phase: TestPhase, activeMode: TestMode | null) {
  if (phase === 'countdown') return 'Starting'
  if (phase === 'running') return activeMode === 'baseline' ? 'Baseline running' : 'Optimized running'
  if (phase === 'baseline_ready') return 'Baseline ready'
  if (phase === 'completed') return 'Comparison ready'
  if (phase === 'failed') return 'Failed'
  return activeMode ? 'Setup' : 'Choose test'
}

function isAlreadyActivePreset(reason?: string | null) {
  return reason?.toLowerCase().includes('already active') ?? false
}

export function TestsPage({
  benchmarkBaseline,
  benchmarkBusy,
  benchmarkEvidence,
  latestBenchmark,
  onApplyRegistryPreset,
  onApplyTweak,
  onAttachSession,
  onCaptureBaseline,
  onClearSessionSelection,
  onEndSession,
  onOpenLogs,
  onOpenSettings,
  onRefresh,
  onRollbackSnapshot,
  onRunBenchmark,
  onSaveBenchmarkCsv,
  onSelectProcess,
  onStartCapture,
  onWaitForCapture,
  onStopCapture,
  profiles,
  realtime,
  registryPresetChangesEnabled,
  runtimeState,
  safeChangesEnabled,
}: TestsPageProps) {
  const gameProcesses = useMemo(() => gameCandidateProcesses(runtimeState, profiles), [profiles, runtimeState])
  const [activeMode, setActiveMode] = useState<TestMode | null>(null)
  const [setupStep, setSetupStep] = useState<SetupStep | null>(null)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>(60)
  const [customDuration, setCustomDuration] = useState('60')
  const [selectedTweakId, setSelectedTweakId] = useState<string | null>(() => recommendedBenchmarkTweakId())
  const [phase, setPhase] = useState<TestPhase>('idle')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [appliedSnapshots, setAppliedSnapshots] = useState<Array<{ id: string; title: string }>>([])

  const selectedGame = selectedPid == null ? null : gameProcesses.find((game) => game.pid === selectedPid) ?? null
  const durationSeconds = durationValue(durationPreset, customDuration)
  const profileId = resolveProfileId(profiles, selectedGame, runtimeState)
  const hasBaseline = baselineBelongsToGame(benchmarkBaseline, selectedGame)
  const hasRealBaseline = hasBaseline && benchmarkBaseline?.capture_source === 'presentmon'
  const reportBaseline = hasRealBaseline ? benchmarkBaseline : null
  const isRunning = phase === 'countdown' || phase === 'running' || benchmarkBusy
  const canCaptureRealFps = runtimeState.capture_status.helper_available
  const baselineSessionMatches =
    hasRealBaseline &&
    Boolean(benchmarkBaseline?.session_id) &&
    benchmarkBaseline?.session_id === runtimeState.session.session_id &&
    benchmarkBaseline?.process_id === runtimeState.session.process_id
  const baselineDurationMatches = benchmarkBaseline?.requested_window_seconds === durationSeconds
  const selectedDefinition = TESTABLE_FUNCTIONS.find((item) => item.id === selectedTweakId) ?? null
  const selectedRequest = selectedDefinition && selectedGame
    ? selectedDefinition.buildRequest({ processId: selectedGame.pid, runtimeState })
    : null
  const selectedPresetSummary =
    selectedRequest?.kind === 'preset'
      ? runtimeState.registry_presets.find((preset) => preset.id === selectedRequest.payload.preset_id) ?? null
      : null
  const selectedActionKey = evidenceKeyForOptimizationRequest(selectedRequest)
  const activeScenarioId = benchmarkBaseline?.scenario_id ?? ''
  const selectedEvidence =
    selectedGame && selectedActionKey
      ? benchmarkEvidence.filter(
          (item) =>
            item.action_key === selectedActionKey &&
            item.game_name.trim().toLowerCase() === selectedGame.name.trim().toLowerCase() &&
            item.scenario_id.trim().toLowerCase() === activeScenarioId.trim().toLowerCase() &&
            (!profileId || !item.profile_id || item.profile_id === profileId),
        )
      : []
  const selectedPolicyBlock = !safeChangesEnabled
    ? 'Safe optimization changes are disabled in Settings.'
    : selectedRequest?.kind === 'preset' && !registryPresetChangesEnabled
      ? 'System preset changes are disabled in Settings.'
      : selectedPresetSummary?.blocking_reason ?? null
  const canStart =
    activeMode === 'baseline'
      ? Boolean(selectedGame && canCaptureRealFps && !isRunning)
      : Boolean(
          selectedGame &&
            canCaptureRealFps &&
            baselineSessionMatches &&
            baselineDurationMatches &&
            selectedTweakId &&
            !selectedPolicyBlock &&
            !isRunning,
        )
  const latestForSelectedGame =
    selectedGame &&
    latestBenchmark &&
    reportBaseline &&
    (latestBenchmark.baseline.csv_id && reportBaseline.csv_id
      ? latestBenchmark.baseline.csv_id === reportBaseline.csv_id
      : latestBenchmark.baseline.captured_at === reportBaseline.captured_at)
      ? latestBenchmark
      : null
  const currentWindow = latestForSelectedGame?.current ?? reportBaseline
  const delta = latestForSelectedGame?.delta ?? null

  const saveCsv = async (csvId: string, suggestedName: string) => {
    setErrorText(null)
    try {
      const savedPath = await onSaveBenchmarkCsv(csvId, suggestedName)
      setStatus(savedPath ? `CSV saved: ${savedPath}` : 'CSV save was canceled.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'CSV save failed.')
    }
  }

  const chooseMode = (mode: TestMode) => {
    setActiveMode(mode)
    setPhase('ready')
    setSetupStep('game')
    setStatus(null)
    setErrorText(null)
    onRefresh()
  }

  const attachSelectedGame = async () => {
    if (!selectedGame) throw new Error('No running game was selected.')
    onSelectProcess(selectedGame.pid)
    await Promise.resolve(onAttachSession({ process_id: selectedGame.pid, process_name: selectedGame.name }))
    return selectedGame
  }

  const startCountdown = async () => {
    setPhase('countdown')
    setStatus('Switch to the game now. The test will start automatically in 3 seconds.')
    await waitForSeconds(TEST_START_DELAY_SECONDS, setSecondsLeft)
    await minimizeAppWindow()
    setPhase('running')
  }

  const runBaseline = async () => {
    if (!selectedGame || isRunning) return
    setErrorText(null)
    let captureStarted = false
    try {
      const game = await attachSelectedGame()
      await onStartCapture()
      captureStarted = true
      await startCountdown()
      setStatus('Waiting for PresentMon to receive real frames from the game.')
      await onWaitForCapture(game.pid)
      setStatus('Baseline capture is running. Stay in the same game scene until the timer ends.')
      await waitForSeconds(durationSeconds, setSecondsLeft)
      setStatus('Saving baseline metrics.')
      await onCaptureBaseline(durationSeconds, `Quick test ${game.name} ${new Date().toISOString()}`)
      setPhase('baseline_ready')
      setStatus(`Baseline saved for ${game.name}. Now run the optimized test for a comparison report.`)
    } catch (error) {
      setPhase('failed')
      setErrorText(formatUnknownError(error, 'Baseline test failed.'))
    } finally {
      if (captureStarted) {
        try {
          await onStopCapture()
        } catch {
          setErrorText((current) => current ?? 'The test finished, but PresentMon could not be stopped cleanly.')
        }
      }
    }
  }

  const applySelectedTweak = async (game: ProcessSummary) => {
    if (!selectedTweakId) throw new Error('Select exactly one change to test.')
    const item = TESTABLE_FUNCTIONS.find((definition) => definition.id === selectedTweakId)
    if (!item) throw new Error('The selected test change is unavailable.')
    const request = item.buildRequest({ processId: game.pid, runtimeState })
    if (!request) throw new Error(`${item.title} is not applicable to this game session.`)

    let snapshotId: string
    if (request.kind === 'tweak') {
      const result = await onApplyTweak(request.payload)
      snapshotId = result.snapshot.id
    } else {
      const result = await onApplyRegistryPreset(request.payload)
      if (result.status !== 'applied' || !result.snapshot) {
        if (isAlreadyActivePreset(result.blocking_reason)) {
          throw new Error(`${item.title} is already active. Roll it back before capturing a proof baseline.`)
        }
        throw new Error(result.blocking_reason ?? `Failed to apply ${item.title}.`)
      }
      snapshotId = result.snapshot.id
    }

    const snapshot = { id: snapshotId, title: item.title }
    setAppliedSnapshots((current) => [...current, snapshot])
    return snapshot
  }

  const runOptimized = async () => {
    if (!canStart || !selectedGame) return
    setErrorText(null)
    let captureStarted = false
    try {
      if (!baselineSessionMatches) {
        throw new Error('The baseline session is no longer active. Capture a new baseline before testing a change.')
      }
      const game = selectedGame
      const testedTweak = await applySelectedTweak(game)
      await onStartCapture()
      captureStarted = true
      await startCountdown()
      setStatus(`Applied ${testedTweak.title}. Waiting for PresentMon to receive real frames.`)
      await onWaitForCapture(game.pid)
      setStatus('Capturing optimized metrics. Stay in the same game scene until the timer ends.')
      await waitForSeconds(durationSeconds, setSecondsLeft)
      setStatus('Saving optimized metrics and comparison.')
      await onRunBenchmark(profileId, durationSeconds)
      setPhase('completed')
      setStatus('Comparison report is ready.')
    } catch (error) {
      setPhase('failed')
      setErrorText(formatUnknownError(error, 'Optimized test failed.'))
    } finally {
      if (captureStarted) {
        try {
          await onStopCapture()
        } catch {
          setErrorText((current) => current ?? 'The test finished, but PresentMon could not be stopped cleanly.')
        }
      }
    }
  }

  const startSelectedMode = () => {
    setSetupStep(null)
    if (activeMode === 'baseline') void runBaseline()
    if (activeMode === 'optimized') void runOptimized()
  }

  const rollbackTweaks = async () => {
    if (appliedSnapshots.length === 0 || isRunning) return
    setErrorText(null)
    try {
      for (const snapshot of [...appliedSnapshots].reverse()) {
        await onRollbackSnapshot(snapshot.id, selectedGame?.pid)
      }
      setAppliedSnapshots([])
      setStatus('Applied test tweaks were rolled back.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Rollback failed.')
    }
  }

  const selectRecommendedTweak = () => setSelectedTweakId(recommendedBenchmarkTweakId())

  const stopSession = () => {
    onEndSession()
    onClearSessionSelection()
    setPhase(activeMode ? 'ready' : 'idle')
    setSetupStep(null)
    setSecondsLeft(0)
    setStatus('Test session stopped.')
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-5 px-2 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Tests</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">Choose a pass, capture the game, then compare the real metrics.</p>
        </div>
        <div className="flex items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={() => onRefresh()} type="button">
            <RefreshCw size={17} />
            <span>Update</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={onOpenLogs} type="button">
            <BarChart3 size={17} />
            <span>Reports</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={onOpenSettings} type="button">
            <Settings size={17} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {activeMode && setupStep ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-[#020617]/74 px-5 backdrop-blur-sm">
          <section className="w-full max-w-[860px] rounded-[1.5rem] bg-[#070b1b] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(123,162,255,0.12)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7ba2ff]">
                  {activeMode === 'baseline' ? 'Baseline test' : 'Optimized test'}
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  {setupStep === 'game' ? 'Select running game' : 'Select capture duration'}
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-white/54">
                  {setupStep === 'game'
                    ? 'Only real game processes are shown. Start CS2 or another game, then press Update if the list is empty.'
                    : 'Choose the capture time. After you press Start, you will have 3 seconds to switch to the game.'}
                </p>
              </div>
              <button
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#202942] text-white/70 hover:bg-[#2b3658]"
                onClick={() => setSetupStep(null)}
                type="button"
              >
                <X size={19} />
              </button>
            </div>

            {setupStep === 'game' ? (
              <div className="space-y-3">
                <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
                  {gameProcesses.length > 0 ? (
                    gameProcesses.map((game) => (
                      <button
                        key={game.pid}
                        className={`flex w-full items-center justify-between gap-3 rounded-[1rem] px-4 py-4 text-left transition ${
                          selectedPid === game.pid ? 'bg-[#315cff]' : 'bg-[#111936] hover:bg-[#1a2550]'
                        }`}
                        disabled={isRunning}
                        onClick={() => {
                          setSelectedPid(game.pid)
                          setSetupStep('duration')
                        }}
                        type="button"
                      >
                        <span>
                          <span className="block text-lg font-black text-white">{game.name}</span>
                          <span className="mt-1 block text-sm font-semibold text-white/50">PID {game.pid}</span>
                        </span>
                        {selectedPid === game.pid ? <Check size={20} /> : <Gamepad2 size={20} className="text-white/58" />}
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[1rem] bg-[#111936] px-5 py-7">
                      <p className="text-lg font-black text-white">No real games are running right now.</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-white/56">Start CS2 or another supported game, wait for it to appear in Task Manager, then refresh this list.</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button className="min-h-11 rounded-xl bg-[#202942] px-5 text-sm font-black" onClick={() => onRefresh()} type="button">
                    Update list
                  </button>
                </div>
              </div>
            ) : null}

            {setupStep === 'duration' ? (
              <div>
                <div className="mb-4 rounded-[1rem] bg-[#111936] px-4 py-3">
                  <p className="text-xs font-black uppercase text-white/38">Selected game</p>
                  <p className="mt-1 text-xl font-black">{selectedGame?.name ?? 'Not selected'}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-5">
                  {DURATION_PRESETS.map((preset) => (
                    <TogglePill key={preset} active={durationPreset === preset} onClick={() => setDurationPreset(preset)}>
                      {preset === 'custom' ? 'Custom' : `${preset}s`}
                    </TogglePill>
                  ))}
                </div>
                {durationPreset === 'custom' ? (
                  <label className="mt-4 block">
                    <span className="text-xs font-bold uppercase text-white/38">Seconds, max 300</span>
                    <input
                      className="mt-2 h-12 w-full rounded-xl bg-[#202942] px-4 text-lg font-black text-white outline-none"
                      max={MAX_DURATION_SECONDS}
                      min={1}
                      onChange={(event) => setCustomDuration(event.target.value.replace(/\D/g, '').slice(0, 3))}
                      type="number"
                      value={customDuration}
                    />
                  </label>
                ) : null}
                <p className="mt-4 rounded-xl bg-[#152b5c] px-4 py-3 text-sm font-semibold leading-6 text-[#9bb7ff]">
                  After pressing Start, switch to the game immediately. Capture begins automatically after a 3-second countdown.
                </p>
                <div className="mt-5 flex justify-between gap-2">
                  <button className="min-h-11 rounded-xl bg-[#202942] px-5 text-sm font-black" onClick={() => setSetupStep('game')} type="button">
                    Back
                  </button>
                  <button
                    className="min-h-11 rounded-xl bg-[#315cff] px-6 text-sm font-black disabled:cursor-not-allowed disabled:bg-white/25"
                    disabled={!canStart}
                    onClick={startSelectedMode}
                    type="button"
                  >
                    {activeMode === 'baseline' ? 'Start baseline test' : 'Run optimized test'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {phase === 'countdown' ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#020617]/92 px-5 backdrop-blur-md">
          <section
            aria-live="assertive"
            className="w-full max-w-xl rounded-[2rem] bg-[#070b1b] px-8 py-10 text-center shadow-[0_28px_90px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgba(123,162,255,0.18)]"
          >
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#7ba2ff]">Test starts soon</p>
            <p className="mt-5 text-8xl font-black leading-none text-white">{secondsLeft}</p>
            <h2 className="mt-6 text-3xl font-black text-white">Switch to the game now</h2>
            <p className="mx-auto mt-3 max-w-md text-base font-semibold leading-7 text-white/62">
              Stay in the selected game scene. Aeterna will minimize automatically and start capture when the countdown ends.
            </p>
          </section>
        </div>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(310px,370px)_minmax(0,1fr)] gap-5">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
            <h2 className="mb-3 text-xl font-black">Test type</h2>
            <div className="space-y-3">
              <ModeButton
                active={activeMode === 'baseline'}
                description="Clean pass without applying tweaks."
                icon={Timer}
                label="Start Baseline Test"
                onClick={() => chooseMode('baseline')}
              />
              <ModeButton
                active={activeMode === 'optimized'}
                description="Apply selected tweaks and compare against baseline."
                icon={Play}
                label="Run Optimized Test"
                onClick={() => chooseMode('optimized')}
              />
            </div>
          </section>

          {activeMode ? (
            <>
              <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">Game capture</h2>
                  <Gamepad2 size={21} className="text-white/70" />
                </div>
                <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1">
                  {gameProcesses.length > 0 ? (
                    gameProcesses.map((game) => (
                      <button
                        key={game.pid}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                          selectedGame?.pid === game.pid ? 'bg-[#315cff] text-white' : 'bg-[#111936] text-white/82 hover:bg-[#1a2550]'
                        }`}
                        disabled={isRunning}
                        onClick={() => setSelectedPid(game.pid)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-base font-bold">{game.name}</span>
                          <span className="mt-0.5 block text-xs text-white/50">PID {game.pid}</span>
                        </span>
                        {selectedGame?.pid === game.pid ? <Check size={18} /> : null}
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl bg-[#111936] px-4 py-5 text-sm leading-6 text-white/62">
                      No games are running right now. Start a real game, then click Update.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
                <button
                  className="flex min-h-14 w-full items-center gap-3 rounded-[1rem] bg-[#111936] px-4 text-left text-white/72"
                  disabled
                  type="button"
                >
                  <MonitorUp size={22} className="text-[#7ba2ff]" />
                  <span>
                    <span className="block text-base font-black text-white">Overlay</span>
                    <span className="mt-1 block text-xs font-semibold text-[#ffcf5a]">In development</span>
                  </span>
                </button>
              </section>

              <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
                <p className="text-xs font-bold uppercase text-white/38">Capture engine</p>
                <p className="mt-2 text-lg font-black text-white">
                  {runtimeState.capture_status.helper_available ? 'PresentMon' : 'PresentMon unavailable'}
                </p>
                <p className={`mt-1 text-sm font-semibold ${runtimeState.capture_status.source === 'presentmon' ? 'text-[#7ba2ff]' : 'text-[#ffcf5a]'}`}>
                  {runtimeState.capture_status.source === 'presentmon'
                    ? 'Real FPS and frame-time capture is active'
                    : runtimeState.capture_status.helper_available
                      ? 'Ready. PresentMon starts only for the 3-second countdown and test'
                      : 'Run Aeterna as administrator for real FPS capture'}
                </p>
                {runtimeState.capture_status.note ? <p className="mt-2 text-xs leading-5 text-white/48">{runtimeState.capture_status.note}</p> : null}
              </section>
            </>
          ) : null}

          {activeMode && selectedGame ? (
            <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
              <h2 className="mb-3 text-xl font-black">Duration</h2>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <TogglePill key={preset} active={durationPreset === preset} onClick={() => setDurationPreset(preset)}>
                    {preset === 'custom' ? 'Custom' : `${preset}s`}
                  </TogglePill>
                ))}
              </div>
              {durationPreset === 'custom' ? (
                <label className="mt-3 block">
                  <span className="text-xs font-bold uppercase text-white/38">Seconds, max 300</span>
                  <input
                    className="mt-2 h-11 w-full rounded-xl bg-[#202942] px-4 text-base font-bold text-white outline-none"
                    max={MAX_DURATION_SECONDS}
                    min={1}
                    onChange={(event) => setCustomDuration(event.target.value.replace(/\D/g, '').slice(0, 3))}
                    type="number"
                    value={customDuration}
                  />
                </label>
              ) : null}

              {activeMode === 'optimized' && !hasRealBaseline ? (
                <p className="mt-4 rounded-xl bg-[#3d1218]/70 px-4 py-3 text-sm font-semibold text-[#ff8a8f]">
                  Capture a real PresentMon baseline for this game before running the optimized comparison.
                </p>
              ) : null}
              {activeMode === 'optimized' && hasRealBaseline && !baselineSessionMatches ? (
                <p className="mt-4 rounded-xl bg-[#3d1218]/70 px-4 py-3 text-sm font-semibold text-[#ff8a8f]">
                  The original baseline session ended or changed. Capture a fresh baseline without reattaching the game.
                </p>
              ) : null}
              {activeMode === 'optimized' && hasRealBaseline && benchmarkBaseline?.scenario_id && !baselineDurationMatches ? (
                <p className="mt-4 rounded-xl bg-[#3d1218]/70 px-4 py-3 text-sm font-semibold text-[#ff8a8f]">
                  Use the same {benchmarkBaseline.requested_window_seconds ?? 'baseline'}s window for the optimized half of this pair.
                </p>
              ) : null}
              {activeMode === 'optimized' && selectedPolicyBlock ? (
                <p className="mt-4 rounded-xl bg-[#3d2512]/80 px-4 py-3 text-sm font-semibold text-[#ffcf5a]">
                  {selectedPolicyBlock} Resolve this requirement, then refresh the runtime state.
                </p>
              ) : null}

              <button
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#315cff] px-4 text-base font-bold disabled:cursor-not-allowed disabled:bg-white/30"
                disabled={!canStart}
                onClick={() => {
                  if (selectedGame) startSelectedMode()
                  else setSetupStep('game')
                }}
                type="button"
              >
                {activeMode === 'baseline' ? <Timer size={19} /> : <Play size={19} />}
                <span>{activeMode === 'baseline' ? 'Start capture' : 'Run optimized capture'}</span>
              </button>

              <button
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#202942] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
                disabled={appliedSnapshots.length === 0 || isRunning}
                onClick={() => void rollbackTweaks()}
                type="button"
              >
                <RotateCcw size={17} />
                <span>Rollback test tweaks</span>
              </button>
            </section>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-5">
          <div className="grid shrink-0 gap-3 lg:grid-cols-3">
            {[
              { label: 'Selected pass', value: activeMode === 'baseline' ? 'Baseline' : activeMode === 'optimized' ? 'Optimized' : 'Choose', icon: Layers },
              { label: 'Game', value: selectedGame?.name ?? 'Not selected', icon: Gamepad2 },
              { label: 'Phase', value: phaseLabel(phase, activeMode), icon: Activity },
            ].map((item) => {
              const Icon = item.icon
              return (
                <article key={item.label} className="rounded-[1.35rem] bg-[#070b1b]/86 px-5 py-4">
                  <Icon size={22} className="text-white/80" />
                  <p className="mt-5 text-sm font-bold text-white/48">{item.label}</p>
                  <p className="mt-1 truncate text-xl font-black text-white">{item.value}</p>
                </article>
              )
            })}
          </div>

          {!activeMode ? (
            <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-7">
              <div className="flex items-start gap-4">
                <Sparkles className="mt-1 text-[#7ba2ff]" size={28} />
                <div>
                  <h2 className="text-2xl font-black">Choose how to test</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
                    Start with a baseline pass. After it finishes, select the optimized pass, pick tweaks, and repeat the same in-game scene for a fair comparison.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {activeMode === 'optimized' && selectedGame ? (
            <section className="rounded-[1.35rem] bg-[#070b1b]/70 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Tweaks for optimized pass</h2>
                  <p className="mt-1 text-sm text-white/48">
                    Select exactly one change. Testing a bundle cannot identify which action caused the result.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-[#202942] px-4 py-2 text-sm font-bold" disabled={isRunning} onClick={selectRecommendedTweak} type="button">
                    Recommended candidate
                  </button>
                  <button className="rounded-xl bg-[#202942] px-4 py-2 text-sm font-bold" disabled={isRunning} onClick={() => setSelectedTweakId(null)} type="button">
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid max-h-[270px] gap-2 overflow-y-auto pr-1 xl:grid-cols-2">
                {TESTABLE_FUNCTIONS.map((item) => (
                  <TweakRow
                    key={item.id}
                    active={selectedTweakId === item.id}
                    disabled={isRunning}
                    item={item}
                    onToggle={() => setSelectedTweakId((current) => (current === item.id ? null : item.id))}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {activeMode === 'optimized' && selectedGame && selectedDefinition ? (
            selectedEvidence.length > 0 ? (
              <div className="grid gap-3">
                {selectedEvidence.map((evidence) => (
                  <EvidenceCard evidence={evidence} key={`${evidence.action_key}-${evidence.scenario_id}-${evidence.environment_fingerprint}`} />
                ))}
              </div>
            ) : (
              <article className="rounded-[1.35rem] bg-[#0d1530] px-5 py-4 ring-1 ring-[#315cff]/25">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7ba2ff]">Repeated evidence</p>
                <h3 className="mt-1 text-lg font-black text-white">{selectedDefinition.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  No comparable live A/B pairs are stored for this game. Complete a baseline and optimized pass to create the first local evidence point.
                </p>
              </article>
            )
          ) : null}

          {isRunning || status || errorText ? (
            <section
              className={`rounded-[1.35rem] px-5 py-4 ${
                isRunning ? 'bg-[#10255b] shadow-[inset_0_0_0_1px_rgba(123,162,255,0.22)]' : 'bg-[#070b1b]/88'
              }`}
            >
              {isRunning ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Timer size={22} className="text-[#7ba2ff]" />
                    <div>
                      <p className="text-lg font-black">{phase === 'countdown' ? 'Test starts in 3 seconds' : 'Test is running'}</p>
                      <p className="mt-1 text-sm font-semibold text-white/68">
                        {phase === 'countdown'
                          ? 'Switch to the game now. Capture starts automatically when the countdown ends.'
                          : 'Stay in the selected game scene until the timer ends.'}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#315cff] px-5 py-2 text-xl font-black">{secondsLeft > 0 ? `${secondsLeft}s` : 'Saving'}</span>
                </div>
              ) : null}
              {status && !isRunning ? <p className="text-sm font-semibold text-white/70">{status}</p> : null}
              {errorText ? (
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#ff6268]">
                  <AlertTriangle size={17} />
                  {errorText}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="min-h-0 flex-1 overflow-y-auto pr-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Report</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">
                  {durationSeconds}s window
                </span>
                <button
                  className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70 disabled:opacity-45"
                  disabled={isRunning}
                  onClick={stopSession}
                  type="button"
                >
                  Stop session
                </button>
              </div>
            </div>

            {!selectedGame || !reportBaseline || !currentWindow ? (
              <div className="rounded-[1.35rem] bg-[#070b1b]/88 p-6 text-white/60">
                {!activeMode
                  ? 'Choose a test type to begin.'
                  : !selectedGame
                    ? gameProcesses.length === 0
                      ? 'No real games are running right now.'
                      : 'Choose a running game.'
                    : benchmarkBaseline && hasBaseline && !hasRealBaseline
                      ? 'Old degraded fallback report was ignored. Run a new baseline with PresentMon active.'
                      : 'No report yet. Start the baseline capture for the selected game.'}
              </div>
            ) : (
              <>
                <div className="mb-4 grid gap-3 lg:grid-cols-2">
                  <article className="rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
                    <p className="text-sm font-bold uppercase text-white/38">Baseline</p>
                    <p className="mt-2 text-2xl font-black text-white">{reportBaseline.game_name}</p>
                    <p className="mt-1 text-sm text-white/50">
                      {reportBaseline.sample_count} samples, {reportBaseline.capture_source}
                      {reportBaseline.presentmon_frame_count ? `, ${reportBaseline.presentmon_frame_count} frames` : ''}
                    </p>
                    <div className="mt-3">
                      <CsvDownloadLink
                        csvId={reportBaseline.csv_id}
                        label="Download baseline CSV"
                        onSave={(csvId, fileName) => void saveCsv(csvId, fileName)}
                        suggestedName={`${reportBaseline.csv_id ?? 'baseline'}.csv`}
                      />
                    </div>
                  </article>
                  <article className="rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
                    <p className="text-sm font-bold uppercase text-white/38">Optimized</p>
                    <p className="mt-2 text-2xl font-black text-white">{latestForSelectedGame?.game_name ?? 'Not captured yet'}</p>
                    <p className="mt-1 text-sm text-white/50">
                      {latestForSelectedGame?.summary ?? 'Run the optimized test after selecting tweaks.'}
                    </p>
                    {latestForSelectedGame ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#202942] px-3 py-1 text-xs font-black text-[#8fb0ff]">
                          {latestForSelectedGame.evidence_level ?? 'Legacy report'}
                        </span>
                        <span className="rounded-full bg-[#202942] px-3 py-1 text-xs font-black text-white/65">
                          {latestForSelectedGame.evidence_status ?? latestForSelectedGame.evidence_quality}
                        </span>
                        <span className="rounded-full bg-[#202942] px-3 py-1 text-xs font-black text-white/65">
                          {latestForSelectedGame.tested_action_count ?? 0} tested action
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <CsvDownloadLink
                        csvId={latestForSelectedGame?.csv_id ?? latestForSelectedGame?.current.csv_id}
                        label="Download optimized CSV"
                        onSave={(csvId, fileName) => void saveCsv(csvId, fileName)}
                        suggestedName={`${latestForSelectedGame?.csv_id ?? latestForSelectedGame?.current.csv_id ?? 'optimized'}.csv`}
                      />
                    </div>
                  </article>
                </div>

                <div className="grid gap-3 xl:grid-cols-3">
                  <MetricCard baseline={reportBaseline.fps_avg} current={currentWindow.fps_avg ?? realtime?.fps_avg} delta={delta} higherIsBetter icon={Gauge} label="Average FPS" />
                  <MetricCard baseline={reportBaseline.fps_p1_low} current={currentWindow.fps_p1_low ?? realtime?.fps_p1_low} delta={delta} higherIsBetter icon={Gauge} label="1% Low FPS" />
                  <MetricCard baseline={reportBaseline.fps_p01_low} current={currentWindow.fps_p01_low ?? realtime?.fps_p01_low} delta={delta} higherIsBetter icon={Gauge} label="0.1% Low FPS" />
                  <MetricCard
                    baseline={reportBaseline.frametime_avg_ms}
                    current={currentWindow.frametime_avg_ms ?? realtime?.frametime_avg_ms}
                    delta={delta}
                    higherIsBetter={false}
                    icon={Zap}
                    label="Average frame time"
                    unit=" ms"
                  />
                  <MetricCard
                    baseline={reportBaseline.frametime_p95_ms}
                    current={currentWindow.frametime_p95_ms ?? realtime?.frametime_p95_ms}
                    delta={delta}
                    higherIsBetter={false}
                    icon={BarChart3}
                    label="P95 frame time"
                    unit=" ms"
                  />
                  <MetricCard
                    baseline={reportBaseline.frametime_p99_ms}
                    current={currentWindow.frametime_p99_ms ?? realtime?.frametime_p99_ms}
                    delta={delta}
                    higherIsBetter={false}
                    icon={BarChart3}
                    label="P99 frame time"
                    unit=" ms"
                  />
                  <MetricCard
                    baseline={reportBaseline.frame_drop_ratio}
                    current={currentWindow.frame_drop_ratio ?? realtime?.frame_drop_ratio}
                    delta={delta}
                    higherIsBetter={false}
                    icon={Activity}
                    label="Frame drops"
                    unit="%"
                    digits={2}
                    multiplier={100}
                  />
                  <MetricCard baseline={reportBaseline.cpu_process_pct} current={currentWindow.cpu_process_pct ?? realtime?.cpu_process_pct} delta={delta} higherIsBetter={false} icon={Cpu} label="Game CPU" unit="%" />
                  <MetricCard baseline={reportBaseline.cpu_total_pct} current={currentWindow.cpu_total_pct ?? realtime?.cpu_total_pct} delta={delta} higherIsBetter={false} icon={Cpu} label="Total CPU" unit="%" />
                  <MetricCard baseline={reportBaseline.gpu_usage_pct} current={currentWindow.gpu_usage_pct ?? realtime?.gpu_usage_pct} delta={delta} higherIsBetter={false} icon={Gauge} label="GPU load" unit="%" />
                  <MetricCard baseline={reportBaseline.ram_working_set_mb} current={currentWindow.ram_working_set_mb ?? realtime?.ram_working_set_mb} delta={delta} higherIsBetter={false} icon={MemoryStick} label="RAM working set" unit=" MB" digits={0} />
                  <MetricCard baseline={reportBaseline.background_cpu_pct} current={currentWindow.background_cpu_pct ?? realtime?.background_cpu_pct} delta={delta} higherIsBetter={false} icon={Cpu} label="Background CPU" unit="%" />
                </div>

                <article className="mt-4 rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
                  <div className="flex items-start gap-3">
                    {latestForSelectedGame ? <Sparkles className="mt-0.5 text-[#7ba2ff]" size={22} /> : <Shield className="mt-0.5 text-[#7ba2ff]" size={22} />}
                    <div>
                      <p className="text-base font-black text-white">{latestForSelectedGame ? 'Next step' : 'Baseline ready'}</p>
                      <p className="mt-1 text-sm leading-6 text-white/62">
                        {latestForSelectedGame?.recommended_next_step ?? 'Run the optimized test with the same game scene to unlock a visual comparison report.'}
                      </p>
                    </div>
                  </div>
                </article>
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
