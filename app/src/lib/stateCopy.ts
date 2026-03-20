export const stateCopy = {
  buildPending: 'Build metadata is still loading from the local runtime.',
  chartEmpty: 'Telemetry samples have not arrived yet. Keep the app open, attach a session, or switch out of demo mode.',
  noBenchmark: 'No benchmark proof has been recorded yet. Capture a baseline before testing a preset so the product has evidence instead of vibes.',
  logsEmpty: 'No diagnostics matched the current filter.',
  modelsEmpty:
    'No model artifacts are registered yet. The UI should not pretend the ML layer is stronger than the runtime actually is.',
  noActivity: 'Nothing reversible has been recorded yet.',
  noConfigSnapshots: 'No settings or model snapshots have been recorded yet.',
  noDetectedGame:
    'No stable game candidate has been detected yet. Keep a supported game in the foreground for a few seconds or use manual process tools as a fallback.',
  noSession:
    'No session is attached yet. Attach a game first so the product can show live state, safe actions, and rollback scope.',
  noSnapshot: 'Select a snapshot to inspect the current diff.',
  noProfile: 'No game profile matches the current session yet. Stay in Manual or Assisted mode and trust the benchmark more than any generic preset.',
  selectedProcessPending: 'Select or attach a process to inspect priority, affinity, and the current rollback-safe scope.',
} as const
