import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!isTauriRuntime()) return
    void invoke<boolean>('is_main_window_maximized')
      .then((value) => setIsMaximized(value))
      .catch(() => {})
  }, [])

  const minimizeWindow = useCallback(() => {
    if (!isTauriRuntime()) return
    void invoke('minimize_main_window')
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    if (!isTauriRuntime()) return
    void invoke<boolean>('toggle_maximize_main_window')
      .then((value) => setIsMaximized(value))
      .catch(() => {})
  }, [])

  const closeWindow = useCallback(() => {
    if (!isTauriRuntime()) return
    void invoke('close_main_window')
  }, [])

  return { closeWindow, isMaximized, minimizeWindow, toggleMaximizeWindow }
}
