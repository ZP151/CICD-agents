# MergePilot Working Rules

Companion to `AGENTS.md` (toolchain, sandbox policy). These are standing rules
agreed with the maintainer; the 2026-08-03 iteration goal references them so
the goal text can stay short.

## Standing mandate

- Continue the 2026-08-03 manual-testing iteration plan until every slice is
  implemented, verified, committed and pushed; do not stop after a single
  slice or at analysis.
- Authoritative docs:
  - `docs/manual-testing/2026-08-03/manual-test-findings.md` (problems MP-001..MP-016)
  - `docs/manual-testing/2026-08-03/iteration-plan.md` (slices P0-A..P2-C)
  - `docs/manual-testing/2026-08-03/regression-acceptance-matrix.md` (RA-001..RA-086)
  - `docs/manual-testing/2026-08-03/agent-mcp-reuse-architecture.md` (deep modules, MCP spec baseline)
  - `docs/third-party-source-reuse.md` (reuse registry; must be updated before adopting/porting any source)
- Slice order: P0-A → P1-A → P1-B → P1-C → P1-D → P2-A → P2-B → P2-C,
  then full RA regression, then real-ADO canary + controlled writeback.
- Each slice is one vertical cut: domain/interface, daemon/runtime, typed
  events, persistence, desktop UI, normal/failure/recovery tests, docs,
  migration, and a commit whose message carries the MP id (e.g.
  `fix(auth): add recoverable ADO OAuth flow (MP-001)`).

## Permission baseline (approved by maintainer)

Work freely, without asking, on anything in-scope:

- Read/create/modify/delete repo files in-scope; refactor code, schemas,
  configs, scripts, tests; delete superseded code that tests cover.
- Install/upgrade/remove dependencies after license/security review.
- Consult official docs, open-source repos, releases, licenses, advisories.
- Adopt/Port/vendor reviewed open-source code (update the reuse registry).
- Start daemon, desktop, mock servers, MCP servers, local services.
- Run unit/integration/E2E/typecheck/lint/build/package tests.
- Use the real Azure DevOps connector/OAuth/REST/MCP for reads and for
  controlled writes described below.
- Create test fixtures, databases, artifacts, branches, commits, PRs,
  Review Runs, Work Items.
- `git add/commit/fetch/rebase/push` on `claudecode/optimize-bugfix`;
  create and update Draft PRs; fix CI/review feedback/merge conflicts.

## Controlled production writes

Real ADO writes are allowed only for the workspace uniquely identified by the
current Git remote AND a matching Project Link. Every write must:

1. Resolve and record organisation/project/repository/resource ID.
2. Confirm target matches the current Project Link and Git remote.
3. Confirm no name ambiguity.
4. Pass schema validation.
5. Pass CapabilityRegistry and ActionPolicy.
6. Carry a stable callId and idempotency key.
7. Record a redacted summary in UI, event store and audit.
8. Read remote state after writing to verify.
9. Recover by type on failure; never blind-retry a mutation.
10. Only clean up temporary resources this goal created and recorded.

Allowed write types: OAuth login/refresh/re-auth; temp test branches;
Draft PRs, review threads, review votes; trigger/rerun/cancel of test
Pipeline runs created or explicitly selected by this goal; test Work Items;
Review Run / Review Queue / Project Link / session metadata; native ADO or
MCP equivalent operations; real integration tests of failure, timeout,
auth-expiry, duplicate and recovery paths.

## Preflight rule

Before any production write, check: Git remote; current Project Link; ADO
org/project/repo; connector type; OAuth identity validity; Pipeline/PR/WI
targets; write types planned. Report one short line in progress notes.

STOP that write (continue other local work) when: org/project/repo cannot be
resolved uniquely; OAuth identity mismatches the target; same-name resources
cannot be disambiguated; the target is another org or not part of the current
workspace; the operation touches existing user resources not selected by this
goal; idempotency cannot be confirmed; no audit/recovery path exists.

## Test resource naming (for real verification)

- Branch: `claudecode/test-<issue-id>-<short-id>`
- Draft PR: `[MergePilot E2E] <issue-id> <short-id>`
- Work Item: `[MergePilot E2E] <issue-id> <short-id>`
- Pipeline run comment/tag: `mergepilot-e2e:<issue-id>:<short-id>`
- Ledger: `docs/manual-testing/2026-08-03/production-verification-ledger.md`
  (redacted; never store tokens, emails, internal URLs, full payloads, PII).
- Only delete resources recorded in the ledger with IDs; no wildcard cleanup.

## Never do

- Delete ADO org/project/repository; delete or rewrite long-lived branches;
  force push; modify branch protection/required reviewers/security policy;
  modify users/teams/permissions/service connections/billing.
- Create/export/rotate/delete production secrets, PATs, OAuth client secrets;
  read or print real tokens, passwords, cookies, private keys.
- Delete existing Pipeline definitions; delete WIs/PRs/comments/artifacts/runs
  not owned by this goal; complete/merge/abandon business PRs; approve or
  request changes on non-test PRs.
- Modify production deployment variables, environment approvals, release
  gates; deploy to production services; `git reset --hard`, `git clean -fd`,
  discard user modifications, rewrite history.
- If a real blocker appears (external permission, target ambiguity, safety
  boundary, product decision), stop that item, report target/impact/rollback/
  needed authorization, and continue unaffected work.

## Quality rules

- One vertical slice at a time; verify before moving on.
- Fix test failures at the root; never delete tests, relax key assertions,
  add arbitrary sleeps, or skip typecheck to force green.
- Reuse before building: MCP SDK v1.x, Azure DevOps MCP, OpenHarness patterns,
  PR-Agent logic, assistant-ui, Radix, Tiptap, CodeMirror; check license,
  version/commit, maintenance, compatibility, security, adapter boundary,
  contract tests, rollback path; update `docs/third-party-source-reuse.md`.
- No string matching on error messages as a source of truth; typed failures
  with recovery actions; distinct types for Stop/timeout/authorization/
  ambiguity/connector failure/internal abort.
- All tool calls carry a stable callId; Chat, step panel, Activity and
  persistence read the same typed execution event source.
- Never use or copy credentials, accounts, internal addresses, UUIDs,
  avatars, or local paths from the original test material; use placeholder
  values (`example-org`, `***REDACTED***`).
- No production ADO mutation without mock/fixture isolation first.
- Docs must match the final implementation; do not fabricate completion.
- Report short progress only: issue ID, current slice, verification result,
  canary status, commit/PR, next step.
