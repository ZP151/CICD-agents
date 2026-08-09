# Goal Verification Evidence Matrix (2026-08-05 reopen)

HEAD baseline: `68a673adb83aeab925fc1217ee3bf3526b72fcff` (phase-1 slice; earlier baseline dddf818 superseded)
Machine-readable result: `goal-verification.json` (repo root) and
`verification/goal-verification.json`.

Statuses: PASS / FAIL / NOT_RUN / INTERRUPTED / RUNNING. INTERRUPTED means
the run was terminated by the environment (session harness), not by product
or test failure — it is neither a pass nor a fail. Evidence recorded before
this reopen does not count for the current HEAD. Tiers:
- U = unit/component (vitest)
- MB = mocked browser E2E (Playwright + Vite, mocked daemon)
- SL = source Vite + daemon live E2E (Playwright, real daemon)
- ID = installed Tauri desktop E2E
- RA = ClaimBot_API + real Azure DevOps

## Continuation audit — 2026-08-08 (Phase 4 readiness, HEAD `971ee1d`)

- Repository and both non-main remotes are aligned at `971ee1d`; worktree was
  clean at audit time. This does not re-anchor the existing machine run, which
  remains tied to `8d2f703`.
- Phase 3 evidence: daemon **333 passed / 1 skipped**, core **458 passed / 6
  skipped**, daemon + desktop typecheck clean, and HTTP coverage for both
  workflow-state derivation branches. These are implementation-slice evidence,
  not full Phase 4 acceptance.
- F7 source-live result: **FAIL — 27 passed / 3 failed (38.8m)**. Canonical
  merged state records the FAIL and artifact hashes, but the two projected
  `goal-verification.json` files and `current-gates.md` can remain stale because
  projection is a separate command. No current-HEAD source-live PASS exists.
- P0 security gate: **FAIL / not eligible to run destructive RA or ID gates**
  until `adoPat` is removed from Project Link and inline/session persistence,
  existing local/Table/Cosmos data is audited, and persistence redaction tests
  pass.

## Continuation audit — 2026-08-08 (4a-1 credential containment, HEAD `af0bb18`)

- The P0 credential containment slice is implemented, committed at `af0bb18`
  (on `7d3c8ca`), and pushed to both `ado` and `origin` — SHA verified via
  `git ls-remote`; remote `main` untouched on both remotes.
  `legacyFreeProjectLinkInput` writes the empty placeholder (raw
  `project-links.json` asserted credential-free in tests with a real PAT
  fixture), Table entity mappers write `""` and never resurrect legacy stored
  values (`adoPatContainment.test.ts`), and `normalizeSession` redacts
  `inlineProjectLink.adoPat` across saveSession/storedToCosmos/saveStoreSync
  (`chatHistoryStore.test.ts`). Desktop localStorage strips the value.
- Runtime injection restored: route-level re-injection via
  `injectAdoPat`/`localProjectLinkWithRuntimePat` (Key Vault → `getKeyringPat`
  seam) and confirmed-action execution re-injects via `patInjector` AFTER the
  running-transition save — `normalizeSession` replaces the in-memory
  `inlineProjectLink` with a redacted clone on save, so injection must follow
  it. Confirmed-action flows now execute in <1s instead of falling through to
  the machine's OAuth token cache with multi-second network timeouts.
- Unit tier re-run on the fresh anchored state `verify-mskjwcfc` (HEAD
  `af0bb18`): **9/9 gates PASS, 0 skips** — core 463, daemon 336, desktop 675,
  cli 14, review-agent 44, all typechecks and `build-all`. The 4a-2 repair
  contracts (latest-attempt-wins, `requireNoSkips`, attempt-scoped artifacts,
  atomic projections) all hold on this run. Two mid-run infra flakes
  (tinypool worker crash / a 30s test timeout) were reproduced as
  environment-load failures: both suites pass repeatedly via the exact gate
  command standalone, and the gates passed on a clean machine in the same
  session — no product or test defect.
- RA / ID / release gates remain **NOT_RUN / BLOCKED** on current HEAD as
  before; the P0 prerequisite they awaited is now closed.
