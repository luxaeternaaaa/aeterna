export const stateCopy = {
  buildPending: 'Version details are still loading.',
  chartEmpty: 'Start or attach a game to see live session data here.',
  noBenchmark: 'Capture a baseline first. After one safe test, the result will appear here.',
  logsEmpty: 'No technical events match this filter.',
  modelsEmpty: 'Recommendations are not ready yet. You can keep using Aeterna without them.',
  noActivity: 'History is empty. Run your first safe test and Aeterna will keep the undo trail here.',
  noConfigSnapshots: 'No saved settings yet. Your first policy or preset change will create one.',
  noDetectedGame: 'Keep a supported game open for a few seconds, then refresh detection.',
  noSession: 'Attach a game to start a safe, reversible session.',
  noSnapshot: 'Pick a saved state to inspect what changed.',
  noProfile: 'No exact profile yet. Start with one safe test and trust the benchmark over presets.',
  selectedProcessPending: 'Only use this if automatic detection missed your game.',
} as const
