import type { OptimizationRuntimeState } from '../types'
import { OPTIMIZATION_FUNCTIONS } from './optimizationFunctions'

export function getAppliedOptimizationCount(runtimeState: OptimizationRuntimeState): number {
  const activeSnapshots = new Set(runtimeState.session.active_snapshot_ids.filter(Boolean))
  const undoableSnapshots = new Set(
    runtimeState.activity
      .filter((entry) => entry.can_undo && !entry.blocked_by_policy && entry.snapshot_id)
      .map((entry) => entry.snapshot_id as string),
  )
  const activeRegistryPresets = runtimeState.registry_presets.filter((preset) => {
    const current = preset.current_state.trim().toLowerCase()
    const target = preset.target_state.trim().toLowerCase()
    return current.length > 0 && target.length > 0 && current === target
  }).length

  return Math.max(activeSnapshots.size, undoableSnapshots.size, activeRegistryPresets)
}

export function getOptimizationLevel(runtimeState: OptimizationRuntimeState): number {
  const total = Math.max(OPTIMIZATION_FUNCTIONS.length, 1)
  const applied = getAppliedOptimizationCount(runtimeState)
  if (applied === 0) return 0
  return Math.min(100, Math.round((applied / total) * 100))
}

export function getOptimizationLevelLabel(level: number): string {
  if (level <= 0) return 'Not optimized'
  if (level < 35) return 'Poor level'
  if (level < 70) return 'Balanced level'
  return 'Strong level'
}
