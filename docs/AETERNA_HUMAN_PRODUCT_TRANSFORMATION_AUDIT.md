# Aeterna Human Product Transformation Audit

## 1. Executive diagnosis

**Facts**

- Aeterna already has the correct strategic spine: local-first runtime, explicit consent, snapshots, rollback, bounded automation, benchmark baseline/report, profile recommendations, and an emerging registry preset engine. The current working implementation spans [app/src/App.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\App.tsx), [backend/services/benchmark_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\benchmark_service.py), [backend/services/profile_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\profile_service.py), [core/sidecar/src/main.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\main.rs), and [core/sidecar/src/registry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\registry.rs).
- The product still ships with uneven truth surfaces. README is mostly aligned, but [docs/ARCHITECTURE.md](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\docs\ARCHITECTURE.md) is stale and still describes a backend-centric ML pipeline that is no longer the operational truth. [docs/PRODUCT_TRUTH.md](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\docs\PRODUCT_TRUTH.md) still contains mojibake.
- The UI is materially improved, but the core experience is still split between "operate the session" and "read explanatory panels." The product is closer to a serious tool than before, but it is not yet product-grade in closure.
- The repo is not at a stable milestone right now. `git status` shows a dirty working tree with registry/runtime/UI changes not yet committed.

**Interpretation**

- Aeterna is no longer "just a prototype UI." The architecture is now genuinely product-shaped.
- The main gap is not missing features in the abstract. The main gap is closure: proof is not fully bound to action history, trust is not fully operationalized in every state transition, and some docs/copy still lag the runtime truth.
- The product is now vulnerable to a different class of failure: not "obvious junk," but "almost serious, still inconsistent."

**Recommendations**

- Treat the next milestone as a product-integrity milestone, not a feature milestone.
- Freeze naming, state contracts, and proof semantics before adding broader automation or more tweaks.
- Clean docs, contracts, and activity/proof linkage before calling the product "human-first" in a stronger sense.

**Experiments**

- Run three 10-minute operator tests with one instruction only: "Attach a session, prove one change, undo it." Record where each user hesitates.
- Run one "hostile audit" review: ask a skeptical user to find every place where the UI sounds more confident than the runtime deserves.

**Acceptance Criteria**

- The product can be described in one sentence without hedging: "Aeterna helps you prove one reversible session change at a time."
- Docs, UI copy, and runtime contracts agree on what is real, partial, and future.
- The working tree is committed into a coherent milestone rather than carrying silent product drift.

## 2. System architecture and trust boundaries

**Facts**

- The system has four real layers.
- UI layer: [app/src/App.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\App.tsx) plus route pages orchestrate page chrome, startup cache, proof actions, consent, preview, and page-level state.
- Native shell layer: [app/src-tauri/src/lib.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src-tauri\src\lib.rs) and sidecar bridge files manage desktop boot and sidecar/backend lifecycle.
- Runtime authority layer: [core/sidecar/src/main.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\main.rs), [telemetry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\telemetry.rs), [policy.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\policy.rs), [snapshots.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\snapshots.rs), and [registry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\registry.rs) handle inspection, attach, tweak apply, registry presets, rollback, and session tracking.
- Read aggregation layer: FastAPI modules such as [backend/api/routers/bootstrap.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\api\routers\bootstrap.py), [dashboard.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\api\routers\dashboard.py), [benchmark.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\api\routers\benchmark.py), and [settings.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\api\routers\settings.py) aggregate local state for the UI.
- Trust boundaries are already mostly correct:
- UI may request action, but does not directly mutate system state.
- Backend may aggregate and persist settings, but should not become the privileged mutation path for runtime-sensitive actions.
- Sidecar is the only layer that should own session attach, process mutation, registry presets, and rollback authority.

**Interpretation**

- The architecture is strongest where it is strict: sidecar owns authority, backend owns presentation data, UI owns decision surfaces.
- The architecture is weakest where documentation still implies older boundaries, and where the UI presents concepts that are not yet first-class state objects.

**Recommendations**

- Keep all high-risk authority in Rust sidecar.
- Keep Python backend as a read-heavy, evidence-heavy API. Do not let it drift into a second runtime authority path.
- Treat the UI as a narrator of state and a collector of intent, not the place where product truth is invented.

**Experiments**

