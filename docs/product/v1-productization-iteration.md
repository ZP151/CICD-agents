# MergePilot v1 Productization Iteration

Status: **Execution plan for the next macro Goal**  
Created: **2026-08-07**  
Required starting documents: `README.md`, `next-iteration-known-gaps.md`, and
the Cycle 00–06 documents

## Macro Goal

Complete MergePilot v1 as an installed, evidence-driven Azure DevOps delivery
copilot. A developer, reviewer, or delivery owner must be able to select one
project from Context and complete the important Work Item → PR → CI/CD loops
with trustworthy AI guidance, explicit approval for every write, authoritative
ADO re-read, and a verifiable final result.

The Goal is product completion, not merely making the current test suite green.

## Verified starting point and protected work

- Foundation commits through `26fd4d7` exist on both
  `ado/claudecode/optimize-bugfix` and
  `origin/claudecode/optimize-bugfix`.
- The Project Link V2 and removal of the Azure CLI keyring verifier have landed
  as implementation slices, but still require final source-live and installed
  product evidence.
- The credential/secret-review focused source-live slice passed `2/2` at
  `69c9dff`.
- At plan creation, the worktree is **not clean**. Ten files contain an
  unfinished Pipelines → Chat approval handoff and decline-continuation slice,
  including the untracked
  `apps/desktop/src/pages/chat/approvalHandoff.ts`. The next executor must
  inspect and preserve this work; it must not reset, overwrite, or silently
  count it as completed.
- The latest mocked chat-layout run is `50/51`, with the saved PR insight
  artifact-source workspace scenario failing. The older mocked PASS is not a
  current-HEAD gate.
- The latest full source-live result is still `24/30`; a full current-HEAD run
  has not yet proved the product-correct Pipeline scenarios.
- Both machine-readable `goal-verification.json` files remain stale at
  `2c82bd7`. Installed-desktop/MSI and final-HEAD real-ADO gates remain open.

## Product outcomes

### 1. One authoritative Context and runtime

- Context is the only Project Link selector.
- Project Link stores stable local workspace and ADO repository identity only.
- Pipeline choices live in PipelineConnection or active Turn/Context state.
- MCP remains an internal capability transport without installation,
  registration, catalog, or marketplace UI.
- One user intent creates one Turn and one canonical event/action history.
- Workspace-originated actions, Chat actions, approvals, cancellation, restart,
  and recovery converge on the same Turn/Action runtime.
- Legacy Bubble, workflow, Project Link, insight, and duplicate state paths are
  removed after migration evidence exists.

### 2. One complete developer delivery loop

Using the ClaimBot_API fixture, a developer can:

1. select the repository through Context;
2. understand linked work and current changes;
3. prepare a PR from actual branch, commit, diff, work-item, and repository
   evidence;
4. preview and approve the ADO write;
5. re-read the created or updated artifact;
6. inspect CI evidence and take the next approved action;
7. receive a verified result without manually reconciling local and ADO state.

The loop must work through the installed desktop, not only daemon APIs or mocked
browser tests.

### 3. Useful PR author and reviewer workflows

- One Review Brief replaces duplicate insight actions.
- Authors receive readiness, missing evidence, test, risk, reviewer, and PR
  field recommendations before creation or update.
- Reviewers receive changed intent, risk, evidence, unresolved discussion,
  policy/build status, and recommended next action.
- Incremental re-review emphasizes new commits and resolved/unresolved findings
  instead of regenerating the whole report.
- Supported reviewer operations use explicit proposals and ADO verification:
  comment, vote/approve, reject/request changes, assign reviewers, link work,
  and open the authoritative ADO editor when MergePilot should not clone it.

### 4. Useful CI and delivery workflows

- Delivery discovers Pipelines from repository identity without writing them to
  Project Link.
- A failed run produces structured failure evidence, classification, likely
  ownership, relevant code/config, and a bounded next action.
- Pipeline navigation never preloads a synthetic Chat report.
- Rerun, trigger, approval, retry, and other remote mutations follow Proposal →
  Approval → Execution → Re-read → Verification.
- Deployment readiness combines commit, PR, build, test, environment, approval,
  and drift evidence without becoming an Azure Pipelines portal clone.
- Production-like or destructive deployment actions remain disabled until
  permission and governance evidence explicitly enables them.

