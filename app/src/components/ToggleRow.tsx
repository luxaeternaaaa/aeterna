interface ToggleRowProps {
  checked: boolean
  description: string
  label: string
  onChange: (next: boolean) => void
}

export function ToggleRow({ checked, description, label, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-4">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 rounded-full border transition ${checked ? 'border-black bg-black' : 'border-border bg-hover'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${checked ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  )
}

