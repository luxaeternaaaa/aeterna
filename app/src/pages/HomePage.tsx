import {
  Bot,
  ChevronRight,
  Cpu,
  FlaskConical,
  Gauge,
  HardDrive,
  MemoryStick,
  Sparkles,
  Zap,
} from 'lucide-react'

import { getAppliedOptimizationCount, getOptimizationLevel, getOptimizationLevelLabel } from '../lib/optimizationLevel'
import type { BuildMetadata, DashboardPayload, OptimizationRuntimeState, SystemTelemetryPayload, TelemetryPoint } from '../types'

interface HomePageProps {
  build: BuildMetadata
  dashboard: DashboardPayload
  onOpenMl: () => void
  onOpenOptimization: () => void
  onOpenTests: () => void
  realtime?: TelemetryPoint | null
  runtimeState: OptimizationRuntimeState
  systemTelemetry: SystemTelemetryPayload | null
  username: string
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return `${Math.round(value)}%`
}

function formatRam(value?: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return `${value.toFixed(1)} GB`
}

export function HomePage({
  build,
  dashboard,
  onOpenMl,
  onOpenOptimization,
  onOpenTests,
  realtime,
  runtimeState,
  systemTelemetry,
  username,
}: HomePageProps) {
  const sample = realtime ?? dashboard.history.at(-1) ?? null
  const optimizationLevel = getOptimizationLevel(runtimeState)
  const optimizationLabel = getOptimizationLevelLabel(optimizationLevel)
  const appliedCount = getAppliedOptimizationCount(runtimeState)
  const recentActivity = runtimeState.activity.slice(0, 4)
  const firstName = username.trim() || 'Player'
  const cpuValue = systemTelemetry ? formatPercent(systemTelemetry.cpu_total_pct) : formatPercent(sample?.cpu_total_pct)
  const gpuValue = systemTelemetry ? formatPercent(systemTelemetry.gpu_usage_pct ?? 0) : formatPercent(sample?.gpu_usage_pct)
  const ramValue = systemTelemetry ? formatRam(systemTelemetry.ram_used_gb) : formatRam(sample ? sample.ram_working_set_mb / 1024 : null)
  const telemetryDetail = systemTelemetry ? 'Updates every second' : 'Waiting for live counters'

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden text-white">
      <section className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight">
            Hello, <span className="text-[#3d6bff]">{firstName}</span>!
          </h1>
          <p className="mt-1 text-sm font-semibold text-white/90">
            Version: <span className="ml-1 rounded-md bg-[#315cff] px-2 py-0.5 text-xs text-white">{build.version || '1.0.0'}</span>
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.35rem] border border-[#ff4e5e]/55 bg-[#080d21]/88 p-5 shadow-panel">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Gauge size={19} />
                <span>Optimization level</span>
              </div>
              <p className={`mt-7 text-3xl font-black ${optimizationLevel > 0 ? 'text-[#ff4e5e]' : 'text-[#6d7da8]'}`}>
                {optimizationLevel}%
              </p>
              <p className="mt-3 text-sm font-semibold text-white/86">{optimizationLabel}</p>
            </div>

            <div className="rounded-[1.35rem] bg-[#080d21]/88 p-5 shadow-panel">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Zap size={19} />
                <span>Applied</span>
              </div>
              <p className="mt-7 text-3xl font-black text-[#3d6bff]">{appliedCount}</p>
              <p className="mt-3 text-sm font-semibold text-white/86">Optimization functions</p>
            </div>

            <div className="rounded-[1.35rem] bg-[#080d21]/88 p-5 shadow-panel">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Bot size={19} />
                <span>Telemetry</span>
              </div>
              <p className="mt-7 text-2xl font-black text-white">{systemTelemetry ? 'Active' : 'Starting'}</p>
              <p className="mt-3 text-sm font-semibold text-white/86">{telemetryDetail}</p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.55rem] bg-[#080d21]/92 p-5 shadow-panel sm:p-6">
            <div className="absolute -bottom-16 right-[-2rem] h-64 w-64 rotate-[-34deg] rounded-[2rem] border-[34px] border-[#315cff]/85 opacity-90" />
            <div className="absolute bottom-12 right-28 h-20 w-28 rotate-[-34deg] bg-[#315cff]/85" />
            <div className="relative max-w-xl">
              <p className="text-[40px] font-black leading-none tracking-normal text-white sm:text-5xl">
                AETER<span className="text-[#315cff]">NA</span>
              </p>
              <p className="mt-4 max-w-md text-lg font-semibold leading-7 text-white/92">
                Local gaming optimization with rollback snapshots and ML-assisted choices.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <button className="button-primary min-h-12 w-full gap-2 px-3 text-sm" onClick={onOpenMl} type="button">
                  <Bot size={17} />
                  <span className="min-w-0 text-center leading-5">Start One-Click Optimization</span>
                </button>
                <button className="button-secondary min-h-12 w-full gap-2 border-[#315cff]/55 bg-[#111936]/90 px-3 text-sm" onClick={onOpenOptimization} type="button">
                  <Sparkles size={17} />
                  <span className="min-w-0 text-center leading-5">Open Custom Optimization</span>
                </button>
                <button className="button-secondary min-h-12 w-full gap-2 border-[#315cff]/55 bg-[#111936]/90 px-3 text-sm" onClick={onOpenTests} type="button">
                  <FlaskConical size={17} />
                  <span className="min-w-0 text-center leading-5">Run Test</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Cpu, label: 'CPU information', value: cpuValue, detail: 'Total load' },
              { icon: Gauge, label: 'GPU information', value: gpuValue, detail: 'Graphics load' },
              { icon: MemoryStick, label: 'RAM information', value: ramValue, detail: 'System memory used' },
            ].map(({ detail, icon: Icon, label, value }) => (
              <div key={label} className="rounded-[1.35rem] bg-[#080d21]/88 p-5 shadow-panel">
                <Icon className="text-white/90" size={20} />
                <p className="mt-8 text-lg font-bold text-white">{value}</p>
                <p className="mt-2 text-sm font-semibold text-white/70">{label}</p>
                <p className="mt-1 text-xs text-white/45">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.55rem] bg-[#080d21]/92 p-6 shadow-panel">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Optimization Overview</h2>
              <span className="rounded-full bg-[#315cff]/18 px-3 py-1 text-xs font-bold text-[#79a0ff]">{optimizationLevel}%</span>
            </div>
            <div
              className="mx-auto grid h-40 w-40 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#315cff ${optimizationLevel * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
              }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-[#080d21]">
                <span className="text-3xl font-black">{optimizationLevel}%</span>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-[#111936]/80 p-4">
              <p className="text-sm font-bold text-white">{optimizationLabel}</p>
              <p className="mt-1 text-sm leading-6 text-white/62">
                {appliedCount > 0 ? `${appliedCount} applied optimization change(s).` : 'No active optimization changes yet.'}
              </p>
            </div>
          </div>

          <div className="rounded-[1.55rem] bg-[#080d21]/92 p-6 shadow-panel">
            <div className="mb-5 flex items-center gap-2">
              <HardDrive size={19} />
              <h2 className="text-xl font-bold">Latest Activity</h2>
            </div>
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((entry) => (
                  <div key={entry.id} className="rounded-2xl bg-[#111936]/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-white">{entry.action}</p>
                      <ChevronRight className="shrink-0 text-white/35" size={16} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/58">{entry.detail}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-[#111936]/80 px-4 py-5 text-sm font-semibold text-white/62">
                  No optimization activity yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