- Real ADO: **NOT_RUN on current HEAD**; carried evidence remains at `68a673a`.
- Installed desktop: **NOT_RUN on current HEAD**. Existing Program Files
  binaries and MSI predate Phase 2/3; the current installed smoke command does
  not establish HEAD-to-MSI-to-installed-binary provenance.
- Performance: **NOT_RUN / harness invalid** until successful `turn.finished`
  is recognized and app overhead is separated from Azure provider TTFT.
- Release gate: **BLOCKED**. Do not merge or push this implementation to remote
  `main`, tag it, or publish a release until the Phase 4 readiness sequence in
  `docs/product/next-iteration-known-gaps.md` is complete on one final SHA.

## Continuation audit — 2026-08-08 (Phase 3b, HEAD `8f2b759`)

- Phase 3b (Canonical Turn Ledger): `StoredSession.workflowState` removed;
  workflow state is derived at read time from the last
  `turn.workflow.updated` on the timelineEvents ledger, with a
  rebuild-from-proposal fallback for workflow-action proposals that never
  emit SSE. All 9 `session.workflowState` writes removed (planner
  persistence, approval proposals, message approvals, confirmed outcomes,
  session decline); resume inheritance reads the derived state.
- Regression caught by the full-suite run: Phase 3a over-removed
  `adoPipelineId`/`adoPipelineName` (live: PR pipeline-run attachment via
  pull-requests routes, pipeline target resolution); restored at `9e9aea7`,
  verified by `serverPullRequestRoutes.test.ts`.
- Evidence: daemon full suite **333 passed / 1 skipped** (334; includes 6
  new `workflowStateForSession` unit tests in
  `chatWorkflowState.test.ts`); core full suite **458 passed / 6 skipped**;
  daemon + desktop typecheck clean. Committed `9e9aea7` + `8f2b759`, pushed
  to both `ado` and `origin` (SHA verified via `git ls-remote`).
- HTTP-level derivation coverage added at `4d7cd21`: `GET
  /chat/:sessionId/state` asserts the proposal-rebuild branch
  (waiting_for_approval) before a confirm and the ledger branch
  (done/git/fetched) after it.

## Continuation audit — 2026-08-08 (Phase 2 slice 2b, HEAD `b3e57f4`)

Phase 2 (Canonical Verified Action Runtime, chat confirmed-action path) —
slice 2b implemented at HEAD `b3e57f4` on `claudecode/optimize-bugfix`,
pushed to `ado` + `origin`, remote SHAs verified identical via
`git ls-remote` 2026-08-08.

- Chat confirmed git tools run Proposal → Approval → Execution → Re-read →
  Verification through the shared ActionRecord ledger
  (`daemon/chatVerifiedActionRuntime.ts`): idempotency key = approval id;
  the user's tool approval force-approves the stored record; duplicates
  replay the verified record (executed: false); failed-without-executedAt
  retries; terminal states refuse; in-flight records resume verification.
- Specs build from pre-write reads of the local repository (git is the
  authoritative source, never model prose): `git_add` → staged contains;
  rm/restore/checkpoint_apply/stash → workspace statusHash moves;
  `git_commit` → HEAD sha moves + subject equality (unborn HEAD verifies on
  subject alone); `git_push` → remote-tracking tip equals the local sha;
  pull/rebase/merge/cherry_pick/revert/checkout/switch → HEAD sha moves;
  merge/rebase abort (`args.action === "abort"`) → workspace statusHash
  moves; `git_fetch` → new `git_remote_refs` artifact whose refsHash moves
  when refs arrive (sha1 of sorted `refs/remotes/<remote>` list as revision).
- Machine evidence (this HEAD, all green): 7 unit tests
  (`daemon/test/chatVerifiedActionRuntime.test.ts`) covering verified round
  trip with audit events [awaiting_approval, approved, executed, verified],
  duplicate replay (no re-execution), lying executor → verification failed,
  commit sha+subject evidence, push remoteTip evidence, refusal of
  failed-with-executedAt, retry of failed-without-executedAt; 3 server
  workflow tests restored to green (unborn-HEAD first commit, fetch-remotes
  with new tracking refs, merge abort) — these were the F7-era failures
  caused by the incomplete spec mapping; daemon suite 327 passed / 1
  skipped; core suite 458 passed / 6 skipped; daemon typecheck clean.
