import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, Gauge, Logs, Power, RefreshCw, Settings2, Square, X } from 'lucide-react'

import type { AttachSessionRequest, BenchmarkWindow, GameProfile, OptimizationRuntimeState } from '../types'

const BENCHMARK_SECONDS = 60
const COMPARE_COOLDOWN_SECONDS = 5

interface SessionControlBarProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  lastTweakAtMs: number | null
  onAttachSession: (request: AttachSessionRequest) => void
  onCaptureBaseline: () => void
  onClearSessionSelection: () => void
  onEndSession: () => void
  onOpenLogs: () => void
  onOpenSettings: () => void
  onRefresh: (processId?: number) => void
  onRunBenchmark: (profileId?: string) => void
  onSelectProcess: (processId: number) => void
  onStopSession: () => void
  profiles: GameProfile[]
  runtimeState: OptimizationRuntimeState
  stopBusy: boolean
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
  const filtered = processes.filter((process) => {
    const name = process.name.toLowerCase()
    return keywords.some((keyword) => name.includes(keyword))
  })

  if (runtimeState.detected_game) {
    const hasDetected = filtered.some((item) => item.pid === runtimeState.detected_game!.pid)
    if (!hasDetected) {
      filtered.unshift({
        pid: runtimeState.detected_game.pid,
        name: runtimeState.detected_game.exe_name,
        priority_label: 'n/a',
        affinity_label: 'n/a',
      })
    }
  }

  return filtered
}

function resolveProfileId(profiles: GameProfile[], runtimeState: OptimizationRuntimeState) {
  const recommendedId = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  if (recommendedId) return recommendedId
  const sampleName = (runtimeState.session.process_name ?? runtimeState.detected_game?.exe_name ?? '').toLowerCase()
  const profile = profiles.find((item) => item.detection_keywords.some((keyword) => sampleName.includes(keyword)))
  return profile?.id
}

