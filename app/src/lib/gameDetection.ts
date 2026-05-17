import type { GameProfile, OptimizationRuntimeState, ProcessSummary } from '../types'

const EXCLUDED_PROCESS_NAMES = new Set([
  'aeterna',
  'aeterna-core',
  'aeterna-sidecar',
  'applicationframehost',
  'battle.net',
  'cargo',
  'chrome',
  'cmd',
  'codex',
  'conhost',
  'cursor',
  'discord',
  'epicgameslauncher',
  'explorer',
  'firefox',
  'msedge',
  'node',
  'npm',
  'obs64',
  'powershell',
  'pwsh',
  'python',
  'pythonw',
  'riotclientservices',
  'searchhost',
  'steam',
  'tauri',
  'tsserver',
  'windows-terminal',
])

const KNOWN_GAME_PATTERNS: Array<(value: string) => boolean> = [
  (value) => value === 'cs2' || value === 'csgo' || value.includes('counterstrike'),
  (value) => value === 'valorant' || value.includes('valorantwin64shipping'),
  (value) => value.includes('fortniteclient'),
  (value) => value === 'r5apex' || value === 'apex' || value.includes('apexlegends'),
  (value) => value === 'dota2' || value.includes('dota2'),
  (value) => value === 'leagueoflegends' || value === 'leagueoflegendsclient',
  (value) => value === 'gta5' || value === 'gta_sa' || value === 'gtaiv',
  (value) => value === 'pubg' || value === 'tslgame',
  (value) => value === 'destiny2',
  (value) => value === 'rustclient',
  (value) => value === 'escapefromtarkov' || value.includes('tarkov'),
  (value) => value === 'eldenring',
  (value) => value === 'cyberpunk2077',
  (value) => value.includes('overwatch'),
  (value) => value === 'warzone' || value.includes('modernwarfare') || value.includes('callofduty') || /^cod\d*$/.test(value),
]

export function normalizeProcessName(value: string) {
  return value.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '')
}

export function matchesProfileKeyword(processName: string, keyword: string) {
  const value = normalizeProcessName(processName)
  const marker = normalizeProcessName(keyword)
  if (!marker || marker.length < 2) return false
  if (marker === 'cod') return value === 'cod' || /^cod\d*$/.test(value) || value.includes('callofduty')
  if (marker.length <= 3) return value === marker
  return value.includes(marker)
}

export function matchingGameProfile(processName: string, profiles: GameProfile[]): GameProfile | null {
  return profiles.find((profile) => profile.detection_keywords.some((keyword) => matchesProfileKeyword(processName, keyword))) ?? null
}

export function isRealGameProcess(process: ProcessSummary | { name: string }, profiles: GameProfile[]) {
  const normalized = normalizeProcessName(process.name)
  if (!normalized || EXCLUDED_PROCESS_NAMES.has(normalized)) return false
  if (matchingGameProfile(process.name, profiles)) return true
  return KNOWN_GAME_PATTERNS.some((test) => test(normalized))
}

function uniqueProcesses(runtimeState: OptimizationRuntimeState): ProcessSummary[] {
  const seen = new Set<number>()
  return [runtimeState.selected_process, ...runtimeState.processes, ...runtimeState.advanced_processes].filter((item): item is ProcessSummary => {
    if (!item || seen.has(item.pid)) return false
    seen.add(item.pid)
    return true
  })
}

export function gameCandidateProcesses(runtimeState: OptimizationRuntimeState, profiles: GameProfile[]): ProcessSummary[] {
  const byPid = new Map<number, ProcessSummary>()

  if (runtimeState.detected_game) {
    const detected = {
      pid: runtimeState.detected_game.pid,
      name: runtimeState.detected_game.exe_name,
      priority_label: 'detected',
      affinity_label: 'detected',
    }
    if (isRealGameProcess(detected, profiles)) byPid.set(detected.pid, detected)
  }

  for (const process of uniqueProcesses(runtimeState)) {
    if (isRealGameProcess(process, profiles)) byPid.set(process.pid, process)
  }

  return Array.from(byPid.values()).sort((left, right) => left.name.localeCompare(right.name))
}