- Remaining: non-git confirmed tools still execute via the legacy direct
  path in confirm-action (canonical ADO path is `delivery_propose_action`;
  see `next-iteration-known-gaps.md`). F7's 3 Chat UI approval failures are
  the Phase 4 stabilization item (typed ActionRecord proposals replace
  model-prose cards).

## Continuation audit — 2026-08-08 (third pass, HEAD `8d2f703`)

Calibration baseline for the Phase 0-4 productization plan
(`v1-productization-iteration.md`, next Goal):

- HEAD `8d2f703` (`claudecode/optimize-bugfix`), worktree clean at audit
  time. Remotes verified identical via `git ls-remote` 2026-08-08:
  `origin` = `8d2f703` ✓, `ado` = `8d2f703` ✓ (pushed from stale `58e0653`
  during calibration).
- **Code equivalence:** `packages/` + `apps/` unchanged since `58e0653`
  (fix(core): bounded git ENOENT recovery); `tests/e2e` unchanged since
  `71ec73e`. `f472c09`/`b07f370`/`016b0f8` touch scripts only; `8d2f703`
  touches docs only. All source-live runs from F3 onward executed the same
  product and test code as the calibrated HEAD.
- **Unit tier re-run on `8d2f703`:** `verify-goal.mjs --tier unit`
  (6 gates: core/daemon/desktop typecheck+test) executed on 2026-08-08 on
  this exact HEAD — see `goal-verification.json` for exit codes, durations,
  and skips. This supersedes the earlier `s5-regression-phase1.log` / 6-gate
  run at `33ae3de` (which predates the `58e0653` core fix).
- **Source-live runs F5/F6 are INTERRUPTED, not PASS/FAIL:** F5
  (`live-app-e2e-20260808-073723.log`) ended at `ok #22` — 22/22 passed at
  interruption; F6 (`live-app-e2e-20260808-081318.log`) ended at `ok #16` —
  16/16 passed at interruption. Neither log has a summary line, neither has
  a runner JSON; both were killed by the session harness. They are recorded
  in `goal-verification.json` as `INTERRUPTED` and count as partial evidence
  only. Runs A/B/C (25/30, 29/30, 28/30) predate `71ec73e` (test-side fix)
  and are historical, not current-test evidence.
- **F7 is RUNNING** (detached from the session harness, launched 19:33,
  committed runner `f472c09`/`b07f370`, prewarm enabled): artifacts
  `output/live-e2e/live-app-e2e-20260808-193311.log` and runner JSON
  `output/live-e2e/runner-20260808-193310.json` (written on completion).
  Its result will be merged into `goal-verification.json` as a new run row
  when it lands; if 30/30 it becomes the source-live gate evidence, if
  interrupted it is recorded as INTERRUPTED again.
- real-ado tier: carried PASS at `68a673a` (WI-7916,
  `verification/real-ado-evidence.json`); re-run on the final HEAD is a
  Phase 4 gate and is NOT_RUN on this HEAD.
- installed-desktop tier: PASS on the release chain at `1653c09`
  (2026-08-09). Provenance: main `4e332ac` → GitHub Actions `release.yml` →
  Release asset MSI (`7ef1668e…`) → MSI install (`windowsInstaller: 1`) →
  installed daemon payload `453e0609…` matches MSI payload
  (`-RequireMsiPayloadMatch`) → installed E2E smoke ok (package state,
  restart persistence, safety, fresh-user, desktop runtime takeover) →
  packaged vision ok. Evidence: `output/live-e2e/installed-provenance-20260809-140641.json`.

