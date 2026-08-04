# Implementation Backlog

Status: Canonical issue source
Rule: Backlog order follows the outcome roadmap, not component ownership.

## Issue Shape

Every implementation issue must contain:

- User outcome.
- Artifact revisions involved.
- Deterministic facts versus model responsibilities.
- Proposed API/event changes.
- Read/write permissions.
- Approval and verification behavior.
- Migration/removal impact.
- Automated tests and real ADO fixture evidence.
- Explicit non-goals.

## Epic 0 — Product Simplification

Outcome: users encounter one coherent workbench rather than duplicated ADO
views.

### MP-PROD-001 Canonical navigation

- Change desktop navigation to Agent, Work, Changes, Delivery, Settings.
- Redirect old routes with a temporary migration notice.
- Remove Review Queue and Activity from primary navigation.
- Acceptance: no user goal requires choosing between Pull Requests and Review
  Queue or between Chat output and Activity artifact.

### MP-PROD-002 Context ownership

- Make Context the only runtime Project Link selector.
- Remove Project Link selectors from composer, PR, pipeline, and review pages.
- Remove changes/ahead/behind from Context.
- Move create/edit into a Context sheet.
- Migrate Project Link writes to stable identity fields only.

### MP-PROD-003 Built-in capabilities settings

- Present Azure DevOps and Web Research as product capabilities.
- Show auth identity, scope, health, last verification, reauthenticate, and
  disconnect.
- Remove install/register/catalog terminology and Project Link MCP flags.

### MP-PROD-004 Delete duplicate insight paths

- Replace insight preview, automated review, stored insight, and Review Queue
  decision paths with a canonical `ReviewAssessment` projection.
- Preserve historical records through an adapter until migration is verified.

## Epic 1 — Canonical Turn And Action Runtime

Outcome: every supported workflow is observable, approval-safe, resumable, and
verifiable.

### MP-RUN-001 Finish canonical Turn timeline

- One writer for `turnId + sequence` events.
- Narrative, tool groups, approvals, artifacts, final, and terminal state.
- Remove legacy direct rendering after replay parity.

### MP-RUN-002 ProposedAction persistence

- Add typed action, source revisions, payload, risk, expected result,
  idempotency, expiry, and status.
- Persist before requesting approval.

### MP-RUN-003 Action verification

- Add per-action verification predicates and retry/timeout behavior.
- Distinguish executed, verified, stale, contradicted, and failed.

### MP-RUN-004 Recovery and cancellation

- Resume verification after restart.
- Never re-execute a mutation during recovery.
- Cancel model/tool work and preserve terminal audit.

### MP-RUN-005 Latency instrumentation

- Record client, daemon, provider, tool, remote-write, and verification spans.
- Report P50/P95 without using Azure TTFT as a hard blocker.

## Epic 2 — Delivery Artifact Graph

Outcome: Work, Changes, and Delivery read the same revisioned facts.

### MP-GRAPH-001 Artifact identity and snapshot store

- Implement `ArtifactRef`, observations, snapshot metadata, and freshness.
- Start with Work Item, PR, Commit, and Build.

### MP-GRAPH-002 Relationship projection

- Link Work Item ↔ branch/commit/PR ↔ build.
- Record source and evidence URL for every edge.
- Keep derived edges distinct from ADO facts.

### MP-GRAPH-003 Service Hook intake

- Validate hook authenticity.
- Dedupe by event and revision.
- Re-read artifact after the event.
- Fall back to explicit refresh/polling.

### MP-GRAPH-004 Artifact adapters

- Map existing PR insight, pipeline artifact, review history, and workflow
  records to canonical identities.
- Add replay/parity tests before deleting old stores.

## Epic 3 — First Vertical Slice

Outcome: one Work Item → PR → CI workflow closes in ADO.

### MP-SLICE-001 Work Item read/refine

- Read exact revision, relations, acceptance criteria, and iteration.
- Produce editable refinement without changing priority automatically.

### MP-SLICE-002 PR preparation

- Compute merge-base, commits, changed files, local validation, and push state.
- Generate title, description, risks, tests, work-item links, and reviewers.

### MP-SLICE-003 Create and verify PR

- Preview exact source/target and fields.
- Create once, find remote PR, and verify links/reviewers/status.

### MP-SLICE-004 CI follow-up

- Observe policy build/run.
- On failure, collect timeline and bounded log evidence.
- Propose rerun, local validation, or Bug creation.

### MP-SLICE-005 Work Item progress write-back

- Draft and approve a progress comment/link/state update.
- Verify new Work Item revision and relations.

## Epic 4 — Changes Workspace

Outcome: authors and reviewers spend less time preparing and re-orienting.

### MP-CHG-001 Changes views and Inspector

- Create PR, Authored by me, Needs my review, Waiting/blocked, All.
- One Inspector for brief, evidence, threads, policies, decision, and actions.

### MP-CHG-002 Versioned Review Brief

