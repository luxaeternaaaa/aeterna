import type { ModelRecord } from '../types'
import { Panel } from '../components/Panel'

interface ModelsPageProps {
  models: ModelRecord[]
  onActivate: (id: string) => void
  onRollback: (id: string) => void
}

export function ModelsPage({ models, onActivate, onRollback }: ModelsPageProps) {
  return (
    <Panel title="Model manager" subtitle="Model versions, metrics, artifact metadata, and rollback controls.">
      <div className="space-y-4">
        {models.map((model) => (
          <div key={model.id} className="rounded-2xl border border-border px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{model.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {model.family} | v{model.version} | {new Date(model.created_at).toLocaleString()}
                </p>
                <p className="mt-3 text-sm text-muted">
                  {Object.entries(model.metrics).map(([key, value]) => `${key}: ${value}`).join(' | ')}
                </p>
                <p className="mt-2 text-sm text-muted">
                  Inference mode: {model.inference_mode} {model.notes ? `| ${model.notes}` : ''}
                </p>
                {model.shap_preview.length ? (
                  <div className="mt-3 space-y-2">
                    {model.shap_preview.map((item) => (
                      <p key={item} className="text-sm text-muted">
                        {item}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted">
                {model.status}
              </span>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => onActivate(model.id)} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">
                Activate
              </button>
              <button onClick={() => onRollback(model.id)} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">
                Rollback
              </button>
              <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">Inspect</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
