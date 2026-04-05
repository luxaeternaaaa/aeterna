import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CircleHelp,
  Clock3,
  Cpu,
  Crosshair,
  Gamepad2,
  Keyboard,
  Layers,
  MonitorSmartphone,
  MonitorUp,
  Power,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Usb,
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
  requiresReboot?: boolean
  action:
    | {
        kind: 'tweak'
        request: (processId: number | null, runtimeState: OptimizationRuntimeState) => ApplyTweakRequest | null
      }
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
  process_isolation: 'process-isolation',
  interrupt_affinity_lock: 'interrupt-affinity-lock',
  disable_dynamic_ticks: 'disable-dynamic-ticks',
  disable_hpet: 'disable-hpet',
  timer_resolution_low: 'low-timer-resolution',
  usb_selective_suspend_off: 'usb-selective-suspend-off',
  pcie_lspm_off: 'pcie-lspm-off',
  'registry:mouse_precision_off': 'reduce-input-lag',
  'registry:game_capture_overhead_off': 'turn-off-recordings',
  'registry:game_mode_on': 'game-mode-on',
  'registry:power_throttling_off': 'power-throttling-off',
  'registry:windowed_optimizations_on': 'windowed-optimizations-on',
  'registry:fullscreen_optimizations_off': 'fullscreen-optimizations-off',
  'registry:gpu_preference_high': 'gpu-preference-high',
  'registry:hags_on': 'hags-on',
  'registry:mpo_off': 'mpo-off',
  'registry:sysmain_off': 'sysmain-off',
  'registry:windows_search_off': 'windows-search-off',
  'registry:dps_off': 'dps-off',
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
      aria-label={active ? 'Disable function' : 'Enable function'}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        active ? 'bg-[#3b82f6]' : 'bg-surface-muted ring-1 ring-inset ring-border-strong/85'
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
          className="text-[12px] font-medium text-muted underline decoration-border-strong/60 underline-offset-4 hover:text-text"
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
        description: 'Disables Windows mouse acceleration (Enhance Pointer Precision).',
        caution: 'Not recommended if your aiming profile depends on Windows acceleration behavior.',
        icon: Crosshair,
        action: { kind: 'preset', request: (processId) => ({ preset_id: 'mouse_precision_off', process_id: processId ?? undefined }) },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('mouse acceleration'),
      },
      {
        id: 'keep-cores',
        title: 'Keep all cores active',
        description: 'Sets game CPU affinity to all logical threads.',
        caution: 'Not recommended for games that perform better with default Windows scheduler balancing.',
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
        description: 'Raises selected game process priority to High.',
        caution: 'Not recommended if streaming/recording apps must keep stable CPU access in parallel.',
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
        description: 'Switches active power plan to Ultimate/High Performance.',
        caution: 'Not recommended for laptops with strict thermals, battery mode, or acoustic limits.',
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
        description: 'Removes process power-throttling for the selected game process.',
        caution: 'Not recommended for low-power profiles where sustained clocks cause thermal throttling.',
        icon: Layers,
        action: {
          kind: 'tweak',
          request: (processId) => (processId ? { kind: 'process_qos', process_id: processId } : null),
        },
        rollbackHint: (entry) => entry.action === 'Per-process QoS applied',
      },
      {
        id: 'process-isolation',
        title: 'Process isolation',
        description: 'Pins the game to one thread per core (anti-SMT overlap preset).',
        caution: 'Not recommended for CPU-heavy games that scale strongly with all logical threads.',
        icon: Cpu,
        action: {
          kind: 'tweak',
          request: (processId) => (processId ? { kind: 'process_isolation', process_id: processId } : null),
        },
        rollbackHint: (entry) => entry.action === 'Process isolation applied',
      },
      {
        id: 'turn-off-recordings',
        title: 'Turn off Game Bar recordings',
        description: 'Disables Game DVR background capture flags.',
        caution: 'Not recommended if you rely on instant replay or automatic gameplay clips.',
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
        description: 'Forces Windows Game Mode enabled for current user.',
        caution: 'Not recommended when heavy non-game workloads run simultaneously on the same machine.',
        icon: SlidersHorizontal,
        action: { kind: 'preset', request: (processId) => ({ preset_id: 'game_mode_on', process_id: processId ?? undefined }) },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('game mode'),
      },
      {
        id: 'windowed-optimizations-on',
        title: 'Windowed optimizations',
        description: 'Enables borderless/windowed DirectX optimization path.',
        caution: 'Not recommended if the specific game shows new frame pacing instability after enabling it.',
        icon: MonitorUp,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'windowed_optimizations_on', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('windowed optimizations'),
      },
      {
        id: 'fullscreen-optimizations-off',
        title: 'Disable fullscreen optimizations',
        description: 'Writes per-app compatibility flag to bypass fullscreen optimization layer.',
        caution: 'Not recommended unless that exact game has proven fullscreen optimization regressions.',
        icon: MonitorUp,
        action: {
          kind: 'preset',
          request: (processId) => (processId ? { preset_id: 'fullscreen_optimizations_off', process_id: processId } : null),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('fullscreen optimizations'),
      },
      {
        id: 'gpu-preference-high',
        title: 'Per-app GPU preference',
        description: 'Sets selected game executable to High performance GPU preference.',
        caution: 'Not recommended on iGPU-only systems or when dGPU power draw is a hard limit.',
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
        description: 'Disables machine-level PowerThrottling policy in registry.',
        caution: 'Not recommended if you need balanced thermals and battery behavior outside gaming sessions.',
        icon: ShieldAlert,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'power_throttling_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('power throttling'),
      },
      {
        id: 'hags-on',
        title: 'Enable HAGS',
        description: 'Enables Hardware-accelerated GPU scheduling (HwSchMode=2).',
        caution: 'Not recommended if your current GPU driver branch is unstable with HAGS on.',
        icon: Zap,
        requiresReboot: true,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'hags_on', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('hardware-accelerated gpu scheduling'),
      },
      {
        id: 'interrupt-affinity-lock',
        title: 'Interrupt affinity lock',
        description: 'Sets interrupt steering mode to lock routing in active power scheme.',
        caution: 'Not recommended if system already shows DPC/ISR imbalance on current CPU topology.',
        icon: Cpu,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'interrupt_affinity_lock' }),
        },
        rollbackHint: (entry) => entry.action === 'Interrupt affinity applied',
      },
      {
        id: 'disable-hpet',
        title: 'Deactivate HPET',
        description: 'Sets boot option useplatformclock=false.',
        caution: 'Not recommended if your platform timing stability depends on forced HPET mode.',
        icon: Clock3,
        requiresReboot: true,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'disable_hpet' }),
        },
        rollbackHint: (entry) => entry.action === 'HPET boot flag disabled',
      },
      {
        id: 'disable-dynamic-ticks',
        title: 'Disable Dynamic Ticks',
        description: 'Sets boot option disabledynamictick=yes.',
        caution: 'Not recommended on battery-first devices where idle power draw must stay minimal.',
        icon: Clock3,
        requiresReboot: true,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'disable_dynamic_ticks' }),
        },
        rollbackHint: (entry) => entry.action === 'Dynamic ticks disabled',
      },
      {
        id: 'low-timer-resolution',
        title: 'Lower timer resolution',
        description: 'Requests minimum system timer resolution through NtSetTimerResolution.',
        caution: 'Not recommended for long idle sessions because tighter timers increase wake-up frequency.',
        icon: Clock3,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'low_timer_resolution' }),
        },
        rollbackHint: (entry) => entry.action === 'Timer resolution lowered',
      },
      {
        id: 'mpo-off',
        title: 'Disable MPO',
        description: 'Sets DWM OverlayTestMode=5 to bypass Multiplane Overlay path.',
        caution: 'Not recommended if your desktop/multimedia workflow currently relies on MPO behavior.',
        icon: Layers,
        requiresReboot: true,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'mpo_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('multiplane overlay'),
      },
      {
        id: 'usb-selective-suspend-off',
        title: 'Disable USB selective suspend',
        description: 'Sets USB selective suspend AC/DC indexes to Disabled.',
        caution: 'Not recommended for battery-sensitive mobile devices with multiple USB peripherals.',
        icon: Usb,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'usb_selective_suspend_off' }),
        },
        rollbackHint: (entry) => entry.action === 'USB selective suspend disabled',
      },
      {
        id: 'pcie-lspm-off',
        title: 'Disable PCIe LSPM',
        description: 'Sets PCIe Link State Power Management AC/DC to Off.',
        caution: 'Not recommended for systems where PCIe idle power savings are required.',
        icon: Power,
        action: {
          kind: 'tweak',
          request: () => ({ kind: 'pcie_lspm_off' }),
        },
        rollbackHint: (entry) => entry.action === 'PCIe LSPM disabled',
      },
      {
        id: 'sysmain-off',
        title: 'Disable SysMain service',
        description: 'Disables SysMain startup and sends stop command.',
        caution: 'Not recommended if your workload benefits from aggressive prefetch caching behavior.',
        icon: Cpu,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'sysmain_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('sysmain'),
      },
      {
        id: 'windows-search-off',
        title: 'Disable Windows Search service',
        description: 'Disables WSearch startup and sends stop command.',
        caution: 'Not recommended if you rely on real-time indexed search across large local datasets.',
        icon: Search,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'windows_search_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('windows search'),
      },
      {
        id: 'dps-off',
        title: 'Disable Diagnostic Policy Service',
        description: 'Disables DPS startup and sends stop command.',
        caution: 'Not recommended if you need built-in Windows troubleshooting diagnostics during sessions.',
        icon: ShieldAlert,
        action: {
          kind: 'preset',
          request: (processId) => ({ preset_id: 'dps_off', process_id: processId ?? undefined }),
        },
        rollbackHint: (entry) => entry.detail.toLowerCase().includes('diagnostic policy service'),
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
    setStatusText(`Cannot apply "${card.title}": select or attach a game process first.`)
    return null
  }

  const buildTweakRequest = async (card: ToggleCard): Promise<ApplyTweakRequest | null> => {
    let request = card.action.kind === 'tweak' ? card.action.request(null, runtimeState) : null
    if (request) return request
    const processId = await ensureProcessId(card)
    if (!processId) return null
    request = card.action.kind === 'tweak' ? card.action.request(processId, runtimeState) : null
    return request
  }

  const buildPresetRequest = async (card: ToggleCard): Promise<ApplyRegistryPresetRequest | null> => {
    let request = card.action.kind === 'preset' ? card.action.request(null) : null
    if (request) return request
    const processId = await ensureProcessId(card)
    if (!processId) return null
    request = card.action.kind === 'preset' ? card.action.request(processId) : null
    return request
  }

  const toggleCard = async (card: ToggleCard, next: boolean) => {
    setBusyCardId(card.id)
    setStatusText(null)
    try {
      if (next) {
        if (card.action.kind === 'tweak') {
          const request = await buildTweakRequest(card)
          if (!request) {
            setStatusText(`Cannot apply "${card.title}": required target is unavailable.`)
            return
          }
          const result = await onApplyTweak(request)
          setSelected((current) => new Set(current).add(card.id))
          setSnapshotMap((current) => ({ ...current, [card.id]: result.snapshot.id }))
          if (card.requiresReboot) {
            setStatusText(`${card.title} applied. Restart Windows to finalize.`)
          }
          return
        }

        const request = await buildPresetRequest(card)
        if (!request) {
          setStatusText(`Cannot apply "${card.title}": required target is unavailable.`)
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
          if (card.requiresReboot) {
            setStatusText(`${card.title} applied. Restart Windows to finalize.`)
          }
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
      if (card.requiresReboot) {
        setStatusText(`${card.title} reverted. Restart Windows to restore boot/driver behavior.`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.'
      setStatusText(message)
    } finally {
      setBusyCardId(null)
    }
  }

  const revertAllEnabled = async () => {
    if (busyCardId) return
    const activeCards = cards.filter((card) => selected.has(card.id))
    if (activeCards.length === 0) {
      setStatusText('No enabled functions to revert.')
      return
    }

    setBusyCardId('revert-all')
    setStatusText(null)

    const nextSelected = new Set(selected)
    const nextSnapshotMap = { ...snapshotMap }
    const failed: string[] = []
    let revertedCount = 0
    let rebootNotice = false

    for (const card of activeCards) {
      const snapshotId = nextSnapshotMap[card.id] ?? resolveRuntimeSnapshot(card)
      if (!snapshotId) {
        nextSelected.delete(card.id)
        delete nextSnapshotMap[card.id]
        continue
      }
      try {
        await onRollbackSnapshot(snapshotId, runtimeState.session.process_id ?? runtimeState.detected_game?.pid ?? undefined)
        nextSelected.delete(card.id)
        delete nextSnapshotMap[card.id]
        revertedCount += 1
        if (card.requiresReboot) rebootNotice = true
      } catch {
        failed.push(card.title)
      }
    }

    setSelected(nextSelected)
    setSnapshotMap(nextSnapshotMap)

    if (failed.length > 0) {
      setStatusText(`Reverted ${revertedCount} function(s). Failed: ${failed.join(', ')}.`)
    } else if (rebootNotice) {
      setStatusText(`Reverted ${revertedCount} function(s). Restart Windows to finalize restored boot/driver flags.`)
    } else {
      setStatusText(`Reverted ${revertedCount} function(s).`)
    }

    setBusyCardId(null)
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
                <div className="flex flex-wrap items-center gap-2">
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
                  <button
                    className="inline-flex items-center rounded-xl border border-border/70 bg-surface-muted/60 px-4 py-2 text-sm font-semibold text-text transition hover:bg-hover disabled:opacity-50"
                    disabled={busyCardId !== null || selected.size === 0}
                    onClick={() => {
                      void revertAllEnabled()
                    }}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    <span className="ml-2">Revert All Functions</span>
                  </button>
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
                {detailModal.kind === 'risk' ? 'Not recommended if...' : 'What this function changes'}
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
