# MergePilot Product Roadmap And Reuse Plan

> **Historical implementation record — superseded for product scope.** As of
> 2026-08-05, use [`docs/product/README.md`](product/README.md), the canonical
> outcome roadmap, and cycle documents for product decisions and development
> order. Reuse research and implementation evidence in this file remain useful;
> its Review Queue, auto-approval, page expansion, and old phase-order
> assumptions no longer authorize new work.

## Purpose

This document describes how the current MergePilot should evolve into the
ideal product: a local-first CI/CD agent desktop runtime that understands a
repository, reasons about Git and Azure DevOps state, executes approved
developer workflows, reviews pull requests, analyzes pipeline failures, and
keeps an auditable activity trail.

Progress is tracked separately in
[`dev-agent-progress-tracker.md`](dev-agent-progress-tracker.md). Update that
tracker after every meaningful development session.

Third-party source reuse is tracked in
[`third-party-source-reuse.md`](third-party-source-reuse.md). Update that file
before adding dependencies, vendoring source, copying upstream files, or
porting upstream behavior.

The goal is not to rebuild every subsystem from scratch. Wherever possible,
the product should reuse mature open-source architecture, code, protocols, and
workflow patterns.

## Target Product Definition

The final product should be a local-first MergePilot Harness:

```text
Tauri Desktop App
  -> Local Node.js Daemon
    -> Agent Runtime / Workflow Engine
      -> Context Builder
      -> Tool Registry / MCP Client
      -> Permission Manager
      -> Executor
      -> Verifier
      -> Rollback / Checkpoint Manager
      -> Activity Timeline
    -> Git / Filesystem / Build / Test / Azure DevOps / MCP Tools
    -> SQLite / Vector Index / Session Store / Audit Store
    -> Cloud LLMs or Local LLMs
```

It should feel less like a chatbot and more like a governed local automation
runtime for development work.

## Current Project Strengths

The current codebase already has useful foundations:

- Desktop application surface in `apps/desktop`.
- Local Fastify daemon in `packages/daemon`.
- Shared agent, context, tool, profile, memory, telemetry, and review logic in
  `packages/core`.
- Cloud Review Agent in `packages/review-agent`.
- Git, npm, pytest, dotnet, and Azure DevOps tool adapters.
- Chat sessions streamed over SSE.
- Local and optional Cosmos-backed chat persistence.
- Repository indexing, SQLite storage, and vector index primitives.
- Azure DevOps PR, pipeline, review history, and Review Queue surfaces.
- Initial workflow state and structured approval events.
- Profile-based configuration for repository, test, build, pipeline, and ADO
  settings.

These are strong building blocks. The remaining work is mainly about making the
agent runtime safer, more general, more reusable, and more product-grade.

## Current Shortcomings

### 1. Tool Permission Is Still Too Prompt-Driven

The planner prompt tells the model to propose approvals for risky actions, but
the execution layer still allows the model to call tools directly. This means
approval safety depends too much on model compliance.

Required improvement:

- Add execution-layer permission checks before every tool call.
- Classify every tool by risk, side effects, workspace scope, and approval
  requirement.
- Convert disallowed direct tool calls into `approval_required` events.
- Never allow prompt text alone to be the final safety boundary.

Reusable reference:

- OpenHarness has an explicit async approval callback around tool execution:
  `approve: async ({ toolName }) => ...`.
- Goose is a useful reference for local agent tooling and extension security.
- Model Context Protocol reference servers show how tools can be exposed with a
  structured tool boundary, but production safeguards must be added by this
  project.

### 2. Semantic Repository Context Exists But Is Not Fully Used

The project has repo indexing and vector search primitives, but chat context
currently leans heavily on quick file scans and heuristic matching. Semantic
retrieval should become a first-class part of chat and workflow planning.

Required improvement:

- Enable semantic retrieval when embeddings are configured and an index exists.
- Refresh indexing in the background without blocking chat.
- Fall back gracefully to README/config/tree/diff heuristics.
- Show context retrieval progress in the UI.
- Persist context snapshots for later audit and replay.

Reusable reference:

- Aider's repo-map approach is a strong reference for compact repository
  understanding.