- Run a threat-boundary review: for every command, answer "why is this not in the UI?" and "why is this not in the backend?"
- Add one architecture diagram to docs showing authority edges and forbidden edges.

**Acceptance Criteria**

- A new engineer can answer in under 30 minutes:
- where telemetry truth comes from
- where policy is enforced
- where rollback is authored
- where evidence is aggregated

### Critical Path

**Facts**

- Detect game -> attach session -> capture baseline -> apply one safe action -> compare -> rollback or keep is already partially present across [OptimizationPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\OptimizationPage.tsx), [benchmark_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\benchmark_service.py), and sidecar apply/rollback commands.

**Interpretation**

- This is the correct product spine and must become the only first-class story.

**Recommendations**

- Make this flow visible on first open of Dashboard and Optimization without requiring policy literacy.

**Experiments**

- Time-to-first-proof test: measure how long it takes a new user to reach a completed compare verdict.

**Acceptance Criteria**

- A user can complete the critical path without documentation.

### Failure Path

**Facts**

- Sidecar unavailable, backend unavailable, missing build metadata, or stale runtime state all degrade product confidence.
- The system does have startup cache and fallback shell logic in [app/src/App.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\App.tsx).

**Interpretation**

- Failure handling exists technically, but the product surface still explains failure more than it directs recovery.

**Recommendations**

- Every hard failure state needs one recovery action and one evidence line.

**Experiments**

- Kill sidecar during a session and observe whether the UI says what is true, what is frozen, and what the user can still safely do.

**Acceptance Criteria**

- No hard failure leaves the user asking "is it broken or just blocked?"

### Fallback Path

**Facts**

- Telemetry can be `demo`, `live`, or effectively degraded counters fallback.
- Model inference can be `onnx`, `metadata-fallback`, or `heuristic`.
- Capture status exists in [types.ts](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\types.ts) and runtime capture logic exists in [telemetry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\telemetry.rs).

**Interpretation**

- Fallback is part of the product truth, not an implementation embarrassment.
- The current product is better than junk products because it does not fully hide fallback, but it still does not yet translate fallback into the cleanest human wording.

**Recommendations**

- Standardize fallback language:
- `Live`
- `Degraded live`
- `Demo`
- `Unavailable`

**Experiments**

- Replace all technical fallback strings on one branch and test whether users still understand the evidence quality.

**Acceptance Criteria**

- A user can tell whether the product is showing real evidence, degraded evidence, or demo data in under 2 seconds.

### Blocked Path

**Facts**

- Policy blocking exists in sidecar for tweaks and registry presets. Current messages come from [policy.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\policy.rs).
- Optimization summary also returns `next_action`, `primary_blocker`, and `proof_state` from [summary_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\summary_service.py).

**Interpretation**

- This is one of Aeterna's strongest product differentiators.
- The blocked path is already better than typical optimizer junk because it refuses action instead of faking authority.

**Recommendations**

- Every blocked state should show only:
- what blocked it
- why
- what single action unblocks it

**Experiments**

- Collect blocked-event telemetry and rank the top three blockers by user confusion.

**Acceptance Criteria**

- No blocked action requires the user to infer the unblock sequence.

### State model / state machine

**Facts**

- Telemetry mode: `demo`, `live`, `disabled`; degraded capture is represented through `capture_source` and `capture_quality`.
- Session state: `idle`, `detected`, `attached`, `active`, `ended`, `restored`.
- Gates already exist for optimizer enabled, baseline present, allowlist allowed, rollback availability, pending registry restore, and model inference mode.

**Interpretation**

- The system has enough state to be rigorous.
- The product still leaks too much raw state and too little synthesized decision state.

**Recommendations**

- Formalize the user-facing state machine as:
- Evidence mode: `demo`, `live`, `degraded`, `off`
- Session mode: `none`, `candidate`, `attached`, `active`, `ended`, `restored`
- Proof mode: `no-baseline`, `baseline-ready`, `comparison-ready`, `inconclusive`
- Authority mode: `blocked`, `manual`, `assisted`, `trusted`
- Restore mode: `clean`, `undo-ready`, `restore-pending`, `admin-restore-required`
- ML mode: `onnx`, `fallback`, `unavailable`

**Experiments**

- Build one internal state matrix showing every allowed action per combined state.

**Acceptance Criteria**

