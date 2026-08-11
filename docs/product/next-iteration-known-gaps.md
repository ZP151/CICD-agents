# Next Iteration Known Gaps

Status: **Active gap register for the MergePilot v1 Goal**
Audit date: **2026-08-11**
Current product-code/evidence baseline: `claudecode/mergepilot-v1` /
`5f14a64`

This document records verified gaps between the canonical product direction and
the current implementation. A future Goal must read this document before
claiming a cycle or the product complete. Test failures are not automatically
bugs in the desired product: obsolete tests must be corrected to the canonical
product semantics before they are made green.

## Current v1 execution delta — 2026-08-11

- Priority 1, Work inspectability, is closed as an implementation slice at
  `d6ba786`, with the ADO >200-id query defect fixed at `82c2e09` and live
  read evidence recorded at `a0196cc`.
- Priority 2, Guided PR Preparation, is closed as an implementation and
  source-live slice through `1fda4a6`. It binds the exact Work Item, source and
  target refs, commit, diff, validation result and ADO policy evidence into an
  editable typed suggestion before `pull_request.create` is proposed.
- Source-live passed **30/30** twice on the 0.5.31 candidate `579ec46`.
  Deterministic real-ADO verification, MSI/install provenance and the installed
  ClaimBot_API Work Item → PR → CI → explicit approval → write-back → ADO
  re-read loop also passed on that exact candidate.
- Canonical run `verify-msoha3ku` then exposed a mocked-browser regression. The
  product/accessibility defects and obsolete acceptance assumptions were fixed
  at `5f14a64`; the full pre-release mocked gate now passes 86/86 with no skip.
  The same slice repairs the verification parser so failed counts cannot be
  hidden by a later `passed` summary line and chained Playwright suites are
  aggregated.
- The installed 0.5.31 payload is now stale relative to `5f14a64`. Priority 3
  remains open only at final 0.5.32 convergence: every manifest gate must run
  fresh on a clean candidate, whose MSI and installed payload must match that
  SHA before installed vertical-loop, real-ADO, credential and split-latency
  evidence are refreshed.
- `docs/manual-testing/2026-08-05/verification/current-gates.md` is a generated
  historical projection and must not be hand-edited. It will be regenerated
  only by the verification runner against the eventual final SHA.

## v0.5.29 release handoff — 2026-08-10

This release consolidates the desktop workflow surface without declaring the
product or its verification program complete. It includes the Context and
Project Link controls, chat-session preservation and prompt deck recovery,
guided pull-request preparation, clearer empty and error states for Work and
Changes, and the Settings navigation and disclosure refinements.

### Next iteration priorities

1. **Make Work inspectable before it is actionable.** Selecting a work item
   must reveal its Azure Boards description, acceptance criteria, links and
   evidence before Comment or Start can propose a governed action.
2. **Make PR creation a guided investigation.** Create PR should first bring
   local changes, source/target branch divergence and remote policy into the
   chat workflow; it must not surface a pre-filled approval card before that
   analysis is visible and editable.
3. **Prove a fresh vertical release loop.** Run the source-live and installed
   MSI acceptance gates against the final tagged HEAD, record the immutable
   source/build/MSI/install evidence, and do not let historical PASS records
   satisfy this release's gates.
4. **Finish responsive consistency.** Exercise every Context popover and the
   Settings sections at desktop, narrow desktop and overflow lengths; content
   must wrap or scroll deliberately, with keyboard navigation and focus order
   intact.
5. **Tighten approval-card hierarchy.** Keep cards proportional to risk,
   present a short purpose and expandable evidence first, and use one visual
   grammar across Work, Changes, Delivery and chat.

### Release acceptance boundary

- A user can retain an in-progress chat while changing Context, start a new
  chat from the primary navigation, and manage Project Links from both Context
  and the dedicated route.
- Context controls and their popovers align to a shared left edge, preserve
  keyboard access and handle long lists without clipping the active control.
- Empty remote data is an informative state, not a placeholder record; a
  failed request identifies the action to retry.
- Release readiness still requires the separate live-source and installed-MSI
  evidence described in the historical audit below.

## Continuation audit — 2026-08-08 (Phase 4 readiness, HEAD `971ee1d`)