- Continue's source-controlled configuration and project context conventions
  are useful even though the repository is now read-only.
- OpenHands can be studied for larger-scale agent context handling, especially
  around software engineering tasks.

### 3. Chat Streaming Is Not Yet A Clean Product Protocol

The frontend can handle `assistant_delta`, `workflow_state`, and
`approval_required`, but the backend planner still accumulates model text and
parses final JSON. The protocol mixes user-facing text, control data, and model
formatting constraints.

Required improvement:

- Split user-facing response streaming from control events.
- Keep final structured state out of assistant prose.
- Define one canonical event protocol:
  - `session.started`
  - `text.delta`
  - `progress`
  - `tool.started`
  - `tool.completed`
  - `approval.required`
  - `approval.resolved`
  - `workflow.updated`
  - `final`
  - `error`
  - `cancelled`
- Make the desktop UI render only clean conversation content by default.
- Move raw JSON and full tool payloads into debug mode.

Reusable reference:

- OpenHarness streams typed events to CLI and web surfaces.
- Goose's desktop, CLI, and API split is a strong model for multiple frontends
  over one runtime.
- OpenCode is useful for terminal-oriented session and event UX patterns.

### 4. Workflow State Is Too Shallow

The current workflow state is mostly `status`, `currentStep`, completed tools,
and pending approval. It is useful for the current right panel, but it is not
yet a real state machine.

Required improvement:

- Introduce a durable `WorkflowState` model:

```ts
interface WorkflowState {
  id: string;
  goal: string;
  type:
    | "inspect_branch"
    | "prepare_pr"
    | "commit_local_changes"
    | "sync_branch"
    | "run_validation"
    | "fix_pipeline_failure"
    | "review_pr"
    | "auto_approve_pr"
    | "custom";
  status:
    | "planning"
    | "running"
    | "waiting_for_approval"
    | "blocked"
    | "failed"
    | "done"
    | "cancelled";
  facts: WorkflowFact[];
  steps: WorkflowStep[];
  pendingApproval?: ApprovalRequest;
  result?: WorkflowResult;
}
```

- Persist workflow state separately from chat messages.
- Render workflow state directly in the right panel.
- Support workflow resume after app restart.
- Stop reconstructing important state from assistant text.

Reusable reference:

- Harness Agents are a strong product reference: agents are pipeline-native,
  governed, observable, and backed by explicit YAML/runtime definitions.
- mcp-agent is useful for simple programmatic control flow and persistent state.
- OpenHarness middleware and typed event model can be adapted for the local
  runtime.

### 5. Git Safety And Rollback Are Not Mature Enough

The product performs Git operations, but it does not yet have a mature
checkpoint, undo, or rollback discipline.

Required improvement:

- Create a checkpoint before any write action.
- Store before/after Git status and diff metadata.
- Provide undo for local writes where possible.
- Require stronger approval for destructive operations.
- Validate path arguments stay within the repository.
- Treat operations that mutate `.git` metadata, such as `fetch`, as side-effect
  operations even if they do not modify the working tree.

Reusable reference:

- Aider's auto-commit and rollback-friendly workflow is the best reference.
- OpenHarness sandbox/file-system providers are relevant to path-boundary
  control.
- Model Context Protocol Git server history is useful, but security issues in
  Git MCP implementations show that this project must add strict validation
  rather than blindly trusting external servers.

### 6. Azure DevOps Integration Is Valuable But Too Custom

The project already has ADO clients and tools, but the ADO tool surface can grow
very large: projects, repos, work items, PRs, builds, releases, test plans,
policies, wiki, search, and advanced security.

Required improvement:

- Avoid hand-writing every ADO capability.
- Add MCP support and integrate Azure DevOps MCP where possible.
- Load only selected domains per Project Link to avoid tool overload.
- Keep local approval and audit controls in front of ADO tools.
- Continue using custom ADO logic only where the product needs specialized
  behavior, such as PR readiness and Review Queue decisions.

Reusable reference:

- `microsoft/azure-devops-mcp` should be the primary reference or dependency
  candidate for ADO tools.
- PR-Agent can be reused or studied for Azure DevOps PR review support.
- Harness Agents provide a strong reference for pipeline-native DevOps agent
  governance.

