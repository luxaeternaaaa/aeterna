import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BellOff,
  Boxes,
  Brush,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  Gamepad2,
  HardDrive,
  Info,
  Keyboard,
  Lock,
  Map,
  MonitorUp,
  MousePointer2,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Usb,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type {
  ActivityEntry,
  ApplyRegistryPresetRequest,
  ApplyRegistryPresetResponse,
  ApplyTweakRequest,
  ApplyTweakResponse,
  AttachSessionRequest,
  AutorunEntry,
  DashboardPayload,
  OptimizationRuntimeState,
  RollbackResponse,
} from '../types'

type CategoryId = 'basic' | 'security' | 'power' | 'debloat' | 'services' | 'privacy' | 'tweaks' | 'autoruns'
type MethodMode = 'default' | 'optimal' | 'maximum'
type ItemMode = 'optimal' | 'maximum' | 'manual'

type OptimizerRequest =
  | { kind: 'tweak'; payload: ApplyTweakRequest }
  | { kind: 'preset'; payload: ApplyRegistryPresetRequest }

interface OptimizationPageProps {
  dashboard: DashboardPayload
  runtimeState: OptimizationRuntimeState
  onApplyRegistryPreset: (request: ApplyRegistryPresetRequest) => Promise<ApplyRegistryPresetResponse>
  onApplyTweak: (request: ApplyTweakRequest) => Promise<ApplyTweakResponse>
  onAttachSession: (request: AttachSessionRequest) => Promise<OptimizationRuntimeState>
  onRefresh: () => void | Promise<void>
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
}

interface OptimizerItem {
  id: string
  category: CategoryId
  title: string
  description: string
  warning?: string
  detail?: string
  icon: LucideIcon
  mode: ItemMode
  requiresProcess?: boolean
  requiresReboot?: boolean
  supported?: boolean
  buildRequest: (context: { processId: number | null; runtimeState: OptimizationRuntimeState }) => OptimizerRequest | null
  rollbackHint: (entry: ActivityEntry) => boolean
}

const STORAGE_KEY = 'aeterna.optimization.v2.desired'
const SNAPSHOT_STORAGE_KEY = 'aeterna.optimization.v2.snapshots'

const categories: Array<{ id: CategoryId; label: string; icon: LucideIcon }> = [
  { id: 'basic', label: 'Basic', icon: SlidersHorizontal },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'power', label: 'Power Management', icon: Power },
  { id: 'debloat', label: 'Debloat', icon: Trash2 },
  { id: 'services', label: 'Service Groups', icon: Boxes },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'tweaks', label: 'Tweaks', icon: Sparkles },
  { id: 'autoruns', label: 'Autoruns', icon: Activity },
]

const activeTweakToItem: Record<string, string> = {
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
  autorun_disable: 'autorun-disable',
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
  'registry:diagtrack_off': 'diagtrack-off',
  'registry:maps_broker_off': 'maps-broker-off',
  'registry:xbox_services_off': 'xbox-services-off',
  'registry:consumer_features_off': 'consumer-features-off',
  'registry:content_delivery_off': 'content-delivery-off',
  'registry:widgets_off': 'widgets-off',
  'registry:advertising_id_off': 'advertising-id-off',
  'registry:telemetry_minimal': 'telemetry-minimal',
  'registry:feedback_frequency_off': 'feedback-frequency-off',
  'registry:activity_history_off': 'activity-history-off',
  'registry:windows_error_reporting_off': 'windows-error-reporting-off',
  'registry:app_launch_tracking_off': 'app-launch-tracking-off',
  'registry:smartscreen_on': 'smartscreen-on',
  'registry:memory_integrity_off': 'memory-integrity-off',
  'registry:ntfs_last_access_off': 'ntfs-last-access-off',
}

const presetToItem: Record<string, string> = Object.fromEntries(
  Object.entries(activeTweakToItem)
    .filter(([key]) => key.startsWith('registry:'))
    .map(([key, value]) => [key.replace('registry:', ''), value]),
)

