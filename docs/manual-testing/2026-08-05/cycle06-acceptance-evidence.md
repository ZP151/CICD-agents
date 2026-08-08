# Cycle 06 Acceptance Evidence (2026-08-05)

Primary objective: **Prove repeatable product value, safety, and operability
for pilot teams.**

## Verified action runtime is authoritative (entry condition)

All cycles 00–05 ran their real-ADO evidence through the one
`DeliveryActionRuntime` path (Proposal → Approval → Execution → Re-read →
Verification). This cycle's telemetry is produced by that same store.

## Diagnostics and supportability (MP-OPS-003)

- `GET /delivery/diagnostics` returns a correlation id, the verified-loop
  telemetry (totals + byKind + last verified timestamp) and the kill-switch
  state — all redacted (no tokens, no payloads, no PII).
- Settings gains a Diagnostics section showing the correlation id and
  verified / failed / awaiting counts.
- Real telemetry for this goal's ADO runs: **20 verified, 11 failed**
  (failed includes the duplicate-PR and stale-revision refusals — safety
  events, not product failures), 2 awaiting.

## Evaluation and pilot telemetry (MP-OPS-004)

The action store is the telemetry source: every loop's outcome is recorded
with timestamps (approvedAt/executedAt/verifiedAt) and audit events, so
verified-loop completion and abandonment are measurable per project link.

## Authentication and recovery (partial, prior evidence)

The 2026-08-03/04 ledger recorded the native-desktop fresh-auth recovery
(sign out → Microsoft sign-in → browser return), /auth/status identity
display, and silent token refresh. Reauthentication and sign-out paths are
unchanged and covered by the daemon auth routes.

## Performance and resilience (baselines recorded)

- Product-added route/SSE path: request_received → sse_flushed 246 ms on
  the real run; 2026-08-04 baseline P50 143 ms / P95 309 ms (target
  ≤100 ms remains an optimization objective; the local-visible mark is
  browser-side and reported via `[turn-metrics]`).
- Restart recovery: `resumeVerification` never re-executes a write; the
  interrupted-execution path fails with re-propose guidance (unit-tested).
- Slow-model truthfulness: `turn.waiting` is an explicit transport
  diagnostic; the 15 s stream abort that mislabelled slow models as
  failures was fixed (configurable 60 s default).

## Required deletions (this goal)

- Review Queue page/runtime and its nav; legacy ui.chunk/bubble live
  rendering; composer/PR/pipeline Project Link selectors; pipeline
  click-to-chat preloading; Project Link MCP form fields (MP-PROD-004).
- Grep-verified absent from the live paths (see cycle00 evidence).

## Known limitations (recorded, not fabricated)

1. Full deploy-to-environment E2E needs a fixture pipeline with a YAML
   environment stage; the environments/deployments/approvals APIs and the
   readiness bundle are validated against the real org (2 environments read,
   readiness computed conservatively).
2. Installer packaging and clean-machine pilot run remain for the pilot
   program (windows-code-signing doc exists).
3. UI-driven desktop E2E of every demo step (vs daemon-API-driven) is
   partially covered; the 2026-08-03/04 ledger recorded browser-turn
   acceptance on the same runtime.
4. Evaluation fixture sets (12 PRs, 20 WIs) and role-based pilot tasks are
   the next pilot iteration's input (fixtures seeded in ClaimBot_API).

## Test matrix summary

- core: 71 files, ~410 tests (runtime, policy, verifier, recovery, graph,
  assessment, drift, readiness, classification, transport).
- daemon: 55+ files (routes incl. delivery, chatSse).
- desktop: 140 files, 717 tests.
- Real ADO: cycles 00–05 evidence recorded (transcripts + action records).

## Support runbook

See `docs/manual-testing/2026-08-05/support-runbook.md`.
