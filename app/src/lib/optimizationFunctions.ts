import type {
  ApplyRegistryPresetRequest,
  ApplyTweakRequest,
  OptimizationRuntimeState,
} from '../types'

export type OptimizationFunctionRequest =
  | { kind: 'tweak'; payload: ApplyTweakRequest }
  | { kind: 'preset'; payload: ApplyRegistryPresetRequest }

export interface OptimizationFunctionContext {
  processId: number | null
  runtimeState: OptimizationRuntimeState
}

export interface OptimizationFunctionDefinition {
  id: string
  title: string
  description: string
  risk?: 'low' | 'medium' | 'high'
  dangerNote?: string
  requiresReboot?: boolean
  processRequired?: boolean
  benchmarkSafe?: boolean
  mlDefault?: boolean
  buildRequest: (context: OptimizationFunctionContext) => OptimizationFunctionRequest | null
}

function highestPerformancePlanGuid(runtimeState: OptimizationRuntimeState): string | null {
  const plan =
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('ultimate performance')) ??
    runtimeState.power_plans.find((row) => row.name.toLowerCase().includes('high performance')) ??
    null
  return plan?.guid ?? null
}

export const OPTIMIZATION_FUNCTIONS: OptimizationFunctionDefinition[] = [
  {
    id: 'reduce-input-lag',
    title: 'Reduce input lag',
    description: 'Disable Windows mouse acceleration (Enhance Pointer Precision).',
    risk: 'medium',
    dangerNote: 'Mouse aim will feel different if the user trained with Windows pointer acceleration enabled.',
    benchmarkSafe: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'mouse_precision_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'driver-search-off',
    title: 'Disable automatic driver search',
    description: 'Block Windows driver search/update staging during startup and servicing windows.',
    risk: 'medium',
    dangerNote: 'Driver delivery behavior changes at machine scope and may delay future device driver updates.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'driver_search_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'global-notifications-off',
    title: 'Disable global notifications',
    description: 'Disable global Windows toast notifications for the current user.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'global_notifications_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'background-apps-off',
    title: 'Disable UWP background apps',
    description: 'Stop Store/UWP background execution where Windows exposes the policy.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'background_apps_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'store-auto-updates-off',
    title: 'Disable Store auto updates',
    description: 'Prevent Store app update downloads from starting during game sessions.',
    risk: 'medium',
    dangerNote: 'Store apps may stop receiving automatic updates until the preset is rolled back.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'store_auto_updates_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'keep-cores',
    title: 'Keep all cores active',
    description: 'Set game CPU affinity to all logical threads.',
    risk: 'medium',
    dangerNote: 'Affinity changes are process-scoped but can destabilize games that expect their original scheduler layout.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'tweak', payload: { kind: 'cpu_affinity', process_id: processId, affinity_preset: 'all_threads' } } : null,
  },
  {
    id: 'max-games',
    title: 'Maximum performance for games',
    description: 'Raise selected game process priority to High.',
    risk: 'medium',
    dangerNote: 'High priority can make the game more responsive, but it can starve background audio, capture, or input helpers.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'tweak', payload: { kind: 'process_priority', process_id: processId, priority: 'high' } } : null,
  },
  {
    id: 'ultimate-power',
    title: 'Ultimate performance mode',
    description: 'Switch active power plan to Ultimate/High Performance.',
    risk: 'medium',
    dangerNote: 'Higher power plans can increase heat, fan noise, and battery drain outside the game session.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: ({ runtimeState }) => {
      const powerPlanGuid = highestPerformancePlanGuid(runtimeState)
      return powerPlanGuid ? { kind: 'tweak', payload: { kind: 'power_plan', power_plan_guid: powerPlanGuid } } : null
    },
  },
  {
    id: 'process-qos-high',
    title: 'Per-process QoS',
    description: 'Remove process power-throttling for the selected game process.',
    risk: 'medium',
    dangerNote: 'This changes the selected process power-throttling state and should be measured against a baseline.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'tweak', payload: { kind: 'process_qos', process_id: processId } } : null),
  },
  {
    id: 'process-isolation',
    title: 'Process isolation',
    description: 'Pin game threads to one thread per core.',
    risk: 'high',
    dangerNote: 'Aggressive affinity isolation can reduce performance or break scheduling assumptions in some games and anti-cheat stacks.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'tweak', payload: { kind: 'process_isolation', process_id: processId } } : null),
  },
  {
    id: 'turn-off-recordings',
    title: 'Turn off Game Bar recordings',
    description: 'Disable Game DVR background capture flags.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'game_capture_overhead_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'game-mode-on',
    title: 'Force Game Mode on',
    description: 'Force Windows Game Mode enabled for current user.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'game_mode_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'windowed-optimizations-on',
    title: 'Windowed optimizations',
    description: 'Enable borderless/windowed DirectX optimization path.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windowed_optimizations_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'fullscreen-optimizations-off',
    title: 'Disable fullscreen optimizations',
    description: 'Write per-app compatibility flag to bypass fullscreen optimization layer.',
    risk: 'medium',
    dangerNote: 'This can change Alt+Tab, overlays, capture, and presentation behavior for the selected executable.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'preset', payload: { preset_id: 'fullscreen_optimizations_off', process_id: processId } } : null,
  },
  {
    id: 'gpu-preference-high',
    title: 'Per-app GPU preference',
    description: 'Set selected executable to High Performance GPU preference.',
    risk: 'medium',
    dangerNote: 'The selected executable will be pinned to the high-performance GPU preference until rolled back.',
    benchmarkSafe: true,
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'preset', payload: { preset_id: 'gpu_preference_high', process_id: processId } } : null),
  },
  {
    id: 'power-throttling-off',
    title: 'Turn off power throttling',
    description: 'Disable machine-level power throttling policy in registry.',
    risk: 'medium',
    dangerNote: 'This is a machine-level power policy change and can increase power draw and thermals.',
    benchmarkSafe: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'power_throttling_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'hags-on',
    title: 'Enable HAGS',
    description: 'Enable hardware-accelerated GPU scheduling.',
    risk: 'medium',
    dangerNote: 'GPU scheduling behavior changes after restart and can be driver-sensitive.',
    requiresReboot: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'hags_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'delivery-optimization-off',
    title: 'Disable Delivery Optimization',
    description: 'Disable peer/download optimization background traffic for Windows updates.',
    risk: 'medium',
    dangerNote: 'Windows and Store download behavior can change while this preset is active.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'delivery_optimization_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'edge-background-off',
    title: 'Disable Edge background mode',
    description: 'Disable Edge startup boost and background operation policy.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'edge_background_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'interrupt-affinity-lock',
    title: 'Interrupt affinity lock',
    description: 'Lock interrupt steering mode for the active power scheme.',
    risk: 'medium',
    dangerNote: 'Interrupt steering changes can affect device latency differently across chipsets.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'interrupt_affinity_lock' } }),
  },
  {
    id: 'disable-hpet',
    title: 'Deactivate HPET',
    description: 'Set boot option useplatformclock=false.',
    risk: 'high',
    dangerNote: 'This changes a boot timer option and requires a restart; bad hardware/driver combinations can become less stable.',
    requiresReboot: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_hpet' } }),
  },
  {
    id: 'disable-dynamic-ticks',
    title: 'Disable Dynamic Ticks',
    description: 'Set boot option disabledynamictick=yes.',
    risk: 'high',
    dangerNote: 'This changes Windows boot timer behavior and requires a restart to validate safely.',
    requiresReboot: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_dynamic_ticks' } }),
  },
  {
    id: 'low-timer-resolution',
    title: 'Lower timer resolution',
    description: 'Request minimum system timer resolution.',
    risk: 'medium',
    dangerNote: 'Lower timer resolution can increase power use and should be kept only if frame-time tests improve.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'low_timer_resolution' } }),
  },
  {
    id: 'mpo-off',
    title: 'Disable MPO',
    description: 'Disable Multiplane Overlay path.',
    risk: 'high',
    dangerNote: 'This changes DWM composition behavior at machine scope and requires a restart.',
    requiresReboot: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'mpo_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'usb-selective-suspend-off',
    title: 'Disable USB selective suspend',
    description: 'Set USB selective suspend AC/DC indexes to Disabled.',
    benchmarkSafe: true,
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'usb_selective_suspend_off' } }),
  },
  {
    id: 'pcie-lspm-off',
    title: 'Disable PCIe LSPM',
    description: 'Set PCIe Link State Power Management AC/DC to Off.',
    risk: 'medium',
    dangerNote: 'Disabling PCIe link power management can increase idle power draw and heat.',
    benchmarkSafe: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'pcie_lspm_off' } }),
  },
  {
    id: 'sysmain-off',
    title: 'Disable SysMain service',
    description: 'Disable SysMain startup and stop running service.',
    risk: 'medium',
    dangerNote: 'Disabling SysMain can affect prefetch behavior and some activity-analysis tools.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'sysmain_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'windows-search-off',
    title: 'Disable Windows Search service',
    description: 'Disable WSearch startup and stop running service.',
    risk: 'medium',
    dangerNote: 'Windows file search and indexing will be degraded until the preset is restored.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windows_search_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'dps-off',
    title: 'Disable Diagnostic Policy Service',
    description: 'Disable DPS startup and stop running service.',
    risk: 'high',
    dangerNote: 'Network diagnostics and some Windows troubleshooting surfaces can stop working while DPS is disabled.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'dps_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'diagtrack-off',
    title: 'Disable telemetry service',
    description: 'Disable Connected User Experiences and Telemetry service startup.',
    risk: 'medium',
    dangerNote: 'This changes a Windows service startup policy and may affect diagnostics/telemetry-dependent features.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'diagtrack_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'maps-broker-off',
    title: 'Disable maps broker service',
    description: 'Disable offline maps maintenance service startup.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'maps_broker_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'xbox-services-off',
    title: 'Disable Xbox services',
    description: 'Disable Xbox background services when they are not used.',
    risk: 'medium',
    dangerNote: 'Xbox app, Game Pass, controller services, and cloud saves may stop working until rollback.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'xbox_services_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'consumer-features-off',
    title: 'Disable consumer content',
    description: 'Block suggested apps and consumer content provisioning.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'consumer_features_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'content-delivery-off',
    title: 'Disable promoted content',
    description: 'Disable suggested apps and promoted content for the current user.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'content_delivery_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'widgets-off',
    title: 'Disable Widgets and News',
    description: 'Disable Windows Widgets/News background surface by policy.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'widgets_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'advertising-id-off',
    title: 'Disable advertising ID',
    description: 'Disable the per-user advertising identifier.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'advertising_id_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'telemetry-minimal',
    title: 'Minimal Windows telemetry',
    description: 'Set diagnostic telemetry policy to the minimum value.',
    risk: 'medium',
    dangerNote: 'This changes Windows diagnostic data policy at machine scope where the edition supports it.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'telemetry_minimal', process_id: processId ?? undefined } }),
  },
  {
    id: 'feedback-frequency-off',
    title: 'Disable feedback prompts',
    description: 'Disable Windows feedback prompt frequency for the current user.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'feedback_frequency_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'activity-history-off',
    title: 'Disable activity history sync',
    description: 'Disable activity history publishing and upload policies.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'activity_history_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'windows-error-reporting-off',
    title: 'Disable Windows Error Reporting',
    description: 'Disable Windows Error Reporting background collection.',
    risk: 'medium',
    dangerNote: 'Crash reports and diagnostic collection can be suppressed while the preset is active.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windows_error_reporting_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'app-launch-tracking-off',
    title: 'Disable app launch tracking',
    description: 'Disable app launch tracking used by Start personalization.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'app_launch_tracking_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'smartscreen-on',
    title: 'Keep SmartScreen enabled',
    description: 'Explicitly keep Windows SmartScreen enabled while optimizing.',
    risk: 'low',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'smartscreen_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'security-center-on',
    title: 'Keep Security Center enabled',
    description: 'Keep Windows Security Center service enabled so protection state stays visible.',
    risk: 'low',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'security_center_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'windows-firewall-on',
    title: 'Keep Windows Firewall enabled',
    description: 'Keep Windows Firewall service enabled while optimizing.',
    risk: 'low',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windows_firewall_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'memory-integrity-off',
    title: 'Disable Memory Integrity',
    description: 'Disable VBS Memory Integrity where it causes latency overhead.',
    risk: 'high',
    dangerNote: 'This weakens Windows security isolation and requires a restart to take full effect.',
    requiresReboot: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'memory_integrity_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'ntfs-last-access-off',
    title: 'Disable NTFS last access updates',
    description: 'Disable last access timestamp updates to reduce metadata writes.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'ntfs_last_access_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'win32-priority-separation',
    title: 'Win32 priority separation',
    description: 'Set foreground scheduler quantum separation to the gaming-oriented 0x2a value.',
    risk: 'medium',
    dangerNote: 'Scheduler quantum policy changes are machine-wide and should be kept only after controlled tests.',
    benchmarkSafe: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'win32_priority_separation_2a', process_id: processId ?? undefined } }),
  },
  {
    id: 'ntfs-8dot3-off',
    title: 'Disable 8.3 filename creation',
    description: 'Disable legacy DOS short filename creation for new files.',
    risk: 'medium',
    dangerNote: 'Legacy applications that rely on 8.3 short names may fail until this is restored.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'ntfs_8dot3_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'application-compatibility-off',
    title: 'Disable compatibility inventory',
    description: 'Reduce compatibility inventory/background checks that can wake outside the active game session.',
    risk: 'medium',
    dangerNote: 'Some launchers and compatibility workflows can break while inventory policies are disabled.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'application_compatibility_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'automatic-maintenance-off',
    title: 'Disable automatic maintenance',
    description: 'Disable scheduled automatic maintenance wakeups while tuning the system.',
    risk: 'medium',
    dangerNote: 'Windows maintenance tasks can be delayed until the preset is rolled back.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'automatic_maintenance_off', process_id: processId ?? undefined } }),
  },
]

