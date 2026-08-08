# Next Iteration Known Gaps

Status: **Required input for the next product Goal**
Audit date: **2026-08-08**
Audited branch/HEAD: `claudecode/optimize-bugfix` / `971ee1d`

This document records verified gaps between the canonical product direction and
the current implementation. A future Goal must read this document before
claiming a cycle or the product complete. Test failures are not automatically
bugs in the desired product: obsolete tests must be corrected to the canonical
product semantics before they are made green.

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
- **P0 credential containment gap:** canonical `ProjectLink` and persisted
  `InlineProjectLink` still contain `adoPat`. `storedToCosmos` copies the inline
  snapshot as-is, and the Azure Table adapter permits storing `adoPat` in the
  entity when Key Vault is not configured. This contradicts ADR-0005 and must
  be closed before any Phase 4 real-ADO or installed write gate. Credentials
  must be runtime-injected only; Project Link, Turn, bubbles, Timeline, local
  JSON, Table Storage, and Cosmos must contain no credential value.
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
  → installed E2E in one evidence record.
- Turn latency evidence is not usable yet: `measure-turn-latency.mjs` waits for
  obsolete `turn.done` rather than successful `turn.finished`, and the current
  narrative metric does not separate app/daemon overhead from provider TTFT.
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
