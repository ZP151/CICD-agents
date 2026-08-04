# Cycle 03 — Delivery Inbox, CI, And Test

Expected window: 3 weeks
Primary objective: **Reduce supported CI failure investigation and recovery time.**

## Product Outcome

A developer opens a failed run, receives a bounded evidence bundle and useful
classification, chooses the smallest appropriate next action, and sees the ADO
result verified. The product no longer responds to pipeline navigation by
injecting preloaded run history into chat.

## Baseline

For at least 15 historical or fixture failures record:

- Time to identify failing stage/job/task.
- Time to find decisive log lines.
- Page switches and searches.
- Final human root-cause class.
- Recovery action and time.
- Whether the failure was repeated/flaky.

## Scope

### 1. Delivery Inbox

Refactor current `apps/desktop/src/pages/Pipelines.tsx` into Delivery views:

- Needs attention.
- Runs.
- Tests.

Selecting a run opens a side Inspector with status, timeline, changes, linked
PR/work items, test summary, evidence, classification, and actions. `Analyze`
can start an Agent Turn, but the Inspector remains the artifact owner.

### 2. Failure evidence bundle

```ts
interface PipelineFailureEvidence {
  build: BuildRef;
  definition: { id: number; name: string; revision?: number };
  sourceVersion: string;
  timelineIssues: TimelineIssue[];
  logExcerpts: RedactedLogExcerpt[];
  changedCommits: CommitRef[];
  relatedPullRequests: PullRequestRef[];
  relatedWorkItems: WorkItemRef[];
  testSummary?: TestSummary;
  lastSuccessfulBuild?: BuildRef;
  repeatedSignatures: FailureSignature[];
  coverage: EvidenceCoverage;
}
```

Boundaries:

- Fetch targeted task logs, not entire builds.
- Redact secrets before persistence/model/UI.
- Store hashes and bounded excerpts with source links.
- If timeline/log access is unavailable, report missing evidence.

### 3. Classification

Classes:

- Code regression.
- Pipeline/YAML/configuration.
- Dependency/package/service.
- Agent/infrastructure.
- Permission/credential.
- Flaky test.
- Cancelled/user action.
- Unknown/insufficient evidence.

Deterministic detectors run before the model. The model synthesizes ambiguous
signals and must cite decisive evidence. Classification is evaluated against
the recorded human resolution, not the first error string.

### 4. Incident aggregation

- Generate a stable failure signature from definition/task/error/test and
  relevant normalized text.
- Group repeated runs without hiding distinct source commits.
- Show first seen, last seen, affected branches/PRs, and existing follow-up.
- Do not create a separate incident system; link/create an ADO Bug when the
  user chooses tracking.

### 5. Recovery actions

Supported typed actions:

- Rerun/retry supported pipeline scope.
- Open local validation Turn with exact command proposal.
- Create or update an ADO Bug linked to build/test/PR.
- Comment on linked PR or Work Item.
- Mark/unmark a test flaky where the ADO API and permission allow.
- Open in ADO for unsupported administrative action.

Every remote write or pipeline trigger is approved and verified.

### 6. Test quality projection

- Repeated failing tests.
- Flaky tests.
- Slow tests and duration regression where history exists.
- Tests likely related to the current code change.
- Missing published test evidence.

Do not build a full Test Plans manager.

## Required Deletions

- Pipeline button behavior that preloads run history into Chat.
- Raw unbounded log rendering.
- Duplicate result workspace for the same run analysis.
- Generic “Analyze pipeline” output without classification coverage/evidence.
- Project Link/pipeline defaults stored as workflow truth.

## Evaluation Fixtures

At minimum:

- Compile/typecheck failure caused by change.
- Unit test regression.
- Known flaky test that passes on rerun.
- Missing dependency/feed failure.
- Permission/service connection failure.
- Agent/infrastructure timeout.
- YAML syntax/configuration failure.
- User cancellation.
- Repeated identical failure on multiple runs.
- Failure with inaccessible logs.

## Tests

- Timeline/log paging, truncation, and redaction.
- Classification detector unit and model-eval cases.
- Failure-signature stability and collision handling.
- Rerun idempotency and build verification.
- Bug/comment/link write-back verification.
- Stale build/run state after refresh.
- Inspector accessibility and no automatic chat side effect.

## Metrics

- Failure-to-evidence and failure-to-classification P50/P95.
- Classification agreement with final human resolution.
- Failure-to-verified-next-action.
- Repeated incident aggregation precision.
- Wrong rerun/recovery recommendation rate.
- Log content/token volume per useful outcome.

## Demo

1. Open a failed fixture run from Needs attention.
2. Show concise evidence and classification.
3. Compare to last success and related PR.
4. Approve the recommended rerun or Bug creation.
5. Verify the new run or linked Bug in ADO.
6. Show a second identical failure joining the existing incident signature.

## Non-goals

- Pipeline designer/YAML editor.
- Full release/environment workflow.
- Arbitrary production remediation.
- Observability/APM replacement.
- General incident-management product.

## Exit Evidence

- Evaluation fixture coverage and classification results are recorded.
- Supported action verification passes in real ADO.
- No pipeline navigation path creates a chat message automatically.
- Time comparison shows whether the product outcome was achieved.
