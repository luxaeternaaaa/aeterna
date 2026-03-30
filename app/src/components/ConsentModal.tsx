import { useState } from 'react'

type ConsentModalProps = {
  description: string
  onCancel: () => void
  onConfirm: () => void
  title: string
}

export function ConsentModal({ description, onCancel, onConfirm, title }: ConsentModalProps) {
  const [consented, setConsented] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[2rem] bg-surface p-6 shadow-float ring-1 ring-inset ring-border/65">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Consent Required</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-text">{title}</h3>
        <p className="mt-4 text-sm leading-7 text-muted">{description}</p>
        <div className="mt-5 rounded-[1.5rem] bg-surface-muted px-5 py-4 text-sm leading-6 text-muted">
          Safe changes stay opt-in, create rollback snapshots before they run, and remain disabled until you confirm.
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-[1.5rem] bg-surface-muted/70 px-5 py-4 text-sm text-text">
          <input checked={consented} className="mt-1 h-4 w-4 accent-accent" onChange={(event) => setConsented(event.target.checked)} type="checkbox" />
          <span>I understand what this feature does and I give consent to enable it on this device.</span>
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button className="button-secondary" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={!consented}
            onClick={onConfirm}
            type="button"
          >
            Enable feature
          </button>
        </div>
      </div>
    </div>
  )
}
