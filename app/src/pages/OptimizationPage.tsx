import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  ChevronDown,
  CircleHelp,
  Cpu,
  Crosshair,
  Gauge,
  Gamepad2,
  Keyboard,
  Logs,
  Power,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Panel } from '../components/Panel'
import type {
  ActivityEntry,
  ApplyRegistryPresetRequest,
  ApplyTweakRequest,
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  DashboardPayload,
  FeatureFlags,
  GameProfile,
  MlInferencePayload,
  OptimizationRuntimeState,
  OptimizationSummary,
  SystemSettings,
} from '../types'

type ToolTab = 'system' | 'ram'
type PresetMode = 'default' | 'high-performance' | 'custom'

interface OptimizationPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  dashboard: DashboardPayload
  featureFlags: FeatureFlags
  inference: MlInferencePayload | null
  lastTweakAtMs: number | null
  latestBenchmark: BenchmarkReport | null
  onAttachSession: (request: AttachSessionRequest) => void
  onCaptureBaseline: () => void
  onEndSession: () => void
  onOpenLogs: () => void
  onOpenSettings: () => void
  onPreviewRegistryPreset: (request: ApplyRegistryPresetRequest) => void
  onPreviewTweak: (request: ApplyTweakRequest) => void
  onRefresh: (processId?: number) => void
  onRollback: (snapshotId: string) => void
  onRunBenchmark: (profileId?: string) => void
  onSelectProcess: (processId: number) => void
  onStopSession: () => void
  optimization: OptimizationSummary
  profiles: GameProfile[]
  runtimeState: OptimizationRuntimeState
  selectedProcessId: number | null
  settings: SystemSettings
  stopBusy: boolean
}

interface ToggleCard {
  id: string
  title: string
  description: string
  caution: string
  icon: LucideIcon
  active: boolean
  blockedReason?: string
  hardDisabled?: boolean
  onToggle: (next: boolean) => boolean
}

const BENCHMARK_SECONDS = 60
const COMPARE_COOLDOWN_SECONDS = 5

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

function resolveProfile(profiles: GameProfile[], runtimeState: OptimizationRuntimeState, dashboard: DashboardPayload) {
  const recommendedId = runtimeState.session.recommended_profile_id ?? runtimeState.detected_game?.recommended_profile_id
  if (recommendedId) {
    const byId = profiles.find((profile) => profile.id === recommendedId)
    if (byId) return byId
  }
  const sampleName = (dashboard.history.at(-1)?.game_name ?? runtimeState.session.process_name ?? '').toLowerCase()
  return profiles.find((profile) => profile.detection_keywords.some((keyword) => sampleName.includes(keyword)))
}

function chooseOneClickRequest(input: {
  attachedProcessId: number | null
  inference: MlInferencePayload | null
  runtimeState: OptimizationRuntimeState
}): ApplyTweakRequest | null {
  const { attachedProcessId, inference, runtimeState } = input
  if (!attachedProcessId) return null
  const hints = (inference?.recommended_tweaks ?? []).map((item) => item.toLowerCase())
  if (hints.some((hint) => hint.includes('power') || hint.includes('plan'))) {
    const preferredPlan = runtimeState.power_plans.find(
      (plan) => !plan.active && /ultimate|high performance/i.test(plan.name),
    )
    if (preferredPlan) return { kind: 'power_plan', process_id: attachedProcessId, power_plan_guid: preferredPlan.guid }
  }
  if (hints.some((hint) => hint.includes('affinity') || hint.includes('core'))) {
    return { kind: 'cpu_affinity', process_id: attachedProcessId, affinity_preset: 'all_threads' }
  }
  return { kind: 'process_priority', process_id: attachedProcessId, priority: 'high' }
}

function findLatestUndoEntry(activity: ActivityEntry[], predicate: (entry: ActivityEntry) => boolean) {
  return [...activity]
    .reverse()
    .find((entry) => entry.can_undo && entry.snapshot_id && predicate(entry))
}

function toGb(mb: number | null | undefined) {
  if (!mb || Number.isNaN(mb)) return 'n/a'
  return `${(mb / 1024).toFixed(1)} GB`
}

function ToggleSwitch({
  active,
  pending,
  hardDisabled,
  onToggle,
}: {
  active: boolean
  pending?: boolean
  hardDisabled?: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      aria-checked={active}
      aria-label={active ? 'Disable tweak' : 'Enable tweak'}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        active ? 'bg-accent' : 'bg-surface-muted ring-1 ring-inset ring-border-strong/85'
      } ${pending ? 'ring-2 ring-accent/45' : ''} ${hardDisabled ? 'cursor-not-allowed opacity-45' : 'hover:opacity-90'}`}
      disabled={hardDisabled}
      onClick={() => onToggle(!active)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full border border-border/60 bg-white transition-[left] ${
          active ? 'left-[calc(100%-1.75rem)]' : 'left-1'
        }`}
      />
    </button>
  )
}

