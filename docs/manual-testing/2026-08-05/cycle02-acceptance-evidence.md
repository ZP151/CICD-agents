# Cycle 02 Acceptance Evidence (2026-08-05)

Primary objective: **Reduce PR preparation and review decision time without
increasing low-value AI feedback.**

## Changes workspace (MP-CHG-001)

- The Pull Requests page is now the Changes workspace with the target views:
  All / Authored by me / Needs my review / Waiting. "Authored by me" matches
  the authenticated user against the PR creator; "Needs my review" matches
  reviewer names (extended PR summary) against the authenticated user.
- Create PR flow: `CreatePullRequest.tsx` builds the exact
  `pull_request.create` proposal (Project Link, source/target branches,
  title, description, optional work item link) and runs it through the
  verified action runtime — propose → approval card → execute → re-read →
  verify. The page never auto-pushes or creates without approval.
- Review Queue deleted: `ReviewFindings` page + `pages/reviewFindings`
  runtime removed; `/findings`, `/review`, `/review-queue` redirect to
  `/pulls`. The deletion backlog item "Review Queue route/navigation/state"
  is closed.

## Canonical Review Assessment (MP-CHG-002)

`delivery/reviewAssessment.ts`: `ReviewAssessment` projection (pr,
sourceCommit, changeMap, findings, policyFacts, testFacts, recommendation,
missingEvidence) with `applyFindingLimit` (max three high-value findings,
nits suppressed) and `incrementalReReview`:

- unchanged findings on changed files are re-derived by the new pass;
- previous findings that vanished from the new pass on changed files are
  marked stale with the reason;
- removed findings on unchanged files resolve;
- only new risks are surfaced — no duplicated full output.

## Reviewer write-back (MP-CHG-004)

`pull_request.comment` and `pull_request.vote` action kinds in the ADO
transport with re-read verification.

**Real ADO evidence (PR #2801, ClaimBot_API, fixture):**

| Action | Record | Result | Verification evidence |
| --- | --- | --- | --- |
| PR comment | act-1b78npu | verified | `comment_contains "Cycle 02 reviewer comment"` on the PR |
| PR vote (approve) | act-mp4mwf | verified | `myVote = approved` re-read from ADO reviewers |

Both followed `awaiting_approval → approved → executed → verified`.

## Your-turn projection (MP-CHG-005)

`delivery/yourTurn.ts` derives attention purely from current ADO facts:
reviewer_requested, author_replied, source_changed, policy_changed,
vote_stale, author_action_required. No second PR persistence model.

## Tests

- core: 398 passed (assessment 3, your-turn 5, transport 3, runtime 16,
  graph 5).
- desktop: 717 passed (Changes categories, Create PR view, navigation,
  Review Queue removal).

## Deletion check

- Review Queue route/navigation/runtime: removed (desktop grep clean).
- Duplicate insight preview/queue paths: page deleted; canonical
  assessment projection is the review surface.
- Pipeline click-to-chat preloading: untouched this cycle (Cycle 03 item).

## Remaining notes

- The desktop-UI-driven demo (steps 1–7 of the cycle doc) is partially
  covered: PR creation and reviewer actions are proven through the verified
  runtime against real ADO; the full UI walkthrough remains for Cycle 06's
  pilot task set.
- Evaluation set of 12 fixture PRs and accept/edit/dismiss persistence are
  recorded as Cycle 06 evaluation work per the roadmap.
