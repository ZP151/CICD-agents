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
