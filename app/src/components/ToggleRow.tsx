interface ToggleRowProps {
  checked: boolean
  description: string
  label: string
  onChange: (next: boolean) => void
}

export function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-border bg-surface-muted/70 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
      <button
        aria-checked={checked}
        role="switch"
        onClick={() => onChange(!checked)}
        type="button"
        className={`relative h-8 w-14 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${checked ? 'border-accent bg-accent/18' : 'border-border-strong bg-surface'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full shadow-panel transition ${checked ? 'left-7 bg-accent' : 'left-1 bg-surface-elevated'}`} />
      </button>
    </div>
  )
}
