import type {
  AttachSessionRequest,
  BenchmarkReport,
  BenchmarkWindow,
  GameProfile,
  OptimizationRuntimeState,
} from '../types'
import { Panel } from '../components/Panel'
import { SessionControlBar } from '../components/SessionControlBar'

interface TestsPageProps {
  benchmarkBaseline: BenchmarkWindow | null
  benchmarkBusy: boolean
  lastTweakAtMs: number | null
  latestBenchmark: BenchmarkReport | null
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

function verdictLabel(report: BenchmarkReport | null) {
  if (!report) return 'No result yet'
  if (report.verdict === 'better') return 'Better'
  if (report.verdict === 'worse') return 'Worse'
  if (report.verdict === 'inconclusive') return 'Inconclusive'
  return 'Mixed'
}

export function TestsPage({
  benchmarkBaseline,
  benchmarkBusy,
  lastTweakAtMs,
  latestBenchmark,
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
}: TestsPageProps) {
  return (
    <div className="space-y-5">
      <Panel title="Tests" variant="secondary">
        <SessionControlBar
          benchmarkBaseline={benchmarkBaseline}
          benchmarkBusy={benchmarkBusy}
          lastTweakAtMs={lastTweakAtMs}
          onAttachSession={onAttachSession}
          onCaptureBaseline={onCaptureBaseline}
          onClearSessionSelection={onClearSessionSelection}
          onEndSession={onEndSession}
          onOpenLogs={onOpenLogs}
          onOpenSettings={onOpenSettings}
          onRefresh={onRefresh}
          onRunBenchmark={onRunBenchmark}
          onSelectProcess={onSelectProcess}
          onStopSession={onStopSession}
          profiles={profiles}
          runtimeState={runtimeState}
          stopBusy={stopBusy}
        />
      </Panel>

      <Panel title="Latest Compare" variant="secondary">
        <div className="summary-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight text-text">Verdict</p>
            <span className="status-chip">{verdictLabel(latestBenchmark)}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {latestBenchmark
              ? latestBenchmark.summary
              : 'Capture baseline, apply one tweak, and run compare to get an empirical verdict.'}
          </p>
        </div>
      </Panel>
    </div>
  )
}
