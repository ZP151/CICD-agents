# Goal Verification Evidence Matrix (2026-08-05 reopen)

HEAD baseline: `dddf81843fe15ebe4362775ba9c5d80df6dc0a81`
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
| Recorded desktop E2E video/log of the demo scenario | NOT_RUN | ID | no installed-desktop run on current HEAD |
| Event replay proves the same Turn after restart | NOT_RUN | ID | unit-level restart recovery exists only |
| ADO re-read proves the mutation exactly once | PASS | RA | `verification/real-ado-evidence.json` (create/comment/delete each once, re-read proven) |
| P50/P95 latency breakdown | FAIL | SL | baseline recorded pre-reopen; not re-measured on current HEAD |
| Search confirms removed runtime selectors and Review Queue/Activity nav | NOT_RUN | U | grep audit pending (agent B) |
| All relevant core, daemon, desktop, and E2E tests pass through the local toolchain | NOT_RUN | U/MB | gate run pending |

## Cycle 01 — Work Item → PR → CI → write-back

| Exit Evidence | Status | Tier | Evidence / gap |
| --- | --- | --- | --- |
| Both fixtures complete through the installed desktop and local daemon | NOT_RUN | ID | prior runs were daemon-API only |
| Artifact graph can traverse Work Item ↔ PR ↔ Build | NOT_RUN | U | traversal unit tests exist; not run on current HEAD |
| ADO re-read proves each write exactly once | PASS | RA | driver proves exactly-once create/comment/delete |
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
| Real fixture proves read, propose, approve, update, and verify | PASS | RA | driver covers read/propose/approve/verify; update proven pre-reopen only → mark FAIL until re-run on current HEAD |
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

## Current gate run (unit tier)

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
