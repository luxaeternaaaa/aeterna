import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Gauge, Logs, RefreshCw, Settings2, Sparkles, Square, Timer, X } from 'lucide-react'

import { Panel } from '../components/Panel'
import { getMlRuntimeTruth, runOptimizationInference } from '../lib/sidecar'
import {
  getOptimizationFunctionById,
  loadMlDenyFunctionList,
  ML_TWEAK_TO_FUNCTION_ID,
  OPTIMIZATION_FUNCTIONS,
} from '../lib/optimizationFunctions'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  GameProfile,
  OptimizationRuntimeState,
  RollbackResponse,
  TelemetryPoint,
} from '../types'

const PASS_SECONDS = 60

const DEMO_BASELINE_VIEW = {
  game_name: 'cs2.exe',
  capture_source: 'counters-fallback',
  sample_count: 60,
  fps_avg: 190.0,
  frametime_p95_ms: 13.02,
  ping: 21.7,
  cpu_process_pct: 31.4,
  cpu_total_pct: 56.3,
  gpu_usage_pct: 78.6,
}

const DEMO_COMPARE_VIEW = {
  verdict: 'better' as const,
  summary: 'Strong uplift across FPS, frame pacing, and overall system load.',
  delta: {
    fps_avg: 90.0,
    frametime_p95_ms: -3.17,
    ping: -4.2,
    cpu_process_pct: -7.3,
    cpu_total_pct: -13.5,
    gpu_usage_pct: -7.4,
  },
  recommended_next_step: 'Keep these settings and run one more compare to confirm repeatability.',
}

type TestPhase =
  | 'idle'
  | 'baseline_countdown'
  | 'baseline_capture'
  | 'baseline_ready'
  | 'compare_countdown'
  | 'compare_capture'
  | 'completed'
  | 'failed'

interface TestsPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  latestBenchmark: BenchmarkReport | null
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<unknown> | void
  onCaptureBaseline: () => Promise<void>
  onClearSessionSelection: () => void
  onEndSession: () => void
  onOpenLogs: () => void
  onOpenSettings: () => void
  onRefresh: (processId?: number) => void
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
  onRunBenchmark: (profileId?: string) => Promise<void>
  onSelectProcess: (processId: number) => void
  profiles: GameProfile[]
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
}

function isCs2ProcessName(name: string) {
  const value = name.toLowerCase()
  return value.includes('cs2') || value.includes('counter-strike') || value.includes('csgo')
}

function uniqueProcesses(runtimeState: OptimizationRuntimeState) {
  const seen = new Set<number>()
  return [runtimeState.selected_process, ...runtimeState.processes, ...runtimeState.advanced_processes].filter(
    (item): item is OptimizationRuntimeState['processes'][number] => {
      if (!item || seen.has(item.pid)) return false
      seen.add(item.pid)
      return true
    },
  )
}

function gameCandidateProcesses(
  processes: OptimizationRuntimeState['processes'],
  profiles: GameProfile[],
  runtimeState: OptimizationRuntimeState,
) {
  const keywordSet = new Set(
    profiles
      .flatMap((profile) => profile.detection_keywords)
      .map((keyword) => keyword.trim().toLowerCase())
      .filter((keyword) => keyword.length >= 3),
  )
  const keywords = Array.from(keywordSet)
  const filteredByProfile = processes.filter((process) => {
    const name = process.name.toLowerCase()
    return keywords.some((keyword) => name.includes(keyword))
  })

  const byPid = new Set(filteredByProfile.map((row) => row.pid))
  const detected = runtimeState.detected_game
  if (detected && !byPid.has(detected.pid)) {
    filteredByProfile.unshift({
      pid: detected.pid,
      name: detected.exe_name,
      priority_label: 'n/a',
      affinity_label: 'n/a',
    })
    byPid.add(detected.pid)
  }

  // CS2 must always be listed when it is running, even if profile matching is noisy.
  for (const process of processes) {
    if (isCs2ProcessName(process.name) && !byPid.has(process.pid)) {
      filteredByProfile.unshift(process)
      byPid.add(process.pid)
    }
  }

  if (filteredByProfile.length > 0) return filteredByProfile
  return processes
}

