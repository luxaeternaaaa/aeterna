import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  Gauge,
  Gamepad2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import {
  useConfirmDialog,
  type ConfirmDialogOptions,
} from '../components/ConfirmDialogContext'
import { requestWindowsRestart } from '../lib/sidecar'
import { matchingGameProfile } from '../lib/gameDetection'
import {
  dangerWarningForOptimizationFunction,
  isDangerousOptimizationFunctionId,
  type OptimizationFunctionRequest,
} from '../lib/optimizationFunctions'
import {
  activePowerPlan,
  analyzeMlSystem,
  buildCoverage,
  detectedGameProcesses,
  isFunctionActive,
  isRuntimeState,
  latestSample,
  type MlPlanItem,
  type PlanTone,
  type ScanResult,
  type ScanState,
} from '../lib/mlPlanner'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  GameProfile,
  OptimizationRuntimeState,
  RollbackResponse,
  TelemetryPoint,
} from '../types'

interface DashboardPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  dashboard: DashboardPayload
  latestBenchmark: BenchmarkReport | null
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<OptimizationRuntimeState | unknown> | OptimizationRuntimeState | void
  onOpenLogs: () => void
  onOpenOptimization: () => void
  onRefreshRuntime: () => Promise<OptimizationRuntimeState | unknown>
  onOpenTests: () => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
}

interface AppliedPlanItem {
  id: string
  label: string
  request: OptimizationFunctionRequest
  requiresReboot: boolean
  snapshotId: string
  status: 'applied' | 'restored'
  verified: boolean
}

function formatUnknownError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message
  }
  return fallback
}

function toneClass(tone: PlanTone) {
  if (tone === 'danger') return 'bg-[#45131a] text-[#ff7b85]'
  if (tone === 'restart') return 'bg-[#3b2911] text-[#ffcf5a]'
  if (tone === 'balanced') return 'bg-[#152b5c] text-[#7ba2ff]'
  return 'bg-[#123d2d] text-[#4dff9b]'
}

