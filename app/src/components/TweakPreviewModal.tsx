import { useState } from 'react'

interface TweakPreviewModalProps {
  changes: string[]
  description: string
  onCancel: () => void
  onConfirm: () => void
  risk: string
  title: string
}

export function TweakPreviewModal({ changes, description, onCancel, onConfirm, risk, title }: TweakPreviewModalProps) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-border bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Preview Required</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text">{title}</h3>
        <p className="mt-4 text-sm leading-7 text-muted">{description}</p>
        <div className="mt-5 rounded-2xl border border-border bg-[#fcfcfc] px-4 py-4 text-sm text-muted">
          Risk level: <span className="font-medium capitalize text-text">{risk}</span>. A rollback snapshot will be created before any change is applied.
        </div>
        <div className="mt-4 rounded-2xl border border-border px-4 py-4">
          <p className="text-sm font-medium text-text">What will change</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
            {changes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-border px-4 py-4 text-sm text-text">
          <input checked={confirmed} className="mt-1 h-4 w-4 accent-black" onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          <span>I understand the effect of this tweak on my device and I want Aeterna to apply it now.</span>
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover" onClick={onCancel}>
            Cancel
          </button>
          <button className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:bg-[#bdbdbd]" disabled={!confirmed} onClick={onConfirm}>
            Apply tweak
          </button>
        </div>
      </div>
    </div>
  )
}
