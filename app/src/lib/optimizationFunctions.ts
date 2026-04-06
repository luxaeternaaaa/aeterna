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
  requiresReboot?: boolean
  processRequired?: boolean
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
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'mouse_precision_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'keep-cores',
    title: 'Keep all cores active',
    description: 'Set game CPU affinity to all logical threads.',
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'tweak', payload: { kind: 'cpu_affinity', process_id: processId, affinity_preset: 'all_threads' } } : null,
  },
  {
    id: 'max-games',
    title: 'Maximum performance for games',
    description: 'Raise selected game process priority to High.',
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'tweak', payload: { kind: 'process_priority', process_id: processId, priority: 'high' } } : null,
  },
  {
    id: 'ultimate-power',
    title: 'Ultimate performance mode',
    description: 'Switch active power plan to Ultimate/High Performance.',
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
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'tweak', payload: { kind: 'process_qos', process_id: processId } } : null),
  },
  {
    id: 'process-isolation',
    title: 'Process isolation',
    description: 'Pin game threads to one thread per core.',
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'tweak', payload: { kind: 'process_isolation', process_id: processId } } : null),
  },
  {
    id: 'turn-off-recordings',
    title: 'Turn off Game Bar recordings',
    description: 'Disable Game DVR background capture flags.',
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'game_capture_overhead_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'game-mode-on',
    title: 'Force Game Mode on',
    description: 'Force Windows Game Mode enabled for current user.',
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'game_mode_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'windowed-optimizations-on',
    title: 'Windowed optimizations',
    description: 'Enable borderless/windowed DirectX optimization path.',
    mlDefault: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windowed_optimizations_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'fullscreen-optimizations-off',
    title: 'Disable fullscreen optimizations',
    description: 'Write per-app compatibility flag to bypass fullscreen optimization layer.',
    processRequired: true,
    buildRequest: ({ processId }) =>
      processId ? { kind: 'preset', payload: { preset_id: 'fullscreen_optimizations_off', process_id: processId } } : null,
  },
  {
    id: 'gpu-preference-high',
    title: 'Per-app GPU preference',
    description: 'Set selected executable to High Performance GPU preference.',
    processRequired: true,
    buildRequest: ({ processId }) => (processId ? { kind: 'preset', payload: { preset_id: 'gpu_preference_high', process_id: processId } } : null),
  },
  {
    id: 'power-throttling-off',
    title: 'Turn off power throttling',
    description: 'Disable machine-level power throttling policy in registry.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'power_throttling_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'hags-on',
    title: 'Enable HAGS',
    description: 'Enable hardware-accelerated GPU scheduling.',
    requiresReboot: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'hags_on', process_id: processId ?? undefined } }),
  },
  {
    id: 'interrupt-affinity-lock',
    title: 'Interrupt affinity lock',
    description: 'Lock interrupt steering mode for the active power scheme.',
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'interrupt_affinity_lock' } }),
  },
  {
    id: 'disable-hpet',
    title: 'Deactivate HPET',
    description: 'Set boot option useplatformclock=false.',
    requiresReboot: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_hpet' } }),
  },
  {
    id: 'disable-dynamic-ticks',
    title: 'Disable Dynamic Ticks',
    description: 'Set boot option disabledynamictick=yes.',
    requiresReboot: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'disable_dynamic_ticks' } }),
  },
  {
    id: 'low-timer-resolution',
    title: 'Lower timer resolution',
    description: 'Request minimum system timer resolution.',
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'low_timer_resolution' } }),
  },
  {
    id: 'mpo-off',
    title: 'Disable MPO',
    description: 'Disable Multiplane Overlay path.',
    requiresReboot: true,
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'mpo_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'usb-selective-suspend-off',
    title: 'Disable USB selective suspend',
    description: 'Set USB selective suspend AC/DC indexes to Disabled.',
    mlDefault: true,
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'usb_selective_suspend_off' } }),
  },
  {
    id: 'pcie-lspm-off',
    title: 'Disable PCIe LSPM',
    description: 'Set PCIe Link State Power Management AC/DC to Off.',
    buildRequest: () => ({ kind: 'tweak', payload: { kind: 'pcie_lspm_off' } }),
  },
  {
    id: 'sysmain-off',
    title: 'Disable SysMain service',
    description: 'Disable SysMain startup and stop running service.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'sysmain_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'windows-search-off',
    title: 'Disable Windows Search service',
    description: 'Disable WSearch startup and stop running service.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'windows_search_off', process_id: processId ?? undefined } }),
  },
  {
    id: 'dps-off',
    title: 'Disable Diagnostic Policy Service',
    description: 'Disable DPS startup and stop running service.',
    buildRequest: ({ processId }) => ({ kind: 'preset', payload: { preset_id: 'dps_off', process_id: processId ?? undefined } }),
  },
]

const FUNCTION_BY_ID = new Map(OPTIMIZATION_FUNCTIONS.map((item) => [item.id, item]))

export function getOptimizationFunctionById(id: string): OptimizationFunctionDefinition | null {
  return FUNCTION_BY_ID.get(id) ?? null
}

export const ML_TWEAK_TO_FUNCTION_ID: Record<string, string> = {
  process_priority: 'max-games',
  cpu_affinity: 'keep-cores',
  power_plan: 'ultimate-power',
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
