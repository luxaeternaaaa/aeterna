import type { ModelRecord } from '../types'
import { Panel } from '../components/Panel'
import { stateCopy } from '../lib/stateCopy'

interface ModelsPageProps {
  models: ModelRecord[]
  onActivate: (id: string) => void
  onRollback: (id: string) => void
}

export function ModelsPage({ models, onActivate, onRollback }: ModelsPageProps) {
  const activeModel = models.find((model) => model.status.toLowerCase().includes('active')) ?? models[0] ?? null
  const onnxModels = models.filter((model) => model.inference_mode === 'onnx').length
  const fallbackModels = models.filter((model) => model.inference_mode !== 'onnx').length

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
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Active model</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{activeModel ? activeModel.name : 'No active model'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {activeModel ? `${activeModel.family} | v${activeModel.version}` : 'The runtime has not loaded any artifact yet.'}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">ONNX ready</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{onnxModels}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Catalog entries currently backed by a real ONNX execution path.</p>
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Fallback only</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{fallbackModels}</p>
              <p className="mt-2 text-sm leading-6 text-muted">Entries that still depend on metadata or heuristic behavior.</p>
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
              ONNX entries are the only ones that count as real runtime inference.
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              Fallback entries stay visible so the UI never pretends the inference stack is more mature than it is.
            </div>
            <div className="rounded-[1.5rem] border border-border bg-surface px-4 py-4 text-sm leading-6 text-muted">
              Model metrics matter only if they are paired with a working local runtime path and visible explainability.
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
                    {model.family} | v{model.version} | {new Date(model.created_at).toLocaleString()}
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