- Git state is clean and both non-main development refs are aligned:
  `origin/claudecode/optimize-bugfix` and
  `ado/claudecode/optimize-bugfix` resolve to `971ee1d`. Remote `main` was not
  changed.
- Phase 3b is a valid workflow-status convergence slice, not full Turn
  convergence. `StoredSession` still persists `messages`, `bubbles`,
  `timelineEvents`, and `approvalProposal`; eight or more evidence, artifact,
  checkpoint, pending-action, and desktop-restore consumers still read
  bubbles. Phase 3c therefore remains required, using versioned public events
  plus stable Action/Artifact/Checkpoint references rather than copying raw
  tool results into the Timeline.
- **P0 credential containment gap — CLOSED in the 4a-1 slice (committed at
  `af0bb18` on `claudecode/optimize-bugfix`, pushed to both `ado` and
  `origin`):** canonical `ProjectLink`
  and persisted `InlineProjectLink` never hold an `adoPat` value.
  `legacyFreeProjectLinkInput` writes the empty placeholder, Table entity
  mappers write `""` and never resurrect legacy stored values, and
  `normalizeSession` is the single redaction choke point for
  saveSession/storedToCosmos/saveStoreSync. The desktop localStorage layer
  strips the value too. Runtime injection is the only source: routes
  re-inject via `injectAdoPat` (Key Vault → keyring seam `getKeyringPat`), and
  confirmed-action execution re-injects via the `patInjector` AFTER the
  running-transition save (the save normalizes/redacts in place; injecting
  before it would be stripped). Unit tests cover the raw JSON file, the
  entity mappers, session/Cosmos serialization, and the keyring seam; the
  real-data audit script (`scripts/audit-credential-persistence.mjs`) reports
  counts only and was clean against the live store. Remaining follow-up: the
  live-tier gates (real ADO, installed MSI) must run against this slice.
- F7 completed on the calibrated `8d2f703` product/test code with **27 passed /
  3 failed** in 38.8 minutes. The failures are product signals, not three
  equivalent locator flakes: stage+commit was collapsed to `git commit --all`;
  a clean-repo request explicitly forbidding stage still produced a `git_add`
  proposal; and pull-with-rebase ended after narrative timeout/retry with an
  aborted Azure request. Typed ActionRecord rendering alone is insufficient:
  deterministic user-constraint enforcement and action decomposition are
  required before a full source-live rerun.
- The Verification Run Module is not yet an acceptance oracle. Its canonical
  state contains the F7 FAIL while the projected JSON/Markdown can remain
  stale; any historical PASS currently outranks later FAIL in gate aggregation;
  generic `requireNoSkips` is not enforced; artifact globs can bind old runs;
  and there is no explicit fresh-run operation for a changed HEAD. Repair these
  contracts and create a new run anchored to the final HEAD before Phase 4.
- Installed provenance is open. The manifest's installed gate checks the
  already-installed app and does not build/install a package or require an MSI
  hash. The Program Files binaries and existing 0.5.26 MSI predate Phase 2/3,
  so version equality cannot prove current-HEAD installation. Bind
  source HEAD → build/sidecar/MSI hashes → installation → Program Files hashes
  → installed E2E in one evidence record. **4a-3 implementation (in the
  version-bump + provenance slice, HEAD after `e2da956`):**
  `scripts/windows/verify-installed-provenance.ps1` records source HEAD +
  tree state, builds the MSI/sidecar from that HEAD, hashes the artifacts,
  compares the installed package, emits an elevation handoff for the install,
  and on completion verifies Program Files hashes against the MSI payload
  (`-RequireMsiPayloadMatch`) and runs the installed E2E smoke + vision —
  one merged evidence record at `output/live-e2e/installed-provenance-*.json`.
  The manifest's `installed-desktop-e2e` gate now runs this script. Version
  bumped to 0.5.27 so the fresh HEAD build upgrades over the stale 0.5.26
  install (MSI same-version installs are rejected).
  **4a-3 evidence (2026-08-09, HEAD `1653c09`):** the provenance gate PASSED
  end to end against the GitHub Actions release artifacts
  (`output/live-e2e/installed-provenance-20260809-140641.json`): release MSI
  `7ef1668e…` → MSI install (`windowsInstaller: 1`) → installed daemon
  payload `453e0609…` matches the MSI payload (`-RequireMsiPayloadMatch`),
  installed E2E smoke ok (package state, restart persistence, safety,
  fresh-user, desktop runtime takeover), and packaged vision smoke ok.
  Provenance chain: main `4e332ac` → GitHub Actions `release.yml` → Release
  asset MSI → install → Program Files hash match → installed E2E PASS.
  Two harness bugs found and fixed along the way: `packaged-live-vision-smoke.ps1`
  and `measure-turn-latency.mjs` still parsed obsolete SSE events
  (`assistant_delta`/`done`/`result.response` and `turn.final.completed` as a
  terminal). The vision smoke now reads `turn.final.completed.finalText` and
  the latency harness treats only `turn.finished` / `turn.failed` /
  `turn.cancelled` as terminals (fixed at `1653c09` / `f54f68c`).
