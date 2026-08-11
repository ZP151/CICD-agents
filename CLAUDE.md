# MergePilot Working Rules

Companion to `AGENTS.md`. These are the standing rules for Claude Code and
other terminal-based executors working on the active MergePilot v1 Goal.

## Product authority

- Start at `docs/product/README.md`. It and the documents it references are the
  only authoritative product route.
- Execute Cycle 00–06 in the order and with the completion evidence defined by
  those documents. Historical manual-test plans are evidence, not scope.
- The active execution plan is
  `docs/product/v1-productization-iteration.md`; current drift and open gates
  are recorded in `docs/product/next-iteration-known-gaps.md`.
- Azure DevOps is the remote source of truth. MergePilot is a local-first
  reasoning, governance and verified-action layer, not an ADO portal clone or
  a general coding agent.

## Active branch and fixture

- Work only on `claudecode/mergepilot-v1` unless the maintainer explicitly
  changes the Goal.
- Push verified checkpoints to both
  `origin/claudecode/mergepilot-v1` and
  `ado/claudecode/mergepilot-v1`, then prove both remote SHAs match local HEAD.
- Never delete, rename, rewrite, force-push, merge, or directly push any remote
  `main` branch.
- ClaimBot_API is the isolated mutable product fixture. Test branches use the
  `mergepilot-e2e/` prefix and test resources use the
  `[MergePilot Fixture]` marker.
- Only touch fixture resources created or explicitly selected by the active
  Goal. Record their IDs before mutation; never use wildcard cleanup.

## Execution discipline

- Work in reversible vertical slices. Each completed slice includes source,
  focused tests, evidence, a meaningful commit and both non-main pushes.
- Preserve existing and uncommitted user work. Never use `git reset --hard`,
  `git clean`, checkout-based discard, or history rewriting.
- Use the repository-local Node/pnpm toolchain exactly as described in
  `AGENTS.md`.
- Fix root causes. Do not delete tests, weaken acceptance assertions, add
  arbitrary sleeps, ignore type errors, or count a skip as a pass.
- Model prose and screenshots are never execution evidence. Structured events,
  ActionRecords, persisted state, process/artifact identity and authoritative
  ADO re-read are evidence.
- Do not promote historical PASS records to the current SHA. Generated gate
  projections are written only by the verification runner.

## Text-only model verification

The active Claude Code model may be non-multimodal.

- Do not require it to interpret screenshots or judge visual similarity.
- Drive source UI with Playwright role/label/test-id locators and assert DOM,
  accessibility state, event order, network requests and persisted records.
- Installed-desktop acceptance must exercise the installed executable and its
  installed sidecar through a deterministic text-observable UI or accessibility
  harness. A daemon-only REST test does not prove the installed UI path.
- Screenshots may be captured for later human review, but PASS must come from
  deterministic assertions. Record irreducibly aesthetic checks as human
  review items instead of fabricating a result.
- Accept English input and output by default. Test typed semantics and event
  structure, not exact language-specific model wording.

## Canonical action boundary

Every real mutation must follow:

`Typed ActionRecord → Preview → Approval → Execution → ADO Re-read → Verification`

Before a real ADO write:

1. Resolve and record organisation, project, repository and resource ID.
2. Prove the target matches both the active Project Link and Git remote.
3. Reject ambiguous names or identities.
4. Validate the typed payload and ActionPolicy decision.
5. Use a stable call ID and idempotency key.
6. Ensure the UI/event/audit path stores only a redacted summary.
7. Execute only after explicit approval.
8. Re-read ADO and verify the intended state.
9. Recover by typed failure; never blindly retry a mutation.
10. Clean up only Goal-created resources whose IDs were recorded.

Allowed scoped writes include fixture branches, Draft PRs, review threads or
votes, test Work Items, explicitly selected test pipeline runs, and the
Project Link/session metadata needed for the acceptance path.

Stop only the affected write when identity, permission, ownership,
idempotency, audit or recovery cannot be proved. Continue safe local work.

## Credentials and security

- Never read, print, persist, commit or ask the user to paste real tokens,
  passwords, cookies, client secrets, private keys or credential-cache payloads.
- Use the existing local OAuth/configuration boundary. Evidence may record
  provider/deployment labels, status and counts, but not secrets, identities or
  internal credential references.
- Never modify organisation permissions, branch protections, users, teams,
  service connections, variable groups, billing, Key Vault contents or
  production deployment controls.
- Never approve, merge, abandon, comment on, or otherwise mutate a non-fixture
  business resource.

## Verification and completion

- Final verification is defined by
  `scripts/verification/verify-manifest.json` and a fresh run of
  `scripts/verification/verify-run.mjs`; ad hoc subsets are slice evidence only.
- Required final evidence includes current-SHA unit/typecheck/build gates,
  mocked browser E2E, source-live with no required skips, deterministic real
  ADO, fresh MSI provenance, installed-desktop E2E, credential audit and split
  application/provider latency.
- Provider TTFT below 500 ms is an optimization target, not a hard Azure
  acceptance gate. Report application-added latency separately from provider
  latency.
- The Goal is complete only when source, both non-main remotes, installed
  artifacts, ADO re-read and generated evidence are reconciled and no required
  item remains open.

## Progress reporting

Report compactly: current slice, deterministic result, real-ADO/installed
status, commit/push state, and the next action. Do not stop after analysis or a
single commit while safe in-scope work remains.