const FUNCTION_BY_ID = new Map(OPTIMIZATION_FUNCTIONS.map((item) => [item.id, item]))

export const HIGH_RISK_FUNCTION_IDS = new Set([
  'disable-hpet',
  'disable-dynamic-ticks',
  'memory-integrity-off',
  'mpo-off',
  'process-isolation',
  'dps-off',
])

export const DANGEROUS_OPTIMIZATION_FUNCTION_IDS = new Set([
  ...HIGH_RISK_FUNCTION_IDS,
  'driver-search-off',
  'store-auto-updates-off',
  'keep-cores',
  'max-games',
  'ultimate-power',
  'process-qos-high',
  'fullscreen-optimizations-off',
  'gpu-preference-high',
  'power-throttling-off',
  'hags-on',
  'delivery-optimization-off',
  'interrupt-affinity-lock',
  'low-timer-resolution',
  'pcie-lspm-off',
  'sysmain-off',
  'windows-search-off',
  'diagtrack-off',
  'xbox-services-off',
  'telemetry-minimal',
  'windows-error-reporting-off',
  'win32-priority-separation',
  'ntfs-8dot3-off',
  'application-compatibility-off',
  'automatic-maintenance-off',
  'print-spooler-off',
])

export function getOptimizationFunctionById(id: string): OptimizationFunctionDefinition | null {
  return FUNCTION_BY_ID.get(id) ?? null
}

