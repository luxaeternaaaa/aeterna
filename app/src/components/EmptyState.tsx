interface EmptyStateProps {
  actionLabel?: string
  actionVariant?: 'primary' | 'secondary'
  description: string
  onAction?: () => void
  title: string
}

export function EmptyState({ actionLabel, actionVariant = 'primary', description, onAction, title }: EmptyStateProps) {
  return (
    <div className="empty-state flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-base font-semibold tracking-tight text-text">{title}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button className={actionVariant === 'primary' ? 'button-primary shrink-0' : 'button-secondary shrink-0'} onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
