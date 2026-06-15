import { useEffect, useId, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
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
  ListChecks,
  Lock,
  Map,
  MonitorUp,
  MousePointer2,
  PackageX,
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

import {
  useConfirmDialog,
  type ConfirmDialogOptions,
} from '../components/ConfirmDialogContext'
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
  ServiceRuntimeSummary,
} from '../types'
import {
  dangerWarningForOptimizationFunction,
  getOptimizationFunctionById,
  isDangerousOptimizationFunctionId,
} from '../lib/optimizationFunctions'

type CategoryId = 'basic' | 'security' | 'power' | 'debloat' | 'services' | 'privacy' | 'tweaks' | 'autoruns'
type MethodMode = 'default' | 'optimal' | 'maximum'
type ItemMode = 'optimal' | 'maximum' | 'manual'
type ItemStateText = 'Enabled' | 'Disabled' | 'Off'

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
  onRequestRestart: () => void | Promise<void>
  onRollbackSnapshot: (snapshotId: string, processId?: number) => Promise<RollbackResponse>
}

interface OptimizerItem {
  id: string
  category: CategoryId
  title: string
  description: string
  warning?: string
  dangerNote?: string
  recommendation?: string
  recommendationNotes?: string[]
  detail?: string
  icon: LucideIcon
  mode: ItemMode
  requiresProcess?: boolean
  requiresReboot?: boolean
  supported?: boolean
  badge?: string
  stateWhenActive?: ItemStateText
  stateWhenInactive?: ItemStateText
  valueControl?: {
    label: string
    value: string
  }
  buildRequest: (context: { processId: number | null; runtimeState: OptimizationRuntimeState }) => OptimizerRequest | null
  rollbackHint: (entry: ActivityEntry) => boolean
}

interface ApplyStats {
  appsDeleted: number
  autorunsRemoved: number
  cleanedMb: number
  servicesDisabled: number
  tweaksApplied: number
}

interface ApplyRunState {
  applied: number
  boostPercent: number
  currentIndex: number
  currentTitle: string
  failed: string[]
  phase: 'running' | 'complete'
  rebootRequired: boolean
  stats: ApplyStats
  total: number
}

interface ServiceGroupInfo {
  risk: 'safe' | 'dangerous'
  services: Array<{
    displayName: string
    name: string
  }>
}

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
  'registry:driver_search_off': 'driver-search-off',
  'registry:global_notifications_off': 'global-notifications-off',
  'registry:background_apps_off': 'background-apps-off',
  'registry:store_auto_updates_off': 'store-auto-updates-off',
  'registry:game_capture_overhead_off': 'turn-off-recordings',
  'registry:game_mode_on': 'game-mode-on',
  'registry:power_throttling_off': 'power-throttling-off',
  'registry:windowed_optimizations_on': 'windowed-optimizations-on',
  'registry:fullscreen_optimizations_off': 'fullscreen-optimizations-off',
  'registry:gpu_preference_high': 'gpu-preference-high',
  'registry:hags_on': 'hags-on',
  'registry:mpo_off': 'mpo-off',
  'registry:print_spooler_off': 'print-spooler-off',
  'registry:sysmain_off': 'sysmain-off',
  'registry:windows_search_off': 'windows-search-off',
  'registry:dps_off': 'dps-off',
  'registry:diagtrack_off': 'diagtrack-off',
  'registry:maps_broker_off': 'maps-broker-off',
  'registry:delivery_optimization_off': 'delivery-optimization-off',
  'registry:edge_background_off': 'edge-background-off',
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
  'registry:security_center_on': 'security-center-on',
  'registry:windows_firewall_on': 'windows-firewall-on',
  'registry:memory_integrity_off': 'memory-integrity-off',
  'registry:win32_priority_separation_2a': 'win32-priority-separation',
  'registry:ntfs_last_access_off': 'ntfs-last-access-off',
  'registry:ntfs_8dot3_off': 'ntfs-8dot3-off',
  'registry:application_compatibility_off': 'application-compatibility-off',
  'registry:automatic_maintenance_off': 'automatic-maintenance-off',
}

const presetToItem: Record<string, string> = Object.fromEntries(
  Object.entries(activeTweakToItem)
    .filter(([key]) => key.startsWith('registry:'))
    .map(([key, value]) => [key.replace('registry:', ''), value]),
)

const EMPTY_APPLY_STATS: ApplyStats = {
  appsDeleted: 0,
  autorunsRemoved: 0,
  cleanedMb: 0,
  servicesDisabled: 0,
  tweaksApplied: 0,
}

const SERVICE_GROUP_INFO: Record<string, ServiceGroupInfo> = {
  'maps-broker-off': {
    risk: 'safe',
    services: [{ name: 'MapsBroker', displayName: 'Downloaded Maps Manager' }],
  },
  'windows-search-off': {
    risk: 'safe',
    services: [{ name: 'WSearch', displayName: 'Windows Search' }],
  },
  'sysmain-off': {
    risk: 'safe',
    services: [{ name: 'SysMain', displayName: 'SysMain' }],
  },
  'print-spooler-off': {
    risk: 'safe',
    services: [{ name: 'Spooler', displayName: 'Print Spooler' }],
  },
  'delivery-optimization-off': {
    risk: 'safe',
    services: [{ name: 'DoSvc', displayName: 'Delivery Optimization' }],
  },
  'diagtrack-off': {
    risk: 'safe',
    services: [{ name: 'DiagTrack', displayName: 'Connected User Experiences and Telemetry' }],
  },
  'dps-off': {
    risk: 'dangerous',
    services: [{ name: 'DPS', displayName: 'Diagnostic Policy Service' }],
  },
  'xbox-services-off': {
    risk: 'dangerous',
    services: [
      { name: 'XblAuthManager', displayName: 'Xbox Live Auth Manager' },
      { name: 'XblGameSave', displayName: 'Xbox Live Game Save' },
      { name: 'XboxNetApiSvc', displayName: 'Xbox Live Networking Service' },
      { name: 'XboxGipSvc', displayName: 'Xbox Accessory Management Service' },
    ],
  },
}

const serviceLikeItemIds = new Set(Object.keys(SERVICE_GROUP_INFO))

function itemsForCategory(items: OptimizerItem[], category: CategoryId): OptimizerItem[] {
  if (category === 'services') return items.filter((item) => serviceLikeItemIds.has(item.id))
  return items.filter((item) => item.category === category)
}

function serviceStartupTypeLabel(value: number | null): string {
  if (value === 0) return 'Boot'
  if (value === 1) return 'System'
  if (value === 2) return 'Automatic'
  if (value === 3) return 'Manual'
  if (value === 4) return 'Disabled'
  return 'Unavailable'
}

function addApplyStats(current: ApplyStats, next: Partial<ApplyStats>): ApplyStats {
  return {
    appsDeleted: current.appsDeleted + (next.appsDeleted ?? 0),
    autorunsRemoved: current.autorunsRemoved + (next.autorunsRemoved ?? 0),
    cleanedMb: current.cleanedMb + (next.cleanedMb ?? 0),
    servicesDisabled: current.servicesDisabled + (next.servicesDisabled ?? 0),
    tweaksApplied: current.tweaksApplied + (next.tweaksApplied ?? 0),
  }
}

function statsForCompletedItem(item: OptimizerItem, applying: boolean): Partial<ApplyStats> {
  if (!applying) return {}
  return {
    autorunsRemoved: item.category === 'autoruns' ? 1 : 0,
    cleanedMb: 0,
    servicesDisabled: serviceLikeItemIds.has(item.id) ? 1 : 0,
    tweaksApplied: 1,
  }
}

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

type RegistryItemConfig = Omit<OptimizerItem, 'buildRequest' | 'rollbackHint'> & {
  presetId: string
  rollbackNeedle?: string
}

