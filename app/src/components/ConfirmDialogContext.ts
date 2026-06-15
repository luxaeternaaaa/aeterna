import { createContext, useContext } from 'react'

export type ConfirmDialogTone = 'default' | 'warning' | 'danger'

export interface ConfirmDialogOptions {
  acknowledgement?: string
  cancelLabel?: string
  confirmLabel?: string
  description: string
  details?: string[]
  eyebrow?: string
  items?: string[]
  title: string
  tone?: ConfirmDialogTone
}

export type ConfirmDialogRequest = (options: ConfirmDialogOptions) => Promise<boolean>

export const ConfirmDialogContext = createContext<ConfirmDialogRequest | null>(null)

export function useConfirmDialog() {
  const requestConfirmation = useContext(ConfirmDialogContext)
  if (!requestConfirmation) {
    throw new Error('useConfirmDialog must be used inside ConfirmDialogProvider.')
  }
  return requestConfirmation
}