- Turn latency evidence is now usable. `measure-turn-latency.mjs` waits for
  the canonical terminal `turn.finished` (status "completed") and reports
  successful vs no-terminal turn counts; the metric table separates
  daemon/transport overhead (`ttft-first-event`) from provider TTFT
  (`ttft-narrative`) with the delta between them. **4a-3 baseline
  (2026-08-09, installed daemon 0.5.27, Azure `gpt-5-mini`, 15 turns,
  `output/performance-baseline-2026-08-09T06-32-25-507Z.json`):**
  `turn-e2e` p50 44.6s / p95 71.5s, `ttft-narrative` p50 21.3s / p95 36.8s,
  `ttft-first-event` p50 9.1s / p95 18.2s, app healthz p50 1ms, all 15/15
  turns successful. Provider TTFT dominates (p50 ~21s); app/daemon overhead
  beyond the transport baseline is small.
- **Build non-determinism (confirmed, 2026-08-09):** the same source HEAD
  produces different binaries across build environments. GitHub Actions
  `release.yml` built daemon payload `453e0609…` (78,815,351 B) while the
  local build of the same 0.5.27 source produced `1cceb385…` (78,344,291 B);
  the local MSI cannot be used as an install-provenance anchor. The release
  chain must anchor to the GitHub Actions artifact: CI build → Release asset
  MSI → install → payload match (as the 4a-3 evidence above does).
- **Release decision:** `971ee1d` is not eligible for `main` or release. The
  minimum sequence is credential containment → verification/provenance repair
  → focused F7 fixes → current-HEAD source-live → real ADO re-read → fresh MSI
  and installed E2E → ClaimBot_API verified vertical loop.

## Continuation audit — 2026-08-08 (Phase 3b, HEAD `8f2b759`)

- Phase 3 (Canonical Turn Ledger + Project Context identity) is
  implemented. `StoredSession.workflowState` is removed: the Turn Timeline
  ledger (`timelineEvents`, `turn.workflow.updated` events) is the canonical
  workflow record and `workflowStateForSession` derives the state at read
  time — ledger-first, with a rebuild-from-proposal fallback for
  workflow-action endpoints that never emit an SSE event. All 9
  `session.workflowState` writers are gone; every transition is still
  recorded on the ledger through the SSE channel, so resume inheritance
  (running → done phase) now reads the derived state.
- The 3a inline-link field trim over-removed `adoPipelineId`/`adoPipelineName`
  — both are live consumers (PR list/insight pipeline-run attachment;
  PipelineTargetResolver for pipeline workflows). Restored at `9e9aea7`
  after the full-suite run caught the PR regression; MCP command/auth and
  template fields remain genuinely dead and removed.
- **Remaining Phase 3 gap (3c, deferred):** `timelineEvents` is not yet
  enriched (checkpointId/path, artifacts, riskLevel, public tool results),
  so it cannot replace `bubbles` as the source for the 8 bubble consumers
  (completedTools, pending-action derivers, checkpoint activity, artifact
  prompts, desktop restore). Workflow *status* is ledger-derived; per-action
  evidence stays in bubbles.

## Continuation audit — 2026-08-08 (Phase 2 slice 2b, HEAD `b3e57f4`)

