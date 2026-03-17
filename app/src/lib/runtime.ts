import { invoke } from '@tauri-apps/api/core'

import type { RuntimeStatusPayload, StartupDiagnostics } from '../types'


const fallbackStatus: RuntimeStatusPayload = {
  state: 'stopped',
  ready: false,
  launched_by_app: false,
}


function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}


export async function startBackend(): Promise<RuntimeStatusPayload> {
  if (!isTauriRuntime()) return fallbackStatus
  try {
    return await invoke<RuntimeStatusPayload>('start_backend')
  } catch {
    return fallbackStatus
  }
}


export async function getBackendStatus(): Promise<RuntimeStatusPayload> {
  if (!isTauriRuntime()) return fallbackStatus
  try {
    return await invoke<RuntimeStatusPayload>('backend_status')
  } catch {
    return fallbackStatus
  }
}


export async function ensureBackendReady() {
  const status = await startBackend()
  if (status.ready) return status
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 180 + attempt * 60))
    const next = await getBackendStatus()
    if (next.ready) return next
  }
  return status
}

export async function getStartupDiagnostics(): Promise<StartupDiagnostics | null> {
  if (!isTauriRuntime()) return null
  try {
    const payload = await invoke<{ diagnostics: StartupDiagnostics }>('startup_diagnostics')
    return payload.diagnostics
  } catch {
    return null
  }
}

export async function markBootstrapLoaded(): Promise<StartupDiagnostics | null> {
  if (!isTauriRuntime()) return null
  try {
    const payload = await invoke<{ diagnostics: StartupDiagnostics }>('mark_bootstrap_loaded')
    return payload.diagnostics
  } catch {
    return null
  }
}
