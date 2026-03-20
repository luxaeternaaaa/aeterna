import type { MlInferencePayload, MlRuntimeTruth, ModelRecord } from '../types'
import { Panel } from '../components/Panel'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'

interface ModelsPageProps {
  inference: MlInferencePayload | null
  models: ModelRecord[]
  onActivate: (id: string) => void
  onRollback: (id: string) => void
  runtimeTruth: MlRuntimeTruth | null
}

export function ModelsPage({ inference, models, onActivate, onRollback, runtimeTruth }: ModelsPageProps) {
  const activeModel = models.find((model) => model.status.toLowerCase().includes('active')) ?? models[0] ?? null
  const onnxModels = models.filter((model) => model.inference_mode === 'onnx').length
  const fallbackModels = models.filter((model) => model.inference_mode !== 'onnx').length
  const runtimeLabel =
    runtimeTruth?.runtime_mode === 'onnx'
      ? runtimeTruth.active_label
      : runtimeTruth?.runtime_mode === 'fallback'
        ? 'Fallback runtime available'
        : activeModel
          ? activeModel.name
          : 'No runtime recommendation path'

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel
          title="Runtime truth"
          subtitle="This page should answer one thing clearly: is the ML layer real, fallback, or still mostly aspirational."
          variant="primary"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current runtime</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{runtimeLabel}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {runtimeTruth
                  ? runtimeTruth.summary
                  : activeModel
                    ? `${activeModel.family} | v${activeModel.version}`
                    : 'No runtime-backed or fallback recommendation path has been loaded yet.'}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Runtime mode</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{runtimeTruth?.runtime_mode ?? 'unavailable'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {runtimeTruth?.runtime_mode === 'onnx'
                  ? 'Recommendations are backed by a runtime inference path.'
                  : runtimeTruth?.runtime_mode === 'fallback'
                    ? 'Recommendations can still run, but only as fallback guidance.'
                    : 'No recommendation authority is currently available.'}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Registered artifacts</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{models.length}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {onnxModels} ONNX-ready, {fallbackModels} fallback-only catalog entries.
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Operator stance"
          subtitle="Do not trust the ML layer for more authority than the runtime can honestly support."
          variant="utility"
        >
          <div className="space-y-3">
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              {runtimeTruth?.runtime_mode === 'onnx'
                ? 'Current recommendations are runtime-backed. Benchmark proof still outranks model output.'
                : 'Fallback runtime is advisory only. It can rank pressure, but it does not prove a tweak helped.'}
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              {runtimeTruth?.runtime_mode === 'fallback'
                ? `Current source: ${runtimeTruth.model_source}. Keep it visible so the UI never pretends the inference stack is more mature than it is.`
                : 'Fallback entries stay visible so the UI never pretends the inference stack is more mature than it is.'}
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              {inference
                ? `Latest recommendation confidence ${(inference.confidence * 100).toFixed(0)}%. Treat it as ranking guidance until Compare closes the proof loop.`
                : 'Model metrics matter only if they are paired with a working local runtime path and visible explainability.'}
            </div>
          </div>
        </Panel>
      </section>

      <Panel
        title="Model catalog"
        subtitle="What is loaded, how trustworthy it is, and what control you still have over rollback."
        variant="secondary"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {models.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-border-strong bg-surface-muted/60 px-5 py-5 text-sm leading-6 text-muted xl:col-span-2">
              {stateCopy.modelsEmpty}
            </div>
          ) : null}
          {models.map((model) => (
            <div key={model.id} className="rounded-[1.75rem] border border-border bg-surface-muted/65 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold tracking-tight text-text">{model.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {model.family} | v{model.version} | {formatTimestamp(model.created_at, 'Artifact time not recorded')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {model.status}
                  </span>
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {model.inference_mode}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Metrics</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(model.metrics).length === 0 ? (
                      <span className="text-sm text-muted">No metrics recorded.</span>
                    ) : (
                      Object.entries(model.metrics).map(([key, value]) => (
                        <span key={key} className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs uppercase tracking-[0.14em] text-muted">
                          {key}: {value}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Artifact posture</p>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {model.notes || 'No extra artifact note recorded.'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Runtime mode {model.inference_mode}. If this is fallback, the app should say so plainly.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-border bg-surface px-4 py-4">
                <p className="text-sm font-semibold tracking-tight text-text">Explainability preview</p>
                {model.shap_preview.length ? (
                  <div className="mt-3 space-y-2">
                    {model.shap_preview.map((item) => (
                      <p key={item} className="text-sm leading-6 text-muted">
                        {item}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">This artifact has no explainability preview yet.</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => onActivate(model.id)} className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" type="button">
                  Activate
                </button>
                <button onClick={() => onRollback(model.id)} className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" type="button">
                  Rollback
                </button>
                <button className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-hover" type="button">
                  Inspect artifact
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