- The UI stops leaking raw implementation terms when a synthesized user-facing state already exists.

## 3. Human product vs AI slop criteria

**Facts**

- Aeterna already satisfies several human-product criteria: explicit rollback, local-first defaults, allowlist authority, honest enough partial ML posture, and blocked-path reasoning.
- Aeterna still shows slop symptoms: explanatory surfaces that outrank action, internal terminology in primary views, and some status duplication.

**Interpretation**

- The product is no longer "AI slop" in the obvious sense.
- It is at risk of "high-effort slop": technically thoughtful, still too even, too explanatory, and not sharp enough in primary flow.

**Recommendations**

- Use these criteria as hard gates:
- truth
- control
- reversibility
- proof
- inspectability
- low cognitive load
- one next action
- naming consistency
- calibration of automation
- ML honesty

**Experiments**

- Apply a slop smell review to every screen before merge.

**Acceptance Criteria**

- Any screen failing more than three smell checks cannot ship.

## 4. Current-state critique of Aeterna

**Facts**

- Truth: good at architecture level, inconsistent at doc/copy level.
- Control: strong for tweaks, snapshots, and automation allowlist.
- Reversibility: strong for standard tweaks; registry path now also strong in design, but live mutation validation is still pending.
- Proof: present, but not fully bound to action history.
- Feedback loops: largely absent. There is no shipped `helped / not helpful / no effect` loop yet.
- Cognitive clarity: improved, still too many medium-weight surfaces and too much explanatory copy in some routes.
- Constraint integrity: good in sidecar policy, weaker in UI wording where some concepts like "Compatibility mode" behave more like doctrine text than a real stateful feature.
- Naming consistency: improved but still mixed. Example: verdict values are `improved/mixed/regressed` in code, while the desired public doctrine is `better/mixed/worse/inconclusive`.
- Trust architecture: strong conceptually, not fully operationalized in activity/proof linkage.
- Automation calibration: mostly good. It is bounded, but not yet explained inline at every automated or blocked decision.
- ML honesty: above average, still not fully product-grade because ONNX is incomplete and the UI still has to carry some aspiration.

**Interpretation**

- The product's strongest asset is not raw optimization. It is constraint integrity.
- The product's weakest asset is closure. Too many pieces are correct in isolation but not yet closed into one fully trustworthy operating loop.

**Recommendations**

- Promote proof linkage, blocked reasons, and restore narrative above all new features.
- Remove any copy that explains philosophy without changing a user decision.
- Normalize public wording across proof, fallback, restore, and automation.

**Experiments**

- Run a "silent mode" review: remove half the prose temporarily and test whether task success improves or degrades.

**Acceptance Criteria**

- The product reads as disciplined, not verbose.
- A skeptical user can still reconstruct what happened and why.

## 5. Information architecture redesign

**Facts**

- Base routes are already sensible: Dashboard, Optimization, Security, Models, Activity, Settings.
- [pageChrome.ts](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\lib\pageChrome.ts) already gives each route a distinct page question and badge set.

**Interpretation**

- The route set does not need replacement.
- The semantic job of each route still needs sharpening.

**Recommendations**

- Keep routes, redefine their jobs:
- Dashboard = session decision surface
- Optimization = action surface
- Security = trust and boundary surface
- Models = ML reality surface
- Activity = evidence and restore surface
- Settings = authority and retention surface
- Primary flow:
- Detect game
- Attach session
- Capture baseline
- Apply one safe preset
- Compare result
- Keep or rollback

**Experiments**

- Add one persistent breadcrumb or step chip showing where the user is inside the primary flow.

**Acceptance Criteria**

- Route identity is clear.
- Cross-route travel feels like progressing through one system, not six loosely related admin pages.

## 6. Screen-by-screen redesign doctrine

### Dashboard

**Facts**

- Promise now: "read the session and decide the next safe move." The current implementation already shows session health, a frametime chart, next move, proof, and profile context in [DashboardPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\DashboardPage.tsx).

**Interpretation**

- Human: it is now evidence-first enough to be useful.
- Slop: it still lacks a hard CTA that advances the primary flow. It describes the session well, but does not always move the user.

**Recommendations**

