import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

interface DisclosurePanelProps extends PropsWithChildren {
  action?: ReactNode
  className?: string
  defaultOpen?: boolean
  summary?: string
  title: string
}

export function DisclosurePanel({ action, children, className, defaultOpen = false, summary, title }: DisclosurePanelProps) {
  return (
    <details className={clsx('group rounded-[1.75rem] bg-surface-muted/80 px-5 py-4 transition hover:bg-surface-muted/95', className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight text-text">{title}</p>
          {summary ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{summary}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-muted transition group-hover:text-text group-open:rotate-180 group-open:text-text">
            <ChevronDown size={18} />
          </span>
        </div>
      </summary>
      <div className="mt-5 border-t border-border/65 pt-5">{children}</div>
    </details>
  )
}