export function SessionControlBar({
  benchmarkBaseline,
  benchmarkBusy,
  lastTweakAtMs,
  onAttachSession,
  onCaptureBaseline,
  onClearSessionSelection,
  onEndSession,
  onOpenLogs,
  onOpenSettings,
  onRefresh,
  onRunBenchmark,
  onSelectProcess,
  onStopSession,
  profiles,
  runtimeState,
  stopBusy,
}: SessionControlBarProps) {
  const [clockTick, setClockTick] = useState(0)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const sessionPickerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!lastTweakAtMs) return
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [lastTweakAtMs])

  useEffect(() => {
    if (!sessionPickerOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const node = sessionPickerRef.current
      if (!node) return
      if (!node.contains(event.target as Node)) setSessionPickerOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [sessionPickerOpen])

  const sessionAttached = runtimeState.session.state === 'attached' || runtimeState.session.state === 'active'
  const attachedProcessId = runtimeState.session.process_id ?? runtimeState.selected_process?.pid ?? null
  const processList = uniqueProcesses(runtimeState)
  const gameProcesses = useMemo(() => gameCandidateProcesses(processList, profiles, runtimeState), [processList, profiles, runtimeState])
  const hasBaseline = Boolean(benchmarkBaseline)
  const hasActiveTweaks = runtimeState.session.active_tweaks.length > 0 || runtimeState.session.active_snapshot_ids.length > 0
  const canCaptureBaseline = sessionAttached && !benchmarkBusy
  const elapsedSeconds = lastTweakAtMs ? Math.floor((Date.now() + clockTick * 0 - lastTweakAtMs) / 1000) : COMPARE_COOLDOWN_SECONDS
  const cooldownRemaining = Math.max(0, COMPARE_COOLDOWN_SECONDS - elapsedSeconds)
  const canCompare = hasBaseline && hasActiveTweaks && cooldownRemaining === 0 && !benchmarkBusy
  const selectedProcessLabel = runtimeState.selected_process?.name ?? runtimeState.session.process_name ?? 'None'
  const hasChosenSession = Boolean(runtimeState.selected_process || runtimeState.session.process_id || runtimeState.session.process_name)
  const profileId = resolveProfileId(profiles, runtimeState)

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <div className="relative" ref={sessionPickerRef}>
        <button
          className="button-secondary"
          onClick={() => setSessionPickerOpen((open) => !open)}
          type="button"
        >
          <Activity size={15} />
          <span className="ml-2">Session: {selectedProcessLabel}</span>
          <ChevronDown className={`ml-2 transition ${sessionPickerOpen ? 'rotate-180' : ''}`} size={15} />
        </button>

        {sessionPickerOpen ? (
          <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(34rem,calc(100vw-4rem))] min-h-[13rem] max-h-[28rem] overflow-hidden rounded-xl border border-border/70 bg-surface p-3 shadow-float">
            {runtimeState.detected_game ? (
              <button
                className="mb-2 w-full rounded-lg border border-border/70 bg-surface-muted px-3 py-2 text-left text-sm text-text"
                onClick={() => {
                  onAttachSession({
                    process_id: runtimeState.detected_game!.pid,
                    process_name: runtimeState.detected_game!.exe_name,
                  })
                  setSessionPickerOpen(false)
                }}
                type="button"
              >
                Attach detected: {runtimeState.detected_game.exe_name} ({runtimeState.detected_game.pid})
              </button>
            ) : null}

            {gameProcesses.length ? (
              <div
                className="session-picker-scroll grid max-h-[20.5rem] gap-2 overflow-y-scroll overflow-x-hidden pr-1 sm:grid-cols-2"
                style={{ scrollbarGutter: 'stable' }}
              >
                {gameProcesses.map((process) => {
                  const selected = runtimeState.selected_process?.pid === process.pid
                  return (
                    <button
                      key={process.pid}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? 'border-border-strong/70 bg-surface-muted text-text'
                          : 'border-border/70 bg-surface text-muted hover:text-text'
                      }`}
                      onClick={() => {
                        onSelectProcess(process.pid)
                        setSessionPickerOpen(false)
                      }}
                      type="button"
                    >
                      {process.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-[9.5rem] items-center justify-center rounded-lg border border-border/60 bg-surface-muted px-3 text-sm text-muted">
                No games found. Start a game and press Refresh.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {hasChosenSession ? (
        <button
          className="button-secondary px-3"
          onClick={() => {
            if (sessionAttached) onEndSession()
            onClearSessionSelection()
            setSessionPickerOpen(false)
          }}
          title="Clear selected session"
          type="button"
        >
          <X size={14} />
        </button>
      ) : null}

      <button className="button-secondary" onClick={() => onRefresh(attachedProcessId ?? undefined)} type="button">
        <RefreshCw size={15} />
        <span className="ml-2">Refresh</span>
      </button>

      <button className="button-secondary" disabled={!canCaptureBaseline} onClick={onCaptureBaseline} type="button">
        <Gauge size={15} />
        <span className="ml-2">{benchmarkBusy ? 'Capturing...' : `Baseline ${BENCHMARK_SECONDS}s`}</span>
      </button>

      <button className="button-secondary" disabled={!canCompare} onClick={() => onRunBenchmark(profileId)} type="button">
        <Activity size={15} />
        <span className="ml-2">{benchmarkBusy ? 'Running...' : `Compare ${BENCHMARK_SECONDS}s`}</span>
      </button>

      <button className="button-secondary" onClick={onOpenLogs} type="button">
        <Logs size={15} />
        <span className="ml-2">Logs</span>
      </button>

      <button className="button-secondary" onClick={onOpenSettings} type="button">
        <Settings2 size={15} />
        <span className="ml-2">Settings</span>
      </button>

      <button className="button-secondary" disabled={stopBusy || !hasActiveTweaks} onClick={onStopSession} type="button">
        <Square size={15} />
        <span className="ml-2">{stopBusy ? 'Stopping...' : 'Stop + rollback all'}</span>
      </button>

      <button className="button-secondary" disabled={!sessionAttached} onClick={onEndSession} type="button">
        <Power size={15} />
        <span className="ml-2">End session</span>
      </button>
    </div>
  )
}