- Above the fold: current session, next action, latest proof verdict.
- Details: secondary recommendations, extra stats, profile nuance.
- Remove: any sentence that repeats "be careful" without changing the next action.
- Restructure: turn primary recommendation into a CTA row with the exact next step and destination.

**Experiments**

- Test CTA variants:
- `Attach session`
- `Capture baseline`
- `Run compare`
- `Restore last change`

**Acceptance Criteria**

- The screen can answer "what should I do now?" without relying on the user to scan every panel.

### Optimization

**Facts**

- Optimization already concentrates attach, action, benchmark, registry presets, and rollback history in [OptimizationPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\OptimizationPage.tsx).

**Interpretation**

- Human: this is the strongest route in the product.
- Slop: there are still too many equal-weight blocks. Manual tools and proof compete for attention with primary actions.

**Recommendations**

- Above the fold: attached session, primary blocker, next action, one safest recommended change, compare status.
- Details: registry preset catalog, manual tools, recent history.
- Remove: duplicate status phrasing where the same blocker appears in several cards.
- Restructure: enforce a vertical action ladder:
- attach
- baseline
- one safe change
- compare
- rollback

**Experiments**

- Collapse manual tools by default and measure whether benchmark completion improves.

**Acceptance Criteria**

- The screen behaves like an operating console, not a mixed dashboard.

### Security

**Facts**

- Security currently communicates posture, confidence, scanning mode, privacy posture, hard boundaries, and operator guidance in [SecurityPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\SecurityPage.tsx).

**Interpretation**

- Human: the route is unusually honest for this category.
- Slop: it is still text-heavy and doctrine-heavy. It proves boundaries, but not enough current runtime trust evidence.

**Recommendations**

- Above the fold: current posture, why it is low/medium/high, what changes behavior now.
- Details: hard boundaries and longer explanations.
- Remove: any generic warning that does not map to present runtime state.
- Restructure: tie the security screen more directly to current session and current enabled authorities.

**Experiments**

- Add a "current trust exposure" block driven by actual enabled capabilities, not only static posture prose.

**Acceptance Criteria**

- Security explains current exposure, not just eternal principles.

### Models

**Facts**

- Models now separates ONNX count, fallback count, active model, and artifact posture in [ModelsPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\ModelsPage.tsx).

**Interpretation**

- Human: it is more honest than most ML pages.
- Slop: it is still catalog-centric and somewhat internal. It answers "what is registered" better than "what should the user trust."

**Recommendations**

- Above the fold: active runtime mode, confidence posture, why recommendations appear, what not to trust.
- Details: model catalog, metrics, artifact inspection.
- Remove: any control that implies high user value if it is really admin tooling.
- Restructure: make "active runtime truth" the whole top of the page.

**Experiments**

- Reframe the first panel from "active model" to "current recommendation authority."

**Acceptance Criteria**

- A user can leave the page understanding the current ML truth without caring about the registry of artifacts.

### Activity

**Facts**

- Activity already emphasizes undo-ready counts and rollback history in [LogsPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\LogsPage.tsx).

**Interpretation**

- Human: this route is close to product-grade.
- Slop: proof linkage is still weak, and diagnostic logs still sit too close to the trust narrative.

**Recommendations**

- Above the fold: last reversible change, undo-ready count, last failed/blocked event.
- Details: developer logs and full event stream.
- Remove: raw proof link text unless it becomes a meaningful compare record.
- Restructure: group activity by session timeline, not just filterable list.

**Experiments**

- Render grouped events:
- session started
- baseline captured
- tweak applied
- compare verdict
- rollback performed

**Acceptance Criteria**

- A user can reconstruct one session story from Activity alone.

### Settings

**Facts**

- Settings is already grouped into privacy defaults, automation authority, session behavior, diagnostics/build state, and rollback history in [SettingsPage.tsx](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\pages\SettingsPage.tsx).

**Interpretation**

- Human: the grouping is mostly correct now.
- Slop: it still behaves partly like a toggle cemetery. Consequences are described, but not summarized enough as user authority.

**Recommendations**

- Above the fold: a single authority summary:
- what the app may observe
- what it may automate
- whether system presets are allowed
- whether telemetry is live or demo
- Details: toggles and diagnostics.
- Remove: any static line that sounds like a feature when it is only a principle.
- Restructure: add a compact "authority summary" card at top.

**Experiments**