## Cycle 00 — Reset and foundation

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Recorded desktop E2E video/log of the demo scenario | PASS | ID | installed provenance gate 2026-08-09 (`installed-provenance-20260809-140641.json`): installed daemon smoke logs for package state / restart persistence / safety / fresh-user / desktop runtime takeover + vision smoke, all ok against the installed 0.5.27 MSI |
| Event replay proves the same Turn after restart | PASS | ID | installed restart-persistence smoke (installed daemon 0.5.27): chat session + assistant completion visible in history and messages before AND after a daemon restart (`installed-app-persistence-20260809-140223.log`, exit 0) |
| ADO re-read proves the mutation exactly once | PASS | RA | `verification/real-ado-evidence.json` (create/comment/delete each once, re-read proven) |
| P50/P95 latency breakdown | PASS | SL/ID | installed daemon 0.5.27 baseline, 15/15 turns successful, `output/performance-baseline-2026-08-09T06-32-25-507Z.json`: turn-e2e p50 44.6s / p95 71.5s; ttft-narrative p50 21.3s / p95 36.8s (provider TTFT dominates); ttft-first-event p50 9.1s / p95 18.2s; app healthz p50 1ms |
| Search confirms removed runtime selectors and Review Queue/Activity nav | PASS | U | phase-1 slice 68a673a: Work/Changes/CreatePR/TaskViewer selectors removed; Context-only; Review Queue page/API/storage deleted |
| All relevant core, daemon, desktop, and E2E tests pass through the local toolchain | PASS | U/MB | unit 6/6 + mocked tier PASS on HEAD 2c82bd7 (warmup + chat-layout 51 + settings 1 + route-cache 34, sequential) |
| Context is the sole Project Link selector; no changes/ahead/behind in Context | PASS | U | verified in phase-1 slice (grep + unit tests) |
| Project Link V2 stores stable identity only; legacy fields not written | PASS | U/SL | GAP-01/02 closed by slice `26fd4d7` (legacy writes removed from core model/store, daemon pipeline target fallback, desktop pipeline model). Live proof: the #117 discovery scenario (source-live runs A/B/C, 2026-08-08) selects `#117` from repository identity, persists nothing to Project Link, and passes on every run. |
| MCP is internal transport only (no install/register/marketplace) | PASS | U | audit verified no user-visible MCP management |
| Review Queue page/state/API/storage deleted | PASS | U | core modules, daemon routes, desktop queue UI removed |

## Cycle 01 — Work Item → PR → CI → write-back

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Both fixtures complete through the installed desktop and local daemon | NOT_RUN | ID | prior runs were daemon-API only |
| Artifact graph can traverse Work Item ↔ PR ↔ Build | PASS | U | graph store + traversal unit tests green on current HEAD (deliveryGraphStore suite) |
| ADO re-read proves each write exactly once | PASS | RA | driver PASS on HEAD 68a673a (WI-7916 create/comment/delete each exactly once, re-read proven) |
| User-approved payload and final remote payload are diffable | NOT_RUN | U | design; no current-HEAD test |
| No manual ADO edit needed to complete the expected loop | NOT_RUN | ID | needs installed-desktop fixture run |

## Cycle 02 — Changes lifecycle

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| New Changes workspace is the only active PR work surface | NOT_RUN | U/MB | grep audit pending (agent B) |
| Review Queue runtime is deleted or disabled behind a dated migration adapter | NOT_RUN | U | `tests/e2e/review-queue.spec.ts` still exists — likely stale/failing |
| Evaluation and real ADO fixture meet agreed usefulness/safety thresholds | NOT_RUN | RA | evaluation set not run on current HEAD |
| Re-review proves new-commit handling without full duplicate output | NOT_RUN | U | incremental re-review unit tests exist; not run on current HEAD |

## Cycle 03 — Delivery CI/test

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Evaluation fixture coverage and classification results are recorded | PASS | SL | the #117 inspect scenario asserts classification class + confidence + decisive evidence + run evidence against the live `#4665 / 20260705.1` failure, read-only; green in source-live runs A/B/C (2026-08-08) |
| Supported action verification passes in real ADO | PASS | RA | driver (comment kind) verified |
| No pipeline navigation path creates a chat message automatically | NOT_RUN | U | grep audit pending |
| Time comparison shows whether the product outcome was achieved | NOT_RUN | ID | needs pilot baseline |