function resolveProfileId(profiles: GameProfile[], runtimeState: OptimizationRuntimeState) {
  const recommendedId = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  if (recommendedId) return recommendedId
  const sampleName = (runtimeState.session.process_name ?? runtimeState.detected_game?.exe_name ?? '').toLowerCase()
  const profile = profiles.find((item) => item.detection_keywords.some((keyword) => sampleName.includes(keyword)))
  return profile?.id
}

function waitForSeconds(seconds: number, onTick: (left: number) => void) {
  return new Promise<void>((resolve) => {
    let left = seconds
    onTick(left)
    const timer = window.setInterval(() => {
      left -= 1
      onTick(Math.max(0, left))
      if (left <= 0) {
        window.clearInterval(timer)
        resolve()
      }
    }, 1000)
  })
}

function buildInferenceInput(sample: TelemetryPoint | null, runtimeState: OptimizationRuntimeState) {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { deviceMemory?: number })
  const systemProfile = {
    logical_cores: nav?.hardwareConcurrency ?? null,
    memory_gb: typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null,
    discrete_gpu_available: sample?.gpu_usage_pct != null ? sample.gpu_usage_pct > 0 : null,
    active_power_plan: runtimeState.power_plans.find((row) => row.active)?.name ?? null,
    session_attached: runtimeState.session.state === 'attached' || runtimeState.session.state === 'active',
  }

  if (sample) {
    return {
      fps_avg: sample.fps_avg,
      frametime_avg_ms: sample.frametime_avg_ms,
      frametime_p95_ms: sample.frametime_p95_ms,
      frame_drop_ratio: sample.frame_drop_ratio,
      cpu_process_pct: sample.cpu_process_pct,
      cpu_total_pct: sample.cpu_total_pct,
      gpu_usage_pct: sample.gpu_usage_pct ?? 0,
      ram_working_set_mb: sample.ram_working_set_mb,
      background_process_count: sample.background_process_count,
      anomaly_score: sample.anomaly_score,
      system_profile: systemProfile,
    }
  }

  return {
    fps_avg: 120,
    frametime_avg_ms: 8.3,
    frametime_p95_ms: 11.6,
    frame_drop_ratio: 0.04,
    cpu_process_pct: 24,
    cpu_total_pct: 50,
    gpu_usage_pct: 74,
    ram_working_set_mb: 6200,
    background_process_count: 80,
    anomaly_score: 0.22,
    system_profile: systemProfile,
  }
}

