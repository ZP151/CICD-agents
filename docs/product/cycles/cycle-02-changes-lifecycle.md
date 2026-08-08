# Cycle 02 — Changes Lifecycle

Expected window: 3 weeks
Primary objective: **Reduce PR preparation and review decision time without increasing low-value AI feedback.**

## Product Outcome

Authors and reviewers use one Changes workspace from PR creation through
incremental re-review and final decision. Review Queue, duplicate insight
types, and page-local AI result stores no longer define the workflow.

## Baseline

- Time to prepare required PR fields for five fixture changes.
- Time for a reviewer to explain intent, risk, tests, and policy state.
- Number of pages/artifacts opened.
- Current AI finding accept/edit/dismiss rate.
- Re-review time after a new push.
- Current duplicate PR insight and Review Queue records.

## Scope

### 1. Changes workspace

Primary desktop paths:

- Replace/reshape `apps/desktop/src/pages/PullRequests.tsx`.
- Consolidate `pages/pullRequests/` components.
- Remove `ReviewFindings.tsx` and `pages/reviewFindings/` after migration.

Views:

- Create PR.
- Authored by me.
- Needs my review.
- Waiting/blocked.
- All.

One Inspector contains brief, change map, findings, threads, policy/build/work
evidence, decision, and actions. It loads remote facts on demand and does not
preload chat.

### 2. Create PR product flow

Build on Cycle 01:

- Branch pair selection and exact commit range.
- Scope grouping and unrelated/generated-file detection.
- Required template/field completion.
- Local test evidence and missing-validation warning.
- Reviewer recommendation using ownership/policy/history where available.
- Draft/ready recommendation.
- Editable preview and exact create action.

The page never auto-pushes a branch or creates a PR. Missing upstream becomes a
separate approved action.

### 3. Canonical Review Assessment

Replace preview/run/stored insight/queue decision with:

```ts
interface ReviewAssessment {
  pr: PullRequestRef;
  generatedAt: number;
  coverage: ReviewCoverage;
  summary: string;
  changeMap: ChangeArea[];
  findings: ReviewFinding[];
  policyFacts: PolicyFact[];
  testFacts: TestFact[];
  recommendation: "approve" | "approve_with_suggestions" |
    "wait_for_author" | "reject" | "insufficient_evidence";
  missingEvidence: string[];
}
```

Rules:

- Maximum three high-value findings by default.
- Findings bind to file/line/commit or explicit artifact evidence.
- Style/nit comments are suppressed unless repository policy makes them
  consequential.
- Recommendation never becomes an ADO vote without approval.
- New PR revision marks the assessment stale.

### 4. Incremental re-review

- Persist last reviewed source commit and accepted/dismissed findings.
- Diff old reviewed commit to current source commit.
- Re-evaluate unresolved findings.
- Identify only new or materially changed risks.
- Invalidate draft comments or vote proposals based on old lines/revisions.

### 5. Your-turn projection

Derive attention from current ADO facts:

- Reviewer requested.
- Author replied to an unresolved thread.
- Source branch changed.
- Policy/build state changed.
- Vote became stale.
- Author must respond or update.

This projection lives in Changes filters and badges. It has no separate review
entity or persistence ownership.

### 6. Reviewer actions

Supported proposals:

- Create general or inline comment.
- Reply to thread.
- Resolve/reactivate thread.
- Add/remove reviewer where policy permits.
- Vote: approve, approve with suggestions, wait for author, reject, reset.

All publishing and votes require exact preview, critical/high approval as
classified, source-revision validation, and remote verification.

## Required Deletions

- Review Queue route/navigation/components/runtime.
- `auto_approved` product state and auto-vote assumptions.
- Generate insight versus automated review controls.
- Review-specific duplicate local history where canonical action/audit records
  provide equivalent evidence.
- Large AI content expanded inside PR list cards.

Historical adapters remain read-only until migrated records can open in the new
Inspector.

## Evaluation Set

At least 12 fixture PRs:

- Documentation-only.
- Small bug fix.
- Missing test.
- Cross-layer API change.
- Security-sensitive configuration.
- Generated/lock-file heavy.
- Large or mixed-scope.
- Policy failure.
- Existing unresolved threads.
- New commit after review.
- ADO permission limitation.
- Insufficient repository evidence.

Truth labels include decisive risks, non-issues, required tests, and expected
recommendation boundaries.

## Tests

- Assessment identity/freshness and replay.
- Incremental diff and line remapping.
- Finding accept/edit/dismiss persistence.
- Stale comment/vote prevention.
- ADO thread/vote verification.
- `Your turn` derivation without duplicate state.
- Keyboard navigation and evidence links.
- Historical PR insight migration.

## Metrics

- PR preparation time and field completeness.
- Reviewer orientation and decision time.
- Re-review time.
- Finding accept/edit/dismiss.
- Low-value comment rate.
- Stale action prevention.
- Human reversal of published action.

## Demo

1. Prepare and create a PR from two selected branches.
2. Open a seeded PR needing review.
3. Generate one Review Brief with evidence.
4. Accept/edit one finding and publish after approval.
5. Push a new fixture commit.
6. Show Your turn and incremental re-review.
7. Approve or wait for author and verify the ADO vote.

## Non-goals

- Merge queue or stacked PR workflow.
- Automatic vote/merge.
- Full code editor replacement.
- General static analysis platform.
- Pipeline root-cause analysis beyond linked evidence.

## Exit Evidence

- New Changes workspace is the only active PR work surface.
- Review Queue runtime is deleted or disabled behind a dated migration adapter.
- Evaluation and real ADO fixture meet agreed usefulness/safety thresholds.
- Re-review proves new-commit handling without full duplicate output.