function highestPerformancePlanGuid(runtimeState: OptimizationRuntimeState): string | null {
  const plan =
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('ultimate performance')) ??
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('high performance')) ??
    null
  return plan?.guid ?? null
}

function presetRequest(presetId: string, processId: number | null): OptimizerRequest {
  return { kind: 'preset', payload: { preset_id: presetId, process_id: processId ?? undefined } }
}

function detailIncludes(entry: ActivityEntry, value: string): boolean {
  return entry.detail.toLowerCase().includes(value.toLowerCase())
}

function matchAction(action: string): (entry: ActivityEntry) => boolean {
  return (entry) => entry.action === action
}

function matchPreset(title: string): (entry: ActivityEntry) => boolean {
  return (entry) => entry.action === 'System preset applied' && detailIncludes(entry, title)
}

function staticItems(): OptimizerItem[] {
  return [
    {
      id: 'reduce-input-lag',
      category: 'basic',
      title: 'Mouse acceleration',
      description: 'Disables Enhance Pointer Precision for consistent mouse input.',
      warning: 'Leave enabled if your aim profile was built around Windows pointer acceleration.',
      icon: MousePointer2,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('mouse_precision_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'mouse acceleration'),
    },
    {
      id: 'game-mode-on',
      category: 'basic',
      title: 'Game Mode',
      description: 'Forces Windows Game Mode on for the current user.',
      icon: Gamepad2,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('game_mode_on', processId),
      rollbackHint: matchPreset('Force Game Mode on'),
    },
    {
      id: 'turn-off-recordings',
      category: 'basic',
      title: 'Game Bar recordings',
      description: 'Disables Game DVR background capture flags.',
      warning: 'Instant replay and automatic clips will stop working while this is active.',
      icon: Keyboard,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('game_capture_overhead_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'capture overhead') || detailIncludes(entry, 'Game DVR'),
    },
    {
      id: 'windowed-optimizations-on',
      category: 'basic',
      title: 'Windowed optimizations',
      description: 'Enables the Windows borderless/windowed DirectX optimization path.',
      icon: MonitorUp,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('windowed_optimizations_on', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'windowed optimizations'),
    },
    {
      id: 'fullscreen-optimizations-off',
      category: 'basic',
      title: 'Fullscreen Optimizations',
      description: 'Disables fullscreen optimizations for the attached executable.',
      warning: 'Requires a selected process and should be used only when that game regresses with FSO.',
      icon: MonitorUp,
      mode: 'maximum',
      requiresProcess: true,
      buildRequest: ({ processId }) => (processId ? presetRequest('fullscreen_optimizations_off', processId) : null),
      rollbackHint: (entry) => detailIncludes(entry, 'fullscreen optimizations'),
    },
    {
      id: 'gpu-preference-high',
      category: 'basic',
      title: 'High performance GPU',
      description: 'Sets the attached executable to High Performance GPU preference.',
      icon: Gauge,
      mode: 'maximum',
      requiresProcess: true,
      buildRequest: ({ processId }) => (processId ? presetRequest('gpu_preference_high', processId) : null),
      rollbackHint: (entry) => detailIncludes(entry, 'GPU preference'),
    },
    {
      id: 'smartscreen-on',
      category: 'security',
      title: 'SmartScreen protection',
      description: 'Keeps Windows SmartScreen explicitly enabled by policy.',
      detail: 'Security category keeps protective defaults unless Maximum is selected.',
      icon: ShieldCheck,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('smartscreen_on', processId),
      rollbackHint: matchPreset('Keep SmartScreen enabled'),
    },
    {
      id: 'memory-integrity-off',
      category: 'security',
      title: 'Memory Integrity (VBS)',
      description: 'Disables Hypervisor-protected Code Integrity for latency-sensitive systems.',
      warning: 'This reduces Windows security isolation and requires a restart.',
      icon: Shield,
      mode: 'maximum',
      requiresReboot: true,
      buildRequest: ({ processId }) => presetRequest('memory_integrity_off', processId),
      rollbackHint: matchPreset('Disable Memory Integrity'),
    },
    {
      id: 'ultimate-power',
      category: 'power',
      title: 'Highest power plan',
      description: 'Switches to Ultimate Performance or High Performance when available.',
      icon: Zap,
      mode: 'optimal',
      buildRequest: ({ runtimeState }) => {
        const powerPlanGuid = highestPerformancePlanGuid(runtimeState)
        return powerPlanGuid ? { kind: 'tweak', payload: { kind: 'power_plan', power_plan_guid: powerPlanGuid } } : null
      },
      rollbackHint: matchAction('Power plan applied'),
    },
    {
      id: 'power-throttling-off',
      category: 'power',
      title: 'Power Throttling',
      description: 'Disables machine-level PowerThrottling policy.',
      warning: 'This can increase thermals and battery drain outside gaming sessions.',
      icon: Power,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('power_throttling_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'power throttling'),
    },
    {
      id: 'usb-selective-suspend-off',
      category: 'power',
      title: 'USB selective suspend',
      description: 'Disables USB selective suspend for AC/DC power mode.',
      icon: Usb,
      mode: 'optimal',
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'usb_selective_suspend_off' } }),
      rollbackHint: matchAction('USB selective suspend disabled'),
    },
    {
      id: 'pcie-lspm-off',
      category: 'power',
      title: 'PCIe Link State Power Management',
      description: 'Sets PCIe LSPM AC/DC indexes to Off.',
      icon: HardDrive,
      mode: 'optimal',
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'pcie_lspm_off' } }),
      rollbackHint: matchAction('PCIe LSPM disabled'),
    },
    {
      id: 'hags-on',
      category: 'power',
      title: 'HAGS',
      description: 'Enables Hardware-accelerated GPU scheduling.',
      warning: 'Restart required. Skip if your GPU driver branch is unstable with HAGS.',
      icon: Gauge,
      mode: 'maximum',
      requiresReboot: true,
      buildRequest: ({ processId }) => presetRequest('hags_on', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'hardware-accelerated gpu scheduling'),
    },
    {
      id: 'content-delivery-off',
      category: 'debloat',
      title: 'Suggested apps',
      description: 'Disables promoted content and silent suggested app installation for the current user.',
      icon: Sparkles,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('content_delivery_off', processId),
      rollbackHint: matchPreset('Disable suggested apps and lock screen content'),
    },
    {
      id: 'consumer-features-off',
      category: 'debloat',
      title: 'Windows consumer content',
      description: 'Blocks Windows consumer feature provisioning by policy.',
      icon: Boxes,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('consumer_features_off', processId),
      rollbackHint: matchPreset('Disable Windows consumer content'),
    },
    {
      id: 'widgets-off',
      category: 'debloat',
      title: 'Widgets and News',
      description: 'Disables Widgets/News taskbar background surface by policy.',
      icon: Brush,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('widgets_off', processId),
      rollbackHint: matchPreset('Disable Widgets and News'),
    },
    {
      id: 'sysmain-off',
      category: 'services',
      title: 'SysMain',
      description: 'Disables SysMain startup and stops the service.',
      warning: 'Do not use if your workload benefits from prefetch caching.',
      icon: Database,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('sysmain_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'SysMain'),
    },
    {
      id: 'windows-search-off',
      category: 'services',
      title: 'Indexing',
      description: 'Disables Windows Search startup and stops indexing service.',
      warning: 'Windows indexed search will be slower while disabled.',
      icon: Search,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('windows_search_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'Windows Search'),
    },
    {
      id: 'dps-off',
      category: 'services',
      title: 'Diagnostic Policy Service',
      description: 'Disables DPS startup and stops the service.',
      warning: 'Built-in Windows troubleshooters can stop reporting diagnostics.',
      icon: Shield,
      mode: 'maximum',
      buildRequest: ({ processId }) => presetRequest('dps_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'Diagnostic Policy Service'),
    },
    {
      id: 'diagtrack-off',
      category: 'services',
      title: 'Telemetry service',
      description: 'Disables Connected User Experiences and Telemetry service.',
      icon: Activity,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('diagtrack_off', processId),
      rollbackHint: matchPreset('Disable Connected User Experiences telemetry service'),
    },
    {
      id: 'maps-broker-off',
      category: 'services',
      title: 'Downloaded Maps',
      description: 'Disables offline maps maintenance service.',
      icon: Map,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('maps_broker_off', processId),
      rollbackHint: matchPreset('Disable downloaded maps service'),
    },
    {
      id: 'xbox-services-off',
      category: 'services',
      title: 'Xbox services',
      description: 'Disables Xbox background services when they are not used.',
      warning: 'Do not disable if Xbox app, Game Pass, controller services, or cloud saves are required.',
      icon: Gamepad2,
      mode: 'maximum',
      buildRequest: ({ processId }) => presetRequest('xbox_services_off', processId),
      rollbackHint: matchPreset('Disable Xbox background services'),
    },
    {
      id: 'advertising-id-off',
      category: 'privacy',
      title: 'Advertising ID',
      description: 'Disables the per-user advertising identifier.',
      icon: Shield,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('advertising_id_off', processId),
      rollbackHint: matchPreset('Disable advertising ID'),
    },
    {
      id: 'telemetry-minimal',
      category: 'privacy',
      title: 'Windows diagnostic telemetry',
      description: 'Sets Windows diagnostic telemetry policy to the minimum value.',
      icon: Activity,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('telemetry_minimal', processId),
      rollbackHint: matchPreset('Set Windows diagnostic telemetry to minimum'),
    },
    {
      id: 'feedback-frequency-off',
      category: 'privacy',
      title: 'Feedback prompts',
      description: 'Disables Windows feedback prompt frequency for the current user.',
      icon: BellOff,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('feedback_frequency_off', processId),
      rollbackHint: matchPreset('Disable feedback prompts'),
    },
    {
      id: 'activity-history-off',
      category: 'privacy',
      title: 'Activity history sync',
      description: 'Disables activity history publishing and upload policies.',
      icon: Database,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('activity_history_off', processId),
      rollbackHint: matchPreset('Disable activity history sync'),
    },
    {
      id: 'windows-error-reporting-off',
      category: 'privacy',
      title: 'Windows Error Reporting',
      description: 'Disables Windows Error Reporting background collection.',
      icon: Info,
      mode: 'maximum',
      buildRequest: ({ processId }) => presetRequest('windows_error_reporting_off', processId),
      rollbackHint: matchPreset('Disable Windows Error Reporting'),
    },
    {
      id: 'app-launch-tracking-off',
      category: 'privacy',
      title: 'App launch tracking',
      description: 'Disables app launch tracking used by Start personalization.',
      icon: Search,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('app_launch_tracking_off', processId),
      rollbackHint: matchPreset('Disable app launch tracking'),
    },
    {
      id: 'interrupt-affinity-lock',
      category: 'tweaks',
      title: 'Interrupt steering mode',
      description: 'Locks interrupt steering mode in the active power scheme.',
      icon: Cpu,
      mode: 'optimal',
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'interrupt_affinity_lock' } }),
      rollbackHint: matchAction('Interrupt affinity applied'),
    },
    {
      id: 'low-timer-resolution',
      category: 'tweaks',
      title: 'Timer resolution',
      description: 'Requests minimum system timer resolution.',
      warning: 'Tighter timers can increase idle wakeups.',
      icon: Gauge,
      mode: 'optimal',
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'low_timer_resolution' } }),
      rollbackHint: matchAction('Timer resolution lowered'),
    },
    {
      id: 'disable-dynamic-ticks',
      category: 'tweaks',
      title: 'Dynamic Ticks',
      description: 'Sets boot option disabledynamictick=yes.',
      warning: 'Restart required. This can increase idle power draw.',
      icon: Zap,
      mode: 'maximum',
      requiresReboot: true,
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_dynamic_ticks' } }),
      rollbackHint: matchAction('Dynamic ticks disabled'),
    },
    {
      id: 'disable-hpet',
      category: 'tweaks',
      title: 'HPET boot flag',
      description: 'Sets boot option useplatformclock=false.',
      warning: 'Restart required. Use only when timing tests show HPET forcing hurts latency.',
      icon: Gauge,
      mode: 'maximum',
      requiresReboot: true,
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_hpet' } }),
      rollbackHint: matchAction('HPET boot flag disabled'),
    },
    {
      id: 'mpo-off',
      category: 'tweaks',
      title: 'Multi Plane Overlay',
      description: 'Disables MPO through DWM OverlayTestMode.',
      warning: 'Restart recommended. Use for driver flicker/stutter cases only.',
      icon: MonitorUp,
      mode: 'maximum',
      requiresReboot: true,
      buildRequest: ({ processId }) => presetRequest('mpo_off', processId),
      rollbackHint: (entry) => detailIncludes(entry, 'Multiplane Overlay'),
    },
    {
      id: 'ntfs-last-access-off',
      category: 'tweaks',
      title: 'NTFS Last Access Update',
      description: 'Disables last-access timestamp updates to reduce metadata writes.',
      icon: HardDrive,
      mode: 'optimal',
      buildRequest: ({ processId }) => presetRequest('ntfs_last_access_off', processId),
      rollbackHint: matchPreset('Disable NTFS last access updates'),
    },
  ]
}

