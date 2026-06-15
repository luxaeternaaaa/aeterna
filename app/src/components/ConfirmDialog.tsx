import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

import {
  ConfirmDialogContext,
  type ConfirmDialogOptions,
  type ConfirmDialogRequest,
  type ConfirmDialogTone,
} from './ConfirmDialogContext'

const toneStyles: Record<ConfirmDialogTone, { icon: string; panel: string; button: string }> = {
  default: {
    icon: 'bg-accent-soft text-accent',
    panel: 'bg-accent-soft/55 text-text',
    button: 'button-primary',
  },
  warning: {
    icon: 'bg-warning-soft text-warning',
    panel: 'bg-warning-soft/55 text-text',
    button: 'button-primary',
  },
  danger: {
    icon: 'bg-danger-soft text-danger',
    panel: 'bg-danger-soft/55 text-text',
    button:
      'inline-flex items-center justify-center rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-panel transition hover:bg-danger/90 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-45',
  },
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  const closeDialog = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setOptions(null)
    resolve?.(confirmed)
  }, [])

  const requestConfirmation = useCallback<ConfirmDialogRequest>((nextOptions) => {
    resolverRef.current?.(false)
    setAcknowledged(false)
    setOptions(nextOptions)

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  useEffect(() => {
    if (!options) return

    cancelButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDialog, options])

  useEffect(
    () => () => {
      resolverRef.current?.(false)
      resolverRef.current = null
    },
    [],
  )

  const tone = options?.tone ?? 'default'
  const styles = toneStyles[tone]
  const Icon = tone === 'default' ? Info : AlertTriangle
  const confirmationDisabled = Boolean(options?.acknowledgement && !acknowledged)

  return (
    <ConfirmDialogContext.Provider value={requestConfirmation}>
      {children}
      {options ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog(false)
          }}
        >
          <section
            aria-describedby="app-confirm-description"
            aria-labelledby="app-confirm-title"
            aria-modal="true"
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-surface shadow-float ring-1 ring-inset ring-border/65"
            role="dialog"
          >
            <div className="flex items-start gap-4 border-b border-border/60 px-6 py-5">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${styles.icon}`}>
                <Icon aria-hidden="true" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.2em] text-muted">
                  {options.eyebrow ?? (tone === 'danger' ? 'Confirmation required' : 'Please confirm')}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text" id="app-confirm-title">
                  {options.title}
                </h2>
              </div>
              <button
                aria-label="Close confirmation"
                className="button-quiet h-10 w-10 shrink-0 p-0"
                onClick={() => closeDialog(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <p className="text-sm leading-7 text-muted" id="app-confirm-description">
                {options.description}
              </p>

              {options.items?.length ? (
                <div className={`mt-5 rounded-[1.4rem] px-5 py-4 ${styles.panel}`}>
                  <p className="text-sm font-semibold">Affected functions</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6">
                    {options.items.map((item, index) => (
                      <li className="flex gap-3" key={`${index}-${item}`}>
                        <span aria-hidden="true" className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {options.details?.length ? (
                <div className="mt-4 space-y-3 rounded-[1.4rem] bg-surface-muted/75 px-5 py-4 text-sm leading-6 text-muted">
                  {options.details.map((detail, index) => (
                    <p key={`${index}-${detail}`}>{detail}</p>
                  ))}
                </div>
              ) : null}

              {options.acknowledgement ? (
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[1.4rem] bg-surface-muted/70 px-5 py-4 text-sm leading-6 text-text">
                  <input
                    checked={acknowledged}
                    className="mt-1 h-4 w-4 shrink-0 accent-accent"
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{options.acknowledgement}</span>
                </label>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 border-t border-border/60 px-6 py-5">
              <button
                className="button-secondary"
                onClick={() => closeDialog(false)}
                ref={cancelButtonRef}
                type="button"
              >
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                className={styles.button}
                disabled={confirmationDisabled}
                onClick={() => closeDialog(true)}
                type="button"
              >
                {options.confirmLabel ?? 'Continue'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  )
}
