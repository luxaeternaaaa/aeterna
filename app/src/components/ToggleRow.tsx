interface ToggleRowProps {
  checked: boolean
  description: string
  label: string
  onChange: (next: boolean) => void
}

export function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-surface-muted/78 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
      <button
        aria-checked={checked}
        role="switch"
        onClick={() => onChange(!checked)}
        type="button"
        className={`relative h-8 w-14 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${checked ? 'bg-accent/20 ring-1 ring-inset ring-accent/35' : 'bg-surface ring-1 ring-inset ring-border-strong/90'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full shadow-sm transition ${checked ? 'left-7 bg-accent' : 'left-1 bg-surface-elevated'}`} />
      </button>
    </div>
  )
}
