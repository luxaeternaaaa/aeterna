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

export async function saveTextFile(defaultFileName: string, contents: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = defaultFileName
    anchor.click()
    URL.revokeObjectURL(url)
    return defaultFileName
  }
  return invoke<string | null>('save_text_file', { defaultFileName, contents })
}
