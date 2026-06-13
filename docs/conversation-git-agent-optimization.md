# Conversation and Git Agent Optimization Plan

## Background

The current chat experience already has the foundation of an agent loop: the desktop app streams conversation events from the daemon, the daemon registers a bounded set of tools, and the planner can call those tools through the LLM function-calling interface.

However, the experience still behaves more like a scripted Git-to-PR workflow than a fully adaptive development agent. The UI exposes internal execution details as conversation content, and the backend contains hard-coded workflow recovery logic for a narrow sequence:

```text
review changes -> stage files -> commit -> push branch -> create PR
```

This document describes the steps needed to turn the current implementation into a cleaner, more general, and more capable conversation-driven agent.

## Current Flow

1. The desktop chat page sends the user message, repo path, selected profile, and LLM settings to the daemon through `/chat`.
2. The daemon creates or resumes a chat session and registers a fixed set of tools:
   - Git tools
   - npm tools
   - pytest tools
   - dotnet tools
   - Azure DevOps tools
   - a Git intent translator helper
3. `ChatPlanner` passes the tool schemas to the LLM.
4. The LLM can call registered tools. Tool start and tool end events are streamed back to the frontend.
5. The LLM eventually returns a required JSON response with fields such as `response`, `risk_level`, `actions_taken`, `suggestions`, and optionally `pending_action`.
6. If a pending action exists, the frontend displays a confirmation card.
7. When the user confirms, `/confirm-action` executes the stored action directly and asks the LLM to continue the workflow.
8. If the LLM fails to provide a pending action, daemon-side workflow enrichment attempts to infer the next action from a fixed Git-to-PR sequence.

## Problems

### 1. Git capabilities are too limited

The registered Git tools cover only a small subset of real Git workflows:

- `git_status`
- `git_diff`
- `git_current_branch`
- `git_log`
- `git_push`
- `git_create_branch`
- `git_add`
- `git_commit`
- `git_branch_list`
- `git_remote`
- `git_stash`

Important operations are missing, including:

- `git_fetch`
- `git_pull`
- `git_merge`
- `git_rebase`
- `git_restore`
- `git_checkout`
- `git_show`
- `git_reset`
- `git_clean`
- `git_tag`
- `git_cherry_pick`
- `git_worktree`

As a result, the agent cannot reliably handle natural user requests outside the happy path of staging, committing, pushing, and creating a PR.

### 2. Chat starts with Git operations instead of repository understanding

The current chat flow is biased toward running Git commands early in the conversation. For many user requests, the agent first checks status, diff, branch, or log, then tries to infer what to do next.

This misses an important capability that already exists elsewhere in the system: repository indexing and embedding-based context retrieval.

The pipeline task flow indexes the repository, updates vector embeddings, computes diffs, builds a context bundle, and only then asks the planner to reason about the change. Chat should reuse the same idea.

The chat agent should not treat the repository as only a Git working tree. It should understand:

- Project structure.
- Important source files.
- Build and test conventions.
- Existing architecture.
- Related code paths.
- Historical memory for the repository.
- Profile-specific pipeline/build/test settings.
- The user's current goal.

Without this semantic context, the chat agent can execute commands but cannot reliably explain the project, reason about affected areas, select relevant tests, or make high-quality PR/review decisions.

### 3. The planner is constrained by a narrow workflow prompt

The system prompt describes the agent as autonomous, but the actual workflow guidance is heavily centered on the Git-to-PR path. The pending action rules also only allow a small set of write actions.

This makes the model appear conversationally flexible while still being structurally limited.

### 4. Workflow continuation is hard-coded

The daemon contains a fixed `WORKFLOW_STEPS` list that infers the next action as:

```text
git_add -> git_commit -> git_push -> ado_create_pr
```

This is useful as a fallback for one workflow, but it prevents the agent from representing other valid user goals such as:

- Rebase the branch onto main.
- Split changes into multiple commits.
- Restore one file and commit the rest.
- Fetch remotes and compare with upstream.
- Create a branch without opening a PR.
- Run tests before committing.
- Stash local work, switch branches, and apply it later.

### 5. Conversation events are semantically muddy

The backend streams model delta text as `thinking`. The frontend then renders that as a collapsible reasoning trace. In practice, this is not reliable reasoning. It may contain partial assistant text, tool-call lead-in text, or the final JSON response that later needs to be stripped.

This creates several UI issues:

- The user sees implementation artifacts.
- The conversation timeline becomes noisy.
- The frontend needs cleanup logic such as JSON stripping.
- "Thinking", "Details", metadata, and raw JSON compete with the actual assistant response.

### 6. The right-side workflow panel is also fixed to the PR flow

The desktop UI derives a static task state from tool execution history and displays:

```text
Review changes
Stage files
Commit
Push branch
Create PR
```

This does not match non-PR workflows and reinforces the impression that the agent only knows one path.

## 2026-06-12 Implementation Audit

Recent git history shows the project has moved materially beyond the original narrow scripted flow:

- `3ee3890 feat: add structured agent streaming finalization` removed raw planner JSON from the normal conversation path and added structured finalization metadata.
- `0246315 feat: strengthen chat workspace workflows` added stronger Git workflow behavior and chat-side workflow recovery.
- `d5f808a chore: bump version to 0.5.4` marks the current released baseline.

Current implemented strengths:

- Chat has structured tool streaming, clean assistant bubbles, tool bubbles, approval cards, and workflow-state events.
- The core Git tool surface now covers status, diff, log, show, fetch, merge-base, branch listing, switch/checkout, pull, merge, rebase, restore, add, commit, push, stash, checkpoints, and checkpoint apply.
- The planner prompt now explicitly requires structured Git arguments and path-aware `git_add` calls.
- Azure DevOps PR insight has internalized PR details, threads, file changes, builds, work items, and policy evaluations.
- Project Link setup can infer Azure DevOps mapping from git remotes and can discover ADO projects, repositories, and pipelines.
- Right-panel Git controls for inspect, branch, push, and commit preparation now enter structured workflow actions instead of inserting hidden natural-language chat prompts.
- Structured push approvals now include upstream and ahead/behind readiness metadata before the user confirms `git_push`.
- Blank commit-message flows now remain structured: after approved staging, the daemon generates a commit message from staged diff metadata and presents a `git_commit` approval.
- Branch checkout/create controls now run branch-state preflight and suppress no-op or duplicate approvals before proposing Git writes.
- The right-side Progress panel now renders compact metadata details for branch preflight, push readiness, and commit workflow branch/message state.
- PR creation now has a first-class structured workflow action that creates an `ado_create_pr` approval proposal with Project Link and dirty-worktree preflight.
- Confirmed PR creation now completes as structured `pr/created` workflow state and returns deterministic next-step suggestions instead of asking the planner to infer continuation.
- PR follow-up now has first-class structured workflow actions for insight, policy status, linked work items, and work-item linking approval.
- PR follow-up workflow failures now preserve missing Project Link mapping and Azure DevOps auth diagnostics as structured Conversation workflow state instead of collapsing to generic 500-style errors.
- Test/build validation now has a first structured Conversation workflow path: command chips and welcome suggestions can create a `validation_command` approval backed by the Project Link validation command, with CI workflow state instead of sending a hidden chat prompt.
- Validation approval proposals now carry command-source metadata and changed-file preflight context, and failed validation runs return a concise failure excerpt for deterministic Conversation follow-up.
- When no explicit Project Link validation command is configured, validation preflight can derive focused package commands from changed files' nearest `package.json` files, including multi-package pnpm workspace filters when all touched packages share the same validation script.
- Validation approval cards now render structured scope evidence: command source, selected script, package filters, package roots, changed-file count, and the selection reason.
- Failed validation confirmations now also generate selectable markdown Conversation artifacts with command, package scope, key output, stdout/stderr excerpts, and an error status for the Result workspace.
- Validation failure artifacts now feed the next recovery turn when the user asks to analyze, fix, retry, or rerun validation, CI failure suggestion chips offer analyze failure, rerun tests/build, and review changes actions, and failed validation artifacts include initial Vitest/Jest, pytest, and dotnet recovery signals.
- Workspace workflow actions now detect unresolved merge/rebase-style Git operation states and block normal commit, push, branch switch, and PR creation approvals while conflicts are unresolved.
- Rebase recovery now has first-class structured workflow actions for continue, abort, and skip. These create exact `git_rebase` approval proposals only when a rebase is actually in progress and complete with deterministic `git` workflow state after confirmation.
- Merge, cherry-pick, and revert recovery now use the same structured approval model through `git_merge`, `git_cherry_pick`, and `git_revert` recovery actions.
- Conflict-file staging is now a guarded structured action: it only works during an active Git conflict recovery state, only stages paths that Git currently reports as conflicted, and returns deterministic workflow state instead of falling back to normal commit automation.

Remaining shortfalls:

- Chat still relies too much on planner inference for multi-step workflows beyond the first structured branch, commit, push, generated-message, and create-PR paths.
- The right panel exposes useful branch/commit/PR follow-up controls and compact workflow metadata, but branch readiness and richer PR artifact rendering are not yet dedicated workspaces.
- PR creation and first PR follow-ups have durable structured actions and clearer failure states, but richer PR insight artifact rendering still needs a dedicated Conversation workspace.
- There is no single source of truth for all Chat agent responsibilities unless the use-case catalog is kept in sync with tests and docs.
- Test/build execution now has an initial dedicated validation workflow state, command-source preflight, changed-file context, single-package and compatible multi-package command derivation, UI-visible selection evidence, failure excerpts, selectable failure artifacts, recovery-turn artifact context, CI failure follow-up suggestions, and initial framework-specific recovery signals, but still needs planner-level use of those signals to pick the smallest safe next action.
- PR insight and CI/CD actions are powerful but not yet presented as a unified “analyze this PR / validate this branch / prepare release” conversation workflow.
- Conflict recovery still needs a dedicated desktop conflict-file picker and deeper conflicted-repository coverage for cherry-pick and revert operations.

## Chat Agent Use-Case Matrix

The following matrix is now represented in code by `packages/core/src/chatUseCases.ts` and injected into the planner prompt. It is intentionally modeled after common behavior in mature coding agents such as Codex-style repository agents, Aider-style Git assistants, OpenHands-style task agents, Goose-style tool agents, and Continue-style repo-context assistants.

| Use case | User signals | Read tools | Write tools | Approval |
| --- | --- | --- | --- | --- |
| Project understanding | explain project, architecture, where is, how does this work | repo context, index refresh, git log | none | none |
| Change review | review changes, inspect diff, what changed | git status, git diff, repo context | none | none |
| Test selection and validation | run tests, verify, build, what tests | git diff, git status, repo context | npm/pytest/dotnet test tools | required |
| Branch management | branch, checkout, switch, fetch, pull, rebase, merge | branch list, current branch, status, fetch, diff, merge-base | switch, checkout, pull, merge, rebase, create branch | required |
| Commit workflow | stage, commit, amend, split commit | status, diff, repo context | add, restore, commit | required |
| Remote sync | push, publish, pull latest, non-fast-forward | status, current branch, remotes, fetch | push, pull, rebase | required |
| PR insight | analyze PR, PR risk, review queue | ADO PR details, threads, changes, builds, work items, policies | none | none |
| PR creation | create PR, open pull request, link work item | status, current branch, log, remotes | push, create PR, link work item | required |
| Shelve and restore | stash, restore, discard, rollback, checkpoint | status, diff, checkpoint show | stash, restore, checkpoint apply | required |
| CI/CD operations | pipeline, CI, build status, trigger pipeline | pipeline definitions, builds, runs | trigger pipeline | required |