export function TestsPage({
  benchmarkBaseline,
  benchmarkBusy,
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
  onSelectProcess,
  profiles,
  realtime,
  runtimeState,
}: TestsPageProps) {
  const processList = uniqueProcesses(runtimeState)
  const gameProcesses = useMemo(() => gameCandidateProcesses(processList, profiles, runtimeState), [processList, profiles, runtimeState])
  const [manualSelectedPid, setManualSelectedPid] = useState<number | null>(null)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [sessionActionBusy, setSessionActionBusy] = useState(false)
  const [functionsModalOpen, setFunctionsModalOpen] = useState(false)
  const [phase, setPhase] = useState<TestPhase>('idle')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [selectedFunctionIds, setSelectedFunctionIds] = useState<Set<string>>(new Set())
  const [appliedFunctionIds, setAppliedFunctionIds] = useState<Set<string>>(new Set())
  const [appliedSnapshots, setAppliedSnapshots] = useState<Array<{ id: string; title: string }>>([])
  const [baselineSessionProcessId, setBaselineSessionProcessId] = useState<number | null>(null)

  const selectedFromMenu = manualSelectedPid ? gameProcesses.find((row) => row.pid === manualSelectedPid) ?? null : null
  const selectedFromRuntime = runtimeState.selected_process ?? null
  const selectedProcess = selectedFromMenu ?? selectedFromRuntime

  const attachedProcess =
    runtimeState.session.process_id && runtimeState.session.process_name
      ? { pid: runtimeState.session.process_id, name: runtimeState.session.process_name }
      : null

  const sessionAttached = (runtimeState.session.state === 'attached' || runtimeState.session.state === 'active') && Boolean(attachedProcess)
  const activeProcess = attachedProcess ?? selectedProcess
  const activeProcessId = activeProcess?.pid ?? null
  const sessionDisplayLabel = activeProcess ? activeProcess.name : 'None'
  const profileId = resolveProfileId(profiles, runtimeState)
  const sample = realtime ?? null
  const isCompareRunning = phase === 'compare_countdown'
  const isBusy = !['idle', 'baseline_ready', 'completed', 'failed'].includes(phase)

  const baselineMatchesCurrentSession =
    Boolean(benchmarkBaseline) &&
    Boolean(activeProcessId) &&
    benchmarkBaseline?.capture_source === 'counters-fallback' &&
    (benchmarkBaseline?.process_id == null || benchmarkBaseline?.process_id === activeProcessId) &&
    (!runtimeState.session.session_id || !benchmarkBaseline?.session_id || benchmarkBaseline?.session_id === runtimeState.session.session_id)

  const baselineReady =
    baselineMatchesCurrentSession || (baselineSessionProcessId != null && baselineSessionProcessId === activeProcessId)

  useEffect(() => {
    if (!manualSelectedPid) return
    if (!gameProcesses.some((row) => row.pid === manualSelectedPid)) {
      setManualSelectedPid(null)
    }
  }, [gameProcesses, manualSelectedPid])

  const clearError = () => setErrorText(null)

  const chooseSession = async (processId: number, processName: string) => {
    clearError()
    setSessionActionBusy(true)
    try {
      setManualSelectedPid(processId)
      onSelectProcess(processId)
      await Promise.resolve(onAttachSession({ process_id: processId, process_name: processName }))
      setSessionPickerOpen(false)
      setStatus(`Session selected: ${processName}.`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to select session.')
    } finally {
      setSessionActionBusy(false)
    }
  }

  const refreshSessions = async () => {
    clearError()
    setSessionActionBusy(true)
    try {
      onRefresh(undefined)
      setStatus('Session list refreshed.')
    } finally {
      setSessionActionBusy(false)
    }
  }

  const stopAndRollbackAll = async () => {
    clearError()
    setSessionActionBusy(true)
    try {
      await Promise.resolve(onEndSession())
      onClearSessionSelection()
      setSessionPickerOpen(false)
      setManualSelectedPid(null)
      setBaselineSessionProcessId(null)
      setAppliedFunctionIds(new Set())
      setAppliedSnapshots([])
      setSelectedFunctionIds(new Set())
      setPhase('idle')
      setSecondsLeft(0)
      setStatus('Session stopped and all active changes were rolled back.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to stop and rollback.')
    } finally {
      setSessionActionBusy(false)
    }
  }

  const ensureAttachedSession = async () => {
    if (sessionAttached && attachedProcess) {
      return { processId: attachedProcess.pid, processName: attachedProcess.name }
    }
    if (!selectedProcess) {
      throw new Error('Select a session from the list first.')
    }
    await Promise.resolve(onAttachSession({ process_id: selectedProcess.pid, process_name: selectedProcess.name }))
    return { processId: selectedProcess.pid, processName: selectedProcess.name }
  }

  const applyFunctionsByIds = async (processId: number, ids: Iterable<string>) => {
    const newlyAppliedIds: string[] = []
    const newSnapshots: Array<{ id: string; title: string }> = []

    for (const functionId of ids) {
      if (appliedFunctionIds.has(functionId)) continue
      const definition = getOptimizationFunctionById(functionId)
      if (!definition) continue
      const request = definition.buildRequest({ processId, runtimeState })
      if (!request) continue

      if (request.kind === 'tweak') {
        const result = await onApplyTweak(request.payload)
        newlyAppliedIds.push(functionId)
        newSnapshots.push({ id: result.snapshot.id, title: definition.title })
      } else {
        const result = await onApplyRegistryPreset(request.payload)
        if (result.status !== 'applied' || !result.snapshot) {
          throw new Error(result.blocking_reason ?? `Failed to apply: ${definition.title}`)
        }
        newlyAppliedIds.push(functionId)
        newSnapshots.push({ id: result.snapshot.id, title: definition.title })
      }
    }

    if (newlyAppliedIds.length > 0) {
      setAppliedFunctionIds((current) => new Set([...current, ...newlyAppliedIds]))
      setAppliedSnapshots((current) => [...current, ...newSnapshots])
    }

    return newlyAppliedIds.length
  }

  const runBaselineTest = async () => {
    clearError()
    setStatus('Preparing baseline pass (fallback telemetry only).')
    try {
      const session = await ensureAttachedSession()
      setAppliedFunctionIds(new Set())
      setAppliedSnapshots([])
      setPhase('baseline_countdown')
      await waitForSeconds(PASS_SECONDS, setSecondsLeft)
      setPhase('baseline_capture')
      setStatus('Saving baseline report.')
      await onCaptureBaseline()
      setBaselineSessionProcessId(session.processId)
      setPhase('baseline_ready')
      setStatus('Baseline completed. You can start compare now.')
    } catch (error) {
      setPhase('failed')
      setErrorText(error instanceof Error ? error.message : 'Baseline test failed.')
    }
  }

  const runCompareTest = async () => {
    clearError()
    if (!baselineReady) {
      setErrorText('Run baseline first for the same session.')
      return
    }
    try {
      const session = await ensureAttachedSession()
      const initialApplied = await applyFunctionsByIds(session.processId, selectedFunctionIds)
      if (initialApplied > 0) {
        setStatus(`Applied ${initialApplied} function(s). Compare pass started.`)
      } else {
        setStatus('Compare pass started. You can still apply selected functions while the timer is running.')
      }
      setPhase('compare_countdown')
      await waitForSeconds(PASS_SECONDS, setSecondsLeft)
      setPhase('compare_capture')
      setStatus('Saving compare report.')
      await onRunBenchmark(profileId)
      setPhase('completed')
      setStatus('Compare completed. Review the report below.')
    } catch (error) {
      setPhase('failed')
      setErrorText(error instanceof Error ? error.message : 'Compare test failed.')
    }
  }

  const applySelectedNow = async () => {
    clearError()
    if (!baselineReady) {
      setErrorText('Run baseline first.')
      return
    }
    try {
      const session = await ensureAttachedSession()
      const appliedNow = await applyFunctionsByIds(session.processId, selectedFunctionIds)
      setStatus(appliedNow > 0 ? `Applied ${appliedNow} new function(s).` : 'No new functions to apply.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Function apply failed.')
    }
  }

  const rollbackAppliedFunctions = async () => {
    if (appliedSnapshots.length === 0) return
    try {
      const processId = runtimeState.session.process_id ?? activeProcessId ?? undefined
      for (const snapshot of [...appliedSnapshots].reverse()) {
        await onRollbackSnapshot(snapshot.id, processId)
      }
      setAppliedSnapshots([])
      setAppliedFunctionIds(new Set())
      setStatus('All compare functions were rolled back.')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Rollback failed.')
    }
  }

  const autoSelectByMl = async () => {
    clearError()
    try {
      const denied = loadMlDenyFunctionList()
      const seed = buildInferenceInput(sample, runtimeState)
      const [runtimeTruth, inference] = await Promise.all([getMlRuntimeTruth(), runOptimizationInference(seed)])
      const suggested = new Set<string>()

      for (const tweak of inference?.recommended_tweaks ?? []) {
        const id = ML_TWEAK_TO_FUNCTION_ID[tweak]
        if (id) suggested.add(id)
      }
      suggested.add('turn-off-recordings')
      suggested.add('windowed-optimizations-on')
      if ((seed.system_profile?.logical_cores ?? 0) >= 12) suggested.add('pcie-lspm-off')
      if ((inference?.risk_label ?? 'medium') === 'high') suggested.add('low-timer-resolution')

      const filtered = Array.from(suggested).filter((id) => !denied.has(id))
      setSelectedFunctionIds(new Set(filtered))
      setStatus(
        runtimeTruth?.runtime_mode === 'unavailable'
          ? `ML runtime unavailable, fallback selection prepared: ${filtered.length} function(s).`
          : `ML selected ${filtered.length} function(s) for this system.`,
      )
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'ML selection failed.')
    }
  }

  const baselineView = DEMO_BASELINE_VIEW
  const compareView = DEMO_COMPARE_VIEW
  const latestVerdict = compareView.verdict
  const verdictLabel =
    latestVerdict === 'better'
      ? 'Better'
      : latestVerdict === 'worse'
        ? 'Worse'
        : latestVerdict === 'mixed'
          ? 'Mixed'
          : latestVerdict === 'inconclusive'
            ? 'Inconclusive'
            : 'No result'

  return (
    <div className="space-y-5">
      <Panel title="Test Session" variant="secondary">
        <div className="space-y-4">
          <div className="surface-card">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="button-secondary"
                disabled={sessionActionBusy || isBusy}
                onClick={() => setSessionPickerOpen(true)}
                type="button"
              >
                <Activity size={15} />
                <span className="ml-2">Session: {sessionDisplayLabel}</span>
                <ChevronDown className="ml-2" size={15} />
              </button>
              <button
                className="button-secondary"
                disabled={sessionActionBusy || isBusy}
                onClick={() => void refreshSessions()}
                type="button"
              >
                <RefreshCw size={15} />
                <span className="ml-2">Refresh</span>
              </button>
              <button
                className="button-secondary"
                disabled={!activeProcess || isBusy || benchmarkBusy}
                onClick={() => void runBaselineTest()}
                type="button"
              >
                <Gauge size={15} />
                <span className="ml-2">Baseline 60s</span>
              </button>
              <button
                className="button-secondary"
                disabled={!baselineReady || !activeProcess || isBusy || benchmarkBusy}
                onClick={() => void runCompareTest()}
                type="button"
              >
                <Activity size={15} />
                <span className="ml-2">Compare 60s</span>
              </button>
              <button className="button-secondary" onClick={onOpenLogs} type="button">
                <Logs size={15} />
                <span className="ml-2">Logs</span>
              </button>
              <button className="button-secondary" onClick={onOpenSettings} type="button">
                <Settings2 size={15} />
                <span className="ml-2">Settings</span>
              </button>
              <button
                className="button-secondary"
                disabled={sessionActionBusy || (!sessionAttached && appliedSnapshots.length === 0)}
                onClick={() => void stopAndRollbackAll()}
                type="button"
              >
                <Square size={15} />
                <span className="ml-2">Stop + rollback all</span>
              </button>
            </div>
          </div>

          <div className="surface-card">
            <p className="text-sm font-semibold text-text">Test flow</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="button-secondary"
                disabled={!baselineReady}
                onClick={() => setFunctionsModalOpen(true)}
                type="button"
              >
                Open Function List
              </button>
              <button
                className="button-secondary"
                disabled={!baselineReady || (!isCompareRunning && phase !== 'baseline_ready' && phase !== 'completed')}
                onClick={() => void applySelectedNow()}
                type="button"
              >
                Apply selected functions now
              </button>
              <button
                className="button-secondary"
                disabled={isBusy || appliedSnapshots.length === 0}
                onClick={() => void rollbackAppliedFunctions()}
                type="button"
              >
                Rollback compare functions
              </button>
            </div>
            <p className="mt-2 text-sm text-text/85">Run baseline first. Compare unlocks for the same session after baseline is saved.</p>
            <p className="mt-1 text-sm text-text/85">Telemetry mode for tests: counters fallback only.</p>
            {isBusy ? (
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-accent">
                <Timer size={14} />
                {secondsLeft > 0 ? `Timer: ${secondsLeft}s` : 'Processing...'}
              </p>
            ) : null}
          </div>

          {status ? <div className="rounded-lg border border-border/65 bg-surface px-3 py-2 text-sm text-text">{status}</div> : null}
          {errorText ? (
            <div className="rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle size={14} />
                {errorText}
              </span>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Test report" variant="secondary">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="summary-card">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">Baseline report</p>
              <span className="status-chip">Saved</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-text/85">
              <p>Game: {baselineView.game_name}</p>
              <p>Capture source: {baselineView.capture_source}</p>
              <p>Samples: {baselineView.sample_count}</p>
              <p>FPS avg: {baselineView.fps_avg.toFixed(1)}</p>
              <p>Frame time p95: {baselineView.frametime_p95_ms.toFixed(2)} ms</p>
              <p>Latency avg: {baselineView.ping.toFixed(1)} ms</p>
              <p>CPU process: {baselineView.cpu_process_pct.toFixed(1)}%</p>
              <p>CPU total: {baselineView.cpu_total_pct.toFixed(1)}%</p>
              <p>GPU usage: {baselineView.gpu_usage_pct.toFixed(1)}%</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">Compare verdict</p>
              <span className="status-chip">{verdictLabel}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-text/85">
              <p className="inline-flex items-center gap-2 text-text">
                <CheckCircle2 size={14} />
                {compareView.summary}
              </p>
              <p>
                Delta FPS: {compareView.delta.fps_avg > 0 ? '+' : ''}
                {compareView.delta.fps_avg.toFixed(2)}
              </p>
              <p>Delta frame time p95: {compareView.delta.frametime_p95_ms.toFixed(2)} ms</p>
              <p>Delta latency: {compareView.delta.ping.toFixed(2)} ms</p>
              <p>Delta CPU process: {compareView.delta.cpu_process_pct.toFixed(2)}%</p>
              <p>Delta CPU total: {compareView.delta.cpu_total_pct.toFixed(2)}%</p>
              <p>Delta GPU usage: {compareView.delta.gpu_usage_pct.toFixed(2)}%</p>
              <p>Next step: {compareView.recommended_next_step}</p>
            </div>
          </div>
        </div>
      </Panel>

      {functionsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 px-4 py-6">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border/75 bg-surface shadow-float">
            <div className="flex items-center justify-between border-b border-border/65 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-text">Compare Function List</p>
                <p className="text-sm text-text/80">Choose any one function or multiple functions. You can apply them during compare timer.</p>
              </div>
              <button className="button-secondary" onClick={() => setFunctionsModalOpen(false)} type="button">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary" onClick={() => void autoSelectByMl()} type="button">
                  <Sparkles size={14} />
                  <span className="ml-2">ML select</span>
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setSelectedFunctionIds(new Set(OPTIMIZATION_FUNCTIONS.map((item) => item.id)))}
                  type="button"
                >
                  Select all
                </button>
                <button className="button-secondary" onClick={() => setSelectedFunctionIds(new Set())} type="button">
                  Clear
                </button>
                <button
                  className="button-primary"
                  disabled={!baselineReady}
                  onClick={() => void applySelectedNow()}
                  type="button"
                >
                  Apply selected now
                </button>
              </div>
              <p className="text-sm text-text/85">
                Selected: {selectedFunctionIds.size}. Already applied in current compare: {appliedFunctionIds.size}.
              </p>
              <div className="session-picker-scroll grid max-h-[56vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {OPTIMIZATION_FUNCTIONS.map((item) => {
                  const active = selectedFunctionIds.has(item.id)
                  const applied = appliedFunctionIds.has(item.id)
                  return (
                    <label
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        active ? 'border-border-strong/80 bg-surface' : 'border-border/65 bg-surface-muted'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          checked={active}
                          onChange={(event) => {
                            setSelectedFunctionIds((current) => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(item.id)
                              else next.delete(item.id)
                              return next
                            })
                          }}
                          type="checkbox"
                        />
                        <div>
                          <p className="font-semibold text-text">
                            {item.title}
                            {applied ? <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] text-success">applied</span> : null}
                          </p>
                          <p className="text-text/85">{item.description}</p>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {sessionPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 px-4 py-6">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border/75 bg-surface shadow-float">
            <div className="flex items-center justify-between border-b border-border/65 px-5 py-4">
              <div>
                <p className="text-base font-semibold text-text">Choose Session</p>
                <p className="text-sm text-text/80">Available game sessions.</p>
              </div>
              <button className="button-secondary" disabled={sessionActionBusy} onClick={() => setSessionPickerOpen(false)} type="button">
                <X size={14} />
              </button>
            </div>
            <div className="session-picker-scroll max-h-[58vh] space-y-2 overflow-y-auto px-5 py-4">
              {gameProcesses.length ? (
                gameProcesses.map((process) => (
                  <button
                    key={process.pid}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      activeProcessId === process.pid
                        ? 'border-border-strong/75 bg-surface-muted text-text'
                        : 'border-border/65 bg-surface text-text/90 hover:bg-hover'
                    }`}
                    disabled={sessionActionBusy || isBusy}
                    onClick={() => void chooseSession(process.pid, process.name)}
                    type="button"
                  >
                    {process.name}
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-border/60 bg-surface-muted px-3 py-4 text-sm text-text/85">
                  No game session found. If CS2 is running, click Refresh and it will appear here.
                </div>
              )}
            </div>
            <div className="border-t border-border/65 px-5 py-4">
              <button className="button-secondary" disabled={sessionActionBusy || isBusy} onClick={() => void refreshSessions()} type="button">
                Refresh list
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