### 7. Review Agent Needs Stronger Decision Policy

The Review Agent already has review history and queue concepts, but the final
product needs an auditable decision system that can distinguish between PRs
that are safe, uncertain, blocked, or waiting.

Required improvement:

- Separate review findings from review decisions.
- Store risk score, confidence, changed areas, sensitive files, policy status,
  pipeline status, and decision reason.
- Implement profile-level auto-approval policy.
- Auto-approve only when all policy gates pass.
- Record full audit metadata for every auto-approval.
- Support manual override actions.

Reusable reference:

- PR-Agent is the strongest open-source reference for PR review commands,
  platform abstraction, PR compression, and configurable review behavior.
- Harness Staff Engineer PR Review Agent examples are useful for prompt shape,
  decision format, and pipeline context injection.
- OpenHands can be studied for broader software engineering evaluation, but it
  is too heavy to embed directly.

### 8. The Desktop Product Surface Needs Clearer Separation

The current desktop UI is already more than a chat page, but the final product
needs clearer surfaces for different jobs.

Required improvement:

- Chat: intent input, explanation, and controlled execution.
- Pull Requests: developer readiness workspace.
- Review Queue: approver and automation decision workspace.
- Activity: audit history of agent runs and background tasks.
- Profiles: repo, ADO, LLM, policy, build/test, and pipeline settings.
- Settings: provider, auth, storage, telemetry, and security.

Reusable reference:

- Goose desktop is the closest reference for local agent desktop ergonomics.
- OpenCode desktop beta and CLI are useful for multi-surface product thinking.
- Harness Agents are useful for marketplace/template concepts, but the UX should
  remain local-first rather than pipeline-only.

## Reusable Repositories And What To Reuse

## Source-First Reuse Strategy

The preferred strategy for future development is source-first reuse:

1. Reuse mature source code directly where the license, runtime, and packaging
   model allow it.
2. Modify and adapt reused modules inside this repository only after the
   original boundaries are understood.
3. Avoid reimplementing mature subsystems from scratch unless the upstream code
   is incompatible with the product's runtime, license, security model, or
   packaging goals.

This project should treat external repositories as candidate components, not
only architecture references.

### License Gate

Before copying, vendoring, forking, or embedding source code, every candidate
must pass a license gate.

Current preferred licenses:

- MIT: safe for direct source reuse with attribution and license preservation.
- Apache-2.0: safe for direct source reuse with attribution, license
  preservation, and NOTICE handling when applicable.

Avoid or require explicit approval for:

- GPL, AGPL, LGPL, or other copyleft licenses.
- Business Source License or source-available licenses.
- Repositories without a clear license file.
- Mixed-license directories where a copied submodule may have a different
  license than the root repository.

For every reused source component, record:

- upstream repository URL
- upstream commit SHA
- license
- copied paths
- local destination paths
- local modifications
- reason for reuse
- known upgrade risks

Recommended location:

```text
docs/third-party-source-reuse.md
third_party/
  <project-name>/
    LICENSE
    NOTICE
    SOURCE.md
```

### Reuse Modes

Use one of these reuse modes for each candidate:

| Mode | When To Use | Example |
| --- | --- | --- |
| Dependency | Package is stable and available for Node/TS | `@openharness/core` |
| External process | Tool is useful but best run as its own process | Azure DevOps MCP server |
| Fork | We want to track upstream but need broad modifications | PR-Agent review logic |
| Vendor source | Small module can be copied and adapted safely | event protocol helpers, repo map ideas |
| Port | Source is useful but runtime is different | Aider Python repo-map to TypeScript |
| Reference only | Code is too large, too coupled, or wrong runtime | OpenHands full platform |

### Direct Source Reuse Priority

The following table ranks components by how aggressively the project should try
to reuse source code.