function registryItem(config: RegistryItemConfig): OptimizerItem {
  const {
    presetId,
    rollbackNeedle,
    stateWhenActive = 'Disabled',
    stateWhenInactive = 'Enabled',
    ...item
  } = config
  return {
    ...item,
    stateWhenActive,
    stateWhenInactive,
    buildRequest: ({ processId }) => presetRequest(presetId, processId),
    rollbackHint: rollbackNeedle ? (entry) => detailIncludes(entry, rollbackNeedle) : matchPreset(item.title),
  }
}

type UnsupportedItemConfig = Omit<OptimizerItem, 'buildRequest' | 'rollbackHint' | 'supported'>

function unsupportedItem(config: UnsupportedItemConfig): OptimizerItem {
  return {
    ...config,
    supported: false,
    buildRequest: () => null,
    rollbackHint: () => false,
  }
}

function itemActiveStateDisablesFeature(item: OptimizerItem): boolean {
  const activeState = item.stateWhenActive ?? 'Enabled'
  return activeState === 'Disabled' || activeState === 'Off'
}

function isDangerousOptimizerItem(item: OptimizerItem): boolean {
  if (item.supported === false) return false
  if (isDangerousOptimizationFunctionId(item.id)) return true
  if (item.requiresReboot) return true
  if (item.mode === 'maximum' && itemActiveStateDisablesFeature(item)) return true
  return Boolean(item.warning && itemActiveStateDisablesFeature(item))
}

function dangerWarningForOptimizerItem(item: OptimizerItem): string {
  const definition = getOptimizationFunctionById(item.id)
  if (definition) return dangerWarningForOptimizationFunction(definition)
  const details = [
    item.dangerNote,
    item.warning,
    item.requiresReboot ? 'A Windows restart is required before the final state can be trusted.' : null,
    item.requiresProcess ? 'The action depends on a selected game process still running.' : null,
  ].filter((line): line is string => Boolean(line))
  return `You are enabling "${item.title}". Continue only if you understand what this function changes, what can stop working, and how to roll it back.${details.length ? `\n\n${details.join('\n')}` : ''}`
}

function dangerNoteForOptimizerItem(item: OptimizerItem): string | null {
  const definition = getOptimizationFunctionById(item.id)
  if (definition?.dangerNote) return definition.dangerNote
  if (item.dangerNote) return item.dangerNote
  if (!isDangerousOptimizerItem(item)) return null
  if (item.requiresReboot) {
    return 'This tweak changes a system-level setting and requires a Windows restart. Apply it only with a rollback snapshot.'
  }
  return 'This tweak can affect system stability, compatibility, or security. Apply it only if you understand the trade-offs.'
}

const categoryRecommendations: Record<CategoryId, string> = {
  basic: 'Use this setting only when it matches how you use the PC, then compare responsiveness and frame-time consistency before keeping it.',
  security: 'Keep the Windows default unless you understand the protection or compatibility trade-off and have a tested rollback path.',
  power: 'Prefer this on a desktop or while connected to power. Check temperatures, fan noise, and idle power after applying it.',
  debloat: 'Apply only when the Windows component is not part of your workflow. Restore it if dependent apps or shell features stop working.',
  services: 'Disable a service only when you do not use the feature it supports. Test related apps and devices before keeping the change.',
  privacy: 'Use this when the reduced background activity is worth the loss of diagnostics, personalization, or synchronization.',
  tweaks: 'Treat this as an advanced Windows setting. Change one item at a time and keep it only after a repeatable before-and-after test.',
  autoruns: 'Disable the startup entry only if you recognize the application and do not need it immediately after signing in.',
}

function guidanceForOptimizerItem(item: OptimizerItem): { recommendation: string; notes: string[] } {
  const definition = getOptimizationFunctionById(item.id)
  const dangerNote = definition?.dangerNote ?? item.dangerNote
  const generatedNotes = [
    item.requiresProcess ? 'A running game process must be selected before this function can be applied.' : null,
    item.requiresReboot ? 'Restart Windows after applying or restoring this function so the final state can be verified.' : null,
    item.warning ? item.warning : null,
    item.detail ? `Location: ${item.detail}` : null,
  ].filter((note): note is string => Boolean(note))
  const notes = [...(item.recommendationNotes ?? []), ...generatedNotes]

  if (item.supported === false) {
    return {
      recommendation:
        item.recommendation ??
        dangerNote ??
        'This function is shown for transparency, but Aeterna does not apply it automatically. Keep the current Windows setting unless you have a manual, tested rollback plan.',
      notes: dangerNote
        ? [
            ...notes,
            'Aeterna shows this function for transparency but does not apply it automatically. Keep the current Windows setting unless you have a tested manual rollback plan.',
          ]
        : notes,
    }
  }

  return {
    recommendation: item.recommendation ?? dangerNote ?? categoryRecommendations[item.category],
    notes,
  }
}

function dangerousOptimizerConfirmation(items: OptimizerItem[], action: string): ConfirmDialogOptions | null {
  const risky = items.filter(isDangerousOptimizerItem)
  if (risky.length === 0) return null
  const details = risky
    .slice(0, 3)
    .map(dangerWarningForOptimizerItem)
  return {
    acknowledgement:
      'I understand what these functions change, what can stop working, and how rollback or restart affects the system.',
    confirmLabel: action === 'apply' ? 'Apply risky functions' : 'Enable risky functions',
    description: `You are about to ${action} ${risky.length} risky function(s). Review the affected functions before continuing.`,
    details,
    eyebrow: 'Dangerous tweak warning',
    items: risky.map((item) => item.title),
    title: 'Confirm risky optimization',
    tone: 'danger',
  }
}

