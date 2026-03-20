export const stateCopy = {
  buildPending: 'Build metadata is still loading from the local runtime.',
  chartEmpty: 'No live evidence yet. Attach a session to start the trace.',
  noBenchmark: 'No proof yet. Capture a baseline, try one reversible change, then compare the result.',
  logsEmpty: 'No diagnostics matched the current filter.',
  modelsEmpty: 'No local model path is ready yet. Recommendations stay evidence-first until the runtime is truly available.',
  noActivity: 'No reversible changes yet. Run one safe test to build history you can inspect and undo.',
  noConfigSnapshots: 'No settings or model snapshots have been recorded yet.',
  noDetectedGame: 'No supported game is ready to attach yet. Keep one in the foreground for a few seconds or use manual process tools.',
  noSession: 'No session is attached yet. Attach a game first so the app can show real state, safe actions, and rollback scope.',
  noSnapshot: 'Select a snapshot to inspect the current diff.',
  noProfile: 'No matched profile yet. Stay in Manual or Assisted mode and trust the benchmark more than a generic preset.',
  selectedProcessPending: 'Choose a process to inspect it, or attach a detected game to stay on the safer path.',
} as const