- Bind to PR source commit, iteration, policy snapshot, and coverage.
- Maximum three prioritized findings by default.
- Persist accepted/edited/dismissed feedback.

### MP-CHG-003 Incremental re-review

- Compare last-reviewed source commit to current.
- Re-evaluate previous findings and identify new risk.
- Invalidate stale actions/votes.

### MP-CHG-004 Reviewer write-back

- Draft comments and thread status changes.
- Support ADO votes behind critical approval.
- Verify visible ADO reviewer/thread state.

### MP-CHG-005 Your-turn projection

- Derive attention from reviewer request, author reply, new push, CI/policy
  change, and stale vote.
- Do not create another PR persistence model.

## Epic 5 — Delivery CI And Test

Outcome: supported failures reach a trusted next action faster.

### MP-DEL-001 Delivery Inbox

- Needs attention, Runs, Tests.
- Open Inspector without generating a chat message.

### MP-DEL-002 Failure evidence bundle

- Task/timeline, bounded logs, changed commits/files, related PR/work items,
  last success, and tests.

### MP-DEL-003 Failure classification

- Deterministic patterns first, model synthesis second.
- Code, pipeline/config, dependency, infra/agent, permission, flaky, unknown.
- Confidence, decisive evidence, missing evidence.

### MP-DEL-004 Recovery actions

- Retry/rerun, local validation, open fix Turn, create Bug, comment on PR/work
  item.
- Verify run or artifact after action.

### MP-DEL-005 Test quality

- Repeated failure, flaky, slow, and change-related test projections.
- Mark/unmark flaky and Bug linkage behind approval.

## Epic 6 — Work Intelligence

Outcome: ADO work state reflects delivery reality.

### MP-WORK-001 My Work

- Current iteration and authenticated-user items.
- Related PR/build/blocker projection.

### MP-WORK-002 Refinement and readiness

- Problem, scope, non-goals, acceptance criteria, tests, dependencies, risks,
  and child-work proposals.

### MP-WORK-003 Work-item drift detector

- Merged/deployed but active.
- Active with no recent evidence.
- PR/build blocked without work-item update.
- Relationship or acceptance-criteria mismatch.

### MP-WORK-004 Sprint risk

- Capacity, unfinished work, dependencies, review/CI wait, and delivery history.
- Exceptions and actions only; no generic health score.

### MP-WORK-005 Work write-back

- Comments, fields, relations, child items, and state transitions with revision
  checks and verification.

## Epic 7 — Deployment Readiness

Outcome: release owners make current, evidence-backed deployment decisions.

### MP-CD-001 Environment and deployment identities

- Add environment/deployment snapshots and graph edges.

### MP-CD-002 Readiness detector

- Pending commits/work items, CI/tests, approvals/checks, incidents, and locks.

### MP-CD-003 Last-good comparison

- Compare deployed artifact, commits, work items, and relevant configuration.

### MP-CD-004 Controlled CD actions

- Approval, retry, redeploy, cancel, and supported rollback path.
- Critical confirmation and verification.

### MP-CD-005 Deployment outcome write-back

- Update linked work and incident records with verified deployment evidence.

## Epic 8 — Pilot And Product Operations

Outcome: product value and safety can be proven repeatedly.

### MP-OPS-001 Isolated ADO fixture

- Seed work items, repositories, PRs, policies, pipelines, tests, and
  environments with deterministic scenarios.

### MP-OPS-002 Evaluation suite

- Domain truth labels, action expectations, stale-state tests, and model
  comparisons.

### MP-OPS-003 Diagnostics and support

- Correlation IDs, redacted export, auth/runtime/capability checks, and runbook.

### MP-OPS-004 Product telemetry

- Verified loops, latency spans, action outcomes, feedback, and retention.

### MP-OPS-005 Pilot onboarding

- Microsoft sign-in, Context/Project Link, permission explanation, read-only
  first run, sample workflows, and exit survey.

## Deletion Backlog

Deletion is planned product work, not cleanup after feature completion:

- Review Queue route, navigation, state, and duplicate review history.
- Duplicate PR insight preview/run/artifact projections.
- Activity primary navigation and duplicate detail panels.
- Composer and page-level Project Link selectors.
- Project Link pipeline/MCP/branch workflow fields after migration.
- Pipeline click-to-chat preloading.
- Legacy Bubble/ExecutionLog rendering after canonical Turn parity.
- Prompt-only action safety paths.

## Definition Of Done For An Epic

- Outcome metric and baseline exist.
- New path is used by the real desktop workflow.
- Old path is deleted or has an explicit dated compatibility exit.
- Unit, contract, replay, failure, and accessibility tests pass.
- Real isolated ADO fixture proves required read/write/verification behavior.
- Permissions and data retention are documented.
- Telemetry can distinguish success, stale, rejection, failure, and
  abandonment.
- Product and engineering owners sign off on evidence, not percentage complete.
