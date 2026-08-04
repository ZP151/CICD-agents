# Cycle 04 — Work Intelligence

Expected window: 3 weeks
Primary objective: **Keep Azure Boards work-item state aligned with actual delivery evidence.**

## Product Outcome

Developers and leads can identify work that is ready, blocked, stale, or out of
sync with code/PR/build reality, then apply an approved update to Azure Boards.
The product does not recreate the Kanban board or become a second planning
system.

## Baseline

- Time spent preparing daily/sprint progress updates.
- Percentage of active Work Items linked to branch/PR/build evidence.
- Merged/deployed items still in active states.
- Items with missing acceptance criteria or unresolved dependencies.
- User corrections to AI-generated descriptions/state suggestions.

## Scope

### 1. Work workspace

Views:

- My work.
- Ready for development.
- Blocked.
- Sprint risks.

All views are projections of ADO Work Items plus delivery evidence. The user can
open the canonical ADO item at any time.

### 2. ADO Work domain coverage

Add/verify adapters for:

- Authenticated user's work items.
- Iterations and current team iteration.
- Backlog items and work-item batch read.
- Fields, relations, comments, revisions.
- Create/update/comment/link and child-work actions.
- Team capacity read where available.

Load only Work/Work Item capability domains for these workflows.

### 3. Readiness and refinement

Deterministic checks:

- Required fields by work-item type/process.
- Owner, state, area, iteration, links, and dependency presence.
- Existing branch/PR/build/deployment evidence.
- Acceptance-criteria presence and structure.

Model proposals:

- Problem/value clarification.
- Scope and non-goals.
- Acceptance criteria.
- Test expectations.
- Technical considerations.
- Dependencies and risks.
- Child tasks.

The model does not invent business priority, estimates, or commitments. It can
highlight missing information and ask the user.

### 4. Work-item drift detector

Supported initial cases:

- PR merged but item remains in an early active state.
- CI repeatedly failing with no item comment/blocker.
- Item marked done but linked PR/build is incomplete.
- Item active without delivery evidence beyond an agreed age.
- Acceptance criteria materially disagree with linked change, reported as a
  review question rather than fact.
- Child work crosses iterations unexpectedly.

Each case lists deterministic evidence and a proposed follow-up. No global
health score.

### 5. My Work Brief

A concise action list:

- What changed since the previous brief.
- What is blocked and why.
- What needs the authenticated user's action.
- What can be safely updated in ADO.

It is generated on demand or from fresh events; it is not a daily spam report.

### 6. Write-back

Supported actions:

- Update approved fields.
- Add progress/blocker comment.
- Create child Bug/Task.
- Link PR, commit, build, or related item.
- Transition state only when the user selects the target and the revision still
  matches.

Priority, business value, estimates, and cross-team iteration changes use
critical confirmation or remain unsupported during this cycle.

## Required Deletions/Avoidance

- No cloned Boards, Backlog, Sprint, Query, or Delivery Plan editor.
- No AI-generated project health score.
- No automatic prioritization.
- No Work Item copy stored as independent MergePilot state.
- No daily summary that lacks a concrete changed fact or next action.

## Evaluation Set

At least 20 items across:

- Ready and well-specified.
- Missing acceptance criteria.
- Duplicate/related items.
- Explicit dependency/blocker.
- PR open/merged.
- CI failing/succeeded.
- Incorrect completed state.
- Stale item.
- Multi-sprint parent/child.
- Custom process fields and permission limits.

## Tests

- Process-specific field handling.
- Work-item revision concurrency.
- Relation/link idempotency.
- Drift detector truth cases and false-positive controls.
- Generated content diff and user edit preservation.
- Batch/paging and capability-scope errors.
- ADO write verification.
- My Work respects authenticated identity and team/iteration context.

## Metrics

- Traceability coverage.
- Confirmed drift findings.
- Refinement accept/edit/reject.
- Time to prepare progress update.
- Wrong state/priority recommendation.
- Verified Work Item update loops.

## Demo

1. Open My work for the fixture iteration.
2. Identify one item blocked by CI and one merged item still active.
3. Refine one under-specified item.
4. Approve a blocker comment and a safe state/link update.
5. Re-read ADO and show new revisions and links.

## Non-goals

- Portfolio planning.
- Full capacity/sprint planning UI.
- Bulk reprioritization.
- Automated estimates.
- Cross-organization work tracking.

## Exit Evidence

- Real fixture proves read, propose, approve, update, and verify.
- At least one drift detector shows useful precision on pilot data.
- Users can always distinguish ADO facts from AI suggestions.
- The Work page remains materially simpler than Azure Boards.
