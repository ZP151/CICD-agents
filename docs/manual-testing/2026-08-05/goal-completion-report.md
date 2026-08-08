# Goal Completion Report — MergePilot Cycle 00–06 (2026-08-05)

Goal: 按权威产品路线完成 MergePilot Cycle 00–06,以
`docs/product/README.md` 及其引用文档为唯一权威依据,严格按顺序完成,每个
Cycle 以真实 ADO 证据验收。

## Implementation summary

### Cycle 00 — Reset and foundation
- Canonical Turn path: daemon emits only `turn.*`; desktop live dispatch
  renders exclusively through the canonical reducer; legacy ui.chunk /
  bubble / progress live-render paths deleted (−1,809 lines).
- Verified action runtime: `ProposedAction` persisted (target, basedOn
  revisions, payload, risk, reason, predicates, idempotency key, expiry),
  statuses proposed…cancelled, restart recovery without re-execution.
- Product simplification: Agent/Work/Changes/Delivery/Settings nav, Work
  enabled in Cycle 04; Context owns the Project Link selector; Built-in
  capabilities + global read-only kill switch; latency instrumentation.
- Real ADO demo: work-item comment proposed → approved → executed →
  re-read → verified (revision_gt + comment_contains).

### Cycle 01 — Work Item → PR → CI → write-back
- Delivery graph (artifactRef, observations, fact/derived edges, SQLite
  snapshot store); pull_request.create, pipeline.trigger, work_item.create
  action kinds with target resolution after execution.
- Fixture A (passing): PR #2801 + run 4833 + WI-7913 write-back all
  verified; run 4830 succeeded. Fixture B (failure): run 4834 completed
  failed (deterministic compile error). Safety: duplicate PR refused
  (TF401179), stale write-back refused.

### Cycle 02 — Changes lifecycle
- Review Queue page/runtime deleted (redirect to Changes); views All /
  Authored by me / Needs my review / Waiting; verified Create PR flow.
- ReviewAssessment + incremental re-review; reviewer write-back
  (pull_request.comment + pull_request.vote) verified on PR #2801;
  your-turn projection.

### Cycle 03 — Delivery CI/test
- Failure evidence bundle (bounded, redacted logs, coverage, signature)
  + deterministic classification; run 4834 classified code_regression
  (0.85) with decisive evidence; run Inspector with rerun / create-Bug
  recovery through the verified runtime; click-to-chat preloading deleted.

### Cycle 04 — Work intelligence
- Work workspace enabled (My work / Ready / Blocked), drift detector
  (6 deterministic cases), My Work endpoint, verified write-back
  (comment + state transition with revision check) — WI-7913 To Do →
  In Progress, rev 7 → 8, verified.

### Cycle 05 — Deployment readiness
- DeploymentReadiness bundle (ready/wait/reject/insufficient_evidence,
  never claims readiness on unreadable evidence), last-good comparison,
  environments/deployments/approvals APIs, deployment.approve kind.
- Real ADO: 2 environments read with readiness computed.

### Cycle 06 — Hardening and pilot readiness
- Diagnostics endpoint (correlation id + telemetry + kill switch),
  Settings Diagnostics section; support runbook; pull_request.update
  lifecycle kind; fixture cleanup performed.

## Test results

| Suite | Result |
| --- | --- |
| packages/core | 71 files passed, ~410 tests (runtime 16, policy, verifier, recovery, graph 5, assessment 3, drift 7, readiness 5, classification 6, transport 3, your-turn 5) |
| packages/daemon | 55+ files passed (delivery routes, chatSse 16, etc.) |
| apps/desktop | 140 files, 717 tests |
| Typecheck | core / daemon / desktop all clean |
| Playwright e2e:chat | @smoke gate (9/9) on the canonical chat path (prior iteration) |

## Real ADO evidence (TeBS-ClaimBot / ClaimBot_API)

- `docs/manual-testing/2026-08-05/` — cycle00/01/02/03/04/05 evidence,
  transcripts (cycle00-e2e-transcript.jsonl, cycle01-e2e-transcript.jsonl),
  cycle01-evidence.json, cycle02-reviewer-evidence.json, cycle03-evidence.json,
  cycle04-evidence.json, cycle05-environments.json.
- 20 verified / 11 failed action records (failures are safety refusals:
  duplicates, stale revisions, missing predicates).

## Cleanup

- PRs 2798/2799/2801 abandoned and verified; 6 `mergepilot-e2e/` branches
  deleted from origin; ClaimBot_API local stash restored (initial state
  matches the goal-start snapshot).
- Remaining: WIs 7912/7913 deletion (standalone auth unavailable; marked
  `[MergePilot Fixture]` — delete via the ADO portal).

## Residual risks / remaining work

1. Deploy-to-environment E2E needs a fixture pipeline with a YAML
   environment stage (APIs + readiness validated against the real org).
2. Installer packaging + clean-machine pilot run (next pilot program step;
   `docs/windows-code-signing.md` exists).
3. UI-driven desktop walkthroughs are partially covered; the daemon-API
   path drives the identical runtime, and the 2026-08-03/04 ledger recorded
   browser-turn acceptance on the same runtime.
4. Evaluation fixture sets (12 PRs / 20 WIs) and role-based pilot tasks are
   seeded and ready for the pilot iteration.
5. `local_visible ≤100 ms` remains an optimization objective; baselines
   recorded (P50 143 ms / P95 309 ms app/SSE path, 246 ms real run).

## Management demo flow

1. Sign in with Microsoft; create/select the ClaimBot_API Project Link in
   Context.
2. Changes → Create PR: pick branches + work item, approve the stored
   proposal, watch it execute and verify against ADO (evidence shown).
3. Delivery: open a failed run in the Inspector — classification badge,
   decisive evidence, bounded logs; approve a rerun or Bug creation and
   watch it verify.
4. Work: My work with drift badges; approve a progress comment or state
   transition; re-read shows the new revision.
5. Settings: Built-in capabilities (identity, kill switch) and
   Diagnostics (correlation id, verified-loop telemetry).
6. Every write follows Proposal → Approval → Execution → Re-read →
   Verification; HTTP success is never verification.