- Test a summary sentence like "Aeterna may observe live telemetry, apply no automated actions, and store local snapshots only."

**Acceptance Criteria**

- A user can answer "what power have I given this app?" without scanning all toggles.

## 7. Benchmark / proof architecture

**Facts**

- Benchmark data model already exists in [types.ts](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\types.ts) and [backend/services/benchmark_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\benchmark_service.py).
- Current verdict values are `improved`, `mixed`, `regressed`.
- Current comparison is based on recent telemetry windows, not a fully rich in-game instrumentation layer.

**Interpretation**

- Benchmark is already the product's most important truth mechanism.
- It is still weaker than it needs to be because proof is not fully attached to action history and because telemetry quality limits benchmark trust.

**Recommendations**

- Normalize public verdict language to:
- `better`
- `mixed`
- `worse`
- `inconclusive`
- Keep internal mapping if needed, but do not expose engineering words if the product doctrine says otherwise.
- Benchmark contract should be:
- baseline
- current
- delta
- verdict
- summary
- recommended_next_step
- Compare surface should live beside the action that created the hypothesis.
- If no proof exists, say exactly: "No proof yet. Baseline exists, but no comparison has been run." or "No proof yet. Capture a baseline first."

**Experiments**

- Add `inconclusive` when sample quality is degraded or sample window is too small.

**Acceptance Criteria**

- No action may appear "successful" without an adjacent proof state.
- Proof language never overstates confidence beyond telemetry quality.

## 8. Profile system design

**Facts**

- Five profiles exist now in [profile_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\profile_service.py): CS2, Valorant, Fortnite, Apex, Warzone.
- Each already exposes safe preset, expected benefit, risk note, benchmark expectation, and allowed actions.

**Interpretation**

- The profile system has the right contract.
- It still reads like structured copy more than a decisive operating mode.

**Recommendations**

- A profile should be rendered as a session mode:
- title
- why it matched
- safe first action
- what evidence should improve
- what would invalidate it
- Keep the five profiles, but reduce prose and promote the operational bits.
- Example contract:
- recommended_profile
- why_this_profile
- safe_preset
- expected_benefit
- risk_note
- benchmark_expectation
- allowed_actions

**Experiments**

- Show "why this profile" from either detection keyword, attached exe, or benchmark posture.

**Acceptance Criteria**

- Profiles feel like trusted operating suggestions, not catalog entries.

## 9. ML reality and explainability doctrine

**Facts**

- The system distinguishes `onnx`, `metadata-fallback`, and `heuristic`.
- ONNX execution in the shipped runtime is still incomplete. README and PRODUCT_TRUTH already say this, but the docs are not fully consistent.
- Optimization summary is partly heuristic via [summary_service.py](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\backend\services\summary_service.py); model service and model catalog are separate.

**Interpretation**

- The product is ahead of most junk optimizers because it already admits fallback.
- It is not yet ML-mature enough to grant the ML layer primary authority.

**Recommendations**

- ML reality contract:
- active_model
- runtime_mode
- confidence_behavior
- why_recommendation_appeared
- what_not_to_trust_yet
- Show "we do not know" when:
- runtime mode is unavailable
- evidence is too sparse
- capture is degraded
- no model supports this path
- Explainability design:
- top reasons
- signal sources
- confidence wording
- degraded wording
- fallback wording
- Feedback loop:
- helped
- not helpful
- too risky
- unclear
- no effect
- do not suggest again

**Experiments**

- Add recommendation feedback capture and compare whether repeated suggestions become more trusted or more often hidden.

**Acceptance Criteria**

- ML never looks smarter than the runtime that produced it.
- Uncertainty is first-class, not hidden in notes.

## 10. Automation authority model

**Facts**

- Automation modes already exist in settings: `manual`, `assisted`, `trusted_profiles`.
- Allowlist actions already exist for `process_priority`, `cpu_affinity`, and `power_plan`.
- Registry presets remain manual-only in current behavior.

**Interpretation**

- The automation model is structurally correct.
- The product still under-communicates automation authority at the moment of action.

**Recommendations**

- Human-readable automation contract:
- Manual = recommend only
- Assisted = may execute approved session actions after attach
- Trusted profiles = same, but only when a known profile exists
- Every automated action must reveal:
- why allowed
- which allowlist rule allowed it
- what will auto-restore
- what risk remains
- how to disable this class of automation