function staticItems(): OptimizerItem[] {
  return [
    registryItem({
      id: 'reduce-input-lag',
      category: 'basic',
      title: 'Mouse acceleration',
      description: 'Disables Enhance Pointer Precision for consistent mouse input.',
      warning: 'Leave enabled if your aim profile was built around Windows pointer acceleration.',
      icon: MousePointer2,
      mode: 'optimal',
      presetId: 'mouse_precision_off',
      rollbackNeedle: 'mouse acceleration',
    }),
    registryItem({
      id: 'driver-search-off',
      category: 'basic',
      title: 'Automatic driver updates on system startup',
      description: 'Blocks automatic Windows driver search/update staging by machine policy.',
      icon: RefreshCw,
      mode: 'optimal',
      presetId: 'driver_search_off',
      rollbackNeedle: 'driver search',
    }),
    registryItem({
      id: 'global-notifications-off',
      category: 'basic',
      title: 'Global notifications',
      description: 'Disables global Windows toast notifications for the current user.',
      icon: BellOff,
      mode: 'optimal',
      presetId: 'global_notifications_off',
      rollbackNeedle: 'notifications',
    }),
    unsupportedItem({
      id: 'windows-11-notifications',
      category: 'basic',
      title: 'Windows 11 Notifications',
      description: 'Per-app Windows 11 notification policy is intentionally not changed automatically.',
      icon: BellOff,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    registryItem({
      id: 'background-apps-off',
      category: 'basic',
      title: 'UWP applications running in the background',
      description: 'Disables Store/UWP background execution for the current user where Windows supports it.',
      icon: Boxes,
      mode: 'optimal',
      presetId: 'background_apps_off',
      rollbackNeedle: 'background UWP',
    }),
    registryItem({
      id: 'maps-broker-off',
      category: 'basic',
      title: 'Automatic map updates',
      description: 'Disables downloaded maps maintenance service startup.',
      icon: Map,
      mode: 'optimal',
      presetId: 'maps_broker_off',
      rollbackNeedle: 'downloaded maps',
    }),
    registryItem({
      id: 'store-auto-updates-off',
      category: 'basic',
      title: 'Automatic updates for store apps',
      description: 'Disables automatic Microsoft Store app update downloads by policy.',
      icon: Database,
      mode: 'optimal',
      presetId: 'store_auto_updates_off',
      rollbackNeedle: 'Store app updates',
    }),
    unsupportedItem({
      id: 'hpet-basic',
      category: 'basic',
      title: 'High Precision Event Timer (HPET)',
      description: 'Global HPET boot changes are kept out of one-click Basic because they require reboot and hardware validation.',
      icon: Gauge,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    registryItem({
      id: 'fullscreen-optimizations-off',
      category: 'basic',
      title: 'Global Fullscreen Optimizations (FSO)',
      description: 'Disables fullscreen optimizations for the selected game executable.',
      warning: 'Will not work if disabled: Quick ALT+TAB',
      icon: MonitorUp,
      mode: 'maximum',
      requiresProcess: true,
      presetId: 'fullscreen_optimizations_off',
      rollbackNeedle: 'fullscreen optimizations',
    }),
    registryItem({
      id: 'mpo-off',
      category: 'basic',
      title: 'Multi Plane Overlay (OverlayTestMode)',
      description: 'Disables DWM MPO composition path for driver flicker or stutter cases.',
      icon: MonitorUp,
      mode: 'maximum',
      requiresReboot: true,
      presetId: 'mpo_off',
      rollbackNeedle: 'Multiplane Overlay',
    }),
    registryItem({
      id: 'turn-off-recordings',
      category: 'basic',
      title: 'Game Bar',
      description: 'Disables Game DVR background capture flags.',
      warning: 'Instant replay and automatic clips will stop working while this is active.',
      icon: Gamepad2,
      mode: 'optimal',
      presetId: 'game_capture_overhead_off',
      rollbackNeedle: 'Game DVR',
    }),
    registryItem({
      id: 'windows-search-off',
      category: 'basic',
      title: 'Indexing',
      description: 'Disables Windows Search startup and stops indexing service.',
      icon: Search,
      mode: 'optimal',
      presetId: 'windows_search_off',
      rollbackNeedle: 'Windows Search',
    }),
    registryItem({
      id: 'sysmain-off',
      category: 'basic',
      title: 'SysMain (Prefetch, Superfetch...)',
      description: 'Disables SysMain startup and stops the service.',
      warning: 'Will not work if disabled: LastActivityView',
      icon: Database,
      mode: 'optimal',
      presetId: 'sysmain_off',
      rollbackNeedle: 'SysMain',
    }),
    registryItem({
      id: 'print-spooler-off',
      category: 'basic',
      title: 'Print Services',
      description: 'Disables Print Spooler startup on systems that do not use printers during gaming.',
      warning: 'Will not work if disabled: Printer',
      icon: HardDrive,
      mode: 'maximum',
      presetId: 'print_spooler_off',
      rollbackNeedle: 'Print Spooler',
    }),
    registryItem({
      id: 'dps-off',
      category: 'basic',
      title: 'Diagnostic Drivers',
      description: 'Disables Diagnostic Policy Service startup and stops the service.',
      warning: 'Will not work if disabled: Network usage in Task Manager, Network usage in Network Settings',
      icon: Shield,
      mode: 'maximum',
      presetId: 'dps_off',
      rollbackNeedle: 'Diagnostic Policy Service',
    }),
    unsupportedItem({
      id: 'windows-update-off',
      category: 'basic',
      title: 'Windows Update',
      description: 'Windows Update service disabling is intentionally not automated because it can break servicing and Store components.',
      icon: RefreshCw,
      mode: 'manual',
      stateWhenActive: 'Off',
      stateWhenInactive: 'Off',
    }),
    registryItem({
      id: 'delivery-optimization-off',
      category: 'basic',
      title: 'Delivery Optimization',
      description: 'Disables Delivery Optimization download mode and stops the service for the current session.',
      icon: Activity,
      mode: 'optimal',
      presetId: 'delivery_optimization_off',
      rollbackNeedle: 'Delivery Optimization',
    }),
    registryItem({
      id: 'edge-background-off',
      category: 'basic',
      title: 'Edge launch speed and background operation',
      description: 'Disables Microsoft Edge Startup Boost and background mode by policy.',
      icon: MonitorUp,
      mode: 'optimal',
      presetId: 'edge_background_off',
      rollbackNeedle: 'Edge startup boost',
    }),
    unsupportedItem({
      id: 'onedrive-off',
      category: 'basic',
      title: 'OneDrive',
      description: 'OneDrive is not removed automatically because it can contain synced user data.',
      icon: Database,
      mode: 'manual',
    }),
    registryItem({
      id: 'hags-on',
      category: 'basic',
      title: 'HAGS',
      description: 'Enables Hardware-accelerated GPU scheduling.',
      warning: 'Restart required. Skip if your GPU driver branch is unstable with HAGS.',
      icon: Gauge,
      mode: 'maximum',
      requiresReboot: true,
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      presetId: 'hags_on',
      rollbackNeedle: 'hardware-accelerated gpu scheduling',
    }),
    unsupportedItem({
      id: 'wfp-filter-bypass',
      category: 'security',
      title: 'Priority WFP Filter (traffic bypass)',
      description: 'Traffic bypass rules are not automated because they can conflict with VPN and firewall routing.',
      warning: 'Will not work if enabled: VPN',
      icon: Shield,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'annoying-security-notifications',
      category: 'security',
      title: 'Annoying security notifications',
      description: 'Security notification suppression is intentionally not automated.',
      icon: BellOff,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'windows-defender',
      category: 'security',
      title: 'Windows Defender (Antivirus)',
      description: 'Disabling antivirus is unsafe; Aeterna will not automate this action.',
      dangerNote: 'Disabling Microsoft Defender removes the built-in real-time antivirus layer and can leave the PC exposed to untrusted files.',
      icon: Shield,
      mode: 'manual',
    }),
    registryItem({
      id: 'security-center-on',
      category: 'security',
      title: 'Security Center',
      description: 'Keeps Windows Security Center service enabled so protection state stays visible.',
      warning: 'Will not work if disabled: Security Center (UI)',
      icon: ShieldCheck,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      presetId: 'security_center_on',
      rollbackNeedle: 'Security Center',
    }),
    unsupportedItem({
      id: 'vbs-memory-integrity-suite',
      category: 'security',
      title: 'VBS (Memory Integrity, DeviceGuard, HVCI, CG)',
      description: 'Full VBS policy stacks are hardware/build dependent and are not changed as a group.',
      warning: 'Will not work if disabled: EAC Kernel Patch Protection Disabled',
      dangerNote: 'Disabling the VBS protection stack weakens kernel and credential isolation and may conflict with anti-cheat requirements.',
      icon: Cpu,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'vbs-virtualization-based',
      category: 'security',
      title: 'VBS (Virtualization Based Security)',
      description: 'Global VBS changes are not automated without a machine-specific compatibility plan.',
      warning: 'Will not work if disabled: EAC Kernel Patch Protection Disabled',
      dangerNote: 'Disabling Virtualization Based Security reduces kernel isolation and can make security-sensitive software reject the system state.',
      icon: Cpu,
      mode: 'manual',
    }),
    registryItem({
      id: 'memory-integrity-off',
      category: 'security',
      title: 'Memory Integrity (VBS)',
      description: 'Disables Hypervisor-protected Code Integrity for latency-sensitive systems.',
      warning: 'This reduces Windows security isolation and requires a restart.',
      icon: Shield,
      mode: 'maximum',
      requiresReboot: true,
      presetId: 'memory_integrity_off',
      rollbackNeedle: 'Memory Integrity',
    }),
    registryItem({
      id: 'smartscreen-on',
      category: 'security',
      title: 'Smartscreen',
      description: 'Keeps Windows SmartScreen explicitly enabled by policy.',
      icon: ShieldCheck,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      presetId: 'smartscreen_on',
      rollbackNeedle: 'SmartScreen',
    }),
    registryItem({
      id: 'windows-firewall-on',
      category: 'security',
      title: 'Windows Firewall',
      description: 'Keeps Windows Firewall service enabled while performance tweaks are applied.',
      warning: 'Will not work if disabled: XBOX',
      icon: Shield,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      presetId: 'windows_firewall_on',
      rollbackNeedle: 'Windows Firewall',
    }),
    unsupportedItem({
      id: 'amsi',
      category: 'security',
      title: 'AMSI',
      description: 'AMSI bypass/disable actions are unsafe and are not automated.',
      dangerNote: 'Disabling AMSI prevents supported antivirus products from inspecting PowerShell and other script content before execution.',
      icon: Shield,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'code-integrity-unsupported',
      category: 'security',
      title: 'Code Integrity',
      description: 'Unsupported Code Integrity policy toggles are blocked.',
      dangerNote: 'Weakening Code Integrity can allow untrusted or vulnerable kernel modules to load.',
      icon: Lock,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'code-integrity',
      category: 'security',
      title: 'Code Integrity',
      description: 'Code Integrity is left under Windows security control.',
      dangerNote: 'Weakening Code Integrity can allow untrusted or vulnerable kernel modules to load.',
      icon: Lock,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'auto-encryption',
      category: 'security',
      title: 'Auto Encryption',
      description: 'Device encryption is not changed automatically because it can affect data recovery.',
      icon: Lock,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'uac-unsupported',
      category: 'security',
      title: 'UAC',
      description: 'UAC policy changes are intentionally blocked.',
      dangerNote: 'Disabling User Account Control removes an important elevation boundary for applications and scripts.',
      icon: Shield,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'uac',
      category: 'security',
      title: 'UAC',
      description: 'Aeterna keeps User Account Control under Windows defaults.',
      dangerNote: 'Disabling User Account Control removes an important elevation boundary for applications and scripts.',
      icon: Shield,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'spectre-v2',
      category: 'security',
      title: 'Spectre v2',
      description: 'CPU mitigation changes require CPU/BIOS-specific validation.',
      dangerNote: 'Disabling CPU vulnerability mitigations can expose data across process and privilege boundaries.',
      icon: Cpu,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'spectre-v2-unsupported',
      category: 'security',
      title: 'Spectre v2',
      description: 'Unsupported CPU mitigation mode for this build.',
      dangerNote: 'Disabling CPU vulnerability mitigations can expose data across process and privilege boundaries.',
      icon: Cpu,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'meltdown',
      category: 'security',
      title: 'Meltdown',
      description: 'CPU mitigation changes are not automated.',
      dangerNote: 'Disabling CPU vulnerability mitigations can expose protected kernel data.',
      icon: Cpu,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'downfall',
      category: 'security',
      title: 'Downfall',
      description: 'CPU mitigation changes are not automated.',
      dangerNote: 'Disabling CPU vulnerability mitigations can expose data processed by affected CPUs.',
      icon: Cpu,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    unsupportedItem({
      id: 'hdcp',
      category: 'security',
      title: 'HDCP',
      description: 'HDCP is controlled by GPU driver/display policy and is not modified here.',
      icon: MonitorUp,
      mode: 'manual',
    }),
    {
      id: 'ultimate-power',
      category: 'power',
      title: 'Highest power plan',
      description: 'Switches to Ultimate Performance or High Performance when available.',
      icon: Zap,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      buildRequest: ({ runtimeState }) => {
        const powerPlanGuid = highestPerformancePlanGuid(runtimeState)
        return powerPlanGuid ? { kind: 'tweak', payload: { kind: 'power_plan', power_plan_guid: powerPlanGuid } } : null
      },
      rollbackHint: matchAction('Power plan applied'),
    },
    registryItem({
      id: 'power-throttling-off',
      category: 'power',
      title: 'Power Throttling',
      description: 'Disables machine-level PowerThrottling policy.',
      warning: 'This can increase thermals and battery drain outside gaming sessions.',
      icon: Power,
      mode: 'optimal',
      presetId: 'power_throttling_off',
      rollbackNeedle: 'power throttling',
    }),
    {
      id: 'usb-selective-suspend-off',
      category: 'power',
      title: 'USB selective suspend',
      description: 'Disables USB selective suspend for AC/DC power mode.',
      icon: Usb,
      mode: 'optimal',
      stateWhenActive: 'Disabled',
      stateWhenInactive: 'Enabled',
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
      stateWhenActive: 'Disabled',
      stateWhenInactive: 'Enabled',
      buildRequest: () => ({ kind: 'tweak', payload: { kind: 'pcie_lspm_off' } }),
      rollbackHint: matchAction('PCIe LSPM disabled'),
    },
    registryItem({
      id: 'content-delivery-off',
      category: 'debloat',
      title: 'Suggested apps',
      description: 'Disables promoted content and silent suggested app installation for the current user.',
      icon: Sparkles,
      mode: 'optimal',
      presetId: 'content_delivery_off',
      rollbackNeedle: 'suggested apps',
    }),
    registryItem({
      id: 'consumer-features-off',
      category: 'debloat',
      title: 'Windows consumer content',
      description: 'Blocks Windows consumer feature provisioning by policy.',
      icon: Boxes,
      mode: 'optimal',
      presetId: 'consumer_features_off',
      rollbackNeedle: 'Windows consumer content',
    }),
    registryItem({
      id: 'widgets-off',
      category: 'debloat',
      title: 'Widgets and News',
      description: 'Disables Widgets/News taskbar background surface by policy.',
      icon: Brush,
      mode: 'optimal',
      presetId: 'widgets_off',
      rollbackNeedle: 'Widgets and News',
    }),
    registryItem({
      id: 'diagtrack-off',
      category: 'privacy',
      title: 'Telemetry service',
      description: 'Disables Connected User Experiences and Telemetry service.',
      recommendation: 'Disable this on a personal or gaming PC when you do not participate in Windows Insider or depend on Microsoft diagnostic support.',
      recommendationNotes: [
        'This reduces background diagnostic sessions and scheduled uploads.',
        'Keep it enabled on managed work PCs where administrators rely on Windows analytics.',
      ],
      icon: Activity,
      mode: 'optimal',
      presetId: 'diagtrack_off',
      rollbackNeedle: 'Connected User Experiences',
    }),
    registryItem({
      id: 'advertising-id-off',
      category: 'privacy',
      title: 'Advertising ID',
      description: 'Disables the per-user advertising identifier.',
      recommendation: 'Disable this when personalized Store advertising and cross-app recommendations are not useful to you.',
      recommendationNotes: [
        'Apps can still show generic advertising, but they cannot use the Windows advertising identifier for personalization.',
      ],
      icon: Shield,
      mode: 'optimal',
      presetId: 'advertising_id_off',
      rollbackNeedle: 'advertising ID',
    }),
    registryItem({
      id: 'telemetry-minimal',
      category: 'privacy',
      title: 'Data Collection Policy Telemetry',
      description: 'Sets the Windows diagnostic data policy to the minimum value accepted by the installed edition.',
      recommendation: 'Use the minimum diagnostic level on personal PCs that do not use Windows Copilot analytics or organization-wide Microsoft 365 reporting.',
      recommendationNotes: [
        'Windows edition and servicing rules can enforce a higher effective level than the policy value.',
      ],
      icon: Activity,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      presetId: 'telemetry_minimal',
      rollbackNeedle: 'diagnostic telemetry',
    }),
    registryItem({
      id: 'feedback-frequency-off',
      category: 'privacy',
      title: 'Windows Feedback and Diagnostics',
      description: 'Disables recurring Windows feedback prompts for the current user.',
      recommendation: 'Disable this when you do not participate in Windows Insider feedback and want to avoid feedback notifications during games or full-screen work.',
      recommendationNotes: [
        'Manual feedback through Feedback Hub remains available.',
      ],
      icon: BellOff,
      mode: 'optimal',
      presetId: 'feedback_frequency_off',
      rollbackNeedle: 'feedback prompts',
    }),
    registryItem({
      id: 'activity-history-off',
      category: 'privacy',
      title: 'Activity Feed',
      description: 'Disables publishing and cloud synchronization of application and document activity history.',
      recommendation: 'Disable this on personal or streaming PCs when you do not need activity history shared between Windows devices.',
      recommendationNotes: [
        'Recent activity may stop appearing across devices, but local application histories are not deleted.',
      ],
      icon: Database,
      mode: 'optimal',
      presetId: 'activity_history_off',
      rollbackNeedle: 'activity history',
    }),
    registryItem({
      id: 'windows-error-reporting-off',
      category: 'privacy',
      title: 'Windows Error Reporting',
      description: 'Disables Windows Error Reporting background collection.',
      recommendation: 'Disable this on a stable gaming PC only when you do not need automatic crash reports or Microsoft troubleshooting data.',
      recommendationNotes: [
        'Keep it enabled while diagnosing application or driver crashes because dump collection can be useful.',
      ],
      icon: Info,
      mode: 'maximum',
      presetId: 'windows_error_reporting_off',
      rollbackNeedle: 'Windows Error Reporting',
    }),
    registryItem({
      id: 'app-launch-tracking-off',
      category: 'privacy',
      title: 'Hide Most Used Apps',
      description: 'Disables app launch tracking used by the Start menu to build the most-used applications list.',
      recommendation: 'Disable this on shared or streaming PCs when recent application usage should not appear in Start.',
      recommendationNotes: [
        'Start menu recommendations become less personalized after launch tracking is disabled.',
      ],
      icon: Search,
      mode: 'optimal',
      presetId: 'app_launch_tracking_off',
      rollbackNeedle: 'app launch tracking',
    }),
    registryItem({
      id: 'xbox-services-off',
      category: 'services',
      title: 'Xbox services',
      description: 'Disables Xbox background services when they are not used.',
      warning: 'Do not disable if Xbox app, Game Pass, controller services, or cloud saves are required.',
      icon: Gamepad2,
      mode: 'maximum',
      presetId: 'xbox_services_off',
      rollbackNeedle: 'Xbox background services',
    }),
    unsupportedItem({
      id: 'cross-device-resume',
      category: 'tweaks',
      title: 'Cross-Device Resume',
      description: 'Cross-device sync is left to Windows account/privacy settings.',
      warning: 'Will not work if disabled: Cross Device, sync with phone',
      recommendation: 'Keep this enabled if you continue tasks, notifications, or browser activity between the PC and a phone; otherwise it can be disabled manually.',
      recommendationNotes: [
        'Disabling it can reduce background synchronization and device-to-device data exchange.',
      ],
      icon: MonitorUp,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    registryItem({
      id: 'win32-priority-separation',
      category: 'tweaks',
      title: 'Win32PrioritySeparation',
      description: 'Sets foreground scheduler quantum separation to the 0x2a tuning value.',
      recommendation: 'Use 0x2a as a conservative foreground scheduling value. Change it only when repeatable CPU-bound testing shows better frame-time consistency.',
      recommendationNotes: [
        'This value changes how processor time is divided between the foreground application and background work.',
        'A different hexadecimal value is not automatically safer or faster.',
      ],
      icon: Keyboard,
      mode: 'optimal',
      stateWhenActive: 'Enabled',
      stateWhenInactive: 'Disabled',
      valueControl: { label: 'Enter your value in HEX', value: '2a' },
      presetId: 'win32_priority_separation_2a',
      rollbackNeedle: 'Win32PrioritySeparation',
    }),
    unsupportedItem({
      id: 'service-grouping',
      category: 'tweaks',
      title: 'Service grouping (svchosts.exe)',
      description: 'Service host grouping is not changed automatically because the safe threshold depends on installed RAM and services.',
      recommendation: 'Leave Windows service grouping at its current value on modern systems. Manual consolidation is mainly useful on low-memory PCs and increases the impact of a host-process failure.',
      recommendationNotes: [
        'Aeterna does not apply this because the correct threshold depends on installed memory and the active service set.',
      ],
      icon: Boxes,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'reserved-storage-updates',
      category: 'tweaks',
      title: 'Reserved Storage for Updates',
      description: 'Reserved storage management is not available in this build.',
      recommendation: 'Keep reserved storage on systems with enough disk space so updates have a reliable staging area.',
      recommendationNotes: [
        'Removing it may recover several gigabytes, but feature updates can fail when the system drive is nearly full.',
      ],
      icon: HardDrive,
      mode: 'manual',
      badge: 'NOT SUPPORTED',
    }),
    registryItem({
      id: 'ntfs-last-access-off',
      category: 'tweaks',
      title: 'NTFS Last Access Update',
      description: 'Disables last-access timestamp updates to reduce metadata writes.',
      recommendation: 'Disable last-access timestamp updates on gaming and general-purpose PCs that do not use backup or archival tools based on that timestamp.',
      recommendationNotes: [
        'This reduces metadata writes; some backup or auditing software may perform a larger rescan after the change.',
      ],
      icon: HardDrive,
      mode: 'optimal',
      presetId: 'ntfs_last_access_off',
      rollbackNeedle: 'NTFS last access',
    }),
    registryItem({
      id: 'ntfs-8dot3-off',
      category: 'tweaks',
      title: '8.3 Filename Convention',
      description: 'Disables legacy short filename creation for new files.',
      recommendation: 'Disable short-name creation on clean systems that run modern software. Keep it enabled when old installers or legacy business applications are still required.',
      recommendationNotes: [
        'Existing short names are not removed; the setting affects creation of new names.',
      ],
      icon: HardDrive,
      mode: 'optimal',
      presetId: 'ntfs_8dot3_off',
      rollbackNeedle: '8.3 filename',
    }),
    unsupportedItem({
      id: 'diagnostic-events',
      category: 'tweaks',
      title: 'Diagnostic Events',
      description: 'Diagnostic event policies are left visible for now until per-task rollback is implemented.',
      recommendation: 'Keep diagnostic event channels enabled while troubleshooting sleep, power, or device problems; consider reducing them only on a stable system.',
      recommendationNotes: [
        'Aeterna does not change this until task-level rollback can restore each channel reliably.',
      ],
      icon: Activity,
      mode: 'manual',
      stateWhenActive: 'Disabled',
      stateWhenInactive: 'Enabled',
    }),
    registryItem({
      id: 'application-compatibility-off',
      category: 'tweaks',
      title: 'Application Compatibility',
      description: 'Disables Application Compatibility inventory policy.',
      warning: 'Will not work if disabled: Launch games in EA Launcher',
      recommendation: 'Use this only on a clean system with modern software. Keep compatibility services enabled for older games, legacy installers, and launchers that depend on Windows shims.',
      recommendationNotes: [
        'Disabling compatibility inventory can remove helper prompts but may prevent Windows from applying known application fixes.',
      ],
      icon: MonitorUp,
      mode: 'maximum',
      presetId: 'application_compatibility_off',
      rollbackNeedle: 'Application Compatibility',
    }),
    registryItem({
      id: 'automatic-maintenance-off',
      category: 'tweaks',
      title: 'Automatic Maintenance',
      description: 'Disables Windows Automatic Maintenance policy.',
      recommendation: 'Disable this only if you manually schedule Windows updates, security scans, drive optimization, and cleanup outside gaming hours.',
      recommendationNotes: [
        'The PC will no longer rely on the normal maintenance window for those background tasks.',
      ],
      icon: Activity,
      mode: 'maximum',
      presetId: 'automatic_maintenance_off',
      rollbackNeedle: 'Automatic Maintenance',
    }),
    unsupportedItem({
      id: 'scheduled-diagnostics-off',
      category: 'tweaks',
      title: 'Scheduled Diagnostics',
      description: 'Scheduled diagnostics are not changed until task-level rollback lands.',
      recommendation: 'Keep scheduled diagnostics enabled unless you monitor system health yourself and accept losing automatic checks for recurring Windows errors.',
      recommendationNotes: [
        'Aeterna does not change this until every affected scheduled task can be restored reliably.',
      ],
      icon: Activity,
      mode: 'manual',
    }),
    unsupportedItem({
      id: 'ucpd',
      category: 'tweaks',
      title: 'UCPD',
      description: 'User Choice Protection Driver is not modified automatically.',
      recommendation: 'Keep UCPD enabled unless you have a controlled deployment that must change default application associations through trusted scripts.',
      recommendationNotes: [
        'Disabling this protection can allow software to replace browser and file-association choices without the normal Windows confirmation flow.',
      ],
      icon: Lock,
      mode: 'manual',
    }),
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
    stateWhenActive: 'Disabled',
    stateWhenInactive: 'Enabled',
    buildRequest: () => (entry.supported ? { kind: 'tweak', payload: { kind: 'autorun_disable', autorun_id: entry.id } } : null),
    rollbackHint: (activity) => activity.action === 'Autorun disabled' && detailIncludes(activity, displayName),
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
  const highestPlanGuid = highestPerformancePlanGuid(runtimeState)
  if (highestPlanGuid && runtimeState.power_plans.some((plan) => plan.guid === highestPlanGuid && plan.active)) {
    active.add('ultimate-power')
  }
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

function statusLabel(active: boolean, item: OptimizerItem) {
  if (item.supported === false) {
    return {
      text: 'Not supported',
      tone: 'neutral' as const,
    }
  }
  const text = active ? item.stateWhenActive ?? 'Enabled' : item.stateWhenInactive ?? 'Disabled'
  return {
    text,
    tone: text === 'Enabled' ? ('danger' as const) : ('accent' as const),
  }
}

function OptimizerSwitch({
  disabled,
  onToggle,
  tone,
}: {
  disabled?: boolean
  onToggle: () => void
  tone: 'danger' | 'accent' | 'neutral'
}) {
  const switchTone = tone === 'danger' ? '#e93c41' : tone === 'accent' ? '#315cff' : '#34405c'
  return (
    <button
      aria-checked={tone === 'danger'}
      className="relative h-7 w-[54px] shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      style={{ backgroundColor: switchTone }}
      type="button"
    >
      <span
        className="absolute left-[calc(100%-1.5rem)] top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px]"
        style={{ color: switchTone }}
      >
        {tone === 'danger' ? <X size={13} /> : <Check size={13} />}
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
  runtimeServices,
}: {
  active: boolean
  changed: boolean
  disabled: boolean
  item: OptimizerItem
  onToggle: () => void
  runtimeServices: ServiceRuntimeSummary[]
}) {
  const Icon = item.icon
  const label = statusLabel(active, item)
  const [expanded, setExpanded] = useState(false)
  const dangerTooltipId = useId()
  const dangerNote = dangerNoteForOptimizerItem(item)
  const guidance = guidanceForOptimizerItem(item)
  const serviceGroup = SERVICE_GROUP_INFO[item.id] ?? null
  const serviceStateByName = new globalThis.Map(runtimeServices.map((service) => [service.name.toLowerCase(), service]))

  return (
    <article
      className={`rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(49,92,255,0.10)] ${
        changed ? 'ring-1 ring-[#7ba2ff]/75' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <button
          aria-describedby={dangerNote ? dangerTooltipId : undefined}
          aria-expanded={expanded}
          aria-label={item.title}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-xl text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <Icon className="shrink-0 text-white/92" size={25} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-[18px] font-semibold leading-6 text-white">{item.title}</span>
              <ChevronDown
                className={`shrink-0 text-white/70 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                size={16}
              />
              {dangerNote ? (
                <span
                  className="group/danger relative inline-flex shrink-0"
                  title={dangerNote}
                >
                  <AlertTriangle aria-hidden="true" className="fill-[#e93c41] text-[#e93c41]" size={20} />
                  <span
                    className="pointer-events-none absolute left-1/2 top-[calc(100%+0.55rem)] z-30 w-max max-w-[390px] -translate-x-1/2 rounded-xl border border-[#6b49ff] bg-[#090d21] px-3 py-2 text-left text-xs font-semibold leading-5 text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.5)] transition-opacity group-hover/danger:opacity-100"
                    id={dangerTooltipId}
                    role="tooltip"
                  >
                    {dangerNote}
                  </span>
                </span>
              ) : null}
              {item.requiresReboot ? (
                <span className="rounded-md bg-[#e93c41] px-2 py-0.5 text-xs font-black uppercase text-white">Restart</span>
              ) : null}
              {item.requiresProcess ? (
                <span className="rounded-md bg-[#315cff]/75 px-2 py-0.5 text-xs font-black uppercase text-white">Process</span>
              ) : null}
              {item.badge ? (
                <span className="rounded-md bg-[#e93c41] px-2 py-0.5 text-xs font-black uppercase text-white">{item.badge}</span>
              ) : null}
              {changed ? <span className="rounded-md bg-[#4f6ba8] px-2 py-0.5 text-xs font-bold text-white">Pending</span> : null}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`text-sm font-bold ${
              label.tone === 'danger' ? 'text-[#ff4e5e]' : label.tone === 'accent' ? 'text-[#315cff]' : 'text-white/45'
            }`}
          >
            {label.text}
          </span>
          <OptimizerSwitch disabled={disabled || item.supported === false} onToggle={onToggle} tone={label.tone} />
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 pl-10">
          <p className="text-[16px] font-medium leading-6 text-white/88">{item.description}</p>
          {item.warning ? (
            <p className="mt-2 flex items-start gap-2 text-sm font-semibold leading-5 text-[#ffd12f]">
              <Info className="mt-0.5 shrink-0" size={16} />
              <span>{item.warning}</span>
            </p>
          ) : null}

          <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-[#34405c] px-3 py-1 text-xs font-black uppercase text-white">
            Detailed description
            <ChevronDown size={14} />
          </div>

          {serviceGroup ? (
            <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-[#111936]/88 p-3">
              <p className="px-1 text-xs font-black uppercase tracking-[0.08em] text-[#7ba2ff]">Included services</p>
              <div className="mt-2 space-y-2">
                {serviceGroup.services.map((service) => {
                  const runtimeService = serviceStateByName.get(service.name.toLowerCase())
                  return (
                    <div
                      key={service.name}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#070b1b]/72 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{service.displayName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-white/45">{service.name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
                        <span className="text-white/55">
                          Startup:{' '}
                          <span className={runtimeService?.startup_type === 4 ? 'text-[#ff4e5e]' : 'text-[#ffd12f]'}>
                            {serviceStartupTypeLabel(runtimeService?.startup_type ?? null)}
                          </span>
                        </span>
                        <span className="text-white/55">
                          Status:{' '}
                          <span className={runtimeService?.running ? 'text-[#315cff]' : 'text-white/45'}>
                            {runtimeService ? (runtimeService.running ? 'Running' : 'Stopped') : 'Unavailable'}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 rounded-[1.2rem] border-2 border-[#315cff] bg-[#24408e]/72 px-5 py-4">
            <p className="text-sm font-black uppercase text-white">Recommendation</p>
            <p className="mt-2 text-[15px] font-medium leading-6 text-white/92">{guidance.recommendation}</p>
            {guidance.notes.length > 0 ? (
              <div className="mt-3 space-y-1.5 text-sm font-medium leading-5 text-white/72">
                {guidance.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}
          </div>

          {item.valueControl ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-white/88">{item.valueControl.label}</span>
              <input
                className="h-8 w-28 rounded-lg border border-white/10 bg-white px-3 text-center font-bold text-[#070b1b] outline-none"
                readOnly
                value={item.valueControl.value}
              />
              <span className="rounded-lg bg-[#315cff] px-3 py-1.5 text-xs font-black uppercase text-white">OK</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function AeternaProcessArt({ complete, percent }: { complete: boolean; percent: number }) {
  const ringDegrees = Math.max(0, Math.min(100, percent)) * 3.6
  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-[1.35rem] bg-[radial-gradient(circle_at_55%_15%,rgba(124,84,255,0.58),rgba(52,32,126,0.95)_42%,rgba(80,58,214,0.84)_100%)] p-8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,rgba(49,92,255,0),rgba(119,90,255,0.78))]" />
      {complete ? (
        <div className="relative z-10 flex h-full min-h-[456px] flex-col items-center justify-center gap-12 text-center">
          <div className="text-5xl font-black tracking-[0.08em]">
            AETERNA <span className="text-[#315cff]">+{Math.max(0, Math.min(100, percent))}%</span>
          </div>
          <div
            className="grid h-56 w-56 place-items-center rounded-full"
            style={{
              background: `conic-gradient(#ffd24a ${ringDegrees}deg, #315cff ${ringDegrees}deg 360deg)`,
            }}
          >
            <div className="grid h-[168px] w-[168px] place-items-center rounded-full bg-[#39217c] text-4xl font-black text-[#ffd24a] shadow-[inset_0_0_32px_rgba(0,0,0,0.18)]">
              {percent}%
            </div>
          </div>
          <p className="max-w-[460px] text-3xl font-black leading-tight">System profile updated and ready for validation.</p>
        </div>
      ) : (
        <div className="relative z-10 flex h-full min-h-[456px] items-center justify-center">
          <div className="relative h-[340px] w-[420px] rotate-[-2deg]">
            <div className="absolute left-8 top-24 h-24 w-[330px] rotate-[-38deg] rounded-[28px] bg-[#080e2b] shadow-[0_0_44px_rgba(214,36,255,0.62)]" />
            <div className="absolute left-12 top-24 h-24 w-[330px] rotate-[-38deg] rounded-[28px] bg-[linear-gradient(90deg,#07102e,#1d1457)]" />
            <div className="absolute left-20 top-40 h-24 w-[330px] rotate-[38deg] rounded-[28px] bg-[linear-gradient(90deg,#10164c,#080d25)] shadow-[0_0_50px_rgba(49,92,255,0.5)]" />
            <div className="absolute left-20 top-40 h-24 w-[330px] rotate-[38deg] rounded-[28px] border-r-4 border-[#e223ff]" />
            <div className="absolute left-10 top-28 h-[190px] w-1 rounded-full bg-[#e223ff] shadow-[0_0_36px_#e223ff]" />
            <div className="absolute bottom-8 right-8 h-[190px] w-1 rounded-full bg-[#e223ff] shadow-[0_0_36px_#e223ff]" />
          </div>
        </div>
      )}
    </div>
  )
}

function ApplySummaryRow({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: LucideIcon
  label: string
  suffix?: string
  value: number | string
}) {
  return (
    <div className="flex items-center gap-4 text-lg font-semibold text-white">
      <Icon className="shrink-0 text-white" size={27} />
      <span>{label}</span>
      <span className="text-[#315cff]">{value}</span>
      {suffix ? <span>{suffix}</span> : null}
    </div>
  )
}

function ApplyFlowScreen({
  onClose,
  onRestart,
  state,
}: {
  onClose: () => void
  onRestart: () => void | Promise<void>
  state: ApplyRunState
}) {
  const running = state.phase === 'running'
  const progress = state.total > 0 ? Math.round((state.currentIndex / state.total) * 100) : 100

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[radial-gradient(circle_at_0%_15%,rgba(66,41,143,0.88),transparent_38%),linear-gradient(120deg,#1a1b59_0%,#121b52_46%,#0b3154_100%)] px-8 py-7 text-white">
      <div className="mx-auto flex w-[min(1500px,calc(100vw-4rem))] items-center gap-4">
        <button
          className="grid h-12 w-12 place-items-center rounded-full text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-55"
          disabled={running}
          onClick={onClose}
          type="button"
        >
          <ArrowLeft size={31} />
        </button>
        <h1 className="text-2xl font-black">{running ? 'Applying optimization' : 'Optimization completed'}</h1>
      </div>

      <section className="mx-auto mt-24 grid w-[min(1380px,calc(100vw-8rem))] grid-cols-[minmax(360px,0.95fr)_minmax(380px,1fr)] overflow-hidden rounded-[1.55rem] bg-[#070b1b]/92 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.36)] max-[980px]:mt-10 max-[980px]:w-full max-[980px]:grid-cols-1">
        <AeternaProcessArt complete={!running} percent={state.boostPercent} />

        <div className="flex min-h-[520px] flex-col px-12 py-14 max-[980px]:min-h-[420px] max-[980px]:px-5">
          {running ? (
            <>
              <div>
                <p className="max-w-[560px] text-3xl font-black leading-snug">Please wait, optimization in progress...</p>
                <div className="mt-8 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#315cff] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-3 text-sm font-bold text-white/55">
                  Step {Math.min(state.currentIndex, state.total)} of {state.total}
                </p>
              </div>

              <div className="mt-auto space-y-2 text-xl font-semibold">
                <p>
                  Starting... <span className="text-[#315cff]">Done!</span> <Check className="inline text-[#315cff]" size={22} />
                </p>
                <p>
                  Changing "{state.currentTitle}" <span className="text-[#18ff78]">Running...</span>
                </p>
                <p className="text-base text-white/48">Rollback snapshots are created before every supported system change.</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-3xl font-black">Optimization completed!</h2>
                {state.failed.length > 0 ? (
                  <p className="mt-3 max-w-[640px] text-base font-semibold leading-6 text-[#ffcf5a]">
                    Completed with warnings: {state.failed.join(', ')}.
                  </p>
                ) : null}
              </div>

              <div className="mt-12 space-y-6">
                <ApplySummaryRow icon={Brush} label="Cleaned" suffix="MB junk" value={state.stats.cleanedMb} />
                <ApplySummaryRow icon={Boxes} label="Disabled" suffix="services" value={state.stats.servicesDisabled} />
                <ApplySummaryRow icon={Check} label="Applied" suffix="tweaks" value={state.stats.tweaksApplied} />
                <ApplySummaryRow icon={PackageX} label="Deleted" suffix="applications" value={state.stats.appsDeleted} />
                <ApplySummaryRow icon={Activity} label="Removed" suffix="autoruns" value={state.stats.autorunsRemoved} />
                <ApplySummaryRow icon={ListChecks} label="Total completed" suffix="functions" value={state.applied} />
              </div>

              <div className="mt-auto">
                <p className={`mb-4 flex items-center gap-2 text-sm font-semibold ${state.rebootRequired ? 'text-[#8fa7e8]' : 'text-white/45'}`}>
                  <Info size={18} />
                  {state.rebootRequired
                    ? 'Some selected functions will fully apply only after Windows restart.'
                    : 'No restart-only functions were selected in this pass.'}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    className="flex min-h-14 items-center justify-center gap-3 rounded-[1.15rem] bg-[#202942] px-7 text-xl font-bold text-white transition hover:bg-[#2b3554]"
                    onClick={() => void onRestart()}
                    type="button"
                  >
                    <RefreshCw size={25} />
                    <span>Restart PC</span>
                  </button>
                  <button
                    className="min-h-14 rounded-[1.15rem] bg-[#315cff] px-10 text-xl font-black text-white transition hover:bg-[#4068ff]"
                    onClick={onClose}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export function OptimizationPage({
  dashboard,
  runtimeState,
  onApplyRegistryPreset,
  onApplyTweak,
  onAttachSession,
  onRefresh,
  onRequestRestart,
  onRollbackSnapshot,
}: OptimizationPageProps) {
  const requestConfirmation = useConfirmDialog()
  const [category, setCategory] = useState<CategoryId>('basic')
  const [mode, setMode] = useState<MethodMode>('default')
  const [desired, setDesired] = useState<Set<string>>(() => new Set())
  const [dirty, setDirty] = useState(false)
  const [snapshotMap, setSnapshotMap] = useState<Record<string, string>>(() => readSnapshotMap())
  const [busy, setBusy] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [applyRun, setApplyRun] = useState<ApplyRunState | null>(null)

  const items = useMemo(() => {
    const autorunItems = runtimeState.autoruns.map(createAutorunItem)
    return [...staticItems(), ...autorunItems]
  }, [runtimeState.autoruns])

  const runtimeActive = useMemo(() => runtimeActiveIds(runtimeState), [runtimeState])
  const activeIds = useMemo(() => {
    const next = new Set(runtimeActive)
    for (const entry of runtimeState.autoruns) {
      if (!entry.enabled) next.add(`autorun:${entry.id}`)
    }
    return next
  }, [runtimeActive, runtimeState.autoruns])
  const activeSignature = useMemo(() => Array.from(activeIds).sort().join('|'), [activeIds])

  useEffect(() => {
    if (!dirty) setDesired(new Set(activeIds))
  }, [activeIds, activeSignature, dirty])

  useEffect(() => {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshotMap))
  }, [snapshotMap])

  const visibleItems = itemsForCategory(items, category)
  const changedItems = items.filter((item) => desired.has(item.id) !== activeIds.has(item.id))
  const selectedCategory = categories.find((item) => item.id === category) ?? categories[0]
  const contentTitle = category === 'basic' ? 'Basic settings' : selectedCategory.label
  const latestSample = dashboard.history.at(-1) ?? null

  const confirmDangerousItems = async (itemsToConfirm: OptimizerItem[], action: string) => {
    const confirmation = dangerousOptimizerConfirmation(itemsToConfirm, action)
    return !confirmation || requestConfirmation(confirmation)
  }

  const setCategoryMode = async (nextMode: MethodMode, targetCategory = category) => {
    const categoryItems = itemsForCategory(items, targetCategory)
    const targets = categoryItems.filter((row) => {
      if (row.supported === false) return false
      if (nextMode === 'optimal') return row.mode === 'optimal'
      if (nextMode === 'maximum') return row.mode !== 'manual'
      return false
    })
    const newlyEnabledRisky = targets.filter((item) => !desired.has(item.id) && isDangerousOptimizerItem(item))
    if (newlyEnabledRisky.length > 0 && !(await confirmDangerousItems(newlyEnabledRisky, 'enable'))) return
    setMode(nextMode)
    setDirty(true)
    setDesired((current) => {
      const next = new Set(current)
      for (const item of categoryItems) {
        if (item.supported === false) continue
        next.delete(item.id)
        if (nextMode === 'optimal' && item.mode === 'optimal') next.add(item.id)
        if (nextMode === 'maximum' && item.mode !== 'manual') next.add(item.id)
      }
      return next
    })
  }

  const toggleDesiredItem = async (item: OptimizerItem, active: boolean) => {
    const enabling = !active
    if (enabling && !(await confirmDangerousItems([item], 'enable'))) return
    setDirty(true)
    setDesired((currentSet) => {
      const next = new Set(currentSet)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
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
    return true
  }

  const rollbackItem = async (item: OptimizerItem): Promise<boolean> => {
    const snapshotId = resolveSnapshot(item)
    if (!snapshotId) {
      setStatusText(`"${item.title}" is active in Windows, but Aeterna has no rollback snapshot for it.`)
      return false
    }
    await onRollbackSnapshot(snapshotId, runtimeState.session.process_id ?? undefined)
    setSnapshotMap((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    return true
  }

  const applyChanges = async () => {
    if (busy || changedItems.length === 0) return
    const riskyItems = changedItems.filter((item) => desired.has(item.id) && isDangerousOptimizerItem(item))
    if (riskyItems.length > 0 && !(await confirmDangerousItems(riskyItems, 'apply'))) return
    const rebootItems = changedItems.filter((item) => desired.has(item.id) && item.requiresReboot)
    if (rebootItems.length > 0) {
      const confirmed = await requestConfirmation({
        confirmLabel: 'Apply changes',
        description: `${rebootItems.length} selected function(s) require a Windows restart to finish. Aeterna will create rollback snapshots before applying them.`,
        eyebrow: 'Restart required',
        items: rebootItems.map((item) => item.title),
        title: 'Apply restart-required changes?',
        tone: 'warning',
      })
      if (!confirmed) return
    }
    const queuedChanges = [...changedItems]
    const supportedItemCount = Math.max(1, items.filter((item) => item.supported !== false).length)
    const projectedActiveIds = new Set(activeIds)
    const emptyStats = { ...EMPTY_APPLY_STATS }

    setBusy('apply')
    setStatusText(null)
    setApplyRun({
      applied: 0,
      boostPercent: Math.round((activeIds.size / supportedItemCount) * 100),
      currentIndex: 0,
      currentTitle: queuedChanges[0]?.title ?? 'Starting',
      failed: [],
      phase: 'running',
      rebootRequired: rebootItems.length > 0,
      stats: emptyStats,
      total: queuedChanges.length,
    })
    let applied = 0
    let stats: ApplyStats = emptyStats
    const failed: string[] = []

    try {
      for (let index = 0; index < queuedChanges.length; index += 1) {
        const item = queuedChanges[index]
        const applying = desired.has(item.id)
        setApplyRun((current) =>
          current
            ? {
                ...current,
                currentIndex: index + 1,
                currentTitle: item.title,
              }
            : current,
        )
        try {
          const ok = applying ? await applyItem(item) : await rollbackItem(item)
          if (ok) {
            applied += 1
            stats = addApplyStats(stats, statsForCompletedItem(item, applying))
            if (applying) projectedActiveIds.add(item.id)
            else projectedActiveIds.delete(item.id)
            setApplyRun((current) =>
              current
                ? {
                    ...current,
                    applied,
                    boostPercent: Math.round((projectedActiveIds.size / supportedItemCount) * 100),
                    stats,
                  }
                : current,
            )
          } else {
            failed.push(item.title)
          }
        } catch (error) {
          failed.push(`${item.title}: ${formatUnknownError(error, 'action failed')}`)
        }
      }
      await onRefresh()
    } finally {
      setBusy(null)
    }

    if (failed.length === 0) setDirty(false)
    if (failed.length > 0) {
      setStatusText(`Applied ${applied} change(s). Failed: ${failed.join(', ')}.`)
    } else {
      setStatusText(`Applied ${applied} change(s).`)
    }
    setApplyRun({
      applied,
      boostPercent: Math.round((projectedActiveIds.size / supportedItemCount) * 100),
      currentIndex: queuedChanges.length,
      currentTitle: queuedChanges.at(-1)?.title ?? 'Completed',
      failed,
      phase: 'complete',
      rebootRequired: rebootItems.length > 0,
      stats,
      total: queuedChanges.length,
    })
  }

  const resetCategoryToActive = () => {
    setMode('default')
    setDirty(true)
    setDesired((current) => {
      const next = new Set(current)
      for (const item of visibleItems) {
        if (activeIds.has(item.id)) next.add(item.id)
        else next.delete(item.id)
      }
      return next
    })
  }

  if (applyRun) {
    return <ApplyFlowScreen onClose={() => setApplyRun(null)} onRestart={onRequestRestart} state={applyRun} />
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(240px,300px)_minmax(0,1fr)] gap-5 text-white">
      <aside className="flex min-h-0 flex-col gap-5">
        <h1 className="px-3 text-2xl font-black">Optimization</h1>
        <div className="min-h-0 overflow-y-auto rounded-[1.35rem] bg-[#070b1b]/86 p-3">
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
          <h2 className="text-2xl font-semibold">{contentTitle}</h2>
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
              category === 'services' ? (
                ([
                  { id: 'safe' as const, label: 'Safe when unused', tone: 'text-white' },
                  { id: 'dangerous' as const, label: 'Dangerous to disable', tone: 'text-[#ff4e5e]' },
                ]).map((section) => {
                  const sectionItems = visibleItems.filter((item) => SERVICE_GROUP_INFO[item.id]?.risk === section.id)
                  if (sectionItems.length === 0) return null
                  return (
                    <section key={section.id} className="space-y-2">
                      <div className="flex items-center gap-3 px-1 pb-1 pt-2">
                        <h3 className={`text-lg font-black ${section.tone}`}>{section.label}</h3>
                        <span className="rounded-full bg-[#5d6f9e]/70 px-5 py-1.5 text-xs font-semibold text-white">
                          Tip <ChevronDown className="ml-1 inline" size={13} />
                        </span>
                      </div>
                      {sectionItems.map((item) => {
                        const active = desired.has(item.id)
                        const current = activeIds.has(item.id)
                        return (
                          <OptimizationRow
                            key={item.id}
                            active={active}
                            changed={active !== current}
                            disabled={busy !== null}
                            item={item}
                            onToggle={() => toggleDesiredItem(item, active)}
                            runtimeServices={runtimeState.services}
                          />
                        )
                      })}
                    </section>
                  )
                })
              ) : (
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
                      onToggle={() => toggleDesiredItem(item, active)}
                      runtimeServices={runtimeState.services}
                    />
                  )
                })
              )
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