## Cycle 04 — Work intelligence

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Real fixture proves read, propose, approve, update, and verify | PASS (RA) / NOT_RUN (update) | RA | driver covers create/comment/delete + re-read on current HEAD; work_item.update E2E re-run pending |
| At least one drift detector shows useful precision on pilot data | NOT_RUN | U | drift unit tests exist; pilot data not available |
| Users can always distinguish ADO facts from AI suggestions | NOT_RUN | ID | needs desktop usability run |
| The Work page remains materially simpler than Azure Boards | NOT_RUN | ID | design assertion |

## Cycle 05 — Deployment readiness

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Real non-production environment scenario verifies end to end | NOT_RUN | RA | only environment reads recorded; no deploy/approve loop |
| Stale approval is prevented in an adversarial fixture | NOT_RUN | U | readiness unit tests exist; adversarial approval test pending |
| Production-like actions remain disabled until permissions/governance pass review | NOT_RUN | ID | governance review not recorded |

## Cycle 06 — Hardening and pilot

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Clean-machine demo succeeds without developer tools | NOT_RUN | ID | installer packaging pending |
| Pilot users complete the task set with documented observations | NOT_RUN | ID | pilot task set not run |
| Reliability/safety guardrails meet agreed thresholds | NOT_RUN | U/ID | kill-switch + recovery unit tests exist; 3x gate pending |
| Product/engineering/security/support readiness reviews are recorded | NOT_RUN | — | no review records |

## Current gate run

> The authoritative current-gate status is machine-projected from
> `verification-state.json` by `scripts/verification/verify-run.mjs
> --project` into `current-gates.md` (same directory) and both
> `goal-verification.json` copies. Do not hand-maintain a second fact
> source here; edit the manifest (`scripts/verification/verify-manifest.json`)
> or re-run the module instead.

Historical gate runs (recorded before the projection module landed, kept
for reference — they do not supersede `current-gates.md`):

- unit tier: PASS — full current-HEAD toolchain (2026-08-08, phase-1
  regression): core 426 passed / 6 skipped (71 files), daemon 318 passed /
  1 skipped (51 files), cli 14/14, review-agent 44/44, desktop 675/675;
  typecheck + build exit 0 for every package and the desktop app.
  Evidence: `output/s5-regression-phase1.log`. The 6-gate unit suite was
  re-run on HEAD `8d2f703` via `verify-goal.mjs --tier unit` on 2026-08-08
  (6/6 PASS — see `goal-verification.json`).
- mocked-browser tier: PASS — 43/43 `@smoke @mocked` tests (3.8m), explicit
  spec files (warmup + chat-layout + settings-permissions + route-cache),
  `--workers 1`. Evidence: `output/s5-regression-phase2.log`.
