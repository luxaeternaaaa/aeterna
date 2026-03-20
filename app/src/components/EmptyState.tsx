interface EmptyStateProps {
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}

export function EmptyState({ actionLabel, description, onAction, title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <p className="text-base font-semibold tracking-tight text-text">{title}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="button-primary mt-4" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
