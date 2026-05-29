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

import { requestWindowsRestart } from '../lib/sidecar'
import { matchingGameProfile } from '../lib/gameDetection'
import {
  dangerWarningForOptimizationFunction,
  isDangerousOptimizationFunctionId,
} from '../lib/optimizationFunctions'
import {
  activePowerPlan,
  analyzeMlSystem,
  buildCoverage,
  detectedGameProcesses,
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
  onRefreshRuntime: () => void | Promise<void>
  onOpenTests: () => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
}

interface AppliedPlanItem {
  id: string
  label: string
  requiresReboot: boolean
  snapshotId: string
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

function confirmDangerousMlApply(items: MlPlanItem[]): boolean {
  const risky = items.filter((item) => isDangerousOptimizationFunctionId(item.definition.id))
  if (risky.length === 0) return true
  const labels = risky.map((item) => `- ${item.definition.title}`).join('\n')
  const details = risky
    .slice(0, 3)
    .map((item) => dangerWarningForOptimizationFunction(item.definition))
    .join('\n\n')
  return window.confirm(
    `Dangerous tweak warning\n\nYou are about to apply ${risky.length} selected risky function(s):\n${labels}\n\nContinue only if you understand what each function does, what can stop working, and how rollback/restart affects the system.\n\n${details}`,
  )
}

export function DashboardPage(props: DashboardPageProps) {
  const sample = latestSample(props.dashboard, props.realtime)
  const gameProcesses = useMemo(() => detectedGameProcesses(props.runtimeState, props.profiles), [props.profiles, props.runtimeState])
  const [selectedGamePid, setSelectedGamePid] = useState<number | null>(gameProcesses[0]?.pid ?? null)
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
    () => gameProcesses.find((process) => process.pid === selectedGamePid) ?? gameProcesses[0] ?? null,
    [gameProcesses, selectedGamePid],
  )
  const selectedProfile = selectedGame ? matchingGameProfile(selectedGame.name, props.profiles) : null
  const rebootSelected = selectedPlan.filter((item) => item.definition.requiresReboot)

  useEffect(() => {
    if (selectedGamePid && gameProcesses.some((process) => process.pid === selectedGamePid)) return
    setSelectedGamePid(gameProcesses[0]?.pid ?? null)
  }, [gameProcesses, selectedGamePid])

  const refreshGames = async () => {
    if (scanState === 'analyzing' || scanState === 'applying') return
    setErrorText(null)
    await props.onRefreshRuntime()
  }

