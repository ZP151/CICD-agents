# Cycle 01 Acceptance Evidence (2026-08-05)

Primary objective: **Prove one complete Work Item → PR → CI → verified ADO
write-back loop.**

## Outcome gate

The user completes the scenario without manually copying fields or links into
ADO. The Work Item, PR, and Build can be traversed through canonical artifact
edges, every write is approved, and the final Work Item revision proves the
outcome.

**Result: achieved.** Real ADO on TeBS-ClaimBot / ClaimBot_API (Project Link
`eb2f6c876f53b33d`). All writes went through `POST /delivery/actions` →
`approve` → execute → re-read → verify (the same DeliveryActionRuntime the
chat tool uses).

## Fixture A — passing PR validation loop

| Step | Action record | Status | ADO evidence |
| --- | --- | --- | --- |
| PR create | act-1hrkgtx | verified | PR #2801 (`mergepilot-e2e/cycle01-fixture-1785878322` → main), WI-7913 linked; verification: exists + title match + relation present |
| CI trigger | act-92i10t | verified | Pipeline #117 run 4833 visible with source commit `f1ddd07…` (run_visible) |
| Work Item write-back | act-10b2mgz | verified | WI-7913 revision 6 → 7; comment contains "PR #2801 created" (revision_gt + comment_contains) |

Audit trails: `awaiting_approval → approved → executed → verified` on every
record (see `GET /delivery/actions/<id>`).

## Fixture B — deterministic failure class

| Step | Action record | Status | ADO evidence |
| --- | --- | --- | --- |
| Failing change trigger | act-1lljl2v | verified | Pipeline #117 run 4832 visible for `mergepilot-e2e/cycle01-fail-1785878302` (commit `160a517…` contains a deterministic compile error) |
| (Follow-up Bug creation is available via `work_item.create`, exercised in transport tests) | | | |

## Safety evidence captured during the run

- **Duplicate PR refused**: a second `pull_request.create` for the same
  source/target pair failed with ADO TF401179 instead of creating a second
  PR — exactly-once holds at the ADO layer too.
- **Stale write-back refused**: a write-back proposed against WI revision 1
  while ADO was at revision 3 was denied by the policy (`target revision
  moved (proposed 1, current 3)`) and never executed.
- **Verification predicates required**: proposals without expectedResult are
  refused; the tool now derives kind-appropriate default predicates, so a
  write can never be declared complete without a re-read.

## Artifact graph (MP-GRAPH-001/002)

`packages/core/src/delivery/` now contains artifactRef, observations,
deliveryEdges (fact vs derived), snapshotStore (SQLite), and the action
runtime. `GET /delivery/artifacts/:kind/:id` exposes canonical reads:
`work_item` (revision/fields/relations/comments), `pull_request`
(title/status/WI relations/source commit), `build` (status/result/branch/
sourceVersion), `branch` (object id).

## Tests

- core: 389+ passed — graph store, transport (comment exactly once, PR
  create + relation verification, snapshot recording), runtime retry /
  target resolution / staleness / recovery.
- daemon: delivery routes incl. artifact reads; chatSse.
- desktop: canonical dispatch, navigation, context ownership suites.

## Files

- Evidence: `cycle01-evidence.json` (this directory).
- Transcripts: `cycle01-e2e-transcript.jsonl` (chat-driven attempts).
- Pipeline runs: 4830/4831/4832 (failure fixture), 4833 (passing fixture).

## Remaining notes

- The pipeline run outcomes were observed via the build artifact read;
  failure evidence bundling (timeline + bounded logs) and recovery actions
  (rerun / Bug creation / blocked comment) are implemented in the transport
  and exercised in unit tests; the failure-class E2E follow-up lands in
  Cycle 03's evaluation fixtures per the roadmap.
- Cleanup of fixture branches/PRs/WIs is recorded in the goal ledger.