- Phase 2 slice 2b (Canonical Verified Action Runtime, chat path) is
  implemented at `b3e57f4` on `claudecode/optimize-bugfix`, pushed to both
  `ado` and `origin` (SHA verified via `git ls-remote`). Chat confirmed git
  tools (add/commit/push/pull/rebase/merge/cherry_pick/revert/checkout/
  switch/stash/fetch/rm/restore/checkpoint_apply) now run the canonical
  Proposal → Approval → Execution → Re-read → Verification lifecycle through
  the shared ActionRecord ledger (`chatVerifiedActionRuntime.ts`); duplicates
  replay the verified record without re-executing; lying tool results fail
  verification; `verifiedActions` are projected into the workflow state from
  the ledger (never model prose).
- **Remaining Phase 2 gap:** non-git confirmed tools (ADO / MCP writes) in
  `/chat/:id/confirm-action` still execute through the legacy
  `streamAndPersistConfirmedAction` path in this slice. The canonical path
  for ADO writes is `delivery_propose_action`, which the planner is
  instructed to prefer; routing every confirmed tool through a verified
  ActionRecord is the remaining Phase 2/4 work.
- F7's 3 live-app Chat UI approval failures (model-prose proposal variance
  and stream-abort latency, recorded in `evidence-matrix.md`) stand as the
  Phase 4 stabilization item: typed `ActionRecord` proposals (deterministic
  kind + record-rendered description) are the product-level fix so tests
  locate cards by stable kind, not model-emitted text.

## Continuation audit — 2026-08-08 (second pass, HEAD `f472c09`/`b07f370`)

- F4 (`live-app-e2e-20260808-065920.log`, full run, 1 failed / 29 did not run)
  was a **Vite cold-compile stall, not a product or test defect**: the shared
  beforeAll warmup (spec `:714`) timed out waiting for the chat composer.
  Trace forensics (`0-trace.network` + screencast frames) established the
  chain: document request 130.9s; auth completed 07:01:47 (`/auth/me` success,
  `auth-cache.json` written, user Zhou.Ping); chat route mounted ~23:01:45 UTC
  and its modules were served 15–98s each (Vite dep-optimizer contention); a
  final wave of 44 chat-runtime modules (`useChatRuntime.ts`,
  `@assistant-ui_react.js`, bubble/stream modules) was requested
  `23:04:23.461–26.846` and **never answered** (in-flight status -1 at
  teardown 23:05:49); screencast frames stop at 23:04:34; the daemon never
  received `/chat/history`. F3 (06:00 run, same code) warmed up successfully —
  cold compile is probabilistic, not deterministic.
