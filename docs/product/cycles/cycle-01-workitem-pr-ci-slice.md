# Cycle 01 — Work Item To PR To CI Vertical Slice

Expected window: 3 weeks
Primary objective: **Prove one complete Work Item → PR → CI → verified ADO write-back loop.**

## Why This Cycle Comes First

This is the smallest workflow that proves MergePilot is more than a chat
client, PR reviewer, or pipeline viewer. It requires local repository context,
Boards, Repos, Pipelines, approval, write-back, and verification without
building complete Work, Changes, and Delivery pages.

## User Scenario

Starting state:

- An isolated ADO project contains one active Work Item.
- The Project Link maps to a local fixture repository.
- The developer has a feature branch with a small valid change and tests.
- A YAML CI pipeline is configured for PR validation.

Goal:

> Prepare a pull request for Work Item 101 from the current branch to main,
> verify its scope and tests, create it after my approval, then follow the first
> CI result and update the work item with the verified outcome.

## Outcome Gate

The user completes the scenario without manually copying fields or links into
ADO. The Work Item, PR, and Build can be traversed through canonical artifact
edges, every write is approved, and the final Work Item revision proves the
outcome.

## Scope

### 1. Minimal delivery artifact graph

Implement:

- `WorkItemRef` with revision.
- `CommitRef` and branch object ID.
- `PullRequestRef` with source commit and iteration.
- `BuildRef`.
- Edges: `implements`, `contains_commit`, `proposed_by`, `validated_by`,
  `built_by`, `followed_up_by`.
- Snapshot store and freshness invalidation.

Do not generalize to environments or tests beyond data attached to the current
build.

### 2. Work Item reader and writer

Current gap: the local internal ADO manifest links Work Items to PRs but does
not provide the complete Work Item read/create/update surface required here.

Implementation:

- Port/adapt the minimum Work Item reader/update/comment/link behavior from the
  vendored Azure DevOps MCP source or official REST client.
- Keep it behind local `WorkItemReader` and `WorkItemWriter` interfaces.
- Read fields, relations, revision, comments needed for the scenario.
- Write only the approved comment/field/link changes.
- Verify by re-reading the next revision.

### 3. PR preparation bundle

Deterministic inputs:

- Project Link repository mapping.
- Current branch and upstream presence.
- Target branch object ID.
- Merge-base and commit range.
- Changed files and diff stats.
- Local validation commands/results.
- Work Item title, description, acceptance criteria, and relations.
- Required PR template and branch policies when available.

Model output:

- Editable title and description.
- Summary, motivation, test evidence, risks, rollback, and reviewer focus.
- Missing evidence and draft/ready recommendation.

The model cannot choose a different source/target branch without a new explicit
proposal.

### 4. Create PR action

`ProposedAction<CreatePullRequestPayload>` includes:

- Exact repository ID.
- Source and target refs/object IDs.
- Title, description, draft state.
- Work Item link.
- Suggested reviewers only if explicitly selected by the user.
- Expected result predicates.

Verification:

- One PR exists for the intended source/target and correlation.
- Title/description/draft match.
- Work Item relation is present.
- Source commit matches the approved proposal.

### 5. CI observation and follow-up

- Observe PR policy/build relationship through hook or bounded polling.
- Read build status, timeline, failing task, bounded logs, and published test
  summary if the run fails.
- For success, propose a concise Work Item progress comment/link update.
- For failure, produce evidence and propose exactly one of: rerun, local
  validation, create Bug, or record blocked progress.
- The cycle does not need broad failure classification; only deterministic
  fixture success and one fixture failure class.

### 6. User experience

Use Agent as the temporary orchestration surface:

- Working narrative explains current evidence and next action.
- Actual Git/ADO calls appear in tool groups.
- PR proposal is a structured approval block.
- PR and Build appear as artifact links.
- Final result states exactly what ADO revision/run proves.

Do not build the final Work, Changes, or Delivery pages in this cycle.

## API And Event Additions

Proposed daemon endpoints or equivalent internal services:

```text
GET  /project-links/:id/work-items/:workItemId
POST /delivery/actions
POST /delivery/actions/:id/approve
GET  /delivery/actions/:id
GET  /delivery/artifacts/:kind/:id
```

SSE events reference action and artifact IDs rather than embedding full remote
payloads.

## Tests

- Work Item revision concurrency and verification.
- Merge-base and source/target branch identity.
- PR creation idempotency after timeout/retry.
- PR source changes between proposal and approval.
- Work Item link and comment verification.
- Build success and fixture failure observation.
- Auth scope insufficient for Work Item write.
- Restart during PR verification.
- Redaction of Work Item, build log, and model content.

## Demo Fixtures

Fixture A: passing PR validation.

- Create PR.
- Build succeeds.
- Work Item receives verified progress update.

Fixture B: deterministic test failure.

- Create PR or use seeded PR.
- CI fails a named test.
- Evidence identifies the task/test.
- User approves creating/linking a Bug or blocked comment.
- Remote artifacts are verified.

## Metrics

- Manual versus assisted task duration.
- Page/context switches.
- Duplicate write count.
- User edits to generated PR fields.
- Time from PR creation to CI evidence.
- Verified-loop completion/abandonment.

## Non-goals

- Reviewer vote or automated review.
- General CI root-cause classification.
- Full Boards or Pull Requests UI.
- Work Item prioritization or sprint planning.
- Environment/deployment evidence.

## Exit Evidence

- Both fixtures complete through the installed desktop and local daemon.
- Artifact graph can traverse Work Item ↔ PR ↔ Build.
- ADO re-read proves each write exactly once.
- User-approved payload and final remote payload are diffable.
- No manual ADO edit is needed to complete the expected loop.