**Experiments**

- Add an inline automation disclosure in Optimization when the current mode is not Manual.

**Acceptance Criteria**

- Automation never looks like silent background magic.

## 11. Activity / rollback trust model

**Facts**

- Activity entries already support `category`, `session_id`, `can_undo`, `proof_link`, and `blocked_by_policy` in [types.ts](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\app\src\types.ts) and Rust models.
- Current `proof_link` is not yet a fully meaningful compare object.

**Interpretation**

- The schema is ahead of the actual trust surface.
- The route needs more causal structure, not just more entries.

**Recommendations**

- Event taxonomy should be fixed as:
- session
- tweak
- proof
- restore
- failed
- blocked
- registry
- registry-restore
- registry-restore-blocked
- Each event must answer:
- what changed
- why
- what proves the result
- can it be undone
- if not, why not

**Experiments**

- Add proof events that reference benchmark report ids and render summary snippets inline.

**Acceptance Criteria**

- Activity becomes the definitive trust ledger, not just a useful log.

## 12. Safe registry preset architecture

**Facts**

- The registry engine now exists in [core/sidecar/src/registry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\registry.rs).
- It is allowlist-only and supports exact snapshot/restore.
- Current catalog is limited to four presets and correctly excludes undocumented hacks, raw editing, and reboot-required keys.
- Policy gating in [policy.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\policy.rs) already requires optimizer enabled, registry presets enabled, attached session, baseline present, and no pending registry restore.
- Crash-safe pending restore state is represented in session state and synchronized in [telemetry.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\telemetry.rs).
- One weak point remains: blocked registry apply currently returns a synthetic snapshot-like response path in [main.rs](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\core\sidecar\src\main.rs), which is functional but not clean.

**Interpretation**

- This subsystem is on the right philosophical track.
- It becomes shady only if the UI starts exposing it like a hacker control panel or if action success is not tightly paired with proof and restore narrative.

**Recommendations**

- Keep registry presets as `System presets`, not "advanced tweaks" or "registry performance hacks."
- Replace the blocked apply response hack with a clean blocked result contract or an explicit error mapped into UI trust state.
- Keep normal mode free of raw hive/path/value exposure.
- Surface advanced details only on opt-in expert review.
- Tie each successful registry apply to a benchmark compare requirement and then to an activity proof event.

**Experiments**

- Validate one HKCU preset end-to-end on a sacrificial local test path with immediate restore and crash-recovery simulation.

**Acceptance Criteria**

- Registry presets feel like bounded, reversible experiments, not underground tweaks.

## 13. Product demand and fit strategy

**Facts**

- Aeterna is not competing on raw tweak quantity. It is competing on trust, reversibility, and proof.
- The product already has uncommon ingredients for a credible gaming utility: explicit boundaries, local-first behavior, no injection, and proof-oriented benchmarking.

**Interpretation**

- The product's wedge is not "we tweak more." The wedge is "we let you prove one safe change at a time."
- This differentiates Aeterna from optimizer junk, but only if the UX makes that value obvious early.

**Recommendations**

- Primary segment:
- competitive players who distrust optimizer junk but still want a controlled session workflow
- Secondary segment:
- performance-sensitive creators and enthusiasts who want reversible system experiments
- JTBD:
- "Help me test whether one reversible session change actually helps before I commit to it."
- Activation moment:
- first attached session plus captured baseline
- Trust moment:
- first clearly blocked unsafe action or first clean rollback
- Aha moment:
- first compare verdict that makes a keep/rollback decision obvious
- Retention hook:
- returning to prove the next change, not to browse telemetry

**Experiments**

- Interview five skeptical users who currently avoid optimizer tools. Ask what would make them trust one.

**Acceptance Criteria**

- The product can be positioned without using the words AI, optimization magic, or tweak pack.

## 14. Metrics and experimentation framework

**Facts**

- The product already has measurable objects for session attach, baseline capture, compare runs, activity entries, and automation settings.
- It does not yet persist a full feedback event stream or trust-specific metrics.

**Interpretation**

- Instrumentation is close enough to begin meaningful product measurement.

**Recommendations**