- **Fix, verified** (`f472c09`, `b07f370` on `claudecode/optimize-bugfix`,
  pushed to `origin`): `scripts/prewarm-vite.mjs` + runner integration in
  `scripts/windows/run-live-app-e2e.ps1`. The runner starts Vite
  (Playwright's webServer reuses it via `reuseExistingServer:true`), runs the
  prewarm script — reload-retry against chat composer + Pipelines heading —
  and aborts with structured JSON rather than starting the suite cold.
  Measured: cold prewarm 60.3s (first experiment) and 177.4s (F5), warm app
  interactive in **1.6s** after prewarm. Runner fixes found by the failed F5
  launches: `Start-Process` refuses identical stdout/stderr redirect targets;
  an HTTP port poll with a 3s budget times out against a cold Vite (first GET
  ~3.8s); wrapper `Stop-Process` orphans the node child (cleanup now also
  clears repo-owned 1420 listeners via `Stop-PortOwner -Port 1420`).
- **actionsTaken trust gap** (from bff168 turn 2, recorded for S6e): the
  `actionsTaken` field read by `packages/core/src/chatPlannerControl.ts:39`
  is the model's self-report (`control["actions_taken"]`), not an execution
  record. Observed: the model claimed `git_add` and "Staged notes.txt
  successfully" while the daemon's `completedTools` recorded only
  `git_status`/`git_diff` — the approval gate held (write never executed), so
  no harm, but `actionsTaken` must never be cited as execution evidence; the
  daemon `completedTools` log is the trusted record.
- S6a state: F3 = 21/26 (5 failures + 4 ADO skips, all 5 fixed in `71ec73e`);
  F4 = environment warmup failure; F5 (prewarm-enabled full run, `-LiveAdo`)
  running at audit time. See GAP-06 for the remaining gates.

## Continuation audit — 2026-08-08

- GAP-01, GAP-02, GAP-03 are closed: slices `0fb9b56`, `26fd4d7`, `ab33410`
  (branch `claudecode/optimize-bugfix`, pushed to both `ado` and `origin`).
  The 4 rewritten #117 scenarios pass source-live cold-start in every run
  (focused 4/4, 9.8–29.8s, 0 skipped) and are green inside full runs A/B/C.
  Full-suite best is 29/30: the residual failures are single-turn gpt-5-mini
  trips at the product's own LLM narrative gates
  (`packages/daemon/src/routes/chat.routes.ts:453` 60s narrative deadline,
  `:467` non-empty narrative) — every one of the 30 tests passed in at least
  one run; no test failed all three. This is a model-latency/quality
  limitation on the shared Azure deployment, not a code or test defect.
- New verified product gaps (reported in `evidence-matrix.md`, not fixed):
  - "AI analyze" / "Diagnose in Inspector" silently no-op when a pipeline row
    has no PR-derived `latestRun` (`openRunInspector` guard in
    `apps/desktop/src/pages/pipelines/usePipelinesRuntime.ts`); empirically
    true for ClaimBot_API (4 active PRs have no `pipelineRun`), so inspection
    evidence and the Inspector entry point are disconnected.
  - `pendingActionCardOrTurnEnded` chip regex `/^Worked for \d+s$/` misses the
    minute format ("Worked for 1m 46s") — latent flake in tag tests.
- GAP-05 is aligned: `evidence-matrix.md`, `phase2-plan.md`, and both
  `goal-verification.json` files now reference the same final HEAD
  (`ab33410`) and artifact paths (run logs `output/live-e2e/live-app-e2e-2026
  0808-*.log`, regression `output/s5-regression-phase1/2.log`).
- GAP-06 remains open: installed-desktop/MSI rebuild from HEAD,
  installed-desktop E2E, real destructive ADO approval execution,
  performance baselines separating app latency from model TTFT, and pilot /
  readiness evidence. The product and Cycles 00–06 are not complete.

## Continuation audit — 2026-08-07

- GAP-01 and GAP-03 have implementation commits through `26fd4d7` on both
  non-main remotes, but final source-live and installed evidence is still open.
- The worktree after `26fd4d7` contains an unfinished Pipelines → Chat approval
  handoff and same-Turn decline slice. Preserve and seal it before starting the
  broader v1 iteration.
- The latest mocked chat-layout result is `50/51`; the saved PR insight artifact
  source → result workspace test is failing. Do not reuse the older mocked PASS
  as current-HEAD evidence.
- The detailed execution plan for the next macro Goal is
  `v1-productization-iteration.md`.

## Current verified baseline

- The credential and secret-review slice is complete at `69c9dff`: its two
  focused source-live scenarios pass and the structured evidence is redacted.
- The most recent complete source-live run is still `24/30`; the four remaining
  failures are the ClaimBot_API Pipeline `#117` scenarios.
- Installed-desktop/MSI evidence and final-HEAD real-ADO evidence are still
  pending. The product and Cycles 00–06 are not complete.
- `goal-verification.json` still describes the older `2c82bd7` failed run. It
  must not be used as current-HEAD completion evidence.
- `69c9dff` exists on `ado/claudecode/optimize-bugfix`. At audit time the local
  branch still tracked `origin/claudecode/optimize-bugfix`, which was one commit
  behind. Future reports must name the remote and prove both non-main refs when
  they claim a push completed.

## GAP-01 — Project Link V2 is not yet stable-identity-only

**Canonical intent:** Project Link owns stable local workspace and ADO repository
identity. Pipeline, branch, MCP, Git status, and workflow state do not belong in
Project Link. Context is the sole Project Link selector.

**Implemented reality:** legacy pipeline fields remain in the canonical model
and persistence path:

- `packages/core/src/projectLinks.ts` still declares, normalizes, and serializes
  `adoPipelineId` and `adoPipelineName`.
- `packages/core/src/store/tableProjectLinkStore.ts` still maps those fields.
- `packages/daemon/src/workflows/pipelineWorkflow.ts` still falls back to
  `projectLink.adoPipelineId` when resolving an action target.
- `apps/desktop/src/pages/pipelines/pipelineModel.ts` still derives pipeline
  connections from Project Link pipeline fields.

**Why it matters:** this recreates the overloaded Project Link model that the
canonical product plan explicitly removed. It also makes Pipeline behavior and
tests depend on stale configuration rather than live ADO repository evidence.

**Required direction:** stop all new writes of legacy workflow fields; migrate
historical pipeline values into the existing PipelineConnection model or a
Turn/Context runtime selection; retain a bounded read-only compatibility adapter
until migration evidence permits deletion.

## GAP-02 — The remaining Pipeline E2E encodes obsolete behavior

`tests/e2e/live-app-business.spec.ts` currently expects pipeline discovery to
write `adoPipelineId: 117` and `adoPipelineName: ClaimBot_API` back into Project
Link. Its fixtures also seed those legacy fields, and its helper still searches
for the old `Environment` label.

Making this test pass unchanged would regress the target product. The intended
scenario is:

1. select the ClaimBot_API Project Link from Context;
2. discover Pipeline `#117` from the ADO repository identity;
3. keep the selected Pipeline in PipelineConnection or the active Turn/Context;
4. re-read Project Link and prove no pipeline fields were persisted;
5. inspect evidence read-only; only an explicit user action may create a trigger
   proposal and approval card.

Pipeline navigation must not preload a report into Chat or create a synthetic
user message.

## GAP-03 — Source-live Pipeline verification depends on broken Azure CLI state

The E2E helper `latestClaimBotPipelineRun()` shells out to `az devops invoke`.
On 2026-08-07 the exact read-only command failed before the app was exercised:

```text
PermissionError: [Errno 13] Permission denied:
C:\Users\15492\.azure\cliextensions\azure-devops\keyring\__init__.py
```

Two of the four Pipeline failures therefore represent a harness/auth dependency,
not demonstrated product failures. The verifier must use MergePilot's own
Microsoft authentication and core ADO client, then perform an authoritative
ADO re-read. It must not read token files, duplicate credentials, add an
unauthenticated test route, or ask for credentials in chat.

## GAP-04 — Pipeline evidence and approval behavior remain unproven end to end

The current remaining source-live scenarios must prove, using real ClaimBot_API
data:

- repository-based discovery selects Pipeline `#117`, never `#108`;
- read-only inspection shows the historical `#4665 / 20260705.1` failure and
  useful VSBuild/MSBuild evidence without leaking secrets;
- read-only inspection never creates an approval or queues a run;
- an explicit rerun/trigger request creates a high-risk
  `ado_trigger_pipeline` proposal for `#117`;
- cancellation or approval remains in the same Turn;
- default non-destructive verification re-reads ADO and proves no run was
  created.

Model prose is not the acceptance oracle. Structured events, approval payloads,
logs, traces, and ADO re-read are the evidence.

## GAP-05 — Verification state is split and stale

The manual evidence matrix records the newer secret-review result, while both
machine-readable `goal-verification.json` files still point to the old failed
run. Before `source_live_ready` can be claimed, the two JSON files and the
manual evidence must reference the same final SHA, command, exit code, test
count, skip count, timing, model configuration, and artifact paths.

## GAP-06 — Product completion gates remain open

After source-live reaches the product-correct `30/30`, the next product Goal
still needs final-HEAD unit repetition, deterministic real-ADO re-read, a fresh
MSI, installed-desktop E2E, performance baselines that separate app latency
from model TTFT, and pilot/readiness evidence. Passing source-live alone does
not complete the product.

## Required Goal behavior

Every future macro Goal may stay concise, but its execution must treat this
document as a required backlog and evidence ledger. Work in reversible slices,
commit and push verified checkpoints to explicitly named non-main branches,
and never delete, rename, force-push, rewrite, or directly push any remote
`main` branch.
