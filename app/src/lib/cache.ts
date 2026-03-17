import type { BootstrapPayload, DashboardPayload, StartupCachePayload } from '../types'


const cacheKey = 'aeterna.startup-cache.v3'


export function readStartupCache(): StartupCachePayload | null {
  const raw = window.localStorage.getItem(cacheKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StartupCachePayload
  } catch {
    window.localStorage.removeItem(cacheKey)
    return null
  }
}


export function writeStartupCache(bootstrap: BootstrapPayload | null, dashboard: DashboardPayload | null) {
  const payload: StartupCachePayload = { bootstrap, dashboard }
  window.localStorage.setItem(cacheKey, JSON.stringify(payload))
}
