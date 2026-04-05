import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CircleHelp,
  Cpu,
  Crosshair,
  Gamepad2,
  Layers,
  Keyboard,
  MonitorSmartphone,
  MonitorUp,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Panel } from '../components/Panel'
import type {
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  DashboardPayload,
  OptimizationRuntimeState,
  RollbackResponse,
} from '../types'

type ToolTab = 'system' | 'ram'
type PresetMode = 'default' | 'high-performance' | 'custom'

type DetailModalState = { cardId: string; kind: 'risk' | 'info' } | null

interface OptimizationPageProps {
  dashboard: DashboardPayload
  runtimeState: OptimizationRuntimeState
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<OptimizationRuntimeState>
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
}

interface ToggleCard {
  id: string
  title: string
  description: string
  caution: string
  icon: LucideIcon
  action:
    | { kind: 'tweak'; request: (processId: number | null, runtimeState: OptimizationRuntimeState) => ApplyTweakRequest | null }
    | { kind: 'preset'; request: (processId: number | null) => ApplyRegistryPresetRequest | null }
  rollbackHint: (entry: { action: string; detail: string }) => boolean
}

const STORAGE_KEY = 'aeterna.optimization.selection'
const SNAPSHOT_STORAGE_KEY = 'aeterna.optimization.snapshots'

const ACTIVE_TWEAK_TO_CARD: Record<string, string> = {
  process_priority: 'max-games',
  cpu_affinity: 'keep-cores',
  power_plan: 'ultimate-power',
  process_qos: 'process-qos-high',
  'registry:mouse_precision_off': 'reduce-input-lag',
  'registry:game_capture_overhead_off': 'turn-off-recordings',
  'registry:game_mode_on': 'game-mode-on',
  'registry:power_throttling_off': 'power-throttling-off',
  'registry:windowed_optimizations_on': 'windowed-optimizations-on',
  'registry:gpu_preference_high': 'gpu-preference-high',
}

function hydrateSelection(runtimeState: OptimizationRuntimeState): Set<string> {
  try {
    const storedRaw = window.localStorage.getItem(STORAGE_KEY)
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((item): item is string => typeof item === 'string')
        return new Set(valid)
      }
    }
  } catch {
    // Ignore malformed local preferences and rebuild from runtime state.
  }

  const initial = new Set<string>()
  for (const tweak of runtimeState.session.active_tweaks) {
    const cardId = ACTIVE_TWEAK_TO_CARD[tweak]
    if (cardId) initial.add(cardId)
  }
  return initial
}

function toGb(mb: number | null | undefined) {
  if (!mb || Number.isNaN(mb)) return 'n/a'
  return `${(mb / 1024).toFixed(1)} GB`
}

function loadSnapshotMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function persistSnapshotMap(snapshotMap: Record<string, string>) {
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshotMap))
}

