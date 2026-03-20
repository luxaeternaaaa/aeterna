import type { MlInferencePayload, MlRuntimeTruth, ModelRecord } from '../types'
import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { getModelPosture } from '../lib/productState'
import { stateCopy } from '../lib/stateCopy'
import { formatTimestamp } from '../lib/time'

interface ModelsPageProps {
  inference: MlInferencePayload | null
  models: ModelRecord[]
  onActivate: (id: string) => void
  onRollback: (id: string) => void
  runtimeTruth: MlRuntimeTruth | null
}

function runtimeModeLabel(mode: ModelRecord['inference_mode']) {
  if (mode === 'onnx') return 'Runtime-backed'
  if (mode === 'metadata-fallback') return 'Metadata-only'
  return 'Heuristic'
}

export function ModelsPage({ inference, models, onActivate, onRollback, runtimeTruth }: ModelsPageProps) {
  const activeModel = models.find((model) => model.status.toLowerCase().includes('active')) ?? models[0] ?? null
  const posture = getModelPosture(runtimeTruth, models.length)
  const runtimeCount = models.filter((model) => model.inference_mode === 'onnx').length
  const advisoryCount = models.filter((model) => model.inference_mode !== 'onnx').length

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel title="Recommendation reality" subtitle="This page exists to calibrate trust, not to oversell the model layer." variant="primary">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current posture</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{posture.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{posture.detail}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Active path</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{runtimeTruth?.active_label ?? activeModel?.name ?? 'No active path'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {runtimeTruth?.summary ?? (activeModel ? `${activeModel.family} v${activeModel.version}` : 'Recommendations fall back to evidence-first behavior until a runtime path is ready.')}
              </p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Catalog split</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-text">{models.length}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{runtimeCount} runtime-backed, {advisoryCount} advisory-only.</p>
            </div>
          </div>
        </Panel>

        <Panel title="How to read this page" subtitle="The model can rank possibilities. It cannot replace benchmark proof." variant="utility">
          <div className="space-y-3">
            <div className="summary-card">
              <p className="text-sm font-semibold tracking-tight text-text">Use the model for ranking, not for truth</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {runtimeTruth?.runtime_mode === 'onnx'
                  ? 'A local runtime path exists, so recommendations are grounded better than pure metadata. They still need session proof.'
                  : 'The current path is advisory. Treat it as a hint about pressure, not as evidence that a tweak helped.'}
              </p>
            </div>
            <div className="summary-card">
              <p className="text-sm font-semibold tracking-tight text-text">What matters at decision time</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Evidence first, then rationale, then confidence. If the benchmark disagrees with the model, the benchmark wins.
              </p>
            </div>
            <div className="summary-card">
              <p className="text-sm font-semibold tracking-tight text-text">Latest model signal</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {inference
                  ? `Current recommendation confidence ${(inference.confidence * 100).toFixed(0)}%. Use it to choose what to test next, not whether to trust a result.`
                  : 'No recommendation is active right now. The product stays usable because the proof loop does not depend on the model layer.'}
              </p>
            </div>
          </div>
        </Panel>
      </section>

      <Panel title="Model catalog" subtitle="This is secondary detail for inspecting artifacts, versions, and explainability." variant="secondary">
        <div className="grid gap-4 xl:grid-cols-2">
          {models.length === 0 ? (
            <div className="xl:col-span-2">
              <EmptyState description={stateCopy.modelsEmpty} title="No model path is ready yet" />
            </div>
          ) : null}
          {models.map((model) => (
            <div key={model.id} className="summary-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold tracking-tight text-text">{model.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {model.family} | v{model.version} | {formatTimestamp(model.created_at, 'Artifact time not recorded')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip">{model.status}</span>
                  <span className="status-chip">{runtimeModeLabel(model.inference_mode)}</span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="surface-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">What this path means</p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {model.inference_mode === 'onnx'
                      ? 'This artifact can participate in a real local runtime path.'
                      : 'This artifact can inform ranking or metadata, but it does not make the recommendation layer fully real.'}
                  </p>
                </div>
                <div className="surface-card">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Artifact note</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{model.notes || 'No extra artifact note recorded.'}</p>
                </div>
              </div>

              <div className="mt-4 surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Recorded metrics</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(model.metrics).length === 0 ? (
                    <span className="text-sm text-muted">No metrics recorded.</span>
                  ) : (
                    Object.entries(model.metrics).map(([key, value]) => (
                      <span key={key} className="status-chip">
                        {key}: {value}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4 surface-card">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Explainability preview</p>
                {model.shap_preview.length ? (
                  <div className="mt-3 space-y-2">
                    {model.shap_preview.map((item) => (
                      <p key={item} className="text-sm leading-6 text-muted">
                        {item}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">No explainability preview has been recorded yet.</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-primary" onClick={() => onActivate(model.id)} type="button">
                  Activate
                </button>
                <button className="button-secondary" onClick={() => onRollback(model.id)} type="button">
                  Rollback
                </button>
                <button className="button-secondary" type="button">
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
