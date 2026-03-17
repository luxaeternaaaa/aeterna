# Source Control Discipline

## Baseline

- The repository should start from one clean `initial import` commit.
- After that, each major product step should be committed as one coherent unit:
  - `runtime`
  - `telemetry`
  - `session`
  - `automation`
  - `ml`
  - `benchmark`
  - `profiles`

## Commit rules

- Do not commit build output from `installer/out`, `app/dist`, or `target`.
- Do not commit local runtime data from `data/runtime`.
- Prefer one meaningful commit per completed product step over many noisy micro-commits.
- Keep commit messages scoped and product-oriented, for example:
  - `feat(session): attach detected game sessions with auto-restore`
  - `feat(policy): add assisted automation allowlist`
  - `feat(ml): surface ONNX/fallback mode in model manager`

## Release discipline

For every substantial desktop change:

1. Build the installer.
2. Reinstall the fresh build.
3. Verify Desktop shortcut, Start Menu entry, and Windows Search target.
4. Launch the installed app, not only the development build.

This is mandatory because Aeterna is a desktop product, not just a codebase.