- Activation:
- session attach rate
- baseline capture rate
- first compare completion rate
- Proof:
- compare completion rate after first tweak
- inconclusive verdict rate
- keep vs rollback after compare
- Trust:
- manual vs assisted vs trusted adoption
- blocked action comprehension rate
- rollback usage rate
- restore-pending resolution rate
- Usefulness:
- preset keep rate
- recommendation helpfulness
- no-effect rate
- do-not-suggest-again rate

**Experiments**

- Instrument feedback events and compare whether users who receive proof complete more actions and trust more presets.

**Acceptance Criteria**

- The team can tell whether the product is becoming more useful, not just more used.

## 15. Roadmap

**Facts**

- Registry presets are in-progress and uncommitted.
- Feedback loops and proof-linked activity are still missing.
- ONNX runtime remains partial.

**Interpretation**

- The next roadmap must consolidate, not sprawl.

**Recommendations**

- 0-30 days:
- commit and stabilize registry milestone
- clean docs and naming mismatches
- add proof events and real proof links
- remove blocked registry response hack
- implement feedback loop schema and UI
- 30-90 days:
- finish dashboard and optimization closure around one next action
- make models page runtime-truth-first
- harden crash restore flow with explicit admin-required states
- add trust metrics and usefulness analytics
- 3-6 months:
- ship true ONNX runtime path
- improve telemetry quality
- deepen game profiles with stronger expectations and per-title evidence tuning

**Experiments**

- Treat each stage as a release candidate and run human task tests before moving to the next.

**Acceptance Criteria**

- Each roadmap slice ends with a stronger product loop, not just more controls.

## 16. Risks

**Facts**

- Dirty working tree means product truth and shipped state can drift.
- Registry presets raise perception risk even when technically safe.
- Partial ONNX and conservative telemetry limit proof credibility.

**Interpretation**

- The biggest risk is not engineering failure. It is trust debt.

**Recommendations**

- Keep registry copy sober and bounded.
- Refuse to call degraded telemetry "full proof."
- Treat doc drift as a release blocker.

**Experiments**

- Run a red-team copy review specifically on "how could this sound shadier than it is?"

**Acceptance Criteria**

- No shipped copy or state creates more authority than the runtime truly has.

## 17. Test plan

**Facts**

- Existing verification already covers build, packaging, health, and some API/runtime checks.

**Interpretation**

- Product-grade testing now has to include human-comprehension checks, not only compile and smoke.

**Recommendations**

- Hierarchy:
- users identify main status, next step, and proof source in under 2 seconds
- Workflow:
- detect -> attach -> baseline -> tweak -> compare -> rollback
- Blocked:
- every blocked action shows one reason and one unblock step
- Fallback:
- demo, degraded, live, and unavailable remain visually and semantically distinct
- Registry:
- allowlist only
- exact restore
- pending restore after crash
- no proofless success
- Copy:
- no mojibake
- no inconsistent verdict words
- no fake timestamps

**Experiments**

- Add scripted smoke scenarios for:
- no baseline
- baseline only
- degraded capture
- pending registry restore
- admin-required restore denied

**Acceptance Criteria**

- The product passes both engineering tests and comprehension tests.

## 18. Human Product Codex

**Facts**

- Aeterna already has a partial constitution in README, PRODUCT_TRUTH, and the emerging UI/copy system.

**Interpretation**

- It now needs one explicit working constitution.

**Recommendations**

### Principles

- Tell the truth before telling the story.
- Make one safe change at a time.
- Show the current state, target state, and restore path together.
- Proof outranks recommendation.
- Block early when authority is missing.
- Let fallback stay visible.
- Keep operator details available but secondary.
- Use friction intentionally around risky actions.
- Prefer local evidence over generic promises.
- Treat rollback as product value, not recovery plumbing.
- Keep automation bounded and inspectable.
- Never let ML outrun runtime truth.

### Anti-principles

- No optimization magic.
- No hidden state transitions.
- No proofless success language.
- No raw registry editor UX.
- No undocumented system hacks.
- No fallback disguised as full capability.
- No admin theater without real necessity.
- No security cosplay.
- No verbose doctrine where one next action would do.
- No route that exists only to display metadata.
- No automation without disable and restore narratives.

### Slop smell checklist

