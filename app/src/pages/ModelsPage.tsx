import type { MlInferencePayload, MlRuntimeTruth, ModelRecord } from '../types'
import { DisclosurePanel } from '../components/DisclosurePanel'
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
  if (mode === 'metadata-fallback') return 'Metadata only'
  return 'Heuristic'
}

export function ModelsPage({ inference, models, onActivate, onRollback, runtimeTruth }: ModelsPageProps) {
  const activeModel = models.find((model) => model.status.toLowerCase().includes('active')) ?? models[0] ?? null
  const posture = getModelPosture(runtimeTruth, models.length)

  return (
    <div className="space-y-6">
      <Panel variant="primary">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Recommendations</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight text-text md:text-[2.4rem]">{posture.label}</h3>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Use model advice to choose what to test next. Trust the benchmark, not the confidence score.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Active path</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-text">{runtimeTruth?.active_label ?? activeModel?.name ?? 'No active path'}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{runtimeTruth?.summary ?? posture.detail}</p>
            </div>
            <div className="surface-card">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Latest hint</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {inference
                  ? `Confidence ${(inference.confidence * 100).toFixed(0)}%. Use it as a hint for the next test, not as proof that a tweak helped.`
                  : 'No active recommendation right now. The safe-test loop still works without the model layer.'}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <DisclosurePanel summary="Catalog, runtime mode, and artifact details." title="Technical details">
        <div className="grid gap-4 xl:grid-cols-2">
          {models.length === 0 ? (
            <div className="xl:col-span-2">
              <EmptyState description={stateCopy.modelsEmpty} title="No model path ready yet" />
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

              <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
                <p>{model.notes || 'No additional note recorded for this artifact.'}</p>
                {model.shap_preview.length ? (
                  <div className="surface-card">
                    {model.shap_preview.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => onActivate(model.id)} type="button">
                  Activate
                </button>
                <button className="button-secondary" onClick={() => onRollback(model.id)} type="button">
                  Rollback
                </button>
              </div>
            </div>
          ))}
        </div>
      </DisclosurePanel>
    </div>
  )
}