Expected behavior across all use cases:

- Read-only inspection can run immediately when it helps the user.
- Write operations must produce exact tool arguments and wait for approval.
- The agent must not invent PR creation after a push unless the user asked for a PR.
- The agent must inspect working-tree state before branch-changing operations.
- The agent should use repository context for project understanding and risk analysis, not only Git status.
- The agent should explain uncertainty and missing context instead of filling gaps with made-up project facts.

## Real Chat Failure Case: Commit-Only Request Escalated Into Push/Rebase

Observed user flow:

```text
User: What's on this branch?
Agent: inspected status/diff and correctly reported branch state.
User: stage the changes, commit
Agent: staged and committed, then proposed git_push even though push was not requested.
Agent: push failed because the branch was behind remote.
Agent: proposed pull --rebase recovery.
git_pull --rebase hit conflicts.
Agent continued offering git_add/git_commit/git_push style actions and attempted another git_rebase start instead of git rebase --continue/--abort/--skip.
```

Problems exposed:

- Scope leak: a commit-only request was escalated into a push workflow.
- Recovery leak: a push failure introduced pull/rebase recovery even though push was already outside the user's requested scope.
- Rebase-state blindness: once a rebase was in progress, the available `git_rebase` tool could only start a new rebase and could not represent `--continue`, `--abort`, or `--skip`.
- Conflict safety gap: after rebase conflicts, the agent treated `git_add` and `git_commit` as normal continuation candidates instead of requiring an explicit rebase resolution path.
- UI wording issue: approval text surfaced long generic tool descriptions instead of concise, task-specific proposals.

Corrections added:

- `git_push`, `git_pull`, and `git_rebase` workflow proposals now check the user's original scope before being converted into approval actions.
- Pull/rebase recovery is allowed only after an in-scope failed push.
- When an explicit but out-of-scope write action is detected, the workflow derivation stops instead of falling back to the older PR workflow sequence.
- `git_rebase` now supports `action: "continue" | "abort" | "skip"` in addition to starting a rebase with `onto`.
- `/chat/workflow-action` now reads Git operation state from porcelain status and `.git` state files, then blocks normal commit/push/branch/PR workflow approvals during unresolved conflicts or in-progress operations.
- Legacy chat write-action derivation now strips normal commit/push approvals after unresolved rebase/merge conflict history unless the proposed action is an explicit rebase recovery step.
- Structured workspace actions now support `continue_rebase`, `abort_rebase`, and `skip_rebase` as high-risk approvals with exact `git_rebase` recovery arguments.
- Confirmed rebase recovery actions now finish with deterministic workflow state such as `rebase_aborted` instead of returning to the planner for guesswork.
- Structured workspace actions now also support merge, cherry-pick, and revert recovery with exact approval-backed tool arguments.
- Selected conflict-file staging now has a dedicated `stage_resolved_conflicts` workspace action that refuses non-conflict paths and does not advance into commit/push automatically.
- Regression tests cover:
  - commit-only requests stop after commit
  - push recovery is allowed only for push-scoped user goals
  - out-of-scope push recovery does not fall back to staging
  - rebase conflict recovery derives `git_rebase { action: "continue" }`
  - merge-conflict workspace actions become blocked workflow state instead of creating `git_add`
  - unresolved rebase conflicts strip ordinary `git_commit` proposals
  - structured rebase abort creates and completes a stored approval proposal
  - structured merge abort creates and completes a stored approval proposal
  - selected conflict-file staging creates and completes a path-scoped `git_add` approval
  - merge/cherry-pick/revert recovery tool actions do not require a start ref

Remaining needed UX corrections:

- Approval cards should display concise action labels, for example `Stage selected files`, `Commit staged changes`, `Continue rebase`, instead of raw tool descriptions.
- The workflow panel receives explicit conflict/in-progress phases and now exposes recovery controls for rebase, merge, cherry-pick, and revert, but still needs a file picker before selected conflict-file staging should be shown as a direct UI control.
- Chat should show branch divergence (`ahead/behind`) as a readiness warning before allowing commit/push flows.

## Popular Agent Source Alignment Audit

This section records the architectural lesson from current popular open-source coding agents and IDE agents. The important distinction is that mature agents do not usually hard-code one invisible Git script such as `add -> commit -> push -> PR`. They expose a tool catalog, context pipeline, permission model, and execution loop. The model then generates the concrete tool calls and arguments for the current user request.

Reviewed references:

| Project | Source / doc signal | Relevant pattern |
| --- | --- | --- |
| Aider | [`Aider-AI/aider` Git integration and `aider/repo.py`](https://github.com/Aider-AI/aider/blob/main/aider/repo.py) | Git-first repo assistant with tracked-file, diff, and commit-message logic. Useful for repo context and commit discipline, but it is intentionally opinionated about commits. |
| OpenHands | [SDK docs define agents, tools, workspaces, and conversations](https://docs.openhands.dev/sdk/getting-started) | Agent is a reasoning/execution loop over enabled tools in a workspace, not a fixed Git workflow. |
| Cline | [CLI runtime tool policies](https://github.com/cline/cline/blob/main/apps/cli/src/runtime/tool-policies.ts) and [interactive approvals](https://github.com/cline/cline/blob/main/apps/cli/src/runtime/interactive/approvals.ts) | Uses per-tool policy and human-in-the-loop approval; safe/read tools can be auto-approved while write/terminal actions are gated. |
| OpenCode | [Permission service](https://github.com/opencode-ai/opencode/blob/main/internal/permission/permission.go) and [bash tool](https://github.com/opencode-ai/opencode/blob/main/internal/llm/tools/bash.go) | Uses a generic bash tool with permission requests, read-only command heuristics, banned commands, and explicit Git/PR prompt discipline. Its commit guidance explicitly says not to push unless requested. |
| Continue | [`runTerminalCommand` tool definition](https://github.com/continuedev/continue/blob/main/core/tools/definitions/runTerminalCommand.ts) and [tool dispatcher](https://github.com/continuedev/continue/blob/main/core/tools/callTool.ts) | Treats terminal execution as a parameterized tool call with security evaluation, and separates built-in tool dispatch from MCP/remote tools. |
| Goose | [Tool confirmation router](https://github.com/block/goose/blob/main/crates/goose/src/agents/tool_confirmation_router.rs) and [tool execution pipeline](https://github.com/block/goose/blob/main/crates/goose/src/agents/tool_execution.rs) | Routes tool calls through permission confirmations and returns a clear declined response telling the agent not to repeat denied calls. |
| VS Code Copilot Agent | [Chat tools docs](https://code.visualstudio.com/docs/chat/chat-tools) | Lets users enable/disable tools per request, review and edit tool parameters before execution, and groups tools into tool sets. Terminal commands are displayed as tool calls with command output. |

Common architecture:

```text
user request
  -> classify intent and constraints
  -> gather repo / Git / CI / PR context
  -> expose only relevant tools
  -> model proposes exact tool call arguments
  -> policy engine checks scope, risk, and workspace boundary
  -> user approves write/destructive/network actions
  -> executor runs the exact approved command/tool
  -> result updates conversation and workflow state
  -> agent decides whether another step is still in scope
```

Reference observations from current open-source agents:

- [Aider](https://aider.chat/docs/git.html) is intentionally Git-centric, but its Git automation is scoped around file edits, undoability, dirty-file isolation, and commit-message generation from diffs/history. It also exposes explicit in-chat Git commands such as `/diff`, `/undo`, `/commit`, and `/git` instead of assuming every request should become a full push/PR chain.
- [Cline](https://github.com/cline/cline) presents broad tools for file edits, terminal commands, browser use, and MCP, with Plan/Act mode and human-in-the-loop approval for file edits and terminal commands. Its useful pattern for this project is not a fixed Git sequence, but a policy layer around arbitrary tool use plus checkpoints.
- [Cline tools documentation](https://docs.cline.bot/tools-reference/all-cline-tools) describes approval and policy controls that can require approval for risky tools, auto-approve low-risk reads, and disable tools. This maps directly to our capability registry and `approvalProposal` gate.
- [OpenHands](https://github.com/OpenHands/openhands) exposes a composable agent SDK, CLI, local GUI, REST API, and React app. Its pattern is an agent runtime that can plan, execute, and integrate with external systems while keeping action execution inspectable, not a UI button that injects a hidden prompt.
- [OpenHands GitHub Action documentation](https://docs.openhands.dev/openhands/usage/run-openhands/github-action) shows a product workflow that can auto-resolve issues and open pull requests, but it is triggered by explicit issue labels/comments. That is closer to a named workflow objective than implicit continuation from any commit/push.

Implications for this project:

- Git operations should be capability tools, not a hidden pre-scripted flow.
- High-level workflows are still valuable, but they should compile into explicit workflow state and exact approval proposals.
- UI shortcuts such as `Changes`, `Branch`, `Commit`, `Push`, and `Create PR` should start a structured workflow intent. They should not insert a natural-language prompt that the daemon later regex-parses.
- Write operations must preserve the user's request boundary. `commit` does not imply `push`; `push` does not imply `create PR`; failed `push` recovery can suggest `pull --rebase`, but only when the original user goal included push/publish/sync.
- A denied or failed risky tool call should not be retried through another inferred path. The agent should either propose a different in-scope action or stop with a clear explanation.
- Git conflict states must become first-class workflow states, for example `rebase_in_progress`, `merge_conflict`, `conflict_blocked`, and `needs_user_resolution`.

### Preset Workflow vs Agent-Generated Git Operations

The desired model is not "no presets at all". The desired model is:

- Preset knowledge: allowed. Examples: commit quality checklist, PR readiness checklist, conflict recovery options, branch divergence checks.
- Preset execution chain: not allowed as the default. Examples: automatically continuing from commit to push, or from push to PR creation, without the user asking.
- Parameterized tool calls: required. Examples: `git_add { paths: [...] }`, `git_restore { paths: [...], staged: false }`, `git_rebase { action: "continue" }`, `git_push { branch, setUpstream }`.
- Scope validation: required before every write proposal.

This aligns with the real failure case above: the agent should have stopped after the commit because the user asked to stage and commit. A later push, pull, rebase, or PR would need a new user request or an explicit approved workflow objective.

### Legacy Workflow Retirement Decision

| Current component | Current risk | Decision | Replacement |
| --- | --- | --- | --- |
| `inferNextPrWorkflowTool` in `packages/daemon/src/chatSession.ts` | Fixed PR-flow continuation can turn one write action into a broader workflow. | Retired from the production chat path. | Workflow state machine plus planner-generated approval proposals. |
| `inferPendingAction` in `packages/daemon/src/chatSession.ts` | Resumes old sessions by parsing assistant prose. Useful compatibility, weak source of truth. | Deprecate. Keep read-only legacy fallback with tests. | Persisted `approvalProposal` / `approval_required` events only. |
| `ACTION_DERIVERS` in `packages/daemon/src/chatSession.ts` | Regex-style response interpretation can produce actions from wording instead of the model's structured tool call. | Narrow and eventually remove for write actions. | Tool-call-native approval proposals with policy validation. |
| `workspaceActionPrompt` in `apps/desktop/src/pages/Chat.tsx` | UI actions become hidden natural-language prompts. This makes clicks look like chat messages and can trigger wrong workflows. | Replace. | Structured workflow action API: `inspect_changes`, `switch_branch`, `prepare_commit`, `push_branch`, `create_pr`. |
| `commit_flow` right-panel action in `apps/desktop/src/pages/Chat.tsx` | Can feel like a canned stage/commit/push bundle. | Split in the frontend action model; backend still receives explicit `prepare_commit` or `push_branch` workflow actions. | `prepare_commit`, `commit_and_push`, and `push_branch` are separate UI actions, with `commitMode` only on commit preparation. |
| `git_intent_translator` in `packages/core/src/tools/gitIntent.ts` | Useful offline planning reference, but can become another canned workflow source. | Removed from production chat tool exposure and production offline fallback. Keep only as offline/test reference while replacing it with direct tool schemas plus policy validation. | Direct tool schemas plus policy validator. |

### Target Git Agent Boundary Rules

The Chat agent may do these without approval:

- Inspect status, diff, log, branch, remotes, and PR/ADO read models.
- Build a repository context summary.
- Explain likely next steps.
- Suggest exact write actions.

The Chat agent needs approval for:

- Any staging, restore, checkout/switch, branch creation, commit, pull, merge, rebase, push, stash apply/pop, tag creation, worktree mutation, pipeline trigger, PR creation/update, work item mutation, or policy-changing operation.

The Chat agent must stop or ask for a new approval when:

- The next step is outside the user's original stated goal.
- Git reports merge/rebase conflicts.
- A push/pull/rebase fails.
- The required command would be destructive or broad, such as `git reset --hard`, `git clean`, `git add .`, or deleting branches/tags.
- The model wants to retry the same denied or failed risky action.

## Target Design

The target architecture should separate four concepts:

1. Conversation content
2. Execution progress
3. Tool traces
4. Approval state

The agent should maintain an explicit workflow state rather than relying on hard-coded workflow inference.

The agent loop should also include a repository understanding phase before command execution:

```text
user goal -> classify intent -> retrieve repo context -> inspect Git state if needed -> plan -> act/ask approval
```

Git inspection is still important, but it should be one source of context, not the default starting point for every conversation.

## Optimization Steps

### Step 1: Add repository understanding to chat

Chat should reuse the indexing and semantic context capabilities currently used by the pipeline flow.

Recommended chat context pipeline:

1. Detect the user's intent.
2. Quickly browse project docs, config files, and file-structure signals.
3. Decide whether deeper repository context is needed.
4. Use an existing semantic index when it is available and useful.
5. Refresh the repository index and embeddings asynchronously when appropriate.
6. Retrieve relevant files, symbols, chunks, memories, and profile settings when the request needs them.
7. Include Git status/diff only when useful for the user's goal.
8. Pass a compact context bundle to the planner.

Intent examples:

- "What does this project do?" needs repo structure, README, package metadata, architecture docs, and core entrypoints.
- "Where should I make this change?" needs semantic retrieval and related code paths.
- "What tests should I run?" needs changed files plus test/build conventions.
- "Help me create a PR" needs Git state plus project-aware diff summary.
- "Review my branch" needs diff, related code, risk-sensitive paths, tests, and profile policy.

The chat planner should receive a context bundle shaped like:

```ts
interface ChatContextBundle {
  repoSummary?: string;
  projectStructure?: Array<{ path: string; kind: string; reason: string }>;
  relevantChunks: Array<{
    path: string;
    symbol?: string;
    text: string;
    score?: number;
  }>;
  changedFiles?: Array<{
    path: string;
    status: string;
    additions?: number;
    deletions?: number;
  }>;
  memories?: Array<{ key: string; value: string }>;
  profile?: {
    buildCommand?: string;
    testCommand?: string;
    targetBranch?: string;
    pipelineName?: string;
  };
}
```

If the embedding model is not configured, chat should gracefully fall back to:

- README/package/config file summaries.
- File tree heuristics.
- Git diff and status.
- Recently opened or changed files.
- Profile build/test settings.

The UI should expose this as a lightweight progress signal, not a noisy trace:

```text
Reading project context
Indexing changed files
Retrieving related code
Checking Git state
```

### Step 2: Redesign chat stream events

Replace the current ambiguous event vocabulary with clearer event types.

Recommended event model:

```text
session_started
assistant_delta
progress
tool_call_started
tool_call_completed
approval_required
approval_resolved
workflow_state
final_response
error
cancelled
```

Expected behavior:

- `assistant_delta` is only user-facing assistant prose.
- `progress` is short operational status such as "Checking branch status".
- `tool_call_started` and `tool_call_completed` contain structured tool trace data.
- `approval_required` contains the exact action, risk level, arguments, and explanation.
- `workflow_state` contains the current plan and completed steps.
- `final_response` contains the final assistant message for the turn.

Do not use `thinking` for model output unless there is a real, intentionally designed reasoning summary.

### Step 3: Simplify the conversation UI

The main chat timeline should show only:

- User messages
- Assistant messages
- Approval cards
- Compact action groups
- Errors

Move the following into a developer/debug mode:

- Raw JSON
- Full tool payloads
- Internal metadata
- Risk/debug details
- Model formatting artifacts

The default action group should be collapsed and human-readable, for example:

```text
Checked Git status
Read diff for 4 files
Generated commit proposal
```

Detailed stdout/stderr should still be available, but not visually dominant.

### Step 4: Introduce a generic workflow state model

Replace fixed Git-to-PR inference with a generic workflow state object.

Suggested shape:

```ts
interface WorkflowState {
  goal: string;
  status: "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";
  facts: Array<{
    key: string;
    value: unknown;
    sourceTool?: string;
  }>;
  steps: Array<{
    id: string;
    title: string;
    status: "pending" | "running" | "done" | "skipped" | "failed";
    tool?: string;
    args?: Record<string, unknown>;
    riskLevel?: "low" | "medium" | "high";
  }>;
  proposedAction?: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    riskLevel: "medium" | "high";
    reason: string;
  };
}
```

The frontend should render this state directly instead of deriving a fixed PR workflow from bubble history.

### Step 5: Build a Git capability registry

Do not expose arbitrary shell access to the LLM. Instead, expand Git support through a structured capability registry.

Each Git capability should define:

- Tool name
- Description
- JSON schema
- Risk level
- Whether it is read-only
- Whether confirmation is required
- How to validate arguments
- How to execute safely

Example:

```ts
interface ToolCapability {
  name: string;
  category: "git" | "test" | "build" | "ado";
  riskLevel: "low" | "medium" | "high";
  readOnly: boolean;
  requiresApproval: boolean;
  description: string;
  parameters: Record<string, unknown>;
}
```

Recommended Git capability groups:

Low risk, auto-run:

- `git_status`
- `git_diff`
- `git_log`
- `git_show`
- `git_current_branch`
- `git_branch_list`
- `git_remote`
- `git_fetch`
- `git_merge_base`

Medium risk, approval required unless explicitly requested:

- `git_add`
- `git_restore`
- `git_stash`
- `git_checkout`
- `git_create_branch`
- `git_pull`
- `git_merge`

High risk, approval required:

- `git_commit`
- `git_push`
- `git_rebase`
- `git_reset`
- `git_clean`
- `git_tag`
- `git_delete_branch`
- `ado_create_pr`
- `ado_trigger_pipeline`

### Step 6: Update planner instructions

Rewrite the system prompt around general agent behavior instead of a fixed PR workflow.

The planner should:

1. Understand the user's goal.
2. Retrieve semantic repository context when useful.
3. Discover Git state with read-only tools when useful.
4. Build or update workflow state.
5. Run safe read-only actions without confirmation.
6. Propose risky actions with exact tool arguments.
7. Continue from approved actions without re-running unnecessary discovery.
8. Stop when the goal is complete or blocked.

The prompt should not hard-code one sequence as the universal path. Git-to-PR can be one recognized workflow template, but not the only workflow.

### Step 7: Replace `pending_action` with structured approval

The current `pending_action` is embedded inside the final JSON response. Move approval into its own event and persisted state.

Recommended flow:

1. Planner emits `approval_required`.
2. Daemon persists the approval request in session state.
3. Frontend renders an approval card from the event.
4. User confirms or cancels.
5. Daemon executes the exact persisted action.
6. Daemon emits `approval_resolved`, tool events, updated workflow state, and final response.

This removes the need to parse assistant text for phrases such as "Shall I" or "Do you want me to".

### Step 8: Remove heuristic workflow enrichment

Delete or retire the fixed `WORKFLOW_STEPS` fallback once structured workflow state and approval events are implemented.

If fallback behavior is still needed, use a planner-owned workflow template registry:

- `prepare_pr`
- `commit_local_changes`
- `sync_branch`
- `inspect_changes`
- `run_validation`
- `stash_and_switch`

Each template should be optional and should adapt based on repository state.

### Step 9: Make the right panel dynamic

The right-side panel should render the current `WorkflowState`.

It should display:

- Goal
- Current status
- Completed steps
- Pending steps
- Active approval request
- Relevant repository facts such as branch, upstream, changed files, and PR URL

It should not assume every workflow ends in PR creation.

### Step 10: Improve session persistence

Persist these separately:

- Conversation messages
- Tool traces
- Workflow state
- Approval requests
- User-facing assistant responses
- Retrieved repository context snapshots

Avoid reconstructing important state by scraping previous assistant text or UI bubbles.

### Step 11: Add tests around agent behavior

Add tests for:

- Repository understanding requests that should not start with Git commands.
- Chat context retrieval with embeddings enabled.
- Chat context fallback with embeddings disabled.
- Free-form Git requests that do not involve PRs.
- Approval-required write operations.
- Confirmation after a pending approval.
- Cancellation after a pending approval.
- Continuing a workflow without repeating read-only tools unnecessarily.
- Rendering dynamic workflow state in the frontend.

Example scenarios:

- "Explain how this project is structured."
- "Where is the chat-to-tool execution flow implemented?"
- "Which tests are relevant to the desktop chat page?"
- "Compare this branch with main and summarize the risk."
- "Restore the package lock file and commit the rest."
- "Fetch origin and tell me if I am behind."
- "Rebase this branch onto main."
- "Stage only the docs changes."
- "Commit and push, but do not create a PR."
- "Create a PR and link work item 12345."

## Product Surface Plan

The desktop navigation should avoid exposing overlapping ADO concepts as separate top-level destinations. Azure DevOps is already the system of record for PRs, pipelines, reviewers, and policies. The desktop app should add value by combining ADO state with local repository context, agent reasoning, workflow automation, and review decisions.

Keep two product surfaces:

1. `Pull Requests`
2. `Review Queue`

Do not keep `Pipelines` as a separate top-level surface. Pipeline state should be embedded into PR readiness and review decisions.

### Pull Requests

`Pull Requests` is the developer workspace for active PRs.

It should answer:

```text
What is blocking my PR, and what should I do next?
```

This page should show:

- Active PRs for the selected profile/repository.
- PRs created by the current user.
- PRs assigned to or involving the current user.
- PR title, source branch, target branch, status, and reviewers.
- Pipeline/build/test status.
- Policy status.
- Merge conflict status.
- Linked work item status.
- Review comments and unresolved threads.
- Review Agent findings related to the PR.
- Agent-generated PR readiness summary.

Useful developer actions:

- Open PR in Azure DevOps.
- Pull or checkout the PR branch locally.
- Explain pipeline failure.
- Rerun failed pipeline.
- Summarize diff.
- Summarize reviewer comments.
- Generate response suggestions.
- Ask the agent to fix review comments.
- Ask the agent to prepare the next commit.

Pipeline functionality belongs here as PR context:

- Latest pipeline result.
- Failed stage/job/test summary.
- Failure explanation.
- Rerun action.
- Related build/test artifacts.

### Review Queue

`Review Queue` replaces the narrower `Review Findings` concept.

It is the approver, manager, and Review Agent decision surface. It should not only display findings; it should manage review state and approval decisions.

It should answer:

```text
Which PRs can be safely approved, which need human review, and why?
```

This page should group PRs into decision queues:

- `Auto-approved`: low-risk PRs that the Review Agent approved automatically.
- `Needs human review`: medium-risk PRs or PRs with uncertain findings.
- `Blocked`: high-risk PRs, failed pipelines, failed policies, conflicts, or unresolved blocking findings.
- `Watching`: PRs waiting for pipeline, policy, or new commits before a decision can be made.

Each PR row/card should show:

- Risk level.
- Review Agent decision.
- Decision reason.
- Changed areas.
- Sensitive files touched.
- Pipeline status.
- Policy status.
- Finding counts by severity.
- Required reviewer status.
- Auto-approval eligibility.
- Audit trail entry.

Useful approver actions:

- Approve PR.
- Request changes.
- Dismiss or confirm a finding.
- Escalate to a human reviewer.
- Open the PR in Azure DevOps.
- View the Review Agent's reasoning summary.
- Configure profile-level review automation policy.

### Review Agent Auto-Approval

The Review Agent should be proactive. It should be able to automatically approve low-risk PRs when the selected profile allows it and all safety conditions pass.

The Review Agent should operate in three phases:

1. `Observe`: monitor PR updates, new commits, pipeline completion, policy changes, and review thread changes.
2. `Decide`: calculate risk, evaluate findings, check profile policy, and determine approval eligibility.
3. `Act`: approve low-risk PRs automatically, block high-risk PRs with findings, or route uncertain PRs to human approvers.

Auto-approval must be profile-controlled and auditable.

Suggested profile policy:

```ts
interface ReviewAutomationPolicy {
  autoApproveLowRisk: boolean;
  maxChangedFiles: number;
  maxDiffLines: number;
  sensitivePaths: string[];
  requirePipelineGreen: boolean;
  requireLinkedWorkItem: boolean;
  allowedAuthors: string[];
  blockedAuthors: string[];
  allowedTargetBranches: string[];
  confidenceThreshold: number;
  requireNoBlockingFindings: boolean;
}
```

A PR is eligible for automatic approval only when all configured conditions pass:

- The profile enables `autoApproveLowRisk`.
- The PR targets an allowed branch.
- The PR author is allowed and not blocked.
- The changed file count is below the configured threshold.
- The diff size is below the configured threshold.
- No sensitive path was modified.
- Required pipelines are green.
- Required policies are satisfied.
- Required work item linkage exists, if configured.
- There are no unresolved high or medium findings.
- There are no merge conflicts.
- The Review Agent confidence is above the configured threshold.
- The Review Agent's final risk level is `low`.

When the Review Agent auto-approves a PR, it must write an audit record containing:

- PR ID and repository.
- Commit SHA or iteration ID reviewed.
- Policy version.
- Risk score and risk level.
- Decision reason.
- Findings summary.
- Pipeline and policy status at the time of approval.
- Actor identity used to approve.
- Timestamp.

If any condition fails, the Review Agent should not approve automatically. It should place the PR into `Needs human review`, `Blocked`, or `Watching` with a clear reason.

### Navigation Recommendation

Recommended sidebar structure:

```text
Workspace
- Chat
- Pull Requests
- Profiles

Quality
- Review Queue

System
- Activity
- Settings
```

`Tasks` should be renamed to `Activity` or `Runs`. It should become a history of agent/background executions rather than a manual task-id viewer.

`Pipelines` should be removed from top-level navigation and folded into:

- `Pull Requests` for developer readiness and failure diagnosis.
- `Review Queue` for approval eligibility and risk decisions.

## Implementation Status

Status: complete for the current optimization scope.

Completed:

- Added lightweight chat repository context retrieval and a non-blocking background index refresh path.
- Updated chat planning so Git inspection is intent-driven rather than automatic at conversation start.
- Replaced visible raw `thinking` output with progress status handling in the desktop chat UI.
- Renamed the old task-id viewer into an `Activity` surface and moved it under `System`.
- Reduced PR/review navigation to `Pull Requests` and `Review Queue`; top-level `Pipelines` now redirects into PR work.
- Added an Azure DevOps-backed `Pull Requests` workspace.
- Embedded latest configured pipeline run status into PR cards by matching recent runs to the PR source branch.
- Added Review Agent decision state for `auto_approved`, `needs_human_review`, and `blocked`.
- Added a default-off Review Agent auto-approval policy with auditable history fields and tests.
- Added a Review Queue API and desktop view backed by Review Agent history.
- Added structured chat workflow and approval events while preserving existing pending-action compatibility.
- Added a first tool capability registry so the planner sees actual registered Git/ADO operations instead of relying only on hard-coded workflow text.
- Replaced the fixed Git-to-PR fallback list with dynamic write-action derivation for stash, branch creation, stage, commit, push, and PR actions.
- Updated the desktop right-side workflow panel to render daemon-owned dynamic workflow state instead of deriving a fixed PR checklist from chat bubbles.
- Added a chat session state endpoint so restored conversations can reload persisted workflow state.
- Expanded the tool capability registry metadata and updated planner instructions so pending actions use registered write tools instead of a hard-coded Git-to-PR whitelist.
- Added initial expanded Git capabilities for `git_show`, `git_fetch`, `git_checkout`, and `git_restore`.
- Added additional Git capabilities for `git_merge_base`, `git_pull`, `git_merge`, and high-risk `git_rebase`.
- Renamed the chat stream model-output event from the old `thinking` vocabulary to `assistant_delta`.
- Extended pending-action derivation and tests for branch checkout, pull/merge/rebase intent, and path-scoped restore requests.
- Stopped exposing pending actions through the final `done` event and made desktop approval cards rely on structured `workflow_state` / `approval_required` events.
- Introduced `approvalProposal` as the internal planner result field while keeping `pendingAction` only as a deprecated compatibility alias for older stored sessions.
- Migrated session persistence to store new approval proposals under `approvalProposal`, with read-only fallback for legacy `pendingAction` session records.
- Updated the LLM JSON protocol to request `approval_proposal`, while retaining parser fallback for legacy `pending_action` output.
- Added planner tests that verify both `approval_proposal` parsing and legacy `pending_action` parser fallback.
- Started replacing right-panel Git prompt injection with structured workflow actions for branch checkout, branch creation, push, and commit preparation; these actions now create stored approval proposals instead of sending hidden chat prompts.
- Structured branch checkout/create approvals now include dirty-working-tree warnings and higher risk when pending changes exist.
- Structured commit workflows now carry workflow metadata and can advance from approved staging to commit approval, then from approved commit to push approval for commit-and-push flows, without returning to hidden prompt injection.
- Workflow state now exposes `workflowKind` and `workflowPhase`, and the desktop right-side panel renders commit workflows as business phases rather than raw Git probe history.
- Structured push approvals now probe upstream and ahead/behind divergence, then surface no-upstream, ahead, behind, diverged, up-to-date, or unknown readiness before approval.
- Empty-message commit preparation now generates a deterministic commit message from staged diff paths after `git_add`, then creates a normal `git_commit` approval instead of falling back to planner continuation.
- Structured branch checkout/create now probes current branch and branch inventory before approval, handles current-branch no-ops, creates tracking local branches for remote-only branches via `git_switch`, and blocks duplicate create-branch approvals.
- The desktop right-side Progress panel now shows compact structured details for branch preflight summaries, push readiness summaries, branch names, and proposed commit messages.
- Structured PR creation now probes source branch, working-tree status, latest commit subject, and Project Link ADO mapping before producing a high-risk `ado_create_pr` approval.
- After confirmed `ado_create_pr`, the daemon now clears approval state, marks the workflow as `pr/created`, and emits a deterministic final result with next suggestions for PR insight, policy status, and work-item linking.
- Structured PR follow-up actions now cover latest-active-PR fallback, deterministic PR insight summary, policy evaluation checks, linked work-item listing, high-risk approval before linking a work item, and deterministic post-link completion.
- Structured Git workspace actions now detect unresolved merge/rebase/cherry-pick/revert state and return blocked `git` workflow phases instead of producing unsafe normal write approvals.
- Structured rebase recovery actions now route through approval-backed `git_rebase` operations and right-panel controls instead of hidden prompt injection.
- Structured merge, cherry-pick, and revert recovery actions now route through approval-backed Git tools and the same right-panel recovery controls.
- Selected conflict-file staging now routes through a guarded `stage_resolved_conflicts` workflow action, producing path-scoped `git_add` approvals only for the active conflict set.
- Production chat fallback no longer uses `git_intent_translator` to emit deterministic Git/PR step lists when the model is unavailable. It now reports that no Git/PR workflow was inferred or executed, and points the user to structured Conversation actions or model recovery.
- The desktop right-panel commit menu no longer routes through a generic `commit_flow` frontend action. Commit, commit-and-push, and push now emit explicit `prepare_commit` / `push_branch` workflow requests, with Playwright coverage for the exact payloads.
- Conversation PR insight, policy, and linked-work-item actions now have coverage proving the UI sends structured workflow actions without a manually typed PR ID, while the daemon resolves the latest active PR from Azure DevOps for read-only PR follow-ups.

## Suggested Implementation Order

1. Add lightweight chat repository context retrieval using project docs, config files, and file-structure signals.
2. Add a non-blocking background index refresh path using the existing indexer, vector index, and embedding model.
3. Add an embedding-aware chat context path with graceful fallback when embeddings are unavailable.
4. Add the new event types while keeping compatibility with the current frontend.
5. Add `WorkflowState` to backend session state.
6. Emit `workflow_state` events from the daemon.
7. Update the frontend to render dynamic workflow state.
8. Replace `thinking` with `assistant_delta` and `progress`.
9. Move raw/debug details behind a debug toggle.
10. Expand Git tools through a capability registry.
11. Rewrite planner prompt around generic workflow orchestration and repository understanding.
12. Replace `pending_action` JSON with `approval_proposal` parsing and structured `approval_required` events.
13. Remove the fixed `WORKFLOW_STEPS` fallback.
14. Rename `Tasks` to `Activity` or `Runs` and render `/tasks` as an automatic execution history.
15. Implement the `Pull Requests` page as the developer PR workspace.
16. Fold pipeline status, failure diagnosis, and rerun actions into `Pull Requests`.
17. Replace `Review Findings` with `Review Queue`.
18. Add Review Agent decision state and auto-approval audit records.
19. Implement profile-level Review Agent auto-approval policy.
20. Add behavior tests for repo understanding, non-PR workflows, PR workflows, review decisions, and auto-approval.

## Acceptance Criteria

The optimization is successful when:

- Chat can answer repository understanding questions from a quick project scan when full indexing is not ready.
- Chat can use the embedding model for semantic context retrieval when configured and when an index is available.
- Chat can refresh repo index/embeddings asynchronously without blocking the conversation.
- Chat has a useful non-embedding fallback for project understanding.
- Chat does not start every conversation with Git commands by default.
- The agent can handle Git requests outside the stage/commit/push/PR path.
- The UI no longer shows raw model output as "thinking".
- Approval cards are generated from structured backend events, not parsed assistant prose.
- The right-side workflow panel reflects the actual user goal.
- Tool execution traces are available but not noisy by default.
- Session state can resume pending approvals and workflow progress reliably.
- Tests cover both PR and non-PR workflows.
- Top-level navigation keeps only `Pull Requests` and `Review Queue` for PR/review work.
- Pipeline functionality is available inside PR readiness and review decisions instead of a standalone page.
- `Review Queue` can separate auto-approved, blocked, watching, and human-review PRs.
- The Review Agent can automatically approve low-risk PRs when profile policy allows it.
- Every auto-approval has an auditable decision record.