export function evidenceKeyForOptimizationRequest(request: OptimizationFunctionRequest | null): string | null {
  if (!request) return null
  if (request.kind === 'preset') return `registry:${request.payload.preset_id}`
  if (request.payload.kind === 'low_timer_resolution') return 'timer_resolution_low'
  return request.payload.kind
}

export function isDangerousOptimizationFunctionId(id: string): boolean {
  const definition = FUNCTION_BY_ID.get(id)
  return DANGEROUS_OPTIMIZATION_FUNCTION_IDS.has(id) || definition?.risk === 'high' || Boolean(definition?.requiresReboot)
}

export function dangerWarningForOptimizationFunction(definition: OptimizationFunctionDefinition): string {
  const reasons = [
    definition.dangerNote,
    definition.requiresReboot ? 'A Windows restart is required before the final state can be trusted.' : null,
    definition.processRequired ? 'The action targets the selected game process and depends on that process still running.' : null,
  ].filter((item): item is string => Boolean(item))
  const suffix = reasons.length > 0 ? `\n\n${reasons.join('\n')}` : ''
  return `You are enabling "${definition.title}". Continue only if you understand what this function changes, what can stop working, and how to roll it back.${suffix}`
}

export const ML_TWEAK_TO_FUNCTION_ID: Record<string, string> = {
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
  'registry:driver_search_off': 'driver-search-off',
  'registry:global_notifications_off': 'global-notifications-off',
  'registry:background_apps_off': 'background-apps-off',
  'registry:store_auto_updates_off': 'store-auto-updates-off',
  'registry:game_capture_overhead_off': 'turn-off-recordings',
  'registry:game_mode_on': 'game-mode-on',
  'registry:windowed_optimizations_on': 'windowed-optimizations-on',
  'registry:fullscreen_optimizations_off': 'fullscreen-optimizations-off',
  'registry:gpu_preference_high': 'gpu-preference-high',
  'registry:power_throttling_off': 'power-throttling-off',
  'registry:hags_on': 'hags-on',
  'registry:mpo_off': 'mpo-off',
  'registry:delivery_optimization_off': 'delivery-optimization-off',
  'registry:edge_background_off': 'edge-background-off',
  'registry:print_spooler_off': 'print-spooler-off',
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
  'registry:security_center_on': 'security-center-on',
  'registry:windows_firewall_on': 'windows-firewall-on',
  'registry:memory_integrity_off': 'memory-integrity-off',
  'registry:ntfs_last_access_off': 'ntfs-last-access-off',
  'registry:win32_priority_separation_2a': 'win32-priority-separation',
  'registry:ntfs_8dot3_off': 'ntfs-8dot3-off',
  'registry:application_compatibility_off': 'application-compatibility-off',
  'registry:automatic_maintenance_off': 'automatic-maintenance-off',
}

const ML_DENY_LIST_STORAGE_KEY = 'aeterna.ml.deny-function-list'

export function loadMlDenyFunctionList(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ML_DENY_LIST_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    const ids = parsed.filter((item): item is string => typeof item === 'string' && FUNCTION_BY_ID.has(item))
    return new Set(ids)
  } catch {
    return new Set()
  }
}

export function saveMlDenyFunctionList(value: Iterable<string>) {
  const ids = Array.from(new Set(value)).filter((item) => FUNCTION_BY_ID.has(item))
  window.localStorage.setItem(ML_DENY_LIST_STORAGE_KEY, JSON.stringify(ids))
}