function ToggleSwitch({ active, onToggle }: { active: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button
      aria-checked={active}
      aria-label={active ? 'Disable tweak' : 'Enable tweak'}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        active ? 'bg-accent' : 'bg-surface-muted ring-1 ring-inset ring-border-strong/85'
      } hover:opacity-90`}
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
  active,
  onToggle,
  onOpenInfo,
  onOpenRisk,
}: {
  card: ToggleCard
  active: boolean
  onToggle: (next: boolean) => void
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
        <ToggleSwitch active={active} onToggle={onToggle} />
      </div>

      <h3 className="mt-5 text-[1.05rem] font-semibold tracking-tight text-text">{card.title}</h3>

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
  dashboard,
  runtimeState,
  onApplyRegistryPreset,
  onApplyTweak,
  onAttachSession,
  onRollbackSnapshot,
}: OptimizationPageProps) {
  const [toolTab, setToolTab] = useState<ToolTab>('system')
  const [mode, setMode] = useState<PresetMode>('default')
  const [detailModal, setDetailModal] = useState<DetailModalState>(null)
  const [selected, setSelected] = useState<Set<string>>(() => hydrateSelection(runtimeState))
  const [snapshotMap, setSnapshotMap] = useState<Record<string, string>>(() => loadSnapshotMap())
  const [busyCardId, setBusyCardId] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selected.values())))
  }, [selected])
  useEffect(() => {
    persistSnapshotMap(snapshotMap)
  }, [snapshotMap])

  const latestSample = dashboard.history.at(-1) ?? null

  const cards: ToggleCard[] = useMemo(
    () => [
      {
        id: 'reduce-input-lag',
        title: 'Reduce input lag',
        description: 'Disables Windows mouse acceleration.',
        caution: 'Not recommended if you use non-RawInput aim muscle memory.',
        icon: Crosshair,
        action: { kind: 'preset', request: (processId) => ({ preset_id: 'mouse_precision_off', process_id: processId ?? undefined }) },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('disable mouse acceleration'),
      },
      {
        id: 'keep-cores',
        title: 'Keep all cores active',
        description: 'Sets CPU affinity to all logical threads.',
        caution: 'Not recommended if the game scales better with default scheduling.',
        icon: Cpu,
        action: {
          kind: 'tweak',
          request: (processId) =>
            processId ? { kind: 'cpu_affinity', process_id: processId, affinity_preset: 'all_threads' } : null,
        },
        rollbackHint: (entry) => entry.action === 'Affinity applied',
      },
      {
        id: 'max-games',
        title: 'Maximum performance for games',
        description: 'Raises game process priority to High.',
        caution: 'Not recommended if background apps must stay responsive.',
        icon: Gamepad2,
        action: {
          kind: 'tweak',
          request: (processId) => (processId ? { kind: 'process_priority', process_id: processId, priority: 'high' } : null),
        },
        rollbackHint: (entry) => entry.action === 'Priority applied',
      },
      {
        id: 'ultimate-power',
        title: 'Ultimate performance mode',
        description: 'Switches active power plan to fastest available.',
        caution: 'Not recommended on hot/noisy laptop profiles.',
        icon: Zap,
        action: {
          kind: 'tweak',
          request: (_processId, state) => {
            const plan =
              state.power_plans.find((row) => row.name.toLowerCase().includes('ultimate performance')) ??
              state.power_plans.find((row) => row.name.toLowerCase().includes('high performance')) ??
              null
            if (!plan) return null
            return { kind: 'power_plan', power_plan_guid: plan.guid }
          },
        },
        rollbackHint: (entry) => entry.action === 'Power plan applied',
      },
      {
        id: 'process-qos-high',
        title: 'Per-process QoS',
        description: 'Applies High QoS to the game process.',
        caution: 'Not recommended for battery mode or thermally limited systems.',
        icon: Layers,
        action: {
          kind: 'tweak',
          request: (processId) => (processId ? { kind: 'process_qos', process_id: processId } : null),
        },
        rollbackHint: (entry) => entry.action === 'Per-process QoS applied',
      },
      {
        id: 'turn-off-recordings',
        title: 'Turn off Game Bar recordings',
        description: 'Disables Game DVR background capture.',
        caution: 'Not recommended if instant clip recording is required.',
        icon: Keyboard,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'game_capture_overhead_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('capture overhead'),
      },
      {
        id: 'game-mode-on',
        title: 'Force Game Mode on',
        description: 'Forces Windows Game Mode to enabled.',
        caution: 'Not recommended while heavy multitasking in parallel.',
        icon: SlidersHorizontal,
        action: { kind: 'preset', request: (processId) => ({ preset_id: 'game_mode_on', process_id: processId ?? undefined }) },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('game mode'),
      },
      {
        id: 'windowed-optimizations-on',
        title: 'Windowed optimizations',
        description: 'Enables borderless/windowed DirectX optimizations.',
        caution: 'Not recommended if a specific game gets new stutter after enabling.',
        icon: MonitorUp,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'windowed_optimizations_on', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('windowed optimizations'),
      },
      {
        id: 'gpu-preference-high',
        title: 'Per-app GPU preference',
        description: 'Sets selected game to High performance GPU.',
        caution: 'Not recommended on integrated-GPU-only systems.',
        icon: MonitorSmartphone,
        action: {
          kind: 'preset',
          request: (processId) => (processId ? { preset_id: 'gpu_preference_high', process_id: processId } : null),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('gpu preference'),
      },
      {
        id: 'power-throttling-off',
        title: 'Turn off power throttling',
        description: 'Disables machine-level power throttling policy.',
        caution: 'Not recommended without admin rights and rollback plan.',
        icon: ShieldAlert,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'power_throttling_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('power throttling'),
      },
    ],
    [],
  )

  const detailCard = detailModal ? cards.find((card) => card.id === detailModal.cardId) ?? null : null

  const resolveRuntimeSnapshot = (card: ToggleCard) => {
    const match = runtimeState.activity
      .filter((entry) => entry.snapshot_id && entry.can_undo)
      .slice()
      .reverse()
      .find((entry) => card.rollbackHint({ action: entry.action, detail: entry.detail }))
    return match?.snapshot_id ?? null
  }

  const ensureProcessId = async (card: ToggleCard) => {
    if (runtimeState.session.process_id) return runtimeState.session.process_id
    if (runtimeState.detected_game?.pid && runtimeState.detected_game.exe_name) {
      await onAttachSession({
        process_id: runtimeState.detected_game.pid,
        process_name: runtimeState.detected_game.exe_name,
      })
      return runtimeState.detected_game.pid
    }
    setStatusText(`Cannot apply "${card.title}": game process is not selected.`)
    return null
  }

  const toggleCard = async (card: ToggleCard, next: boolean) => {
    setBusyCardId(card.id)
    setStatusText(null)
    try {
      if (next) {
        const processId = await ensureProcessId(card)
        if (card.action.kind === 'tweak') {
          const request = card.action.request(processId, runtimeState)
          if (!request) {
            setStatusText(`Cannot apply "${card.title}": required runtime target not available.`)
            return
          }
          const result = await onApplyTweak(request)
          setSelected((current) => new Set(current).add(card.id))
          setSnapshotMap((current) => ({ ...current, [card.id]: result.snapshot.id }))
          return
        }

        const request = card.action.request(processId)
        if (!request) {
          setStatusText(`Cannot apply "${card.title}": required runtime target not available.`)
          return
        }
        const result = await onApplyRegistryPreset(request)
        if (result.status === 'blocked') {
          setStatusText(result.blocking_reason ?? `Cannot apply "${card.title}" right now.`)
          return
        }
        const snapshotId = result.snapshot?.id
        if (snapshotId) {
          setSelected((current) => new Set(current).add(card.id))
          setSnapshotMap((current) => ({ ...current, [card.id]: snapshotId }))
          return
        }
        setStatusText(`Preset "${card.title}" applied without rollback snapshot.`)
        return
      }

      const knownSnapshotId = snapshotMap[card.id] ?? resolveRuntimeSnapshot(card)
      if (!knownSnapshotId) {
        setSelected((current) => {
          const nextSet = new Set(current)
          nextSet.delete(card.id)
          return nextSet
        })
        setSnapshotMap((current) => {
          const nextMap = { ...current }
          delete nextMap[card.id]
          return nextMap
        })
        return
      }
      await onRollbackSnapshot(knownSnapshotId, runtimeState.session.process_id ?? runtimeState.detected_game?.pid ?? undefined)
      setSelected((current) => {
        const nextSet = new Set(current)
        nextSet.delete(card.id)
        return nextSet
      })
      setSnapshotMap((current) => {
        const nextMap = { ...current }
        delete nextMap[card.id]
        return nextMap
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.'
      setStatusText(message)
    } finally {
      setBusyCardId(null)
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
                <h2 className="text-[2rem] font-semibold tracking-tight text-text">Optimization</h2>
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
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {cards.map((card) => (
                <TweakCard
                  key={card.id}
                  active={selected.has(card.id)}
                  card={card}
                  onOpenInfo={(cardId) => setDetailModal({ cardId, kind: 'info' })}
                  onOpenRisk={(cardId) => setDetailModal({ cardId, kind: 'risk' })}
                  onToggle={(next) => {
                    if (busyCardId) return
                    void toggleCard(card, next)
                  }}
                />
              ))}
            </div>
            {statusText ? (
              <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <span>{statusText}</span>
              </div>
            ) : null}
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
