import { api } from './api'
import { getSidecarStatus, startSidecar } from './sidecar'
import { markBootstrapLoaded } from './runtime'

import type { BootstrapPayload, DashboardPayload, SidecarStatusPayload } from '../types'


const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))


async function waitForBootstrap(attempts = 12): Promise<BootstrapPayload> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await api.bootstrap()
    } catch (error) {
      lastError = error
      await delay(250 * (attempt + 1))
    }
  }
  throw lastError ?? new Error('Bootstrap failed')
}


async function waitForDashboard(attempts = 8): Promise<DashboardPayload> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await api.dashboard()
    } catch (error) {
      lastError = error
      await delay(200 * (attempt + 1))
    }
  }
  throw lastError ?? new Error('Dashboard failed')
}


export function toConnection(status: SidecarStatusPayload, demoMode = true) {
  if (status.ready) {
    return {
      title: 'Optimization runtime ready',
      detail: demoMode ? 'Sidecar online | cached local data active' : 'Sidecar online | local-only control path',
    }
  }
  return {
    title: 'Optimization runtime starting',
    detail: 'Preparing the local sidecar and restoring the last shell state...',
  }
}


export async function getStartupState() {
  const sidecar = await startSidecar()
  return { sidecar: sidecar.ready ? sidecar : await getSidecarStatus() }
}


export async function getInitialState() {
  const bootstrap = await waitForBootstrap()
  const dashboard = await waitForDashboard()
  const diagnostics = await markBootstrapLoaded()
  return {
    bootstrap,
    dashboard,
    diagnostics,
  }
}