function createAutorunItem(entry: AutorunEntry): OptimizerItem {
  const displayName = entry.name.trim() || 'Startup entry'
  return {
    id: `autorun:${entry.id}`,
    category: 'autoruns',
    title: displayName,
    description: entry.command,
    detail: entry.location,
    warning: entry.supported ? 'Disabling removes the Run registry value and creates a rollback snapshot.' : 'This autorun type is visible but not supported for one-click disable.',
    icon: Activity,
    mode: 'manual',
    supported: entry.supported,
    buildRequest: () => (entry.supported ? { kind: 'tweak', payload: { kind: 'autorun_disable', autorun_id: entry.id } } : null),
    rollbackHint: (activity) => activity.action === 'Autorun disabled' && detailIncludes(activity, displayName),
  }
}

function readStoredSet(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item): item is string => typeof item === 'string'))
  } catch {
    return new Set()
  }
}

function readSnapshotMap(): Record<string, string> {
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

function formatUnknownError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return fallback
}

function runtimeActiveIds(runtimeState: OptimizationRuntimeState): Set<string> {
  const active = new Set<string>()
  for (const tweak of runtimeState.session.active_tweaks) {
    const mapped = activeTweakToItem[tweak]
    if (mapped) active.add(mapped)
  }
  for (const preset of runtimeState.registry_presets) {
    if (!preset.blocking_reason?.toLowerCase().includes('already active')) continue
    const mapped = presetToItem[preset.id]
    if (mapped) active.add(mapped)
  }
  return active
}