### 5. Useful Work Item intelligence

- Work presents actionable delivery drift rather than cloning Azure Boards.
- AI distinguishes ADO facts from suggestions.
- Readiness and drift checks connect Work Items to actual PR, commit, build,
  test, and deployment state.
- State changes and comments remain approval-gated and are verified by ADO
  re-read.

### 6. Installed-product quality

- Microsoft sign-in, browser return, credential cache refresh, and first-run
  Context setup work in a fresh installation.
- User-visible latency is measured separately from Azure model TTFT. Application
  overhead receives P50/P95 baselines; model TTFT below 500 ms is an optimization
  target, not a hard external acceptance gate.
- Turn streaming, approval recovery, cancellation, history replay, diagnostics,
  secret redaction, and failure recovery work after restart.
- The release includes a fresh MSI/installer, clean-machine smoke, upgrade
  preservation, support runbook, known limitations, and reproducible evidence.

## Execution sequence and checkpoints

### Checkpoint A — Recover and seal current work

Review the existing approval handoff changes, complete their tests, correct any
same-Turn or stale-session defect, then commit and push this slice before
starting broader refactoring. Repair the current `50/51` mocked-browser failure
and establish a clean baseline.

### Checkpoint B — Close the canonical source runtime

Resolve the product-correct Pipeline #117 scenarios described in
`next-iteration-known-gaps.md`; remove remaining legacy Project Link workflow
writes; prove canonical approval and recovery behavior; reach a cold
source-live `30/30` with zero required skips.

### Checkpoint C — Prove the first installed vertical slice

Complete Work Item → PR → CI → approved write-back against ClaimBot_API through
the installed desktop. Capture proposal payload, user decision, execution,
remote artifact identity, ADO re-read, and final verification in one evidence
chain.

### Checkpoint D — Complete PR, CI/CD, and Work outcomes

Finish the author/reviewer, CI failure, delivery readiness, and Work Item drift
outcomes. Delete superseded Review Queue, duplicate insight, click-to-chat,
legacy Project Link, and second-state paths as their replacements become proven.

### Checkpoint E — Harden and release

Run final-head verification, build and install a fresh package, execute pilot
task sets, measure latency and reliability, complete security/operability
reviews, and generate release evidence.

Each checkpoint is a reversible product slice. It must end with tests, evidence,
a meaningful commit, and a push to explicitly named non-main branches. A later
checkpoint must not begin while the current checkpoint has uncommitted or
unexplained failures.

## Verification contract

Final evidence must include:

- relevant core, daemon, and desktop typechecks/builds/tests passing three
  consecutive times on the final HEAD;
- mocked browser and source-live gates with zero required skips;
- deterministic real-ADO verification on the final HEAD;
- real ClaimBot_API evidence for read, proposal, approval, execution, and
  authoritative re-read;
- installed-desktop E2E for sign-in, Context, Work, Changes, Delivery, Chat,
  approval recovery, restart, and diagnostics;
- fresh MSI/installer identity and payload evidence;
- app-overhead and model-TTFT P50/P95 reported separately;
- secret, token, permission, audit, stale-approval, duplicate-write, and
  cancellation checks;
- both `goal-verification.json` files and the manual evidence ledger pointing to
  the same final SHA and artifact set.

Tests must validate deterministic state and structured evidence. Exact model
phrasing, the model's claim that it succeeded, or a visually plausible screen
is not completion evidence.

## Non-goals

- A general-purpose coding agent.
- A clone of Azure Boards, Repos, Pipelines, Test Plans, or Environments.
- A second Review Queue or duplicate AI insight system.
- An MCP marketplace, installer, or user-managed connector registry.
- Autonomous remote writes or production deployment without explicit approval
  and governance.

## Final Definition of Done

MergePilot v1 is complete only when pilot users can install the current build
and finish the primary developer, reviewer, and delivery-owner tasks against a
real ADO fixture with less manual reconciliation, while every mutation is
previewed, approved, executed once, re-read, and verified. All legacy duplicate
paths are removed or confined to documented migration adapters; product,
machine, and installed evidence agree on the same final release SHA.

No remote `main` branch may ever be deleted, renamed, force-pushed, rewritten,
or directly pushed by the agent.