  const startScan = async () => {
    if (scanState === 'analyzing' || scanState === 'applying') return
    if (!selectedGame) {
      setScanState('idle')
      setErrorText('No running games found. Start a supported game, refresh the game list, then run ML analysis again.')
      setScan(null)
      setSelectedIds(new Set())
      setApplied([])
      setRestartNeeded([])
      await props.onRefreshRuntime()
      return
    }
    setScanState('analyzing')
    setErrorText(null)
    setApplied([])
    setRestartNeeded([])
    try {
      const attached = await props.onAttachSession({ process_id: selectedGame.pid, process_name: selectedGame.name })
      const runtimeState = isRuntimeState(attached) ? attached : props.runtimeState
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

  const applyPlan = async () => {
    if (!scan || scanState === 'applying' || selectedPlan.length === 0) return
    if (!confirmDangerousMlApply(selectedPlan)) return
    setScanState('applying')
    setErrorText(null)
    const nextApplied: AppliedPlanItem[] = []
    const failed: string[] = []

    try {
      for (const item of selectedPlan) {
        try {
          if (item.request.kind === 'tweak') {
            const result = await props.onApplyTweak(item.request.payload)
            nextApplied.push({
              id: item.definition.id,
              label: item.definition.title,
              requiresReboot: Boolean(item.definition.requiresReboot),
              snapshotId: result.snapshot.id,
            })
            continue
          }

          const result = await props.onApplyRegistryPreset(item.request.payload)
          if (result.status !== 'applied' || !result.snapshot) {
            const reason = result.blocking_reason ?? 'System policy blocked this setting.'
            if (reason.toLowerCase().includes('already active')) continue
            failed.push(`${item.definition.title}: ${reason}`)
            continue
          }
          nextApplied.push({
            id: item.definition.id,
            label: item.definition.title,
            requiresReboot: Boolean(item.definition.requiresReboot),
            snapshotId: result.snapshot.id,
          })
        } catch (error) {
          failed.push(`${item.definition.title}: ${formatUnknownError(error, 'apply failed')}`)
        }
      }

      await props.onRefreshRuntime()
      setApplied(nextApplied)
      const rebootItems = nextApplied.filter((item) => item.requiresReboot).map((item) => item.label)
      setRestartNeeded(rebootItems)
      setScanState('complete')
      if (failed.length > 0) setErrorText(`Applied ${nextApplied.length} setting(s). Failed: ${failed.join(', ')}`)
    } catch (error) {
      setScanState('failed')
      setErrorText(formatUnknownError(error, 'ML plan apply failed.'))
    }
  }

  const rollbackApplied = async () => {
    if (applied.length === 0 || scanState === 'applying') return
    const processId = props.runtimeState.session.process_id ?? props.runtimeState.detected_game?.pid ?? undefined
    for (const item of [...applied].reverse()) {
      await props.onRollbackSnapshot(item.snapshotId, processId)
    }
    setApplied([])
    setRestartNeeded([])
    setScanState('ready')
  }

  const restartNow = async () => {
    if (restartBusy) return
    const confirmed = window.confirm('Windows will restart immediately. Continue?')
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
            Select a running game, analyze Windows and hardware state, then let the local model pick the best safe tweaks.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <button
            className="flex min-h-11 items-center gap-2 rounded-[1rem] bg-[#315cff] px-5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-55"
            disabled={scanState === 'analyzing' || scanState === 'applying'}
            onClick={() => void (selectedGame ? startScan() : refreshGames())}
            type="button"
          >
            {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
            <span>{scanState === 'analyzing' ? 'Analyzing' : selectedGame ? 'Analyze System' : 'Refresh Games'}</span>
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
                <h2 className="text-xl font-black">Running games</h2>
                <p className="mt-1 text-sm leading-5 text-white/52">Only real detected game processes are listed here.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
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
                        setApplied([])
                        setRestartNeeded([])
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
                  No running games found. Start a game, then refresh the game list.
                </div>
              )}
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
              disabled={scanState === 'analyzing' || scanState === 'applying'}
              onClick={() => void (selectedGame ? startScan() : refreshGames())}
              type="button"
            >
              {scanState === 'analyzing' ? <Loader2 className="animate-spin" size={18} /> : <Gauge size={18} />}
              <span>{scanState === 'analyzing' ? 'Scanning system' : selectedGame ? 'Start ML Analysis' : 'Refresh game list'}</span>
            </button>
            <button
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#202942] px-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!scan || selectedPlan.length === 0 || scanState === 'applying' || scanState === 'analyzing'}
              onClick={() => void applyPlan()}
              type="button"
            >
              {scanState === 'applying' ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              <span>{scanState === 'applying' ? 'Applying plan' : `Apply Selected (${selectedPlan.length})`}</span>
            </button>
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
                <span className="text-white/52">Selected game</span>
                <span className="max-w-[190px] truncate font-bold">{selectedGame?.name ?? 'None'}</span>
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
                <p className="mt-1 text-sm text-white/48">The model checks hardware, OS state, active settings, enabled tweaks, autoruns, telemetry, and game context.</p>
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
                    Pick a running game on the left. Aeterna will attach to that process, scan the OS, hardware, active presets, autoruns, telemetry, and current game profile, then select the safest useful plan.
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
                    Checking OS state, components, power policy, registry presets, active tweaks, telemetry quality, and selected game profile.
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
                <span className="rounded-full bg-[#202942] px-4 py-2 text-sm font-bold text-white/70">
                  {selectedPlan.length}/{scan.plan.length} selected
                </span>
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
                        Applied {applied.length} setting(s). Rollback snapshots were created for applied changes.
                      </p>
                    </div>
                  </div>
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
                    <button className="rounded-xl bg-[#202942] px-4 py-2 font-bold" disabled={applied.length === 0} onClick={() => void rollbackApplied()} type="button">
                      <RotateCcw className="mr-2 inline" size={16} />
                      Rollback applied
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