function statusLabel(active: boolean, supported: boolean | undefined) {
  if (supported === false) return { text: 'Not supported', tone: 'neutral' as const }
  return active ? { text: 'Enabled', tone: 'danger' as const } : { text: 'Disabled', tone: 'accent' as const }
}

function OptimizerSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-checked={active}
      className={`relative h-7 w-[54px] shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-[#e93c41]' : 'bg-[#315cff]'
      }`}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] transition-[left] ${
          active ? 'left-[calc(100%-1.5rem)] text-[#e93c41]' : 'left-1 text-[#315cff]'
        }`}
      >
        {active ? <X size={13} /> : <Check size={13} />}
      </span>
    </button>
  )
}

function OptimizationRow({
  active,
  changed,
  disabled,
  item,
  onToggle,
}: {
  active: boolean
  changed: boolean
  disabled: boolean
  item: OptimizerItem
  onToggle: () => void
}) {
  const Icon = item.icon
  const label = statusLabel(active, item.supported)

  return (
    <article
      className={`rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(49,92,255,0.10)] ${
        changed ? 'ring-1 ring-[#7ba2ff]/75' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Icon className="shrink-0 text-white/92" size={25} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[18px] font-semibold leading-6 text-white">{item.title}</h3>
            <ChevronDown className="shrink-0 text-white/70" size={16} />
            {item.requiresReboot ? (
              <span className="rounded-md bg-[#e93c41] px-2 py-0.5 text-xs font-black uppercase text-white">Restart</span>
            ) : null}
            {item.requiresProcess ? (
              <span className="rounded-md bg-[#315cff]/75 px-2 py-0.5 text-xs font-black uppercase text-white">Process</span>
            ) : null}
            {changed ? <span className="rounded-md bg-[#4f6ba8] px-2 py-0.5 text-xs font-bold text-white">Pending</span> : null}
          </div>
          {item.warning ? <p className="mt-1 text-sm font-semibold leading-5 text-[#ffd12f]">{item.warning}</p> : null}
          {item.detail ? <p className="mt-1 truncate text-sm text-white/48">{item.detail}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`text-sm font-bold ${
              label.tone === 'danger' ? 'text-[#ff4e5e]' : label.tone === 'accent' ? 'text-[#315cff]' : 'text-white/45'
            }`}
          >
            {label.text}
          </span>
          <OptimizerSwitch active={active} disabled={disabled || item.supported === false} onToggle={onToggle} />
        </div>
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
  onRefresh,
  onRollbackSnapshot,
}: OptimizationPageProps) {
  const [category, setCategory] = useState<CategoryId>('basic')
  const [mode, setMode] = useState<MethodMode>('default')
  const [desired, setDesired] = useState<Set<string>>(() => readStoredSet(STORAGE_KEY))
  const [localActive, setLocalActive] = useState<Set<string>>(() => readStoredSet(`${STORAGE_KEY}.active`))
  const [snapshotMap, setSnapshotMap] = useState<Record<string, string>>(() => readSnapshotMap())
  const [busy, setBusy] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)

  const items = useMemo(() => {
    const autorunItems = runtimeState.autoruns.map(createAutorunItem)
    return [...staticItems(), ...autorunItems]
  }, [runtimeState.autoruns])

  const runtimeActive = useMemo(() => runtimeActiveIds(runtimeState), [runtimeState])
  const activeIds = useMemo(() => new Set([...Array.from(runtimeActive), ...Array.from(localActive)]), [localActive, runtimeActive])

  useEffect(() => {
    if (desired.size > 0) return
    setDesired(new Set(activeIds))
  }, [activeIds, desired.size])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(desired.values())))
  }, [desired])

  useEffect(() => {
    window.localStorage.setItem(`${STORAGE_KEY}.active`, JSON.stringify(Array.from(localActive.values())))
  }, [localActive])

  useEffect(() => {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshotMap))
  }, [snapshotMap])

  const visibleItems = items.filter((item) => item.category === category)
  const changedItems = items.filter((item) => desired.has(item.id) !== activeIds.has(item.id))
  const selectedCategory = categories.find((item) => item.id === category) ?? categories[0]
  const latestSample = dashboard.history.at(-1) ?? null

  const setCategoryMode = (nextMode: MethodMode, targetCategory = category) => {
    setMode(nextMode)
    setDesired((current) => {
      const next = new Set(current)
      for (const item of items.filter((row) => row.category === targetCategory)) {
        next.delete(item.id)
        if (nextMode === 'optimal' && item.mode === 'optimal') next.add(item.id)
        if (nextMode === 'maximum' && item.mode !== 'manual') next.add(item.id)
      }
      return next
    })
  }

  const resolveProcessId = async (item: OptimizerItem) => {
    if (!item.requiresProcess) return runtimeState.session.process_id ?? runtimeState.detected_game?.pid ?? null
    if (runtimeState.session.process_id) return runtimeState.session.process_id
    if (runtimeState.detected_game?.pid && runtimeState.detected_game.exe_name) {
      await onAttachSession({
        process_id: runtimeState.detected_game.pid,
        process_name: runtimeState.detected_game.exe_name,
      })
      return runtimeState.detected_game.pid
    }
    return null
  }

  const resolveSnapshot = (item: OptimizerItem) => {
    const known = snapshotMap[item.id]
    if (known) return known
    const matched = runtimeState.activity
      .filter((entry) => entry.can_undo && entry.snapshot_id)
      .slice()
      .reverse()
      .find(item.rollbackHint)
    return matched?.snapshot_id ?? null
  }

  const applyItem = async (item: OptimizerItem): Promise<boolean> => {
    const processId = await resolveProcessId(item)
    if (item.requiresProcess && !processId) {
      setStatusText(`Select or detect a game process before applying "${item.title}".`)
      return false
    }
    const request = item.buildRequest({ processId, runtimeState })
    if (!request) {
      setStatusText(`"${item.title}" is unavailable on this system state.`)
      return false
    }
    if (request.kind === 'tweak') {
      const result = await onApplyTweak(request.payload)
      setSnapshotMap((current) => ({ ...current, [item.id]: result.snapshot.id }))
      setLocalActive((current) => new Set(current).add(item.id))
      return true
    }
    const result = await onApplyRegistryPreset(request.payload)
    if (result.status === 'blocked') {
      setStatusText(result.blocking_reason ?? `"${item.title}" is blocked by current system policy.`)
      return false
    }
    if (result.snapshot?.id) {
      setSnapshotMap((current) => ({ ...current, [item.id]: result.snapshot?.id as string }))
    }
    setLocalActive((current) => new Set(current).add(item.id))
    return true
  }

  const rollbackItem = async (item: OptimizerItem): Promise<boolean> => {
    const snapshotId = resolveSnapshot(item)
    if (!snapshotId) {
      setLocalActive((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      return true
    }
    await onRollbackSnapshot(snapshotId, runtimeState.session.process_id ?? undefined)
    setLocalActive((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    setSnapshotMap((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    return true
  }

  const applyChanges = async () => {
    if (busy || changedItems.length === 0) return
    const rebootItems = changedItems.filter((item) => desired.has(item.id) && item.requiresReboot)
    if (rebootItems.length > 0) {
      const confirmed = window.confirm(
        `${rebootItems.length} selected function(s) require Windows restart to finish.\n\nApply and create rollback snapshots?`,
      )
      if (!confirmed) return
    }
    setBusy('apply')
    setStatusText(null)
    let applied = 0
    const failed: string[] = []

    try {
      for (const item of changedItems) {
        try {
          const ok = desired.has(item.id) ? await applyItem(item) : await rollbackItem(item)
          if (ok) applied += 1
          else failed.push(item.title)
        } catch (error) {
          failed.push(`${item.title}: ${formatUnknownError(error, 'action failed')}`)
        }
      }
      await onRefresh()
    } finally {
      setBusy(null)
    }

    if (failed.length > 0) {
      setStatusText(`Applied ${applied} change(s). Failed: ${failed.join(', ')}.`)
    } else {
      setStatusText(`Applied ${applied} change(s).`)
    }
  }

  const resetCategoryToActive = () => {
    setMode('default')
    setDesired((current) => {
      const next = new Set(current)
      for (const item of visibleItems) {
        if (activeIds.has(item.id)) next.add(item.id)
        else next.delete(item.id)
      }
      return next
    })
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(240px,300px)_minmax(0,1fr)] gap-5 text-white">
      <aside className="flex min-h-0 flex-col gap-5">
        <h1 className="px-3 text-2xl font-black">Optimization</h1>
        <div className="min-h-0 rounded-[1.35rem] bg-[#070b1b]/86 p-3">
          <button className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-semibold text-white" type="button">
            <Boxes size={20} />
            <span>My tweaks</span>
          </button>
          <div className="space-y-1">
            {categories.map((item) => {
              const Icon = item.icon
              const active = item.id === category
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-semibold transition ${
                    active ? 'bg-[#315cff] text-white' : 'text-white hover:bg-white/8'
                  }`}
                  onClick={() => setCategory(item.id)}
                  type="button"
                >
                  <Icon size={20} />
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-[1.35rem] bg-[#070b1b]/86 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xl font-black">Quick methods</h2>
            <Info size={17} />
          </div>
          <div className="space-y-2">
            {[
              { id: 'default' as const, label: 'Default', icon: RotateCcw },
              { id: 'optimal' as const, label: 'Optimal', icon: Power },
              { id: 'maximum' as const, label: 'Maximum', icon: Gauge },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-semibold ${
                    mode === item.id ? 'bg-white/10 text-white' : 'text-white/92 hover:bg-white/8'
                  }`}
                  onClick={() => (item.id === 'default' ? resetCategoryToActive() : setCategoryMode(item.id))}
                  type="button"
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          className={`mt-auto flex min-h-12 items-center justify-center gap-2 rounded-[1.05rem] px-4 text-lg font-bold ${
            changedItems.length > 0 ? 'bg-[#315cff] text-white' : 'bg-white/38 text-white'
          }`}
          disabled={busy !== null || changedItems.length === 0}
          onClick={() => void applyChanges()}
          type="button"
        >
          <Check size={24} />
          <span>Apply</span>
          {changedItems.length > 0 ? <span className="rounded-full bg-white/18 px-2 text-sm">{changedItems.length}</span> : null}
        </button>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">{selectedCategory.label}</h2>
          <div className="flex min-w-[520px] max-w-full flex-1 items-center rounded-[1.35rem] bg-[#070b1b]/88 p-2">
            {[
              { id: 'default' as const, label: 'Default', icon: RotateCcw },
              { id: 'optimal' as const, label: 'Optimal', icon: Power },
              { id: 'maximum' as const, label: 'Maximum', icon: Gauge },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[1rem] px-4 text-base font-semibold ${
                    mode === item.id
                      ? item.id === 'maximum'
                        ? 'bg-[#e93c41]'
                        : 'bg-[#315cff]'
                      : 'bg-[#202942] text-white'
                  }`}
                  onClick={() => (item.id === 'default' ? resetCategoryToActive() : setCategoryMode(item.id))}
                  type="button"
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              )
            })}
            <button
              className="ml-2 flex min-h-11 min-w-[148px] items-center justify-center gap-2 rounded-[1rem] bg-[#202942] px-5 text-base font-semibold"
              onClick={() => void onRefresh()}
              type="button"
            >
              <RefreshCw size={17} />
              <span>Update</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-full bg-[#5d6f9e]/70 px-8 py-2.5 text-sm font-semibold" type="button">
            Tip <ChevronDown className="ml-1 inline" size={14} />
          </button>
          <span className="text-sm font-semibold text-white/58">
            {latestSample
              ? `Live sample: CPU ${latestSample.cpu_total_pct.toFixed(0)}%, GPU ${(latestSample.gpu_usage_pct ?? 0).toFixed(0)}%`
              : 'Real changes are applied through snapshots and can be rolled back.'}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="space-y-2 pb-5">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const active = desired.has(item.id)
                const current = activeIds.has(item.id)
                return (
                  <OptimizationRow
                    key={item.id}
                    active={active}
                    changed={active !== current}
                    disabled={busy !== null}
                    item={item}
                    onToggle={() => {
                      setDesired((currentSet) => {
                        const next = new Set(currentSet)
                        if (next.has(item.id)) next.delete(item.id)
                        else next.add(item.id)
                        return next
                      })
                    }}
                  />
                )
              })
            ) : (
              <div className="rounded-[1.35rem] bg-[#070b1b]/88 p-8 text-center text-white/60">
                No supported items are available in this category yet.
              </div>
            )}
          </div>
        </div>

        {statusText ? (
          <div className="rounded-[1rem] border border-[#ffd12f]/25 bg-[#ffd12f]/10 px-4 py-3 text-sm font-semibold text-[#ffd12f]">
            {statusText}
          </div>
        ) : null}
      </section>
    </div>
  )
}