| Priority | Upstream | License | Reuse Preference | Why |
| --- | --- | --- | --- | --- |
| 1 | `microsoft/azure-devops-mcp` | MIT | External process or selective source reuse | Official ADO domain tools; avoids hand-writing every ADO operation |
| 2 | `MaxGfeller/open-harness` / `@openharness/core` | MIT | Dependency first, source fork if needed | TypeScript-native harness, typed events, tool approval, middleware |
| 3 | `The-PR-Agent/pr-agent` | Apache-2.0 | Fork or selective port | Mature PR review, PR compression, platform adapters |
| 4 | `Aider-AI/aider` | Apache-2.0 | Selective port | Repo map, Git checkpoint discipline, diff workflow |
| 5 | `aaif-goose/goose` | Apache-2.0 | Selective source study or port | Desktop/CLI/API runtime, provider and extension architecture |
| 6 | `anomalyco/opencode` | MIT | Selective source study or port | Modern coding agent session and terminal UX |
| 7 | `lastmile-ai/mcp-agent` | Apache-2.0 | Selective port | MCP-first orchestration patterns, persistent state ideas |
| 8 | `OpenHands/OpenHands` | MIT core with additional license boundaries | Reference only unless a small module is isolated | Heavy platform; useful for sandbox and eval concepts |

### Source Reuse Rules

When reusing source directly:

- Keep upstream files mechanically separate at first.
- Preserve upstream license headers.
- Add a local `SOURCE.md` explaining what was copied and why.
- Add tests before adapting behavior.
- Replace upstream network/auth/storage assumptions with this project's profile
  and settings model.
- Route all tool execution through the local capability registry and approval
  gate.
- Route all logs through this project's redaction and telemetry layer.
- Do not let copied source bypass workspace boundary checks.
- Prefer thin adapters around copied code before deep rewrites.

### Dependency Reuse Rules

When using an upstream package directly:

- Pin exact versions.
- Add a compatibility wrapper in `packages/core/src/integrations`.
- Keep product code independent from upstream-specific event names and schemas.
- Map upstream events into this project's canonical event protocol.
- Add tests around wrapper behavior.
- Track upgrade risk in documentation.

### Fork Reuse Rules

When forking an upstream project:

- Fork only when the expected local modifications are too large for a thin
  adapter.
- Keep the fork in a separate repository or `third_party` subtree.
- Preserve upstream history when possible.
- Document the upstream remote and sync strategy.
- Keep local product-specific patches small and named.
- Rebase or merge upstream periodically only after tests pass.

### Porting Rules

When porting logic from Python/Rust/Go to TypeScript:

- Port behavior, not incidental implementation details.
- Write fixtures from the upstream behavior before porting.
- Keep the first port intentionally small.
- Prefer pure functions first, then integrate with the daemon.
- Record what was intentionally not ported.

### Recommended Source-First Implementation Sequence

1. Integrate Azure DevOps MCP as an external process.
2. Add an MCP adapter layer that maps external MCP tools into the local
   capability registry.
3. Evaluate `@openharness/core` as a dependency for typed events, tool
   approval, and middleware.
4. If `@openharness/core` fits, wrap it. If it does not fit, selectively copy
   and adapt the smallest useful pieces.
5. Fork or vendor PR-Agent review/compression logic for Review Agent
   improvement.
6. Port Aider's repo-map and Git checkpoint concepts into TypeScript.
7. Study Goose and OpenCode only for runtime and UX modules that can be
   isolated cleanly.
8. Use OpenHands only for sandbox/evaluation references unless a very small
   MIT-compatible module is clearly useful.

### Reuse Risk Register

| Risk | Mitigation |
| --- | --- |
| Upstream code bypasses local approval | Wrap all tools behind local capability registry |
| License obligations are missed | Add third-party source registry and preserve license files |
| Runtime mismatch creates packaging burden | Prefer external process or port over embedding |
| Copied code becomes unupgradeable | Preserve upstream commit SHA and isolate local patches |
| Large upstream architecture overwhelms this product | Reuse modules, not whole platforms |
| MCP tool exposes too much power | Enable domains per Project Link and require approval for write tools |
| PR review logic becomes too platform-specific | Keep a platform adapter boundary around ADO/GitHub/GitLab logic |
| Fork drifts from upstream | Schedule periodic upstream sync and regression tests |

### 1. aaif-goose/goose

Repository: <https://github.com/aaif-goose/goose>

Best fit:

- Local desktop plus CLI plus API architecture.
- Extension-based local tools.
- MCP-centric agent ecosystem.
- Multi-provider LLM support.
- Local execution UX and session design.

Reuse strategy:

- Study runtime module boundaries.
- Study how desktop, CLI, and API share one core agent runtime.
- Borrow ideas for provider abstraction and extension configuration.
- Do not directly port Rust code unless the product intentionally moves the
  daemon from Node.js to Rust.

### 2. microsoft/azure-devops-mcp

Repository: <https://github.com/microsoft/azure-devops-mcp>

Best fit:

- Azure DevOps tools exposed through MCP.
- Work items, repositories, pipelines, test plans, wiki, search, and other
  domains.
- Local stdio and remote MCP direction.
- Official Microsoft implementation and domain organization.

Reuse strategy:

- Integrate as an external MCP server instead of rewriting all ADO tools.
- Use profile settings to enable only required domains.
- Keep local approval and policy controls in this project.
- Keep custom PR readiness and Review Queue logic where product-specific
  decisions are needed.

### 3. The-PR-Agent/pr-agent

Repository: <https://github.com/The-PR-Agent/pr-agent>

Best fit:

- PR review automation.
- PR summary, review, improve, ask, and configuration-driven behavior.
- Platform support including Azure DevOps.
- Large PR handling through compression strategies.

Reuse strategy:

- Reuse prompt structure and review categories where licensing allows.
- Study PR compression and file filtering logic.
- Reuse ideas for `/review`, `/improve`, and `/ask` commands inside the Pull
  Requests surface.
- Compare Review Agent output schema against PR-Agent output to avoid inventing
  unnecessary review concepts.

### 4. OpenHarness / @openharness/core

Project: <https://open-harness.dev/>

Best fit:

- TypeScript-native agent harness primitives.
- Typed streaming events.
- Tool permission callbacks.
- Middleware for retry, persistence, compaction, and tracking.
- MCP integration.

Reuse strategy:

- Study the event protocol and approval API first.
- Consider adopting or adapting its approval callback pattern.
- Consider using its SDK if it fits the current Node.js runtime without forcing
  too much architecture churn.
- Use it as the main reference for turning `ChatPlanner` into a cleaner
  harness.

### 5. lastmile-ai/mcp-agent

Repository: <https://github.com/lastmile-ai/mcp-agent>

Best fit:

- MCP-first agent orchestration.
- Simple workflow patterns instead of over-complex graph systems.
- Human input and external signals.
- Persistent state and durable execution concepts.

Reuse strategy:

- Do not port Python directly into the daemon.
- Reuse workflow concepts, MCP client strategy, and state model ideas.
- Use as a design reference for keeping agent orchestration explicit and
  debuggable.

### 6. Aider-AI/aider

Repository: <https://github.com/aider-ai/aider>

Best fit:

- Git-native coding workflow.
- Repo map and context selection.
- Diff-based editing.
- Auto-commit and rollback-friendly discipline.
- Practical local developer ergonomics.

Reuse strategy:

- Study repo map and file selection logic.
- Adopt the principle of checkpointing before and after edits.
- Reuse workflow ideas for commit message generation and diff explanation.
- Keep implementation in TypeScript unless direct Python integration is
  intentionally introduced.

### 7. anomalyco/opencode

Repository: <https://github.com/anomalyco/opencode>

Best fit:

- Modern open-source coding agent.
- CLI and desktop distribution.
- Session, provider, tool, and terminal UX ideas.
- TypeScript ecosystem relevance.

Reuse strategy:

- Study session management, provider abstraction, and UI event design.
- Use as a reference for developer-facing ergonomics.
- Avoid older `opencode-ai/opencode`, which has been archived.

### 8. OpenHands/OpenHands

Repository: <https://github.com/OpenHands/OpenHands>

Best fit:

- Full autonomous software development platform.
- Sandbox and agent server ideas.
- Evaluation infrastructure.
- End-to-end issue-to-code workflows.

Reuse strategy:

- Use as a reference for sandboxing, evaluation, and software-engineering agent
  behavior.
- Do not embed directly into the desktop daemon; it is much heavier than the
  current product needs.
- Watch licensing boundaries, especially enterprise-only code.

### 9. modelcontextprotocol/servers

Repository: <https://github.com/modelcontextprotocol/servers>

Best fit:

- MCP reference servers for Git, filesystem, memory, fetch, time, and related
  capabilities.