function TweakCard({
  card,
  pending,
  onOpenInfo,
  onOpenRisk,
}: {
  card: ToggleCard
  pending: boolean
  onOpenInfo: (id: string) => void
  onOpenRisk: (id: string) => void
}) {
  const Icon = card.icon
  return (
    <article className="rounded-[1.2rem] border border-border/65 bg-surface px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-surface-muted/80 ring-1 ring-inset ring-border/45">
          <Icon className="text-muted" size={24} />
        </div>
        <ToggleSwitch active={card.active || pending} hardDisabled={card.hardDisabled} onToggle={card.onToggle} pending={pending} />
      </div>

      <h3 className="mt-5 text-[1.05rem] font-semibold tracking-tight text-text">{card.title}</h3>

      {card.blockedReason ? <p className="mt-3 text-sm text-warning">{card.blockedReason}</p> : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          className="text-[13px] font-medium text-muted underline decoration-border-strong/60 underline-offset-4 hover:text-text"
          onClick={() => onOpenRisk(card.id)}
          type="button"
        >
          Not recommended if...
        </button>
        <button
          aria-label={`Open info for ${card.title}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-surface-muted text-muted hover:text-text"
          onClick={() => onOpenInfo(card.id)}
          type="button"
        >
          <CircleHelp size={14} />
        </button>
      </div>
    </article>
  )
}

export function OptimizationPage({
  benchmarkBaseline,
  benchmarkBusy,
  dashboard,
  featureFlags,
  inference,
  lastTweakAtMs,
  latestBenchmark,
  onAttachSession,
  onCaptureBaseline,
  onEndSession,
  onOpenLogs,
  onOpenSettings,
  onPreviewRegistryPreset,
  onPreviewTweak,
  onRefresh,
  onRollback,
  onRunBenchmark,
  onSelectProcess,
  onStopSession,
  optimization,
  profiles,
  runtimeState,
  selectedProcessId,
  settings,
  stopBusy,
}: OptimizationPageProps) {
  const [toolTab, setToolTab] = useState<ToolTab>('system')
  const [mode, setMode] = useState<PresetMode>('default')
  const [clockTick, setClockTick] = useState(0)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [uiHint, setUiHint] = useState<string | null>(null)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)
  const [detailModal, setDetailModal] = useState<{ cardId: string; kind: 'risk' | 'info' } | null>(null)

  useEffect(() => {
    if (!lastTweakAtMs) return
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(timer)
  }, [lastTweakAtMs])

  useEffect(() => {
    if (!pendingToggleId) return
    const timer = window.setTimeout(() => setPendingToggleId((current) => (current === pendingToggleId ? null : current)), 1800)
    return () => window.clearTimeout(timer)
  }, [pendingToggleId])

  const sessionAttached = runtimeState.session.state === 'attached' || runtimeState.session.state === 'active'
  const attachedProcessId = runtimeState.session.process_id ?? runtimeState.selected_process?.pid ?? selectedProcessId ?? null
  const processList = uniqueProcesses(runtimeState)
  const hasBaseline = Boolean(benchmarkBaseline)
  const hasActiveTweaks = runtimeState.session.active_tweaks.length > 0 || runtimeState.session.active_snapshot_ids.length > 0
  const canApply = sessionAttached && hasBaseline && featureFlags.network_optimizer
  const canCaptureBaseline = sessionAttached && !benchmarkBusy
  const elapsedSeconds = lastTweakAtMs ? Math.floor((Date.now() + clockTick * 0 - lastTweakAtMs) / 1000) : COMPARE_COOLDOWN_SECONDS
  const cooldownRemaining = Math.max(0, COMPARE_COOLDOWN_SECONDS - elapsedSeconds)
  const canCompare = hasBaseline && hasActiveTweaks && cooldownRemaining === 0 && !benchmarkBusy
  const matchedProfile = resolveProfile(profiles, runtimeState, dashboard)
  const latestSample = dashboard.history.at(-1) ?? null

  const registryById = useMemo(() => new Map(runtimeState.registry_presets.map((preset) => [preset.id, preset])), [runtimeState.registry_presets])
  const activeTweakSet = useMemo(() => new Set(runtimeState.session.active_tweaks), [runtimeState.session.active_tweaks])

  const oneClickRequest = chooseOneClickRequest({ attachedProcessId, inference, runtimeState })
  const oneClickHint = inference?.factors?.slice(0, 2).join(' | ') ?? optimization.next_action ?? 'Safe local heuristic path.'

  const selectedPowerPlan = useMemo(() => {
    const available = runtimeState.power_plans.filter((plan) => !plan.active)
    if (!available.length) return null
    if (mode === 'high-performance') {
      return available.find((plan) => /ultimate|high performance/i.test(plan.name)) ?? available[0]
    }
    return available[0]
  }, [mode, runtimeState.power_plans])

  const selectedProcessLabel = runtimeState.selected_process
    ? `${runtimeState.selected_process.name} (${runtimeState.selected_process.pid})`
    : selectedProcessId
      ? `PID ${selectedProcessId}`
      : 'None'

  const rollbackBy = (predicate: (entry: ActivityEntry) => boolean) => {
    const row = findLatestUndoEntry(runtimeState.activity, predicate)
    if (row?.snapshot_id) onRollback(row.snapshot_id)
  }

  const applyBlocker = !sessionAttached
    ? 'Session is not attached. Select and attach a process first.'
    : !hasBaseline
      ? `Baseline missing. Capture ${BENCHMARK_SECONDS}s before enabling tweaks.`
      : !featureFlags.network_optimizer
        ? 'Optimizer is disabled in Settings.'
        : null

  const startPending = (id: string) => setPendingToggleId(id)

  const processPriorityCard: ToggleCard = {
    id: 'max-games',
    title: 'Maximum performance for games',
    description: 'Raise game process priority.',
    caution: 'Not recommended if CPU load is unstable.',
    icon: Gamepad2,
    active: activeTweakSet.has('process_priority'),
    blockedReason: activeTweakSet.has('process_priority') ? undefined : applyBlocker ?? undefined,
    onToggle: (next) => {
      if (!next) {
        rollbackBy((entry) => entry.action === 'Priority applied')
        return true
      }
      startPending('max-games')
      if (applyBlocker || !attachedProcessId) {
        setUiHint(applyBlocker ?? 'No process selected.')
        return false
      }
      onPreviewTweak({
        kind: 'process_priority',
        process_id: attachedProcessId,
        priority: mode === 'high-performance' ? 'high' : 'above_normal',
      })
      return true
    },
  }

  const affinityCard: ToggleCard = {
    id: 'keep-cores',
    title: 'Keep all cores active',
    description: 'Apply CPU affinity preset.',
    caution: 'Not recommended if a game needs default scheduler behavior.',
    icon: Cpu,
    active: activeTweakSet.has('cpu_affinity'),
    blockedReason: activeTweakSet.has('cpu_affinity') ? undefined : applyBlocker ?? undefined,
    onToggle: (next) => {
      if (!next) {
        rollbackBy((entry) => entry.action === 'Affinity applied')
        return true
      }
      startPending('keep-cores')
      if (applyBlocker || !attachedProcessId) {
        setUiHint(applyBlocker ?? 'No process selected.')
        return false
      }
      onPreviewTweak({
        kind: 'cpu_affinity',
        process_id: attachedProcessId,
        affinity_preset: mode === 'high-performance' ? 'all_threads' : 'balanced_threads',
      })
      return true
    },
  }

  const powerCard: ToggleCard = {
    id: 'ultimate-power',
    title: 'Ultimate performance mode',
    description: selectedPowerPlan ? `Switch power plan to ${selectedPowerPlan.name}.` : 'Switch to a higher power plan.',
    caution: 'Not recommended on thermally constrained laptops.',
    icon: Zap,
    active: activeTweakSet.has('power_plan'),
    blockedReason: activeTweakSet.has('power_plan')
      ? undefined
      : applyBlocker ?? (!selectedPowerPlan ? 'No alternate power plan found.' : undefined),
    hardDisabled: !selectedPowerPlan,
    onToggle: (next) => {
      if (!next) {
        rollbackBy((entry) => entry.action === 'Power plan applied')
        return true
      }
      startPending('ultimate-power')
      if (applyBlocker || !selectedPowerPlan) {
        setUiHint(applyBlocker ?? 'No alternate power plan found.')
        return false
      }
      onPreviewTweak({
        kind: 'power_plan',
        process_id: attachedProcessId ?? undefined,
        power_plan_guid: selectedPowerPlan.guid,
      })
      return true
    },
  }

  const registryCard = (
    presetId: string,
    id: string,
    title: string,
    description: string,
    caution: string,
    icon: ToggleCard['icon'],
  ): ToggleCard => {
    const preset = registryById.get(presetId)
    const active = activeTweakSet.has(`registry:${presetId}`)
    return {
      id,
      title,
      description,
      caution,
      icon,
      active,
      hardDisabled: !preset,
      blockedReason: active ? undefined : preset?.blocking_reason ?? applyBlocker ?? (!preset ? 'Unavailable in this build.' : undefined),
      onToggle: (next) => {
        if (!next) {
          rollbackBy(
            (entry) =>
              entry.category === 'registry' &&
              (entry.detail.toLowerCase().includes((preset?.title ?? '').toLowerCase()) ||
                entry.detail.toLowerCase().includes(title.toLowerCase())),
          )
          return true
        }
        startPending(id)
        if (!preset) {
          setUiHint('Preset unavailable in this build.')
          return false
        }
        if (applyBlocker || preset.blocking_reason) {
          setUiHint(applyBlocker ?? preset.blocking_reason ?? 'Preset blocked.')
          return false
        }
        onPreviewRegistryPreset({ preset_id: preset.id, process_id: attachedProcessId ?? undefined })
        return true
      },
    }
  }

  const cards: ToggleCard[] = [
    registryCard(
      'mouse_precision_off',
      'reduce-input-lag',
      'Reduce input lag',
      'Disable mouse acceleration.',
      'Not recommended if you rely on mouse acceleration.',
      Crosshair,
    ),
    affinityCard,
    processPriorityCard,
    powerCard,
    registryCard(
      'game_capture_overhead_off',
      'turn-off-recordings',
      'Turn off Game Bar recordings',
      'Disable background capture overhead.',
      'Not recommended if you constantly record clips.',
      Keyboard,
    ),
    registryCard(
      'game_mode_on',
      'game-mode-on',
      'Force Game Mode on',
      'Enable Game Mode for the current user.',
      'Not recommended if you multitask heavily while gaming.',
      SlidersHorizontal,
    ),
    registryCard(
      'power_throttling_off',
      'power-throttling-off',
      'Turn off power throttling',
      'Disable Windows power throttling policy.',
      'Not recommended without admin rights and rollback plan.',
      ShieldAlert,
    ),
  ]

  const detailCard = detailModal ? cards.find((card) => card.id === detailModal.cardId) ?? null : null

  const handleCardToggle = (card: ToggleCard, next: boolean) => {
    const accepted = card.onToggle(next)
    if (!accepted) {
      window.setTimeout(() => setPendingToggleId((current) => (current === card.id ? null : current)), 1000)
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden p-0" variant="secondary">
        <div className="border-b border-border/70 bg-surface-elevated/90 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'system', label: 'System Tweaks' },
              { id: 'ram', label: 'RAM Cleaner' },
            ].map((item) => (
              <button
                key={item.id}
                className={`rounded-lg px-3 py-2 text-base font-semibold transition ${
                  toolTab === item.id ? 'bg-surface text-text' : 'text-muted hover:bg-hover hover:text-text'
                }`}
                onClick={() => setToolTab(item.id as ToolTab)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {toolTab === 'system' ? (
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-[1.1rem] border border-border/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[2rem] font-semibold tracking-tight text-text">System performance enhancements</h2>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'default', label: 'Default' },
                    { id: 'high-performance', label: 'High performance' },
                    { id: 'custom', label: 'Custom' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        mode === item.id
                          ? 'bg-surface-muted text-text ring-1 ring-inset ring-[#24d7a5]/70'
                          : 'bg-surface-muted/60 text-muted hover:text-text'
                      }`}
                      onClick={() => setMode(item.id as PresetMode)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="button-secondary"
                  onClick={() => {
                    setSessionPickerOpen((open) => !open)
                    setUiHint(null)
                  }}
                  type="button"
                >
                  <Activity size={15} />
                  <span className="ml-2">Session: {selectedProcessLabel}</span>
                  <ChevronDown className={`ml-2 transition ${sessionPickerOpen ? 'rotate-180' : ''}`} size={15} />
                </button>

                <button className="button-secondary" onClick={() => onRefresh(attachedProcessId ?? undefined)} type="button">
                  <RefreshCw size={15} />
                  <span className="ml-2">Refresh</span>
                </button>

                <button className="button-secondary" disabled={!canCaptureBaseline} onClick={onCaptureBaseline} type="button">
                  <Gauge size={15} />
                  <span className="ml-2">{benchmarkBusy ? 'Capturing...' : `Baseline ${BENCHMARK_SECONDS}s`}</span>
                </button>

                <button className="button-secondary" disabled={!canCompare} onClick={() => onRunBenchmark(matchedProfile?.id)} type="button">
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

              {sessionPickerOpen ? (
                <div className="mt-3 rounded-xl border border-border/60 bg-surface-muted/65 p-3">
                  {runtimeState.detected_game ? (
                    <button
                      className="mb-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-sm text-text"
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

                  <div className="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
                    {processList.length ? (
                      processList.map((process) => {
                        const selected = selectedProcessId === process.pid || runtimeState.selected_process?.pid === process.pid
                        return (
                          <button
                            key={process.pid}
                            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                              selected
                                ? 'border-border-strong/70 bg-surface text-text'
                                : 'border-border/70 bg-surface-muted text-muted hover:text-text'
                            }`}
                            onClick={() => {
                              onSelectProcess(process.pid)
                              setSessionPickerOpen(false)
                            }}
                            type="button"
                          >
                            {process.name} ({process.pid})
                          </button>
                        )
                      })
                    ) : (
                      <p className="text-sm text-muted">No processes found.</p>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <span>Session: {sessionAttached ? 'Attached' : 'Not attached'}</span>
                <span>Baseline: {hasBaseline ? 'Ready' : 'Missing'}</span>
                <span>Compare: {canCompare ? 'Ready' : cooldownRemaining > 0 ? `Cooldown ${cooldownRemaining}s` : 'Blocked'}</span>
                <span>Tweaks: {runtimeState.session.active_tweaks.length}</span>
                <span>Mode: {settings.automation_mode}</span>
                <span>Verdict: {latestBenchmark?.verdict ?? 'none'}</span>
              </div>

              {uiHint ? <p className="mt-3 text-sm text-warning">{uiHint}</p> : null}

              {mode === 'high-performance' ? (
                <div className="mt-4 rounded-lg border border-border/60 bg-surface-muted/70 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-sm text-text">
                      <Bot size={16} />
                      {oneClickHint}
                    </p>
                    <button
                      className="button-primary"
                      disabled={!canApply || !oneClickRequest}
                      onClick={() => {
                        if (!oneClickRequest) return
                        startPending('one-click')
                        onPreviewTweak(oneClickRequest)
                      }}
                      type="button"
                    >
                      <Zap size={16} />
                      <span className="ml-2">Start optimization</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {cards.map((card) => {
                const shownCard = {
                  ...card,
                  onToggle: (next: boolean) => {
                    handleCardToggle(card, next)
                    return true
                  },
                }
                return (
                  <TweakCard
                    key={card.id}
                    card={shownCard}
                    onOpenInfo={(cardId) => setDetailModal({ cardId, kind: 'info' })}
                    onOpenRisk={(cardId) => setDetailModal({ cardId, kind: 'risk' })}
                    pending={pendingToggleId === card.id}
                  />
                )
              })}
            </div>
          </div>
        ) : null}

        {toolTab === 'ram' ? (
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-[1.1rem] border border-border/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[1.9rem] font-semibold tracking-tight text-text">RAM cleaner</h2>
                  <p className="text-sm text-muted">Telemetry view only in this build.</p>
                </div>
                <button className="inline-flex items-center rounded-xl bg-danger px-5 py-2 text-base font-semibold text-white opacity-60" disabled type="button">
                  <RotateCcw size={18} />
                  <span className="ml-2">Clean</span>
                </button>
              </div>
              <div className="mt-4 h-6 overflow-hidden rounded-lg bg-surface-muted">
                <div
                  className="h-full rounded-lg bg-accent-soft"
                  style={{ width: `${Math.min(100, Math.max(0, latestSample?.memory_pressure_pct ?? 0))}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-base text-muted">
                <span className="inline-flex items-center gap-2">
                  <Cpu size={16} />
                  Used: {toGb(latestSample?.ram_working_set_mb)}
                </span>
                <span>Memory pressure: {(latestSample?.memory_pressure_pct ?? 0).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      {detailCard && detailModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-float">
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
              <h3 className="text-lg font-semibold tracking-tight text-muted">
                {detailModal.kind === 'risk' ? 'Not recommended if...' : 'What this tweak does'}
              </h3>
              <button
                aria-label="Close details modal"
                className="text-muted hover:text-text"
                onClick={() => setDetailModal(null)}
                type="button"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-6">
              {detailModal.kind === 'risk' ? (
                <p className="text-sm leading-7 text-muted">{detailCard.caution}</p>
              ) : (
                <p className="text-sm leading-7 text-muted">{detailCard.description}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