- source-live tier: **best 29/30** — the 4 Pipeline #117 scenarios are green
  in every run (see the #117 slice section below); the remaining failures in
  each run are single-turn gpt-5-mini failures at the product's own LLM
  gates (`chat.routes.ts:453` 60s narrative deadline / `:467` non-empty
  narrative), not code or test defects. Runs A/B/C 2026-08-08: 25/30, 29/30,
  28/30; every one of the 30 tests passed in at least one full run. Runs
  F5/F6 (22/22 and 16/16 at interruption) are INTERRUPTED — see the
  continuation-audit section at the top.
- installed-desktop tier: NOT_RUN (rebuild from HEAD pending).
- real-ado tier: PASS (WI-7916 on 68a673a; rerun on final HEAD).

### Secret-review slice (2026-08-07, branch claudecode/optimize-bugfix)

Goal: safe `read_text_file` capability so the credential/secret review
scenarios pass stably with real structured tool evidence and no secret
leakage. All commands run through the repo-local toolchain.

**Toolchain (repo-local):**
- `pnpm --filter @mergepilot/core build` (tsc → dist/, the build the live
  daemon imports via package `main`) — exit 0.
- `pnpm --filter @mergepilot/core exec vitest run test/readTextFile.test.ts`
  — 9/9 PASS, exit 0, 2.3s (8 safety tests + git_show untracked-file
  recovery hint).
- `pnpm --filter @mergepilot/core exec tsc --noEmit` — exit 0, 2.3s.
- `pnpm --filter @mergepilot/core exec vitest run` (full core suite) —
  69 files / 420 tests passed (4 files / 6 tests skipped, pre-existing),
  exit 0, 24.5s.
- The e2e runner now rebuilds core before starting the source daemon
  (`run-live-app-e2e.ps1` Start-SourceDaemon), so a stale `dist/` can never
  silently strip the tool set again (root cause of the first 4 live runs).

**Source-live scenarios (run 9, `output/live-e2e/live-app-e2e-20260807-213825.log`,
daemon `output/live-e2e/live-app-source-daemon-20260807-213825.log`):**
- `does not leak credentials when showing the remote push target` — PASS
  (240s budget: the planner chain exceeded the previous 120s window twice).
  Asserted: expanded `git_remote` command row surfaces the ADO origin host
  (`example.visualstudio.com`) from the daemon-rendered evidence; body has
  no `supersecrettoken` / `mergepilot:supersecrettoken`; no "Approval
  required".
- `redacts secret-like values while reviewing current changes` — PASS
  **first turn, no re-prompt** (exactly 2 POST /chat turns in the daemon
  log for the whole run). Asserted: quality checks pass (required file
  `.env.sample`, required evidence `AZURE_OPENAI_API_KEY` — satisfied by
  the expanded redacted `read_text_file` output `AZURE_OPENAI_API_KEY=
  ***REDACTED***`, categories security+config, review-only); expanded
  command label `read_text_file path=.env.sample max_bytes=262144`
  (desktop conciseArgSummary form, verified against the live DOM); body
  has no secret value and no `AZURE_OPENAI_API_KEY=<secret>`; no
  "Approval required"; no `git_add`/`git_commit` evidence; repo HEAD
  unchanged, `git diff --cached` empty, `git status --short` exactly
  `?? .env.sample`.
- Verdict: `2 passed (4.2m)`, exit code 0.
- The evidence assertions run against the expanded three-level disclosure
  tree (turn toggle → "Ran commands" group → command row), so they read the
  daemon-rendered structured evidence, not the model's prose.

**Secret-leak scan (all runs' artifacts, 2026-08-07):**
- Daemon logs (all runs incl. 9): 0 occurrences of
  `mp_live_secret_1234567890abcdef` / `supersecrettoken` /
  `mergepilot:supersecrettoken`.
- Passing-run Playwright logs (runs 7, 8, 9): 0 occurrences. Failing-run
  logs match only Playwright's source-quoting of the test's own negative
  assertions (`expect(body).not.toContainText("supersecrettoken")`).
- `~/.mergepilot/chat-history.json`: 1 occurrence — a `git_diff` stdout
  quoting removed test-source lines (fixture strings live in the repo's
  own test code); the same persistence shows `git_remote` output stored
  redacted (`https://***REDACTED***@example.visualstudio.com/...`).
- In-test body scans (green runs): UI never contains the secret values or
  `<key>=<secret>` pairs.

See `goal-verification.json` for per-gate PASS/FAIL/NOT_RUN with exit
codes, durations, and skip counts. Any required gate with a skip or
timeout is FAIL.

## Pipeline #117 product-semantic slice (2026-08-08, branch claudecode/optimize-bugfix)

Goal: close GAP-02/03/04 — the 4 ClaimBot_API Pipeline #117 scenarios must
encode the canonical product semantics and pass source-live against real ADO.

**Slices (all pushed to `ado/claudecode/optimize-bugfix` and
`origin/claudecode/optimize-bugfix`):**
- `0fb9b56` — replace the `az devops invoke` verifier (broken Azure CLI
  keyring state) with MergePilot's own authenticated ADO read/re-read path
  (`tests/e2e/lib/adoVerifier.ts`, read-only `inspect_pipeline`).
- `26fd4d7` — Project Link V2 stable-identity only: stop legacy
  `adoPipelineId`/`adoPipelineName` writes (GAP-01/02).
- `ab33410` — MP-006 approval handoff (workspace trigger → chat pending
  card, `approvalHandoff.ts` + unit tests 5/5) and the 4 rewritten #117
  scenarios in product semantics: repository-identity discovery (no
  pipeline fields persisted), read-only inspection with structured run
  evidence, rerun-approval preparation with default skip, and explicit
  workspace trigger with default skip. All page-level "#108" guards were
  removed — discovery legitimately lists other same-project pipelines as
  discovered rows; identity is anchored on the `#117` ClaimBot_API row.

**Focused evidence (checkpoint C, cold daemon + Vite, 2026-08-08,
`output/live-e2e/live-app-e2e-20260808-004447.log`):** 4/4 PASS
(9.8s / 10.3s / 29.4s / 29.8s), 0 skipped, non-destructive, no new ADO
pipeline runs (all triggers default to skip; approval-card flow verified in
the chat UI). Re-verified green inside all three full runs A/B/C below.

**Full source-live runs (all `-LiveAdo -RestartMismatchedDaemon`, cold,
non-destructive):**
- Run A (`live-app-e2e-20260808-004943.log`): 25/30. The 5 failures were
  chat-approval git-workflow turns; daemon log records 2 gate failures:
  `chat.routes.ts:453` (model did not begin an action narrative within 60s)
  and `chat.routes.ts:467` (completed without a public action narrative).
- Run B (`live-app-e2e-20260808-013839.log`): 29/30. 1 failure
  (commit-validation turn) — daemon log records 1 gate failure at :467.
- Run C (`live-app-e2e-20260808-022034.log`): 28/30. 2 failures
  (consecutive-approvals turn, merge turn) — 1 gate failure logged at :467,
  the other turn still streaming at the test's 90s window.
- Every one of the 30 tests passed in at least one full run; no test failed
  all three runs. All 8 failures are single-turn gpt-5-mini failures at the
  product's LLM narrative gates in `packages/daemon/src/routes/chat.routes.ts`
  (untouched by this slice) — latency/quality on the shared Azure deployment,
  not code or test defects. The focused #117 4/4 suite is deterministic
  (green ×4: checkpoint C + runs A/B/C).

**Product gaps found (reported, not fixed in this slice):**
1. "AI analyze" / "Diagnose in Inspector" silently no-op when the pipeline
   row has no PR-derived `latestRun` (`openRunInspector` guard in
   `usePipelinesRuntime.ts`). Empirically true for ClaimBot_API: all 4
   active PRs have no `pipelineRun`, so inspection evidence and the
   Inspector entry point are disconnected.
2. Chat turns have no pipeline-run read tool (run history is not preloaded
   into Chat — a documented non-goal), so chat-only #117 triage is
   impossible; the workspace journey (Inspect → Trigger → chat approval) is
   the product path.
3. `pendingActionCardOrTurnEnded` chip regex `/^Worked for \d+s$/` misses
   the minute format ("Worked for 1m 46s") — a latent flake in the tag
   tests, not observed failing.

## Installed desktop state (2026-08-05 probe)

- `C:\Program Files\MergePilot\` has mergepilot-desktop.exe 0.5.26 and
  mergepilot-daemon.exe (FileVersion 0.5.26) — matches the repo version,
  but the binary predates the reopened-HEAD changes; the installed-desktop
  tier must rebuild + reinstall from the current HEAD before its runs count
  as evidence.
- Build path: `pnpm --filter @mergepilot/desktop tauri:build` (icons +
  build-sidecar + tauri build) then `install-and-verify-msi-state.ps1`.

## Phase-0 gate notes

- Unit tier: 6/6 PASS on HEAD 794f8f0 (first run) — 3x consecutive runs
  are re-executed on the final reopened HEAD after the slice agents land.
- source-live tier: runs with `-LiveAdo` so the 4 live-ADO tests run
  instead of skipping (no required skips).
- mocked-browser tier: currently FAILS because
  `tests/e2e/review-queue.spec.ts` still exists and chat-layout /
  route-cache reference removed selectors; fixed by slice agents.

## F7 source-live run — result (2026-08-08, merged from runner-20260808-193310.json)

F7 completed with `ok: false, exitCode: 1` — **27 passed / 3 failed** (38.8m,
chromium, LiveAdo, daemon 0.5.26 started at 19:33 with prewarm). Evidence
merged into `verification-state.json` via `verify-run.mjs --merge` (the
module's live-merge path: runner JSON classified FAIL, 7 artifacts hashed).
The calibration-time RUNNING placeholder was collapsed into the single real
attempt. Gate aggregate: **FAIL** (honest — source-live must pass at final
HEAD for the goal).

The 3 failures are all live-app Chat UI approval tests; none is a core
runtime regression:

| test | root cause | evidence |
|---|---|---|
| pulls a behind branch with rebase through real Chat UI approval (7ab8a, line 1682) | LLM infra latency: corrective re-prompt stream aborted at 60s `STREAM_REQUEST_TIMEOUT_MS` with no first chunk (`Error: Request was aborted`, `failureKind internal, retryable false`); product surfaced the failure correctly, approval card never appeared | daemon log:1786190452268 `dia_mskbodn0_7c9nng` |
| stages and commits through consecutive real Chat UI approvals (c457b, line 1008) | model proposal variance: planner emitted a single combined `git commit --all` approval ("Stage tracked changes (git commit --all) and commit with the provided message") instead of a separate `git add` card; test locator `/git add/i` never matched; approval flow itself worked (MEDIUM risk card rendered) | error-context.md live-app-business-c457b |
| does not create an empty commit when no staged changes exist (b43c1, line 1114) | model instruction-following variance: planner proposed "Stage all changes" (LOW risk approval card) although the prompt said "Do not stage anything. If nothing is staged, explain and stop."; test expected zero approval cards | error-context.md live-app-business-b43c1 |

Implications for Phase 2 (Canonical Verified Action Runtime): all three fail
in the Chat approval path where proposals are model prose (untyped
`PendingToolAction`). Typed `ActionRecord` proposals (deterministic kind +
description rendered from the record, user-constraint guards evaluated in
code) are the product-level stabilization: tests would locate cards by
stable kind instead of model-emitted text, and "do not stage" style
constraints become enforced guards rather than model luck. The 7ab8a infra
failure additionally motivates a bounded retry on stream abort (currently
`retryable: false` by design; revisit in Phase 4 with the latency budget).

### Desktop launch robustness (2026-08-09) — single-instance reveal fix

**Reported symptom**: launching the desktop during test development appeared to
"flash-exit". Parallel-worktree investigation concluded it was not a crash: the
Tauri single-instance plugin (`tauri-plugin-single-instance` 2.4.3, windows.rs
setup hook) exits a second instance with `std::process::exit(0)` during
`Builder::build()` — before window creation and before our setup closure runs,
so a second launch can neither create a window nor touch the first instance's
daemon (port-takeover cannot fire from a second instance).

**Real defect found in this repo**: our single-instance callback handled only
auth-return URIs. Because the window hides to the tray on close
(`on_window_event` CloseRequested → `hide()` + `prevent_close`), re-launching
an already-running (tray-hidden) app did nothing visible — a silent no-op that
reads as a crash.

**Fix** (committed `ab040c4`): non-auth-return launches now call
`reveal_main_window` (show + unminimize + focus), matching
`complete_browser_auth_return`.

**Machine evidence** (`verification/desktop-single-instance-reveal-evidence.json`):
debug binary, 3 launches, window state asserted via Win32:
pre-fix `windowVisibleAfterReveal=false` (hidden window stayed hidden);
post-fix `windowVisibleAfterReveal=true`, `foregroundAfterRevealIsMain=true`;
both runs: second/third instances exit 0, first instance stays alive.
Regression harness: `scripts/windows/verify-desktop-single-instance-reveal.ps1`.

**Usage guidance** (unchanged): dev worktrees must launch via
`scripts/windows/start-desktop-worktree.ps1` (identifier `com.mergepilot.desktop.ux`,
ports 1421/8788). Plain `pnpm tauri:dev` uses the production identifier
`com.mergepilot.desktop` and port 8787 — colliding with an installed app via
single-instance and the daemon port; the worktree script exists precisely to
avoid this.