- Official SDK usage examples.

Reuse strategy:

- Use for learning and prototyping MCP integration.
- Do not treat reference servers as production-ready.
- Add strict local validation, workspace scoping, approval, and logging before
  allowing any MCP tool to mutate the repository or external systems.

### 10. Harness Agents

Product reference: <https://www.harness.io/products/harness-ai/agents>

Best fit:

- Pipeline-native agent product model.
- Governance, RBAC, secrets, observability, and audit concepts.
- Agent templates as reusable pipeline definitions.
- CI autofix, code review, coverage, and remediation use cases.

Reuse strategy:

- Use as a product and architecture reference rather than a direct code source.
- Adopt the principle that DevOps agents should inherit execution context,
  permissions, secrets, and audit boundaries.
- Adapt the template concept into local workflow templates and profile policies.

## Final Product Capability Gap

The following table maps the final ideal product to the current gaps and reuse
options.

| Capability | Current State | Gap | Best Reference |
| --- | --- | --- | --- |
| Local desktop + daemon runtime | Present | Needs cleaner shared runtime boundary | Goose, OpenCode |
| Typed streaming event protocol | Partial | Backend does not fully stream clean user text | OpenHarness, Goose |
| Execution-layer approval | Weak | Prompt-driven safety, no hard gate before every tool | OpenHarness |
| Repository semantic context | Partial | Vector path exists but chat does not fully use it | Aider, Continue, OpenHands |
| MCP tool ecosystem | Missing or early | Internal tools are custom adapters | Azure DevOps MCP, mcp-agent, MCP servers |
| Git checkpoint / rollback | Weak | No systematic pre-write checkpoint | Aider |
| Workflow state machine | Partial | State is mostly tool history | Harness Agents, mcp-agent |
| PR review quality | Partial | Needs compression, review categories, decision policy | PR-Agent |
| Pipeline failure analysis | Partial | Needs logs, root cause, fix plan, validation loop | Harness Agents |
| Review Queue / auto-approval | Partial | Needs stronger policy and audit model | PR-Agent, Harness Agents |
| Audit and observability | Partial | Needs replayable traces and structured run records | Harness Agents, OpenHands |
| Sandbox / workspace boundaries | Partial | Needs stronger path and command validation | OpenHands, MCP servers, OpenHarness |

## Development Plan

### Phase 1: Safety And Protocol Stabilization

Goal:

Make the current agent safe enough to execute workflows reliably.

Work items:

- Add execution-layer approval checks for every tool call.
- Extend the tool capability registry with:
  - side-effect type
  - workspace mutation
  - external API mutation
  - destructive potential
  - approval requirement
  - required scopes
- Reclassify Git tools.
- Convert risky direct tool calls into approval proposals.
- Replace legacy event names with a canonical typed event model.
- Make `assistant_delta` or equivalent real, or remove it from the product
  protocol until the backend can support it correctly.
- Add tests for:
  - direct `git_push` call is blocked
  - direct `git_commit` call is blocked
  - direct `ado_create_pr` call is blocked
  - approval confirmation executes exactly the stored action
  - approval cancellation clears the pending action

Reuse targets:

- OpenHarness approval callbacks.
- Goose event/runtime separation.
- MCP tool schema conventions.

Exit criteria:

- Risky tools cannot execute without explicit approval.
- UI receives clean structured events.
- Approval can survive session reload.
- Tests cover approval, cancellation, and risky direct tool calls.

### Phase 2: Repository Understanding Upgrade

Goal:

Make chat and workflows project-aware before they act.

Work items:

- Enable semantic retrieval when embeddings are configured.
- Add index status metadata to chat context.
- Persist context snapshots per workflow turn.
- Add a repo summary cache.
- Add file relevance scoring based on:
  - changed files
  - imports
  - tests
  - config files
  - semantic search
  - profile build/test settings
- Add fallback behavior when embeddings are unavailable.
- Add UI progress events:
  - `Reading project context`
  - `Checking Git state`
  - `Retrieving related code`
  - `Indexing changed files`

Reuse targets:

- Aider repo map.
- Continue project config and context conventions.
- OpenHands context and evaluation patterns.

Exit criteria:

- Project understanding questions do not start with Git commands by default.
- Branch/diff questions include Git state and changed files.
- Code-location questions include relevant files and symbols.
- Semantic retrieval is used when available.

### Phase 3: Real Workflow Engine

Goal:

Replace ad hoc continuation and tool-history-derived UI with durable workflow
state.

Work items:

- Introduce `WorkflowState`.
- Introduce workflow templates:
  - `inspect_branch`
  - `prepare_pr`
  - `commit_local_changes`
  - `sync_branch`
  - `run_validation`
  - `fix_pipeline_failure`
  - `review_pr`
  - `auto_approve_pr`
- Store facts separately from messages.
- Store tool traces separately from assistant responses.
- Add workflow resume.
- Add workflow failure and blocked reasons.
- Update the right-side panel to render steps and facts from workflow state.

Reuse targets:

- Harness Agents template model.
- mcp-agent simple programmatic workflow patterns.
- OpenHarness middleware/event design.

Exit criteria:

- The right panel accurately reflects the user's actual goal.
- Non-PR workflows no longer look like PR workflows.
- Workflow state can be reloaded after app restart.
- Tool history is not the source of truth for planned steps.

### Phase 4: MCP And Azure DevOps Tool Expansion

Goal:

Avoid hand-building every tool by adopting MCP as the external tool layer.

Work items:

- Add MCP client support to the daemon.
- Add profile-level MCP server configuration.
- Integrate Azure DevOps MCP.
- Enable ADO domains per Project Link:
  - `core`
  - `repositories`
  - `work-items`
  - `pipelines`
  - `test-plans`
  - `wiki`
  - `search`
- Map MCP tool capabilities into the local capability registry.
- Apply local approval rules to MCP tools.
- Add audit logging for MCP calls.
- Keep custom wrappers for high-value product workflows.

Reuse targets:

- microsoft/azure-devops-mcp.
- modelcontextprotocol/servers.
- lastmile-ai/mcp-agent.
- OpenHarness MCP integration.

Exit criteria:

- The daemon can connect to configured MCP servers.
- ADO tools can be loaded by domain.
- Risky MCP tools require local approval.
- Tool traces show source server, tool name, args, and result summary.

### Phase 5: Pull Request Workspace

Goal:

Turn Pull Requests into the main developer readiness surface.

Work items:

- List active PRs for the selected profile.
- Show:
  - source branch
  - target branch
  - reviewers
  - policies
  - linked work items
  - pipeline status
  - unresolved comments
  - Review Agent findings
  - readiness summary
- Add actions:
  - open in ADO
  - checkout branch
  - summarize diff
  - explain pipeline failure
  - rerun pipeline
  - prepare next commit
  - respond to reviewer comments
- Add PR-specific chat context.

Reuse targets:

- Azure DevOps MCP for PR, pipeline, work item, and policy data.
- PR-Agent for PR summarization and review commands.
- Harness Agents for pipeline-native failure diagnosis concepts.

Exit criteria:

- A developer can answer: "What is blocking my PR, and what should I do next?"
- PR readiness is based on ADO state plus local repository context.
- Pipeline status is part of PR readiness, not a separate top-level product.

### Phase 6: Review Queue And Auto-Approval

Goal:

Make Review Queue the decision surface for approvers and automation.

Work items:

- Implement decision queues:
  - `Auto-approved`
  - `Needs human review`
  - `Blocked`
  - `Watching`
- Add policy model:
  - target branches
  - author allow/block lists
  - sensitive paths
  - max changed files
  - max diff lines
  - required green pipeline
  - required linked work item
  - minimum confidence
  - no blocking findings
- Add decision audit records.
- Add manual review actions:
  - approve
  - request changes
  - dismiss finding
  - confirm finding
  - escalate
- Add Review Agent re-run.

Reuse targets:

- PR-Agent review categories and PR compression.
- Harness Staff Engineer PR Review Agent prompt structure.
- Azure DevOps MCP for PR, policy, pipeline, and review operations.

Exit criteria:

- Low-risk PRs can be auto-approved only when policy allows it.
- Every decision has an audit record.
- Review Queue clearly separates safe, uncertain, blocked, and waiting PRs.