function StatusBadge({ children, tone }: { children: string; tone: PlanTone }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${toneClass(tone)}`}>{children}</span>
}

function dangerousMlApplyConfirmation(items: MlPlanItem[]): ConfirmDialogOptions | null {
  const risky = items.filter((item) => isDangerousOptimizationFunctionId(item.definition.id))
  if (risky.length === 0) return null
  const details = risky
    .slice(0, 3)
    .map((item) => dangerWarningForOptimizationFunction(item.definition))
  return {
    acknowledgement:
      'I understand what these functions change, what can stop working, and how rollback or restart affects the system.',
    confirmLabel: 'Apply risky functions',
    description: `You are about to apply ${risky.length} selected risky function(s). Review the affected functions before continuing.`,
    details,
    eyebrow: 'Dangerous tweak warning',
    items: risky.map((item) => item.definition.title),
    title: 'Confirm risky optimization',
    tone: 'danger',
  }
}

export function DashboardPage(props: DashboardPageProps) {
  const requestConfirmation = useConfirmDialog()
  const sample = latestSample(props.dashboard, props.realtime)
  const gameProcesses = useMemo(() => detectedGameProcesses(props.runtimeState, props.profiles), [props.profiles, props.runtimeState])
  const [selectedGamePid, setSelectedGamePid] = useState<number | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [applied, setApplied] = useState<AppliedPlanItem[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)
  const [restartNeeded, setRestartNeeded] = useState<string[]>([])
  const [restartBusy, setRestartBusy] = useState(false)

  const selectedPlan = useMemo(
    () => scan?.plan.filter((item) => selectedIds.has(item.definition.id)) ?? [],
    [scan?.plan, selectedIds],
  )
  const selectedGame = useMemo(
    () => gameProcesses.find((process) => process.pid === selectedGamePid) ?? null,
    [gameProcesses, selectedGamePid],
  )
  const selectedProfile = selectedGame ? matchingGameProfile(selectedGame.name, props.profiles) : null
  const rebootSelected = selectedPlan.filter((item) => item.definition.requiresReboot)
  const activeApplied = applied.filter((item) => item.status === 'applied')
  const selectedCoverageCount = scan
    ? scan.activeCoverageCount +
      selectedPlan.filter((item) => scan.eligibleFunctionIds.includes(item.definition.id)).length
    : 0
  const selectedCoveragePercent =
    scan && scan.eligibleFunctionCount > 0
      ? Math.round((selectedCoverageCount / scan.eligibleFunctionCount) * 100)
      : 100
  const coverageTargetMet = !scan || selectedCoverageCount >= scan.minimumCoverageCount
  const analyzeButtonLabel =
    activeApplied.length > 0
      ? 'Restore active plan first'
      : scanState === 'analyzing'
      ? 'Analyzing'
      : selectedGame
        ? 'Analyze Windows + Game'
        : 'Analyze Windows'
  const scanButtonLabel =
    activeApplied.length > 0
      ? 'Restore active plan first'
      : scanState === 'analyzing'
      ? 'Scanning system'
      : selectedGame
        ? 'Analyze Windows + Game'
        : 'Analyze and optimize Windows'
  const scanBusy = scanState === 'analyzing' || scanState === 'applying'
  const analysisDisabled = scanBusy || activeApplied.length > 0

  useEffect(() => {
    if (selectedGamePid == null || gameProcesses.some((process) => process.pid === selectedGamePid)) return
    setSelectedGamePid(null)
    setScanState('idle')
    setScan(null)
    setSelectedIds(new Set())
  }, [gameProcesses, selectedGamePid])

  const refreshGames = async () => {
    if (scanState === 'analyzing' || scanState === 'applying') return
    setErrorText(null)
    await props.onRefreshRuntime()
  }

  const startScan = async () => {
    if (scanBusy || activeApplied.length > 0) return
    setScanState('analyzing')
    setErrorText(null)
    setApplied([])
    setRestartNeeded([])
    try {
      const currentState = selectedGame
        ? await props.onAttachSession({ process_id: selectedGame.pid, process_name: selectedGame.name })
        : await props.onRefreshRuntime()
      const runtimeState = isRuntimeState(currentState) ? currentState : props.runtimeState
      const result = await analyzeMlSystem({
        dashboard: props.dashboard,
        profiles: props.profiles,
        realtime: props.realtime,
        runtimeState,
        selectedGame,
      })
      setScan(result)
      setSelectedIds(new Set(result.plan.map((item) => item.definition.id)))
      setScanState('ready')
    } catch (error) {
      setScanState('failed')
      setErrorText(formatUnknownError(error, 'System analysis failed.'))
    }
  }

  const executePlanItem = async (item: {
    id: string
    label: string
    request: OptimizationFunctionRequest
    requiresReboot: boolean
  }): Promise<AppliedPlanItem> => {
    if (item.request.kind === 'tweak') {
      const result = await props.onApplyTweak(item.request.payload)
      return {
        ...item,
        snapshotId: result.snapshot.id,
        status: 'applied',
        verified: isFunctionActive(result.state, item.id),
      }
    }

    const result = await props.onApplyRegistryPreset(item.request.payload)
    if (result.status !== 'applied' || !result.snapshot) {
      throw new Error(result.blocking_reason ?? 'System policy blocked this setting.')
    }
    return {
      ...item,
      snapshotId: result.snapshot.id,
      status: 'applied',
      verified: isFunctionActive(result.state, item.id),
    }
  }

  const applyPlan = async () => {
    if (
      !scan ||
      scanState === 'applying' ||
      selectedPlan.length === 0 ||
      !coverageTargetMet ||
      activeApplied.length > 0
    )
      return
    const confirmation = dangerousMlApplyConfirmation(selectedPlan)
    if (confirmation && !(await requestConfirmation(confirmation))) return
    setScanState('applying')
    setErrorText(null)
    const nextApplied: AppliedPlanItem[] = []
    const failed: string[] = []

    try {
      for (const item of selectedPlan) {
        try {
          const result = await executePlanItem({
            id: item.definition.id,
            label: item.definition.title,
            request: item.request,
            requiresReboot: Boolean(item.definition.requiresReboot),
          })
          nextApplied.push(result)
          if (!result.verified) {
            failed.push(`${item.definition.title}: Windows did not confirm the active state after apply.`)
          }
        } catch (error) {
          failed.push(`${item.definition.title}: ${formatUnknownError(error, 'apply failed')}`)
        }
      }

      await props.onRefreshRuntime()
      setApplied(nextApplied)
      const rebootItems = nextApplied.filter((item) => item.requiresReboot).map((item) => item.label)
      setRestartNeeded(rebootItems)
      setScanState('complete')
      const verifiedCoverage =
        scan.activeCoverageCount +
        nextApplied.filter(
          (item) => item.verified && scan.eligibleFunctionIds.includes(item.id),
        ).length
      if (verifiedCoverage < scan.minimumCoverageCount) {
        failed.push(
          `Verified safe-function coverage is ${verifiedCoverage}/${scan.eligibleFunctionCount}; the required minimum is ${scan.minimumCoverageCount}/${scan.eligibleFunctionCount}.`,
        )
      }
      if (failed.length > 0) {
        setErrorText(`Applied ${nextApplied.length} setting(s). Verification issues: ${failed.join(', ')}`)
      }
    } catch (error) {
      setScanState('failed')
      setErrorText(formatUnknownError(error, 'ML plan apply failed.'))
    }
  }

  const rollbackApplied = async () => {
    if (activeApplied.length === 0 || scanState === 'applying') return
    setScanState('applying')
    setErrorText(null)
    const processId = props.runtimeState.session.process_id ?? props.runtimeState.detected_game?.pid ?? undefined
    try {
      for (const item of [...activeApplied].reverse()) {
        await props.onRollbackSnapshot(item.snapshotId, processId)
        setApplied((current) =>
          current.map((currentItem) =>
            currentItem.snapshotId === item.snapshotId
              ? { ...currentItem, status: 'restored', verified: false }
              : currentItem,
          ),
        )
        if (item.requiresReboot) {
          setRestartNeeded((current) => current.filter((label) => label !== item.label))
        }
      }
      setScanState('complete')
    } catch (error) {
      setScanState('complete')
      setErrorText(formatUnknownError(error, 'Plan rollback failed.'))
    }
  }

  const rollbackAppliedItem = async (item: AppliedPlanItem) => {
    if (item.status !== 'applied' || scanState === 'applying') return
    setScanState('applying')
    setErrorText(null)
    try {
      const processId = props.runtimeState.session.process_id ?? props.runtimeState.detected_game?.pid ?? undefined
      await props.onRollbackSnapshot(item.snapshotId, processId)
      setApplied((current) =>
        current.map((currentItem) =>
          currentItem.snapshotId === item.snapshotId
            ? { ...currentItem, status: 'restored', verified: false }
            : currentItem,
        ),
      )
      setRestartNeeded((current) => current.filter((label) => label !== item.label))
    } catch (error) {
      setErrorText(formatUnknownError(error, `Unable to restore ${item.label}.`))
    } finally {
      setScanState('complete')
    }
  }

  const reapplyItem = async (item: AppliedPlanItem) => {
    if (item.status !== 'restored' || scanState === 'applying') return
    setScanState('applying')
    setErrorText(null)
    try {
      const reapplied = await executePlanItem(item)
      setApplied((current) =>
        current.map((currentItem) =>
          currentItem.snapshotId === item.snapshotId ? reapplied : currentItem,
        ),
      )
      if (reapplied.requiresReboot) {
        setRestartNeeded((current) =>
          current.includes(reapplied.label) ? current : [...current, reapplied.label],
        )
      }
      if (!reapplied.verified) {
        setErrorText(`${reapplied.label} was applied, but Windows did not confirm the active state.`)
      }
    } catch (error) {
      setErrorText(formatUnknownError(error, `Unable to apply ${item.label} again.`))
    } finally {
      setScanState('complete')
    }
  }

  const restartNow = async () => {
    if (restartBusy) return
    const confirmed = await requestConfirmation({
      confirmLabel: 'Restart now',
      description: 'Windows will restart immediately. Save open work before continuing.',
      eyebrow: 'Restart required',
      title: 'Restart Windows now?',
      tone: 'warning',
    })
    if (!confirmed) return
    setRestartBusy(true)
    try {
      await requestWindowsRestart()
    } finally {
      setRestartBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-5 px-2 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">ML Tweaks</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">
            Analyze and optimize Windows directly. Selecting a running game is optional and only adds process-specific recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <button
            className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#315cff] px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55"
            disabled={analysisDisabled}
            onClick={() => void startScan()}
            type="button"
          >
            {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
            <span>{analyzeButtonLabel}</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={props.onOpenOptimization} type="button">
            <Sparkles size={17} />
            <span>Custom</span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold" onClick={props.onOpenTests} type="button">
            <BarChart3 size={17} />
            <span>Tests</span>
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-5">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#315cff]/18 text-[#7ba2ff]">
                <Gamepad2 size={25} />
              </span>
              <div>
                <h2 className="text-xl font-black">Optional game context</h2>
                <p className="mt-1 text-sm leading-5 text-white/52">Windows optimization works without a game. Select one only for process-specific tweaks.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <button
                className={`w-full rounded-xl px-4 py-3 text-left transition ${
                  selectedGame ? 'bg-[#111936] text-white/86 hover:bg-[#172145]' : 'bg-[#315cff] text-white'
                }`}
                onClick={() => {
                  setSelectedGamePid(null)
                  setScanState('idle')
                  setScan(null)
                  setSelectedIds(new Set())
                  if (activeApplied.length === 0) {
                    setApplied([])
                    setRestartNeeded([])
                  }
                  setErrorText(null)
                }}
                type="button"
              >
                <span className="block text-base font-black">Windows only</span>
                <span className={`mt-1 block text-xs font-semibold ${selectedGame ? 'text-white/42' : 'text-white/72'}`}>
                  Analyze the OS and hardware without a running game
                </span>
              </button>
              {gameProcesses.length > 0 ? (
                gameProcesses.map((process) => {
                  const active = selectedGame?.pid === process.pid
                  const profile = matchingGameProfile(process.name, props.profiles)
                  return (
                    <button
                      key={process.pid}
                      className={`w-full rounded-xl px-4 py-3 text-left transition ${
                        active ? 'bg-[#315cff] text-white' : 'bg-[#111936] text-white/86 hover:bg-[#172145]'
                      }`}
                      onClick={() => {
                        setSelectedGamePid(process.pid)
                        setScanState('idle')
                        setScan(null)
                        setSelectedIds(new Set())
                        if (activeApplied.length === 0) {
                          setApplied([])
                          setRestartNeeded([])
                        }
                        setErrorText(null)
                      }}
                      type="button"
                    >
                      <span className="block truncate text-base font-black">{process.name}</span>
                      <span className={`mt-1 block text-xs font-semibold ${active ? 'text-white/72' : 'text-white/42'}`}>
                        PID {process.pid}
                        {profile ? ` | ${profile.title}` : ' | game signature'}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-xl bg-[#111936] px-4 py-4 text-sm font-semibold leading-6 text-white/54">
                  No running games found. This does not block Windows analysis.
                </div>
              )}
              <button
                className="w-full rounded-xl bg-[#202942] px-4 py-3 text-sm font-black text-white/78"
                disabled={scanBusy}
                onClick={() => void refreshGames()}
                type="button"
              >
                Refresh optional game list
              </button>
            </div>
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#315cff]/18 text-[#7ba2ff]">
                <Bot size={25} />
              </span>
              <div>
                <h2 className="text-xl font-black">Balanced ML mode</h2>
                <p className="mt-1 text-sm leading-5 text-white/52">Performance gains with rollback, safety gates, and restart warnings.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Confidence</p>
                <p className="mt-2 text-2xl font-black">{scan ? `${(scan.confidence * 100).toFixed(0)}%` : 'n/a'}</p>
              </div>
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Safety</p>
                <p className="mt-2 text-2xl font-black">{scan ? `${scan.safetyScore}%` : 'n/a'}</p>
              </div>
            </div>
            <button
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#315cff] px-4 text-base font-bold disabled:cursor-not-allowed disabled:bg-white/30"
              disabled={analysisDisabled}
              onClick={() => void startScan()}
              type="button"
            >
              {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={18} /> : <Gauge size={18} />}
              <span>{scanButtonLabel}</span>
            </button>
            <button
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#202942] px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
              disabled={
                !scan ||
                selectedPlan.length === 0 ||
                scanState === 'applying' ||
                scanState === 'analyzing' ||
                !coverageTargetMet ||
                activeApplied.length > 0
              }
              onClick={() => void applyPlan()}
              type="button"
            >
              {scanState === 'applying' ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              <span>{scanState === 'applying' ? 'Applying plan' : `Apply Selected (${selectedPlan.length})`}</span>
            </button>
            {scan ? (
              <p
                className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold ${
                  coverageTargetMet
                    ? 'bg-[#123d2d] text-[#4dff9b]'
                    : 'bg-[#3b2911] text-[#ffcf5a]'
                }`}
              >
                Safe coverage {selectedCoverageCount}/{scan.eligibleFunctionCount} ({selectedCoveragePercent}%).
                Minimum: 60%.
              </p>
            ) : null}
            {rebootSelected.length > 0 ? (
              <p className="mt-3 rounded-xl bg-[#3b2911] px-4 py-3 text-sm font-semibold text-[#ffcf5a]">
                {rebootSelected.length} selected setting(s) will need Windows restart after apply.
              </p>
            ) : null}
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <h2 className="text-xl font-black">Current system</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Optimization scope</span>
                <span className="max-w-[190px] truncate font-bold">{selectedGame?.name ?? 'Windows system'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Telemetry</span>
                <span className="font-bold">{props.dashboard.mode}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Power plan</span>
                <span className="max-w-[190px] truncate font-bold">{activePowerPlan(props.runtimeState)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">Active tweaks</span>
                <span className="font-bold">{props.runtimeState.session.active_tweaks.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3">
                <span className="text-white/52">CPU load</span>
                <span className="font-bold">{sample ? `${sample.cpu_total_pct.toFixed(0)}%` : 'n/a'}</span>
              </div>
            </div>
          </section>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-5">
          <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">System analysis</h2>
                <p className="mt-1 text-sm text-white/48">The model checks hardware, OS state, active settings, enabled tweaks, autoruns, services, and telemetry. Game context is optional.</p>
              </div>
              <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">{scan?.modelLabel ?? 'Waiting for scan'}</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-4">
              {(scan?.coverage ?? buildCoverage(props.runtimeState, props.dashboard, sample, selectedGame, selectedProfile, props.profiles.length)).map((item) => (
                <article key={item.label} className="rounded-[1rem] bg-[#111936] p-4">
                  <p className="text-xs font-bold uppercase text-white/36">{item.label}</p>
                  <p className="mt-2 truncate text-lg font-black">{item.value}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {scanState === 'idle' ? (
            <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-7">
              <div className="flex items-start gap-4">
                <Sparkles className="mt-1 text-[#7ba2ff]" size={28} />
                <div>
                  <h2 className="text-2xl font-black">Start with system analysis</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
                    Run the analysis immediately to optimize Windows. Aeterna scans hardware, active presets, autoruns, services, telemetry, and current settings, then builds a safe reversible plan. Selecting a game only adds compatible process-level tweaks.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {scanState === 'analyzing' ? (
            <section className="rounded-[1.35rem] bg-[#10255b] p-6 shadow-[inset_0_0_0_1px_rgba(123,162,255,0.22)]">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin text-[#7ba2ff]" size={26} />
                <div>
                  <h2 className="text-xl font-black">Analyzing full system</h2>
                  <p className="mt-1 text-sm text-white/64">
                    Checking OS state, components, power policy, registry presets, active tweaks, services, telemetry quality, and optional game context.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {scan ? (
            <section className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Balanced plan</h2>
                  <p className="mt-1 text-sm text-white/48">{scan.summary}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#123d2d] px-4 py-2 text-sm font-bold text-[#4dff9b]">
                    {scan.coveragePercent}% safe coverage
                  </span>
                  <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">
                    {selectedPlan.length}/{scan.plan.length} selected
                  </span>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {scan.plan.map((item) => {
                  const active = selectedIds.has(item.definition.id)
                  return (
                    <button
                      key={item.definition.id}
                      className={`rounded-[1.2rem] px-4 py-4 text-left transition ${
                        active ? 'bg-[#16285d] ring-1 ring-[#315cff]/80' : 'bg-[#070b1b]/88 opacity-70 hover:opacity-100'
                      }`}
                      disabled={scanState === 'applying'}
                      onClick={() => {
                        setSelectedIds((current) => {
                          const next = new Set(current)
                          if (next.has(item.definition.id)) next.delete(item.definition.id)
                          else next.add(item.definition.id)
                          return next
                        })
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${active ? 'bg-[#315cff]' : 'bg-[#202942]'}`}>
                            {active ? <Check size={16} /> : null}
                          </span>
                          <div>
                            <h3 className="text-base font-black">{item.definition.title}</h3>
                            <p className="mt-1 text-sm leading-5 text-white/56">{item.reason}</p>
                          </div>
                        </div>
                        <StatusBadge tone={item.tone}>{item.tone === 'danger' ? 'Risk' : item.tone === 'restart' ? 'Restart' : item.tone}</StatusBadge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-white/38">
                        <span>{item.impact}</span>
                        {item.mlConfidence != null ? <span className="rounded-full bg-[#202942] px-2.5 py-1 text-white/62">ML {(item.mlConfidence * 100).toFixed(0)}%</span> : null}
                        {item.expectedGainPct != null && item.expectedGainPct > 0 ? (
                          <span className="rounded-full bg-[#123d2d] px-2.5 py-1 text-[#4dff9b]">+{item.expectedGainPct.toFixed(1)}% expected</span>
                        ) : null}
                        {item.scoreSource ? <span className="rounded-full bg-[#202942] px-2.5 py-1 text-white/52">{item.scoreSource}</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <article className="rounded-[1.2rem] bg-[#070b1b]/88 p-4">
                  <h3 className="text-base font-black">Why this plan</h3>
                  <div className="mt-3 space-y-2">
                    {scan.rationale.map((line) => (
                      <p key={line} className="flex gap-2 text-sm leading-6 text-white/58">
                        <ShieldCheck className="mt-1 shrink-0 text-[#4dff9b]" size={15} />
                        <span>{line}</span>
                      </p>
                    ))}
                  </div>
                </article>
                <article className="rounded-[1.2rem] bg-[#070b1b]/88 p-4">
                  <h3 className="text-base font-black">Skipped for safety</h3>
                  <div className="mt-3 space-y-2">
                    {scan.skipped.slice(0, 5).map((line) => (
                      <p key={line} className="flex gap-2 text-sm leading-6 text-white/58">
                        <AlertTriangle className="mt-1 shrink-0 text-[#ffcf5a]" size={15} />
                        <span>{line}</span>
                      </p>
                    ))}
                    {scan.skipped.length === 0 ? <p className="text-sm text-white/52">No safety skips in this scan.</p> : null}
                  </div>
                </article>
              </div>

              {scanState === 'complete' ? (
                <section className="mt-4 rounded-[1.35rem] bg-[#070b1b]/88 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 text-[#4dff9b]" size={23} />
                    <div>
                      <h2 className="text-xl font-black">ML plan applied</h2>
                      <p className="mt-1 text-sm leading-6 text-white/60">
                        {activeApplied.length} setting(s) remain active. Every applied change has its own rollback snapshot.
                      </p>
                    </div>
                  </div>
                  {applied.length > 0 ? (
                    <div className="mt-4 grid gap-2 xl:grid-cols-2">
                      {applied.map((item) => (
                        <article
                          className="flex items-center justify-between gap-3 rounded-xl bg-[#111936] px-4 py-3"
                          key={`${item.id}-${item.snapshotId}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{item.label}</p>
                            <p
                              className={`mt-1 text-xs font-semibold ${
                                item.status === 'restored'
                                  ? 'text-white/45'
                                  : item.verified
                                    ? 'text-[#4dff9b]'
                                    : 'text-[#ffcf5a]'
                              }`}
                            >
                              {item.status === 'restored'
                                ? 'Restored'
                                : item.verified
                                  ? 'Applied and verified'
                                  : 'Applied, verification pending'}
                            </p>
                          </div>
                          <button
                            className="shrink-0 rounded-lg bg-[#202942] px-3 py-2 text-xs font-black text-white disabled:opacity-45"
                            onClick={() =>
                              void (item.status === 'applied'
                                ? rollbackAppliedItem(item)
                                : reapplyItem(item))
                            }
                            type="button"
                          >
                            {item.status === 'applied' ? 'Restore' : 'Apply again'}
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {restartNeeded.length > 0 ? (
                    <div className="mt-4 rounded-xl bg-[#3b2911] px-4 py-3 text-sm text-[#ffcf5a]">
                      <p className="font-black">Restart required to finish: {restartNeeded.join(', ')}.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="rounded-xl bg-[#315cff] px-4 py-2 font-bold text-white" disabled={restartBusy} onClick={() => void restartNow()} type="button">
                          {restartBusy ? 'Requesting restart...' : 'Restart now'}
                        </button>
                        <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold text-white" onClick={() => setRestartNeeded([])} type="button">
                          Later
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold" disabled={activeApplied.length === 0} onClick={() => void rollbackApplied()} type="button">
                      <RotateCcw className="mr-2 inline" size={16} />
                      Restore all active
                    </button>
                    <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold" onClick={props.onOpenTests} type="button">
                      Run controlled test
                    </button>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {errorText ? (
            <section className="rounded-[1rem] bg-[#3d1218]/80 px-4 py-3 text-sm font-semibold text-[#ff8a8f]">
              <AlertTriangle className="mr-2 inline" size={17} />
              {errorText}
            </section>
          ) : null}
        </section>
      </main>
    </div>
  )
}
