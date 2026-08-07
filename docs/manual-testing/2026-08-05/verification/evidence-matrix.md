# Goal Verification Evidence Matrix (2026-08-05 reopen)

HEAD baseline: `68a673adb83aeab925fc1217ee3bf3526b72fcff` (phase-1 slice; earlier baseline dddf818 superseded)
Machine-readable result: `goal-verification.json` (repo root) and
`verification/goal-verification.json`.

Statuses: PASS / FAIL / NOT_RUN. Evidence recorded before this reopen does
not count for the current HEAD. Tiers:
- U = unit/component (vitest)
- MB = mocked browser E2E (Playwright + Vite, mocked daemon)
- SL = source Vite + daemon live E2E (Playwright, real daemon)
- ID = installed Tauri desktop E2E
- RA = ClaimBot_API + real Azure DevOps

## Cycle 00 — Reset and foundation

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Recorded desktop E2E video/log of the demo scenario | NOT_RUN | ID | installed-desktop tier pending (rebuild from HEAD required) |
| Event replay proves the same Turn after restart | NOT_RUN | ID | unit-level restart recovery exists; desktop replay pending |
| ADO re-read proves the mutation exactly once | PASS | RA | `verification/real-ado-evidence.json` (create/comment/delete each once, re-read proven) |
| P50/P95 latency breakdown | NOT_RUN | SL | to re-measure on current HEAD during source-live tier |
| Search confirms removed runtime selectors and Review Queue/Activity nav | PASS | U | phase-1 slice 68a673a: Work/Changes/CreatePR/TaskViewer selectors removed; Context-only; Review Queue page/API/storage deleted |
| All relevant core, daemon, desktop, and E2E tests pass through the local toolchain | PASS | U/MB | unit 6/6 + mocked tier PASS on HEAD 2c82bd7 (warmup + chat-layout 51 + settings 1 + route-cache 34, sequential) |
| Context is the sole Project Link selector; no changes/ahead/behind in Context | PASS | U | verified in phase-1 slice (grep + unit tests) |
| Project Link V2 stores stable identity only; legacy fields not written | FAIL | U/SL | 2026-08-07 audit found `adoPipelineId`/`adoPipelineName` still present in the core model/store, daemon pipeline target fallback, desktop pipeline model, and live Pipeline E2E writes. See `docs/product/next-iteration-known-gaps.md` GAP-01/02. |
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
| Evaluation fixture coverage and classification results are recorded | FAIL | U | classification tests exist; evidence from pre-reopen run only |
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

- unit tier: 6/6 PASS (2c82bd7).
- mocked-browser tier: PASS (warmup + 86 tests sequential, -Workers 1).
- source-live tier: FAIL — 6 live-app approval-flow tests failing; repair in
  progress. **Secret-review slice (this goal): the 2 credential/secret
  scenarios are now green (run 9, 2026-08-07). The remaining 4 failures are
  the ClaimBot_API Pipeline #117 scenarios — next goal.** The most recent
  full source-live run remains 24/30; only the secret-review slice is marked
  done here.
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