- The screen has many cards but no decisive action.
- The copy explains philosophy more than behavior.
- A blocked state lacks a single unblock step.
- A fallback state sounds like full capability.
- A proof surface is separated from the action that needs it.
- A settings page lists toggles without authority summary.
- A model page tells catalog truth but not trust truth.
- Activity shows events but not causality.
- Automation is described without allowlist reason.
- Registry changes appear without restore narrative.
- The same concept has multiple names.
- A success message appears before compare.

### UX checklist

- Main status visible.
- Main next action visible.
- Blocking reason visible.
- Evidence source visible.
- Risky actions previewed.
- Restore path visible.
- Details progressive, not mandatory.
- Copy short enough to scan.

### AI honesty checklist

- Runtime mode exposed.
- Confidence calibrated.
- Fallback named plainly.
- Uncertainty stated.
- "We do not know" supported.
- Explainability tied to signals, not mystique.

### Safety and rollback checklist

- Snapshot before mutation.
- Exact restore supported.
- Pending restore surfaced.
- Admin restore requirement surfaced.
- No irreversible hidden action.

### Proof and value checklist

- Baseline exists.
- Compare exists.
- Verdict exists.
- Recommended next step exists.
- Keep/rollback choice is obvious.

### Microcopy templates

- Warning: "This changes machine state for the current session. A rollback snapshot will be created first."
- Uncertainty: "The runtime does not have enough evidence to recommend a change yet."
- Blocked action: "Blocked by policy. [Reason]. Next step: [single action]."
- Consent: "Review the change before applying it. This action is reversible."
- Manual-only: "This preset stays manual. Aeterna will not apply it automatically."
- Fallback: "Using fallback logic. Treat this recommendation as lower-confidence."
- Degraded: "Live session detected, but capture quality is reduced."
- Baseline required: "Capture a baseline first so this change can be proven or rejected."
- Rollback available: "A rollback snapshot is ready if this change does not help."
- Admin required: "This preset needs Windows elevation because it changes machine-scope state."

### Quality gates

- No fake timestamps.
- No mojibake.
- No empty cards without next action.
- No inconsistent labels.
- No hidden irreversible actions.
- No unbounded registry writes.
- No fallback disguised as full capability.
- No proofless tweak marked as success.
- No auto action without policy explanation.
- No ambiguous restore path.

### User research plan

- 5 operator usability tests
- 5 skeptical-user trust interviews
- 3 crash/blocked-path comprehension tests
- 1 benchmark proof diary study over one week

### Engineering implementation plan

- stabilize contracts
- bind proof to activity
- add feedback events
- harden restore flows
- clean docs and naming
- only then expand automation or ML authority

### Definition of Done for "not raw"

- The main workflow is obvious.
- The proof loop is complete.
- Trust is behavioral, not rhetorical.
- Fallback is honest.
- Registry presets are bounded and reversible.
- Activity can explain a session story.
- Settings summarize authority clearly.

**Experiments**

- Review this codex before any feature merge that changes authority, evidence, or rollback behavior.

**Acceptance Criteria**

- The codex becomes a merge gate, not a forgotten document.

## 19. Concrete implementation backlog

**Facts**

- The repo already contains most of the required building blocks, but the connective tissue is incomplete.

**Interpretation**

- The highest-value work is not adding more knobs. It is tightening truth, proof, and recoverability.

**Recommendations**

- P0:
- commit the registry milestone cleanly
- fix mojibake in [docs/PRODUCT_TRUTH.md](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\docs\PRODUCT_TRUTH.md)
- rewrite [docs/ARCHITECTURE.md](C:\Users\foxal.DESKTOP-N1GCIEU\Desktop\aeterna\docs\ARCHITECTURE.md) to match current sidecar-centric authority
- replace blocked registry response hack with a proper blocked result
- bind benchmark report ids into activity proof events
- normalize public verdict language
- add authority summary at top of Settings
- P1:
- add feedback event contract and storage
- add grouped session timeline in Activity
- add `inconclusive` proof state
- sharpen Dashboard CTA logic
- turn Models into runtime-truth-first surface
- P2:
- finish ONNX runtime path
- deepen telemetry quality
- evolve profiles from text-heavy descriptors to stronger operational presets

**Experiments**

- Ship P0 as one milestone and measure:
- attach rate
- baseline rate
- compare completion
- rollback usage
- blocked-action comprehension

**Acceptance Criteria**

- After P0, the product is materially more trustworthy even if no new "headline feature" is added.