### Phase 7: Verification, Rollback, And Activity Timeline

Goal:

Make every agent action verifiable, explainable, and recoverable.

Work items:

- Add pre-write checkpoints.
- Add post-action verification.
- Run profile-specific build/test/lint commands.
- Store run records:
  - user goal
  - context snapshot
  - plan
  - approvals
  - tool calls
  - command outputs
  - diffs
  - validation results
  - final result
- Add Activity search and filters.
- Add local undo for safe operations.
- Add exportable audit log.

Reuse targets:

- Aider for Git checkpoint discipline.
- OpenHands for sandbox and evaluation concepts.
- Harness Agents for observable pipeline-native execution.

Exit criteria:

- Every workflow can be replayed from stored trace data.
- Every write operation has a before/after record.
- Users can understand what happened without reading raw logs.

### Phase 8: Product Hardening And Distribution

Goal:

Prepare for real team usage.

Work items:

- Improve installer and signing.
- Add first-run onboarding.
- Add health checks for Git, Node, daemon, ADO, LLM, embeddings, and MCP.
- Add telemetry opt-in and local-only mode.
- Add Azure auth refresh handling.
- Add workspace boundary enforcement.
- Add command allowlist policy.
- Add profile migration and backup.
- Validate against real Azure DevOps repositories.

Reuse targets:

- Goose distribution and multi-surface packaging ideas.
- OpenCode desktop and CLI distribution references.
- Harness governance model for secrets, permissions, and audit.

Exit criteria:

- A new developer can install, configure, and run the product without touching
  repo internals.
- A team can adopt the product with clear security boundaries.
- Real PR and pipeline workflows have been validated end to end.

## Recommended Implementation Order

The safest implementation order is:

1. Execution-layer approval and tool risk registry.
2. Clean typed event protocol.
3. Semantic repository context.
4. Durable workflow state.
5. Git checkpoint and rollback.
6. MCP client support.
7. Azure DevOps MCP integration.
8. Pull Requests workspace upgrade.
9. Review Queue and auto-approval policy.
10. Activity timeline and audit replay.
11. Packaging, signing, onboarding, and real-world validation.

This order avoids building a large platform before the current agent is safe
and predictable.

## Architecture Decision Guidance

### Prefer Reuse Over Reimplementation

Reuse should be preferred when:

- The external project owns a broad integration surface, such as Azure DevOps.
- The external project has already solved a generic agent runtime problem.
- The external project provides a standard protocol, such as MCP.
- The behavior can be adapted behind the local approval and audit system.

Reimplementation is acceptable when:

- The workflow is core product differentiation.
- Security rules must be stricter than the upstream project.
- The upstream project is too heavy for a local desktop daemon.
- The code is in a language/runtime that would make packaging harder.

### Keep Product-Specific Logic Local

The following should remain local product logic:

- Workflow state.
- Approval policy.
- Risk classification.
- Review Queue decision policy.
- Auto-approval rules.
- Activity timeline.
- Profile model.
- Local persistence.
- UI rendering.

External repos should provide tools, patterns, and reusable runtime ideas, not
own the product's safety model.

### Treat MCP As A Tool Boundary, Not A Trust Boundary

MCP gives the project a standard way to connect tools, but it does not remove
the need for:

- path validation
- argument validation
- command allowlists
- approval gates
- result redaction
- audit logging
- prompt-injection resistance
- per-profile domain restrictions

All MCP tools should pass through the same local capability registry as native
tools.

## Final Acceptance Criteria

The product can be considered complete when:

- Users can ask project understanding questions and receive repo-grounded
  answers without unnecessary Git commands.
- Users can run Git, PR, test, build, and pipeline workflows through chat with
  clear approval gates.
- Risky operations cannot execute without execution-layer approval.
- The workflow panel shows the actual current goal, plan, facts, progress, and
  pending approval.
- Pull Requests shows readiness, pipeline, policy, work item, and review state.
- Review Queue separates PRs by decision state and supports policy-based
  auto-approval.
- Every auto-approval has a complete audit record.
- Every agent run has a replayable activity trace.
- The product can integrate external tools through MCP while preserving local
  safety controls.
- The desktop app can be installed and used by a developer without manual
  development setup.
