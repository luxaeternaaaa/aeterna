interface ToggleRowProps {
  checked: boolean
  description?: string
  label: string
  onChange: (next: boolean) => void
}

export function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.25rem] bg-surface-muted/82 px-4 py-4 ring-1 ring-inset ring-border/45">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text">{label}</p>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <button
        aria-checked={checked}
        role="switch"
        onClick={() => onChange(!checked)}
        type="button"
        className={`relative h-8 w-14 shrink-0 overflow-hidden rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${checked ? 'bg-accent ring-1 ring-inset ring-accent/40' : 'bg-surface ring-1 ring-inset ring-border-strong/90'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full border border-border-strong/45 bg-white shadow-sm transition-[left] duration-150 ${checked ? 'left-[calc(100%-1.75rem)]' : 'left-1'}`}
        />
      </button>
    </div>
  )
}
