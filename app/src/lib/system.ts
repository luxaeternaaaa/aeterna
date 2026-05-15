import { invoke } from '@tauri-apps/api/core'

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getWindowsUsername(): Promise<string> {
  if (!isTauriRuntime()) return 'Player'
  try {
    const value = await invoke<string>('get_windows_username')
    return value.trim() || 'Player'
  } catch {
    return 'Player'
  }
}
