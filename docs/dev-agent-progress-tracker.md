# Dev Agent Progress Tracker

## Purpose

This tracker is the durable project progress board for the Dev Agent product
roadmap. It should be updated after every meaningful development session.

Use this file to answer:

- Which phase are we in?
- What has already been completed?
- What is partially implemented?
- What is still missing?
- Which upstream projects are being reused?
- What is the next concrete development target?

Status values:

- `Not started`: no implementation work has begun.
- `Researching`: source candidates, license, and reuse boundary are being
  evaluated.
- `In progress`: implementation has started.
- `Partial`: useful code exists, but acceptance criteria are not met.
- `Blocked`: cannot continue without a decision, dependency, credential, or
  external setup.
- `Complete`: acceptance criteria are met and verified.

## Current Overall Status

| Area | Status | Completion | Notes |
| --- | --- | ---: | --- |
| Product roadmap | Complete | 100% | Roadmap and source-first reuse plan documented in `docs/dev-agent-product-roadmap-and-reuse-plan.md`. |
| Current-state audit | Complete | 100% | Main shortfalls identified: prompt-driven approval, shallow workflow state, incomplete semantic retrieval, weak rollback, custom ADO tooling. |
| Source-first reuse strategy | Complete | 100% | Reuse modes, license gate, priority table, risk register, and third-party source registry documented. OpenHarness and Azure DevOps MCP source have been vendored for direct reuse. |
| Implementation phases | In progress | 82% | Progress is tracked against product readiness rather than accumulated implementation activity. PR insight, Review Queue, Activity, checkpointing, internal ADO tools, and Chat use-case coverage are usable foundations. The largest remaining gaps are durable workflow execution for broader write workflows, richer repository understanding UX, complete ADO OAuth recovery, live ADO validation, and production hardening. Recent work added explicit workflow kind/phase metadata, right-panel phase rendering for structured commit workflows, push readiness checks before push approval, structured commit-message generation after staging, branch checkout/create preflight, right-panel metadata details, a first-class create-PR workflow action, deterministic PR-created completion state, retired fixed Git-to-PR continuation from the production chat path, structured PR insight/policy/work-item follow-up actions, conflict-aware Git workflow blocking, first-class structured rebase/merge/cherry-pick/revert recovery approvals, and guarded selected-conflict-file staging. |
| Verification | Partial | 98% | Focused typechecks/builds and a broad historical test suite have passed during recent sessions. Chat use-case catalog, offline Git intent routing, structured commit workflows, generated commit-message continuation, push readiness, branch preflight, create-PR workflow, PR-created completion, structured PR insight/policy/work-item follow-ups, legacy workflow retirement, conflict-aware Git workflow blocking, structured rebase and merge abort recovery, selected conflict-file staging, Git recovery tool options, conversation part rendering, and Chat layout browser smoke coverage now have focused tests, but broader durable write workflows, ADO OAuth recovery, live ADO PR/pipeline validation, and live-agent desktop verification still need coverage. |

## Phase Progress Summary

| Phase | Name | Status | Completion | Primary Goal | Reuse Target |
| --- | --- | --- | ---: | --- | --- |
| 0 | Planning, Audit, And Reuse Strategy | Complete | 100% | Understand current gaps and choose source-first reuse path. | All candidate repos |
| 1 | Safety And Event Protocol | In progress | 60% | Hard approval gate and clean event protocol. | OpenHarness, Goose |
| 2 | Repository Understanding | In progress | 24% | Make semantic repo context first-class. | Aider, Continue, OpenHands |
| 3 | Durable Workflow Engine | In progress | 48% | Replace shallow workflow state with real workflow model. | OpenHarness, mcp-agent, Harness Agents |
| 4 | MCP And Azure DevOps Tool Reuse | In progress | 74% | Internalize ADO MCP capabilities and map them into local policies. | microsoft/azure-devops-mcp |
| 5 | Pull Requests Workspace | In progress | 91% | PR readiness workspace with ADO and local repo context. | Azure DevOps MCP, PR-Agent |
| 6 | Review Queue And Auto-Approval | In progress | 73% | Auditable review decisions and low-risk auto-approval. | PR-Agent, Harness Agents |
| 7 | Verification, Rollback, And Activity Timeline | In progress | 52% | Checkpoints, validation, replayable audit history. | Aider, OpenHands |
| 8 | Product Hardening And Distribution | In progress | 34% | Installer, onboarding, auth, workspace policies, real validation. | Goose, OpenCode |

## Phase 0: Planning, Audit, And Reuse Strategy

Status: `Complete`

Completion: `100%`

Goal:

Define the target product, identify current project gaps, and decide how future
development should maximize reuse of mature source code.

Completed:

- Audited current chat, daemon, planner, context, tool, workflow, and desktop UI
  code paths.
- Identified major shortfalls:
  - approval depends too much on prompt compliance
  - semantic context path is not fully used in chat
  - backend does not truly stream clean assistant text
  - workflow state is too shallow
  - Git checkpoint and rollback are immature
  - ADO tool surface is too custom
  - Review Queue needs stronger policy and audit model
- Created `docs/dev-agent-product-roadmap-and-reuse-plan.md`.
- Added source-first reuse strategy.
- Ranked reusable upstream projects.

Acceptance criteria:

- Roadmap exists.
- Current gaps are documented.
- Source reuse candidates are documented.
- Reuse modes and license gates are documented.

Verification:

- Documentation added and manually reviewed.

Next:

- Begin Phase 1 with source-first investigation of OpenHarness event and
  approval model.

## Phase 1: Safety And Event Protocol

Status: `In progress`

Completion: `60%`

Goal:

Make the current agent safe enough to run real workflows by enforcing approval
at the execution layer and cleaning up the streaming protocol.

Why this phase comes first:

The agent already has tools that can mutate Git state, create PRs, push
branches, and interact with Azure DevOps. Before adding more capabilities, the
runtime must guarantee that risky tools cannot execute without approval.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `MaxGfeller/open-harness` / `@openharness/core` | Dependency or selective source reuse | Tool approval callback, typed event stream, middleware structure |
| `aaif-goose/goose` | Selective source study or port | Runtime event separation, desktop/CLI/API boundary |
| `modelcontextprotocol/servers` | Reference only | Tool schema conventions |

Work items:

- Investigate `@openharness/core` package API and license.
- Decide whether to use it as a dependency or copy/adapt minimal source.
- Extend local `ToolCapability` metadata.
- Add execution-layer permission checks before every planner tool call.
- Convert risky direct planner tool calls into structured approval requests.
- Replace prompt-only safety with runtime-enforced safety.
- Define canonical event types:
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
- Map old events to new events temporarily for frontend compatibility.
- Update desktop chat event handling.
- Add tests for direct risky tool-call blocking.

Completed:

- Added runtime gating in `ChatPlanner` before executing model-requested tool
  calls.
- Approval-required planner tool calls now return an `approvalProposal` instead
  of executing the tool handler directly.
- Added focused tests proving `git_commit`, `git_push`, and `ado_create_pr`
  are blocked when called directly by the model.
- Added explicit focused tests for `git_fetch`, `git_rebase`, and
  `ado_trigger_pipeline`.
- Reclassified `git_fetch` from low/read-only to medium/approval-required,
  because it mutates Git remote-tracking metadata.
- Evaluated `@openharness/core@0.6.2` as a source-first reuse candidate and
  recorded the result in `docs/third-party-source-reuse.md`.
- Added a daemon-side compatibility layer that emits legacy SSE event names for
  the current desktop UI and canonical aliases for future clients.
- Added canonical aliases for session, text delta, tool start/end, workflow
  update, approval required/resolved, final, error, and cancelled events.
- Added focused daemon tests for legacy-plus-canonical SSE event emission.
- Vendored OpenHarness core source into `third_party/open-harness`.
- Ported the OpenHarness approval-before-execute pattern into the local
  `ToolExecutor` as `ToolApproveFn` and `ToolDeniedError`.
- Added focused `ToolExecutor` tests for approval allow/deny behavior.
- Wired the OpenHarness-style approval hook into daemon chat execution by
  separating planner executors from confirmed-action executors.
- Confirmed actions now execute through the exact stored action path without
  being denied by the planner approval backstop.

Acceptance criteria:

- `git_fetch`, `git_commit`, `git_push`, `git_rebase`, `ado_create_pr`, and
  `ado_trigger_pipeline` cannot execute directly from planner tool calls without
  approval.
- Approval execution uses the exact stored action.
- Approval cancellation clears pending state.
- Frontend receives structured approval and workflow events.
- Future clients can consume canonical event names while the current desktop UI
  continues to consume legacy names.
- Raw model JSON is not shown as assistant text.
- Tests exist for approval enforcement.

Current known blockers:

- Plain `node` and global `pnpm` still resolve to the Codex app WindowsApps
  runtime and fail with `Access is denied`.
- Workaround: run commands through `.tools` and prepend
  `.tools/node-v22.11.0-win-x64` plus `.tools` to `PATH`.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-09 | Started Phase 1. Added execution-layer approval gate in `ChatPlanner`, changed `git_fetch` to medium risk, added direct tool-call blocking tests, and verified with `.tools` runner. |
| 2026-06-09 | Added explicit tests for `git_fetch`, `git_rebase`, and `ado_trigger_pipeline`; evaluated `@openharness/core` as a dependency candidate and created third-party source reuse registry. |
| 2026-06-09 | Added backward-compatible canonical SSE event aliases in the daemon and desktop event type support. Focused event tests and typechecks pass; daemon full test has one unrelated Azure auth/Cosmos environment failure. |
| 2026-06-09 | Vendored OpenHarness core source under `third_party/open-harness` and ported its approval-before-execute pattern into `ToolExecutor`. Core full tests and daemon typecheck pass. |
| 2026-06-09 | Connected the OpenHarness-style approval hook to daemon planner execution while preserving separate confirmed-action execution. Core focused tests, daemon focused tests, daemon typecheck, and desktop typecheck pass. Daemon full test still has the known unknown-session `401` failure. |
| 2026-06-09 | Vendored `microsoft/azure-devops-mcp` under `third_party/azure-devops-mcp` for Phase 4 direct source reuse. The strongest reuse targets are repositories/PRs, pipelines, work items, auth, and MCP registration modules. |
| 2026-06-09 | Added a minimal MCP stdio bridge, optional Azure DevOps MCP discovery, and MCP approval classification. Fixed daemon test environment isolation so Azure Cosmos settings from the host no longer break unknown-session state tests. Core full tests, daemon full tests, daemon typecheck, and desktop typecheck pass. |

## Phase 2: Repository Understanding

Status: `In progress`

Completion: `13%`

Goal:

Make the agent understand project structure, relevant files, symbols, tests,
and current changes before it acts.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `Aider-AI/aider` | Port selected logic | Repo map, file relevance, Git-aware context discipline |
| `continuedev/continue` | Reference or selective config ideas | Project configuration and context patterns |
| `OpenHands/OpenHands` | Reference only | Large-task context and software engineering agent patterns |

Work items:

- Enable semantic retrieval in chat when embeddings are configured.
- Add context snapshot persistence.
- Add repo summary cache.
- Add changed-file and related-test detection.
- Add context progress events.
- Add fallback mode when embeddings are unavailable.
- Add tests for:
  - project understanding without Git
  - branch review with Git
  - semantic retrieval path
  - fallback retrieval path

Acceptance criteria:

- Project explanation questions do not start with Git commands by default.
- Branch/change questions include Git state.
- Relevant files and tests are surfaced in context.
- Semantic retrieval is used when available.
- Fallback works without LLM embeddings.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-11 | Started Conversation repository-understanding work: Chat context now records index stats, defaults to using available semantic index hits when embeddings already exist, reports quick-scan versus index-backed retrieval in assistant metadata, and exposes an internal `repo_refresh_index` tool for explicit project-understanding/index-refresh requests. |

## Phase 3: Durable Workflow Engine

Status: `In progress`

Completion: `42%`

Goal:

Replace shallow tool-history-derived workflow state with a durable workflow
state model that can represent many workflow types.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `@openharness/core` | Dependency or selective source reuse | Typed state/event primitives and middleware |
| `lastmile-ai/mcp-agent` | Port concepts | Simple workflow patterns and durable execution ideas |
| Harness Agents | Product reference | Template-based DevOps agent workflow model |

Work items:

- Add `WorkflowState` schema.
- Add `WorkflowStep`, `WorkflowFact`, `ApprovalRequest`, and `WorkflowResult`.
- Persist workflow state separately from chat messages.
- Add workflow templates:
  - `inspect_branch`
  - `prepare_pr`
  - `commit_local_changes`
  - `sync_branch`
  - `run_validation`
  - `fix_pipeline_failure`
  - `review_pr`
  - `auto_approve_pr`
- Update right panel to render workflow state directly.
- Add workflow resume after app restart.

Acceptance criteria:

- Non-PR workflows no longer appear as PR workflows.
- Right panel shows goal, facts, steps, current status, approval, and result.
- Workflow state survives app restart.
- Tool history is not the source of truth for workflow progress.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-11 | Started Phase 3 with structured Conversation Environment workflow actions. Read-only workspace actions now use a daemon workflow endpoint for git status, diff, branch, and remote probes instead of injecting prompt text into Chat. Write actions still use the existing approval-backed agent path until durable templates are complete. |

## Phase 4: MCP And Azure DevOps Tool Reuse

Status: `In progress`

Completion: `70%`

Goal:

Stop hand-building every ADO tool. Reuse Azure DevOps MCP source as the
canonical implementation reference, port high-value capabilities into local
core code, and keep the external MCP process bridge only as temporary
compatibility infrastructure.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `microsoft/azure-devops-mcp` | Port selected source behavior into local TypeScript modules; keep external process bridge as fallback only | ADO tools for repos, work items, pipelines, test plans, wiki, search |
| `modelcontextprotocol/servers` | Reference only | MCP server/client conventions |
| `lastmile-ai/mcp-agent` | Port concepts | MCP orchestration and server management |

Work items:

- Vendor Azure DevOps MCP source for direct reuse.
- Add a minimal stdio MCP client bridge.
- Convert MCP tool definitions into local `ToolExecutor` tools.
- Map Azure DevOps MCP tool names into local capability and approval policy.
- Add MCP client to daemon.
- Add profile-level external MCP fallback configuration.
- Add Azure DevOps MCP compatibility integration.
- Map MCP tools into local capability registry.
- Apply local approval policy to MCP tools.
- Port Azure DevOps MCP discovery behavior into internal core functions for ADO
  projects, repositories, and pipelines.
- Surface Project Link discovery in both the management page and in-chat
  onboarding.
- Keep the external MCP bridge available only as a fallback/compatibility path
  while internal coverage grows.
- Add audit logging for MCP calls.
- Keep custom wrappers for product-specific PR readiness and Review Queue
  decisions.

Acceptance criteria:

- The daemon can run internally ported Azure DevOps MCP-style capabilities
  without starting an external MCP process.
- External ADO MCP tools remain available only as compatibility/fallback tools.
- Risky ADO capabilities require approval whether they are internal or fallback
  MCP tools.
- Project Link setup can use internally ported discovery to populate ADO
  project, repository, and pipeline fields.
- Tool traces include source, tool name, args, summary, and result status.

Current fallback switch:

- Project Link-level MCP configuration is now treated as an optional external
  compatibility fallback:
  - `adoMcpEnabled`
  - `adoMcpCommand`
  - `adoMcpAuthentication`
  - `adoMcpDomains`
- Environment variables remain optional global fallbacks:
  - `CICD_AGENT_ADO_MCP_ENABLED`
  - `CICD_AGENT_ADO_MCP_COMMAND`
  - `CICD_AGENT_ADO_MCP_AUTHENTICATION`
  - `CICD_AGENT_ADO_MCP_DOMAINS`
  - `CICD_AGENT_ADO_MCP_TIMEOUT_MS`
- Default remains disabled, so existing self-authored ADO tools continue to run
  without requiring the upstream MCP server binary.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-09 | Vendored `microsoft/azure-devops-mcp` at commit `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1` under `third_party/azure-devops-mcp`. Copied source includes ADO repositories/PRs, pipelines, work items, auth, MCP registration, docs, and tests. |
| 2026-06-09 | Added a dependency-free stdio MCP bridge in core, mapped MCP tools into local `Tool` wrappers, added MCP risk classification, and wired optional Azure DevOps MCP discovery into daemon chat sessions behind `CICD_AGENT_ADO_MCP_ENABLED`. |
| 2026-06-09 | Stabilized daemon full tests by clearing host Azure persistence env vars in `server.test.ts`. Full daemon verification now passes locally. |
| 2026-06-10 | Added daemon `/profiles/discover` route and exposed discovery actions in Profiles and in-chat Project Link onboarding. This was first backed by Project Link MCP settings, then corrected to an internal ADO implementation. |
| 2026-06-10 | Added daemon `/profiles/check-ado-tools` route and desktop health-check controls. This was first a bridge check under `/profiles/check-mcp`, then corrected to validate internally ported ADO tools with the old route kept as a compatibility alias. |
| 2026-06-10 | Corrected Phase 4 direction: external MCP process is now treated as fallback infrastructure, while project/repository/pipeline discovery and ADO tool health checks are internally ported into `@cicd-agent/core`. |

## Phase 5: Pull Requests Workspace

Status: `In progress`

Completion: `46%`

Goal:

Make `Pull Requests` the developer readiness workspace.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `microsoft/azure-devops-mcp` | External process or source reuse | PR, branch, pipeline, work item, and policy data |
| `The-PR-Agent/pr-agent` | Fork or selective port | PR summary, review commands, compression, file filtering |
| Harness Agents | Product reference | Pipeline-native failure diagnosis |

Work items:

- Show active PRs for the selected profile.
- Include reviewer, pipeline, policy, linked work item, comment, and finding
  state.
- Add PR readiness summary.
- Add actions:
  - open in ADO
  - checkout branch
  - summarize diff
  - explain failure
  - rerun pipeline
  - prepare next commit
  - respond to reviewer comments
- Add PR-specific chat context.

Acceptance criteria:

- User can answer: "What is blocking my PR, and what should I do next?"
- Pipeline state is embedded in PR readiness.
- The agent can explain and act on PR blockers with approval.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |

## Phase 6: Review Queue And Auto-Approval

Status: `In progress`

Completion: `58%`

Goal:

Make Review Queue the decision surface for reviewers and automation.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `The-PR-Agent/pr-agent` | Fork or selective port | Review prompts, categories, compression, platform adapters |
| Harness Agents | Product reference | Approval policy, audit, DevOps governance |
| `microsoft/azure-devops-mcp` | Selective internal port | PR review, thread creation, approval and context operations |

Work items:

- Add decision queues:
  - `Auto-approved`
  - `Needs human review`
  - `Blocked`
  - `Watching`
- Add policy controls.
- Add auto-approval audit record.
- Add finding confirm/dismiss/escalate actions.
- Add Review Agent rerun action.
- Add manual approval and request-changes actions.

Completed:

- Persist review confidence signals into Review History:
  - discarded model finding counts
  - hunk coverage file counts
  - whole-file fallback counts
  - changed hunk line counts
- Add attention-first Review Queue sorting and reason-code explanations.
- Feed context confidence into local auto-approval gating.
- Persist review policy results and context confidence for audit.
- Add manual disposition summary fields and append-only disposition events.
- Add Review Queue actions for acknowledge, safe, blocked, and changes
  requested dispositions.
- Add an internal daemon disposition endpoint that can write blocking and
  changes-requested dispositions back to Azure DevOps PR threads.
- Persist ADO write-back attempted/success/error/time status.
- Expose failed or pending ADO write-back retry from Review Queue without
  appending duplicate disposition events.
- Persist ADO PR thread id/url returned by successful write-back and show an
  open-thread link in Review Queue.
- Guard retry write-back buttons while the request is in flight to avoid
  duplicate Azure DevOps thread creation.
- Add a Review Queue side panel audit section for disposition history,
  write-back attempt status, error details, and ADO thread links.
- Store every ADO write-back attempt as an append-only audit event with status,
  actor, note, error, thread id, and thread URL.
- Add a Review Queue rerun action that triggers the full Review Agent path,
  refreshes the queue item, preserves manual audit history, and updates stored
  findings.

Acceptance criteria:

- Low-risk PRs can be auto-approved only when profile policy allows.
- Every decision has an audit record.
- Review Queue clearly separates safe, uncertain, blocked, and waiting PRs.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-11 | Review confidence signals, attention sorting, manual disposition audit events, ADO PR-thread write-back status/thread links, append-only write-back attempt events, guarded retry write-back, Review Queue rerun, and a side-panel audit view are implemented locally. |

## Phase 7: Verification, Rollback, And Activity Timeline

Status: `Not started`

Completion: `0%`

Goal:

Make every agent action verifiable, explainable, and recoverable.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `Aider-AI/aider` | Port selected logic | Git checkpoint and undo discipline |
| `OpenHands/OpenHands` | Reference only | Sandbox and evaluation concepts |
| Harness Agents | Product reference | Observable action history and pipeline context |

Work items:

- Create pre-write checkpoints.
- Store before/after Git state.
- Run profile build/test/lint validation.
- Add replayable activity records.
- Add Activity filters.
- Add local undo where safe.
- Add exportable audit logs.

Acceptance criteria:

- Every workflow can be replayed from stored trace data.
- Every write action has a before/after record.
- User can understand what happened without reading raw logs.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |

## Phase 8: Product Hardening And Distribution

Status: `In progress`

Completion: `25%`

Goal:

Prepare the product for real developer and team usage.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `aaif-goose/goose` | Selective source study or port | Desktop/CLI distribution, diagnostics, provider setup |
| `anomalyco/opencode` | Selective source study or port | Coding agent distribution and user-facing ergonomics |
| Harness Agents | Product reference | Governance, permissions, and audit expectations |

Work items:

- Rename the user-facing `Profile` concept to `Project Link`.
- Add conversational Project Link creation when no link exists or no link is
  selected.
- Improve installer and signing.
- Add first-run onboarding.
- Add health checks.
- Add telemetry opt-in and local-only mode.
- Add Azure auth refresh handling.
- Add workspace boundary enforcement.
- Add command allowlist policy.
- Add profile backup/migration.
- Validate with real ADO repositories.

Acceptance criteria:

- New developer can install and configure the product without repo internals.
- Real PR and pipeline workflows pass end-to-end validation.
- Security boundaries are documented and enforced.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |
| 2026-06-09 | Started product UX hardening by introducing `Project Link` as the user-facing name for the repo-to-DevOps mapping concept and adding in-chat creation instead of forcing navigation to the management page. |
| 2026-06-11 | Improved Conversation onboarding and light-theme polish: assistant/status chat bubbles now use semantic theme variables, light theme maps additional zinc opacity classes, and the in-chat Project Link setup now clearly supports local-repo-first creation with inferred ADO mapping and optional PAT fallback messaging. |

## Active Phase Protocol

At any time, only one phase should be considered the primary active phase.

Current active phase:

```text
Phase 1: Safety And Event Protocol
```

Before starting a new phase:

1. Update the current phase status and completion.
2. Record what was completed in the phase progress log.
3. Record any blockers.
4. Link major code changes or documents.
5. Update the Phase Progress Summary table.

## Session Update Template

Use this template at the end of each development session:

```md
### YYYY-MM-DD Session Update

Phase:

Status change:

Completed:

Partially completed:

Blocked:

Files changed:

Tests run:

Next recommended task:
```

## Next Recommended Task

Start Phase 1 by investigating whether `@openharness/core` can be adopted as a
direct dependency for:

- typed event streaming
- execution-layer tool approval
- middleware
- tool wrappers

Expected output of the next session:

- A short integration decision note.
- Either a dependency-based plan or a selective-source-reuse plan.
- A first implementation task list for execution-layer approval.

## Session Updates

### 2026-06-11 Session Update 104

Phase:

Phase 3: Durable Workflow Engine, Phase 4: MCP And Azure DevOps Tool Reuse, Phase 8: Product Hardening And Distribution

Progress changes:

- Recalibrated the tracker from implementation-activity progress to product-readiness progress.
- Overall implementation readiness is now tracked as `64%` instead of the previous optimistic `96%`.
- Phase 3 is now `In progress` at `12%` because Conversation Environment read-only actions have a structured daemon workflow path.
- Phase 4 moved to `74%` with internal PR work-item and PR policy-evaluation capabilities.
- Phase 8 moved to `33%` with explicit Azure DevOps OAuth consent recovery groundwork.

Implemented:

- Added internal Azure DevOps MCP-style PR work-item detail retrieval:
  - `listAzurePullRequestWorkItems`
  - `ado_list_pull_request_work_items`
- Added internal Azure DevOps MCP-style PR policy evaluation retrieval:
  - `listAzurePullRequestPolicyEvaluations`
  - `ado_list_pull_request_policy_evaluations`
- Added best-effort PR context enrichment for `workItems` and `policies`; failures in these optional signals no longer block the core PR context response.
- Added `/auth/azure-devops/enable` so the app can explicitly request Azure DevOps OAuth consent instead of relying on a Graph-only sign-in and later failing with `OAuth token unavailable`.
- Added `/chat/workflow-action` for structured, read-only Conversation Environment actions:
  - `inspect_environment`
  - `inspect_changes`
  - `refresh_branch`
- Updated the Chat Environment action dispatcher so read-only actions call the structured daemon workflow endpoint and render real tool bubbles instead of sending hidden natural-language prompts.

Verification:

- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core test -- azureDevOpsInternal.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- server.test.ts`.
- Passed `git diff --check`.

Remaining gaps:

- Write actions still use the approval-backed agent path instead of durable workflow templates.
- Azure DevOps OAuth still needs a visible UI recovery action that calls `/auth/azure-devops/enable`.
- PR policy artifact-id compatibility should be live-tested against the target Azure DevOps organization.

### 2026-06-11 Session Update 105

Phase:

Phase 8: Product Hardening And Distribution

Progress changes:

- Clarified Azure DevOps OAuth readiness: the portal screenshot confirms the default desktop client ID is the registered `DevCICDAgent` app with Azure DevOps `user_impersonation` consent, so the remaining issue is active-account token acquisition rather than an app-registration ID mismatch.

Implemented:

- Added `getDesktopAzureAuthConfig` so daemon and desktop can report the actual tenant/client used for Microsoft login and Azure DevOps token acquisition.
- Updated Azure DevOps OAuth acquisition to try both the upstream-compatible `.default` scope and the explicit `user_impersonation` delegated scope.
- Made browser sign-in fail visibly if the signed-in account cannot acquire an Azure DevOps token, instead of swallowing the failure and surfacing a later `OAuth token unavailable` error.
- Persisted MSAL account identity fields (`homeAccountId`, `tenantId`, and `username`) after sign-in and cache load.
- Updated Azure DevOps token acquisition to prefer the requested or cached MSAL account instead of blindly using the first account in the token cache.
- Added daemon config support for:
  - `CICD_AGENT_AZURE_TENANT_ID`
  - `CICD_AGENT_AZURE_CLIENT_ID`
- Added Settings fields for Azure tenant ID and Azure client ID so the app can be pointed at the registered `DevCICDAgent` application that already has Azure DevOps consent.
- Extended `/auth/status`, `/auth/me`, and `/daemon/config` to expose non-secret Azure auth configuration diagnostics.
- Fixed Settings hydration so Azure tenant/client settings can still be written after a failed daemon-config read.

Verification:

- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- server.test.ts`.
- Passed `git diff --check`.

Observed local diagnostic:

- Current runtime uses the built-in default client ID `03da33ef-7161-4b27-ae80-3079313f131d`, matching the Azure Portal `DevCICDAgent` application shown by the user.
- The likely failure path was selecting a stale or wrong cached MSAL account for Azure DevOps token acquisition after login.

### 2026-06-12 Session Update 106

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse, Phase 8: Product Hardening And Distribution

Progress changes:

- Improved Project Link Azure DevOps setup ergonomics by making project/repository discovery part of the inputs instead of a separate select-only workflow.
- Fixed a build-definition discovery compatibility issue with Azure DevOps when filtering pipelines by repository.

Implemented:

- Project Link creation in Chat now auto-discovers Azure DevOps projects when an organization URL is available.
- Project Link creation in Chat now auto-discovers repositories when organization and project are available.
- Project Link creation in Chat now auto-discovers pipelines when organization, project, and repository are available.
- Project and repository inputs now expose discovered values through native input suggestions while still allowing manual typing.
- Profiles Project Link editing now uses the same auto-discovery behavior for project, repository, and pipeline discovery.
- Pipeline discovery now sends `repositoryType=TfsGit` whenever it filters build definitions by repository, resolving Azure DevOps `Repository type is missing/invalid` responses.

Verification:

- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core test -- azureDevOpsInternal.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/desktop build`.
- Passed `git diff --check`.

Notes:

- Automated visual screenshot verification was attempted against the local Vite preview, but the local Node runtime did not have Playwright installed and PATH did not expose a browser screenshot CLI.
- Follow-up correction replaced native datalist project/repository suggestions with in-place select controls, removed duplicate project/repository discovery buttons, constrained the Chat Project Link setup card to a single-column narrow-panel layout, and made pipeline refresh require a selected repository.

### 2026-06-12 Session Update 111

Phase:

Phase 2: Repository Understanding, Phase 3: Durable Workflow Engine, Phase 5: Pull Requests Workspace

Progress changes:

- Re-audited current code and git history at `v0.5.4`.
- Chat implementation readiness moves from scattered workflow coverage toward a catalog-backed agent responsibility model.
- Phase 2 remains in progress because repository understanding is now part of the use-case contract but still needs richer dedicated UX/workflow state.
- Phase 3 remains in progress because only read-only Environment actions have structured direct workflow endpoints; write workflows still rely on planner approvals.

Implemented:

- Added `packages/core/src/chatUseCases.ts` as the single code-level catalog of Chat agent responsibilities.
- Injected the Chat use-case catalog into the `ChatPlanner` system prompt so planning sees the expected behavior for project understanding, change review, validation, branch management, commit workflows, remote sync, PR insight, PR creation, rollback, and CI/CD operations.
- Expanded the offline Git intent translator to cover:
  - summarize/review changes
  - stash changes
  - restore a specific path
  - fetch and compare with a remote target
  - pull latest
  - rebase and merge
  - switch branch
  - commit/amend
  - push without inventing PR creation
  - push/create PR as an explicit PR workflow
- Updated `docs/conversation-git-agent-optimization.md` with a git-history-based implementation audit and Chat agent use-case matrix.
- Added tests for Chat use-case coverage, approval boundaries, prompt injection, and offline Git intent routing.

Verification:

- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core test -- chatUseCases.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core test -- chatPlannerApproval.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck`.

Remaining gaps:

- Add durable daemon workflow actions for branch switching, branch creation, validation runs, commit flows, push, and PR creation.
- Make the right-side Chat workflow panel reflect initialized/running/approval/done/failed states for each workflow family instead of depending mainly on natural-language prompts.
- Add live UI validation for narrow Chat layouts after the desktop app can be reliably driven in-browser.

### 2026-06-12 Session Update 112

Phase:

Phase 3: Durable Workflow Engine, Phase 7: Verification, Rollback, And Activity Timeline

Progress changes:

- Converted a real Chat execution failure into scoped workflow safety fixes and regression tests.
- Phase 3 remains in progress because write workflow execution still needs durable first-class templates, but approval derivation is now safer for commit-only and rebase-conflict flows.

Implemented:

- Added scope checks for derived `git_push`, `git_pull`, and `git_rebase` approval proposals.
- Prevented out-of-scope explicit write actions from falling back into the older fixed PR workflow sequence.
- Allowed pull/rebase recovery only after an in-scope failed push.
- Extended `git_rebase` with `action: "continue" | "abort" | "skip"` for in-progress rebase recovery.
- Added regression tests based on the real use case:
  - stage+commit does not escalate into push
  - push recovery is allowed only when push was requested
  - out-of-scope push recovery does not fall back to staging
  - rebase conflict recovery proposes `git_rebase` continue
- Documented the real failure case in `docs/conversation-git-agent-optimization.md`.

Verification:

- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- chatSessionWorkflow.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core test -- gitOptions.test.ts`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core build`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck`.
- Passed `.\.tools\pnpm.exe --filter @cicd-agent/core typecheck`.

Remaining gaps:

- Add explicit `rebase_in_progress` / `conflict_blocked` workflow state in the daemon and right-side Chat panel.
- Improve approval-card copy so users see concise action-specific text instead of generic tool descriptions.
- Add Git divergence readiness warnings before commit/push workflows.

### 2026-06-12 Session Update 113

Phase:

Phase 3: Durable Workflow Engine, Phase 8: Product Hardening And Distribution

Progress changes:

- Reviewed current popular open-source agent architecture against this project's Chat/Git workflow direction.
- Phase 3 moved from 14% to 16% because the legacy workflow retirement boundary is now documented and tied to concrete code locations.
- Phase 8 moved from 33% to 34% because tool permission and workspace-boundary expectations are now aligned with mature agent products.
- Overall implementation progress moved from 66% to 67%.

Reviewed upstream patterns:

- Aider: Git-first repository assistant with diff and commit-message discipline.
- OpenHands: agent/tool/workspace/conversation loop.
- Cline: per-tool policy and interactive approval controller.
- OpenCode: permission service plus bash tool with read-only command detection and Git/PR guidance.
- Continue: terminal command tool with security evaluation and tool dispatcher.
- Goose: tool confirmation router and declined-tool response that tells the agent not to retry.
- VS Code Copilot Agent: tool picker, editable tool parameters, and terminal command approval UX.

Decision:

- Keep high-level workflow knowledge as planner guidance and UI intent.
- Do not keep hidden fixed Git execution chains as the production path.
- Require parameterized, state-aware Git tools for write operations.
- Enforce user-request scope at every write proposal.
- Treat right-panel actions as structured workflow intents, not natural-language chat prompt injections.

Documented:

- Added `Popular Agent Source Alignment Audit` to `docs/conversation-git-agent-optimization.md`.
- Added a `Preset Workflow vs Agent-Generated Git Operations` decision.
- Added a `Legacy Workflow Retirement Decision` table covering:
  - `inferNextPrWorkflowTool`
  - `inferPendingAction`
  - `ACTION_DERIVERS`
  - `workspaceActionPrompt`
  - `commit_flow`
  - `git_intent_translator`
- Added target Chat/Git boundary rules for read-only actions, approval-required actions, and stop/ask conditions.

Verification:

- Documentation-only change in this session; no code tests were required.

Next recommended task:

- Replace `workspaceActionPrompt` for right-panel Git actions with structured workflow action events, starting with `inspect_changes`, `prepare_commit`, `switch_branch`, and `push_branch`.

### 2026-06-13 Session Update 114

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 16% to 18%.
- Overall implementation progress moved from 67% to 68%.
- The right-side Chat Git panel now has a first real structured write-action path instead of relying only on natural-language prompt injection.

Implemented:

- Extended `/chat/workflow-action` beyond read-only actions:
  - `checkout_branch`
  - `create_branch`
  - `push_branch`
  - `prepare_commit`
- Added `ChatSessionManager.createApprovalProposal(...)` so structured workflow actions can persist an approval proposal in the active or newly created Chat session.
- Updated desktop Chat workspace actions so right-panel Git actions call `/chat/workflow-action` with structured parameters instead of falling back to `workspaceActionPrompt`.
- Added session creation/return for workflow actions started before any normal chat message, allowing approval cards to execute through the existing `/chat/:sessionId/confirm-action` path.
- Implemented structured write proposals:
  - branch checkout -> `git_checkout { ref }`
  - branch creation -> `git_create_branch { name }`
  - branch push -> `git_push { branch, setUpstream: true }`
  - commit preparation with unstaged changes -> `git_add { all: true }` plus a next-step hint to generate/use the commit message
  - staged-only commit with explicit message -> `git_commit { message }`
- Kept commit-message generation out of the backend; the backend now prepares the workflow and lets the agent continue after the approved staging step.
- Treated `git_log` and staged diff preflight failures as non-blocking for new repositories during commit preparation.
- Added dirty-working-tree warnings to structured branch checkout/create approvals and raised those approvals to high risk when pending changes exist.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- `prepare_commit` is still a first-step workflow, not a full durable multi-step state machine.
- The next implementation should add explicit workflow states for `preflight`, `waiting_for_stage_approval`, `staged`, `waiting_for_commit_approval`, `committed`, and optional `waiting_for_push_approval`.
- The right-side UI should show these workflow states directly instead of relying on only generic approval-card text.
- Branch switching still needs richer branch existence/upstream validation before approval.

### 2026-06-13 Session Update 115

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 18% to 21%.
- Overall implementation progress moved from 68% to 69%.
- Structured commit workflows now advance across multiple write approvals without converting the flow back into a natural-language prompt.

Implemented:

- Added optional workflow metadata to `PendingToolAction`.
- Structured `prepare_commit` proposals now carry commit workflow context:
  - phase
  - branch
  - optional commit message
  - whether push should follow commit
- After confirmed `git_add` succeeds, daemon can directly create the next `git_commit` approval when the workflow already has an explicit commit message.
- After confirmed `git_commit` succeeds, daemon can directly create the next `git_push` approval when the workflow was started as commit-and-push.
- These deterministic next approvals bypass LLM continuation and are persisted in session workflow state.
- `prepare_commit` now probes the current branch so later commit/push steps keep the exact branch context.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- Blank commit-message generation still falls back to planner continuation after staging.
- The workflow state should expose richer UI phases, not only `waiting_for_approval` plus current step text.
- Push readiness should inspect upstream/divergence before approval.
- The right-side panel should render commit workflow phases directly.

### 2026-06-13 Session Update 116

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 21% to 23%.
- Overall implementation progress moved from 69% to 70%.
- Commit workflow state is now explicit enough for the right-side panel to render business phases instead of raw tool history.

Implemented:

- Added `workflowKind` and `workflowPhase` to `ChatWorkflowState`.
- Derived commit workflow phases from structured approval metadata:
  - `waiting_for_stage_approval`
  - `waiting_for_commit_approval`
  - `waiting_for_push_approval`
- Extended commit workflow metadata with a `push` phase so commit-and-push flows keep their workflow identity through the final push approval.
- Updated the desktop right-side panel to render commit workflow phases as:
  - Inspect changes
  - Stage changes
  - Commit changes
  - Push branch, only when the workflow includes push
- Added regression assertions that workflow kind/phase are returned from `/chat/workflow-action` and from `/chat/:sessionId/confirm-action` SSE workflow events.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- Push readiness still needs upstream/divergence checks before presenting approval.
- Blank commit-message generation still falls back to planner continuation after staging.
- The commit workflow panel should include richer branch/message metadata once the UI has space for it.

### 2026-06-13 Session Update 117

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 23% to 25%.
- Overall implementation progress moved from 70% to 71%.
- Push actions from Chat workflow controls now run a real readiness preflight before presenting approval.

Implemented:

- Added push readiness metadata to structured approval proposals.
- `push_branch` workflow actions now probe:
  - current branch
  - working-tree status
  - remotes
  - configured upstream
  - ahead/behind divergence against upstream when available
- Approval proposals now describe no-upstream, up-to-date, ahead, behind, diverged, and unknown push readiness states before the user approves `git_push`.
- Commit-and-push workflow continuation now performs the same readiness check before generating the final push approval.
- Added a regression test that creates a real local repository, pushes to a bare upstream, creates one local commit, and verifies the approval reports `ahead` with the expected upstream and commit counts.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.

Remaining gaps:

- Blank commit-message generation still falls back to planner continuation after staging.
- Branch switching needs richer branch existence/upstream validation before approval.
- The commit workflow panel should include richer branch/message/readiness metadata once the UI has space for it.

### 2026-06-13 Session Update 118

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 25% to 27%.
- Overall implementation progress moved from 71% to 72%.
- Blank commit-message flows now stay inside the structured commit workflow after staging.

Implemented:

- Added deterministic commit-message generation from staged diff metadata after an approved `git_add`.
- Empty-message `prepare_commit` workflows now advance to a stored `git_commit` approval instead of falling back to planner continuation.
- Generated commit approvals preserve the workflow metadata:
  - phase: `commit`
  - branch
  - generated message
  - optional push-after-commit flag
- Added helper logic to infer simple conventional commit prefixes from changed paths:
  - docs
  - test
  - ci
  - build
  - chore
- Added a regression test covering `Commit message (leave blank to generate)` with a real staged diff and confirming the generated `git_commit` approval.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.

Remaining gaps:

- Generated commit messages are deterministic and safe, but later can be refined with an LLM-backed summarizer before approval.
- The commit workflow panel should include richer branch/message/readiness metadata once the UI has space for it.

### 2026-06-13 Session Update 119

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 27% to 29%.
- Overall implementation progress moved from 72% to 73%.
- Branch checkout/create actions now perform branch-state preflight before creating approval proposals.

Implemented:

- Added structured branch preflight metadata to approval proposals.
- `checkout_branch` now probes current branch and `git branch -a` before proposing a write action.
- Current-branch checkout is treated as a no-op and does not request approval.
- Local branch checkout produces a normal `git_checkout` approval.
- Remote-only branch checkout produces a `git_switch` approval with:
  - `create: true`
  - `startPoint`
  - `track: true`
- Missing or unsafe branch names do not produce checkout approval proposals.
- `create_branch` now suppresses duplicate approvals when the local/current branch already exists or when a matching remote branch should be switched to instead.
- Desktop approval matching now recognizes `git_switch` as a valid structured checkout approval.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- Branch preflight is visible in the right-side panel only as compact text; it can later become richer branch-specific controls.
- Generated commit messages are deterministic and safe, but later can be refined with an LLM-backed summarizer before approval.
- The commit workflow panel should include richer branch/message/readiness metadata once the UI has space for it.

### 2026-06-13 Session Update 120

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 29% to 30%.
- Overall implementation progress moved from 73% to 74%.
- The right-side Chat progress panel now consumes workflow metadata instead of only rendering generic step labels.

Implemented:

- Added compact progress details for structured approval metadata:
  - branch preflight summaries
  - push readiness summaries
  - commit workflow branch
  - commit workflow message
- Added truncation for long commit messages in the progress panel while preserving the full text in the tooltip.
- Tightened conversation-part source/metadata TypeScript narrowing so desktop typecheck remains stable with the richer conversation part model.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`.

Remaining gaps:

- Branch preflight details are currently compact text, not dedicated branch controls.
- Generated commit messages are deterministic and safe, but later can be refined with an LLM-backed summarizer before approval.
- PR creation now has a first-class workflow action; follow-up PR insight and work-item linking still need durable continuation templates.

### 2026-06-13 Session Update 121

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 30% to 33%.
- Overall implementation progress moved from 74% to 75%.
- PR creation now has a durable first-class Chat workflow path instead of relying only on planner inference.

Implemented:

- Added `create_pr` to `/chat/workflow-action`.
- Added structured PR preflight metadata:
  - source branch
  - target branch
  - Azure DevOps organization
  - ADO project
  - ADO repository
  - generated or supplied title
  - dirty working-tree warning
- Added `workflowKind: "pr"` and `workflowPhase: "waiting_for_create_pr_approval"` for pending PR creation approvals.
- `create_pr` now creates a stored `ado_create_pr` approval proposal and does not call Azure DevOps until the user confirms.
- Missing ADO Project Link mapping fails before any write proposal is made.
- Dirty working-tree PR creation is allowed only as a high-risk approval with an explicit warning that uncommitted changes are not included.
- Added a right-panel `Create pull request` action that calls the structured workflow endpoint.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- PR creation confirmation now completes as `pr/created`; post-create PR insight, work-item linking, and policy follow-up are not yet deterministic workflow continuations.
- Missing Project Link UX should eventually guide the user inline instead of only failing the workflow action.
- Live ADO validation for create-PR remains covered by integration/manual testing rather than offline tests.

### 2026-06-13 Session Update 122

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 33% to 35%.
- Overall implementation progress moved from 75% to 76%.
- Confirmed PR creation now completes through structured workflow state instead of falling back to planner continuation.

Implemented:

- Persisted inline Project Link data when structured workflow actions create stored approval proposals, so `/confirm-action` has the same ADO context that was used to create the approval.
- Added deterministic completion handling after confirmed `ado_create_pr` succeeds:
  - clears pending approval
  - sets workflow status to `done`
  - sets `workflowKind` to `pr`
  - sets `workflowPhase` to `created`
  - emits a user-facing final result without asking the LLM to infer the next step
- The final result suggests the next structured product actions:
  - Inspect PR insight
  - Check policy status
  - Link related work items
- Added an offline regression test that mocks ADO create-PR, confirms the approval, and verifies the session ends in `pr/created` with no new approval request.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- `pr/created` suggests PR insight, policies, and work-item linking, but those follow-up actions are not yet first-class structured actions from the Chat workflow endpoint.
- Missing Project Link UX should eventually guide the user inline instead of only failing the workflow action.
- Live ADO validation for create-PR remains covered by integration/manual testing rather than offline tests.

### 2026-06-13 Session Update 123

Phase:

Phase 3: Durable Workflow Engine

Progress changes:

- Phase 3 moved from 35% to 37%.
- Overall implementation progress moved from 76% to 77%.
- Verification moved from 92% to 93% after adding a regression check for fixed workflow retirement.

Implemented:

- Removed `git_intent_translator` from the production Conversation tool registry so chat planning no longer exposes a canned Git workflow translator as a callable runtime tool.
- Kept `git_intent_translator` available for CLI/offline deterministic analysis and tests, where it is useful as a fixture rather than as the source of truth for live project maintenance.
- Retired `inferNextPrWorkflowTool` from `deriveWorkflowPendingAction` and `inferPendingAction`.
- Conversation approval derivation now requires either:
  - an explicit structured `approvalProposal` from the planner
  - an explicit write action mentioned in the assistant proposal
  - a structured workflow action such as `prepare_commit`, `push_branch`, `checkout_branch`, or `create_pr`
- A generic "continue toward the PR" confirmation no longer auto-expands into the fixed `git_add -> git_commit -> git_push -> ado_create_pr` sequence.

Design decision:

- Git operations remain broad capability tools.
- Prebuilt product workflows remain allowed as stateful shortcuts.
- Fixed hidden execution chains are not the default agent architecture and should be retired as durable workflow state covers each use case.

Verification:

- Added a regression update proving executed Git history alone does not create the next PR workflow approval.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- `git diff --check` was clean apart from expected CRLF warnings.

Remaining gaps:

- `ACTION_DERIVERS` still parses explicit assistant wording into write proposals for legacy compatibility; it should continue shrinking as planner-native approval proposals become reliable.
- `inferPendingAction` still exists for old session recovery; the target state is persisted approval state only.
- PR insight, PR policy, and work-item follow-ups should become first-class structured workflow actions.

### 2026-06-13 Session Update 124

Phase:

Phase 3: Durable Workflow Engine / Phase 5: Pull Requests Workspace

Progress changes:

- Phase 3 moved from 37% to 40%.
- Phase 5 moved from 89% to 91%.
- Overall implementation progress moved from 77% to 78%.
- Verification moved from 93% to 94%.

Implemented:

- Added structured Conversation workflow actions for PR follow-up work:
  - `inspect_pr_insight`
  - `check_pr_policy`
  - `list_pr_work_items`
  - `link_work_item`
- `inspect_pr_insight`, `check_pr_policy`, and `list_pr_work_items` are read-only workflow actions that execute directly and return `workflowKind: "pr"` done states.
- `link_work_item` creates a stored high-risk approval proposal for `ado_link_work_item` instead of mutating Azure DevOps immediately.
- Confirmed `ado_link_work_item` now completes as deterministic `pr/work_item_linked` workflow state instead of falling back to planner continuation.
- PR follow-up actions can default to the latest active pull request for the Project Link when no `pullRequestId` is supplied.
- Desktop Chat API types now expose the new workflow actions and `pullRequestId` / `workItemId` inputs.
- The Chat right-side Project Link area now shows compact PR action buttons when ADO mapping is available:
  - PR insight
  - Policy
  - Work items
- Right-panel progress rendering now recognizes PR insight, policy, work-item, and link-work-item workflow phases.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.

Remaining gaps:

- Manual visual verification is still needed for the new right-panel PR buttons in the desktop app.
- PR insight workflow currently returns a concise deterministic summary; richer artifact rendering in Conversation remains future work.

### 2026-06-13 Session Update 125

Phase:

Phase 3: Durable Workflow Engine / Phase 5: Conversational Dev Agent Runtime

Progress changes:

- Phase 3 moved from 40% to 42%.
- Overall implementation progress moved from 78% to 79%.
- Verification moved from 94% to 95%.

Implemented:

- Added structured Git operation-state detection inside `/chat/workflow-action`:
  - detects unresolved index conflicts from `git status --porcelain`
  - detects in-progress `rebase`, `merge`, `cherry-pick`, and `revert` operations from `.git` state files
- Structured workspace actions now block normal `prepare_commit`, `push_branch`, branch switch/create, and `create_pr` proposals while a Git operation is conflicted or in progress.
- Blocked workflow responses now return `workflowKind: "git"` and phases such as `merge_conflict` instead of creating unsafe approvals.
- Chat legacy write-action derivation now filters ordinary `git_commit` / `git_push` proposals after an unresolved rebase/merge conflict history, while still allowing explicit rebase recovery actions.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts`.
- Added a real Git merge-conflict daemon test proving `prepare_commit` becomes a blocked workflow state and does not create `git_add`.
- Added a chat workflow regression proving unresolved rebase conflicts strip normal `git_commit` approval proposals.

Remaining gaps:

- The right-side UI should render `merge_conflict`, `rebase_conflict`, and `*_in_progress` phases with dedicated recovery controls rather than a generic blocked summary.
- The structured workflow API still needs first-class recovery actions such as `continue_rebase`, `abort_rebase`, and selected-path conflict staging.

### 2026-06-13 Session Update 126

Phase:

Phase 3: Durable Workflow Engine / Phase 5: Conversational Dev Agent Runtime

Progress changes:

- Phase 3 moved from 42% to 44%.
- Overall implementation progress moved from 79% to 80%.
- Verification moved from 95% to 96%.

Implemented:

- Added first-class structured rebase recovery workflow actions:
  - `continue_rebase`
  - `abort_rebase`
  - `skip_rebase`
- `/chat/workflow-action` now turns those actions into stored high-risk `git_rebase` approvals with exact `{ action: "continue" | "abort" | "skip" }` arguments.
- Rebase recovery proposals are only created when the repository is actually in an in-progress rebase state.
- Confirmed rebase recovery actions now complete deterministically with `workflowKind: "git"` and phases such as `rebase_aborted`, instead of asking the planner to infer a follow-up.
- Desktop Chat now carries `git` workflow evidence through approval cards and shows dedicated right-panel controls for continue, abort, and skip when the workflow state is rebase-related.
- The right-panel rebase controls now call structured workflow actions rather than inserting hidden text into the chat input.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts` with 62 tests.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build`.
- Added a real Git rebase-conflict daemon test proving structured `abort_rebase` creates an approval and confirmed execution completes the workflow.

Remaining gaps:

- Conflict-file staging should become a selected-path recovery action instead of relying on generic `git_add`.
- Merge, cherry-pick, and revert recovery should receive the same first-class structured treatment as rebase recovery.
- The right-side recovery UI still needs visual verification inside the running desktop app.

### 2026-06-13 Session Update 127

Phase:

Phase 3: Durable Workflow Engine / Phase 5: Conversational Dev Agent Runtime

Progress changes:

- Phase 3 moved from 44% to 46%.
- Overall implementation progress moved from 80% to 81%.
- Verification moved from 96% to 97%.

Implemented:

- Extended the structured Git tool surface:
  - `git_merge` now supports `action: "continue" | "abort"` in addition to starting a merge with `ref`.
  - Added `git_cherry_pick` with `action: "start" | "continue" | "abort" | "skip"`.
  - Added `git_revert` with `action: "start" | "continue" | "abort" | "skip"`.
- Added high-risk capability classification for `git_cherry_pick` and `git_revert`.
- Generalized workspace Git recovery actions beyond rebase:
  - `continue_merge`, `abort_merge`
  - `continue_cherry_pick`, `abort_cherry_pick`, `skip_cherry_pick`
  - `continue_revert`, `abort_revert`, `skip_revert`
- `/chat/workflow-action` now maps those recovery actions to exact stored approval proposals and only allows them when the matching Git operation state is detected.
- Confirmed Git recovery actions now finish with deterministic workflow states such as `merge_aborted`, `cherry_pick_skipped`, and `revert_continued`.
- Desktop Chat now exposes a generic recovery panel for rebase, merge, cherry-pick, and revert states, using structured workflow actions instead of hidden prompt injection.
- The Chat use-case catalog now advertises cherry-pick and revert as approval-required Git capabilities.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts` with 6 tests.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts` with 63 tests.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build`.
- Added a real Git merge-conflict daemon test proving structured `abort_merge` creates an approval and confirmed execution completes the workflow.
- Added core Git tool tests proving merge, cherry-pick, and revert recovery actions do not require a start `ref`.

Remaining gaps:

- Conflict-file staging still needs a selected-path recovery action.
- Cherry-pick and revert should receive real conflicted-repository daemon tests like rebase and merge.
- The right-side recovery UI still needs visual verification inside the running desktop app.

### 2026-06-13 Session Update 128

Phase:

Phase 3: Durable Workflow Engine / Phase 5: Conversational Dev Agent Runtime

Progress changes:

- Phase 3 moved from 46% to 48%.
- Overall implementation progress moved from 81% to 82%.
- Verification moved from 97% to 98%.

Implemented:

- Added a guarded `stage_resolved_conflicts` workspace action for conflict recovery.
- The action probes current Git operation state before proposing any write and only works while a rebase, merge, cherry-pick, or revert conflict is actually in progress.
- The action requires explicit file paths, stages only those provided paths, and every requested path must be one of the current conflict files reported by Git.
- The approval proposal uses exact stored tool arguments: `git_add { paths: [...] }` with workflow metadata `kind: "git"` and `phase: "stage_conflicts"`.
- Confirmed selected-conflict staging now completes deterministically with workflow states such as `merge_conflicts_staged`, then stops so the user can explicitly continue, skip, or abort the active Git operation.
- Approval evidence now explains the boundary: this action only stages selected files that belong to the active conflict recovery.
- This keeps conflict resolution aligned with mature agent patterns: the agent can propose a precise safe-range tool call, but it does not silently convert conflict recovery into normal commit/push automation.

Verification:

- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck`.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts` with 6 tests.
- Passed `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts` with 64 tests.
- Added a real Git merge-conflict daemon test proving `stage_resolved_conflicts` rejects missing paths, creates a selected-path `git_add` approval, and confirmed execution stages only the selected conflict file.

Remaining gaps:

- Desktop still needs a dedicated conflict-file picker before exposing selected staging as a right-panel control.
- Cherry-pick and revert should receive real conflicted-repository daemon tests like rebase and merge.
- The right-side recovery UI still needs visual verification inside the running desktop app.

### 2026-06-09 Session Update

Phase:

Phase 1: Safety And Event Protocol

Status change:

- Phase 1 moved from `Not started` to `In progress`.
- Completion moved from `0%` to `30%`.
- Verification moved from `Blocked` to `Partial` because `.tools` runner works
  with the correct PATH.

Completed:

- Added execution-layer approval gating in `ChatPlanner`.
- Risky model-requested tool calls now return an approval proposal instead of
  executing immediately.
- Added tests proving direct planner calls to `git_fetch`, `git_commit`,
  `git_push`, `git_rebase`, `ado_create_pr`, and `ado_trigger_pipeline` do not
  execute handlers.
- Reclassified `git_fetch` as `medium` risk and approval-required.
- Evaluated `@openharness/core@0.6.2` as an MIT-licensed source-first reuse
  candidate and recorded the decision not to install it yet.
- Added `docs/third-party-source-reuse.md` to track dependency, fork, vendor,
  copy, and port decisions.

Partially completed:

- Runtime safety is now enforced for planner tool calls, but the broader event
  protocol cleanup is not done yet.
- OpenHarness has been evaluated at the package metadata level, but no upstream
  source has been copied and no package dependency has been added yet.

Blocked:

- Plain `node` and global `pnpm` still point at the Codex app WindowsApps Node
  and fail with `Access is denied`.
- Use `.tools` runner with `.tools/node-v22.11.0-win-x64` first in `PATH`.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `docs/third-party-source-reuse.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/core` focused tests passed: 2 files, 10 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/core` full tests passed: 13 files, 40 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Add a small compatibility layer that turns planner approval proposals into
  the new canonical event names without breaking the existing desktop UI.
- Decide whether to use `@openharness/core` only as a design reference for this
  phase, or add a wrapper dependency after resolving the `zod@3`/`zod@4`
  boundary.

### 2026-06-09 Session Update 2

Phase:

Phase 1: Safety And Event Protocol

Status change:

- Phase 1 completion moved from `30%` to `40%`.
- Overall implementation progress moved from `7%` to `9%`.

Completed:

- Added `packages/daemon/src/chatEvents.ts`.
- The daemon now emits legacy SSE event names for current desktop compatibility
  and canonical event aliases for future clients.
- Added canonical aliases:
  - `session.started`
  - `text.delta`
  - `progress`
  - `tool.started`
  - `tool.completed`
  - `workflow.updated`
  - `approval.required`
  - `approval.resolved`
  - `final`
  - `error`
  - `cancelled`
- Updated `/chat` and `/chat/:sessionId/confirm-action` SSE routes to use the
  compatibility layer.
- Extended desktop `ChatEventType` with canonical event names.
- Added daemon focused tests for legacy-plus-canonical event emission.

Partially completed:

- Event naming compatibility exists, but the frontend still actively renders
  the legacy event names.
- The final protocol should eventually remove legacy names after desktop
  rendering is migrated.

Source reuse:

- No upstream source was copied.
- This change follows the typed event direction documented from OpenHarness,
  but is implemented locally because it is a small adapter tightly coupled to
  the current daemon and desktop protocol.
- `@openharness/core` remains a dependency candidate, not an installed
  dependency.

Resolved later:

- The daemon full test suite previously had an environment-sensitive failure
  where host Azure Cosmos settings leaked into `server.test.ts`. This was fixed
  in Session Update 4 by clearing Azure persistence env vars in the test setup.

Files changed:

- `packages/daemon/src/chatEvents.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/chatEvents.test.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatEvents.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- `@cicd-agent/daemon` focused event tests passed: 1 file, 8 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/daemon` full test run: 2 files passed, 1 file failed because of
  an existing auth/Cosmos environment issue unrelated to the event
  compatibility change.

Next recommended task at the time:

- Add canonical event consumption in the desktop chat stream parser while still
  keeping legacy support.
- Investigate and stabilize the daemon full test auth/Cosmos failure so Phase 1
  verification can become fully green. Completed in Session Update 4.

### 2026-06-09 Session Update 3

Phase:

Phase 1: Safety And Event Protocol

Status change:

- Phase 1 completion moved from `40%` to `45%`.
- Overall implementation progress moved from `9%` to `11%`.
- Source-first reuse moved from planning into active use.

Completed:

- Vendored OpenHarness core source into `third_party/open-harness`.
- Preserved upstream MIT license and recorded upstream commit:
  `c45c9343962a3832bf3eb3456170a59414bf18d9`.
- Added `third_party/open-harness/SOURCE.md`.
- Updated `docs/third-party-source-reuse.md` with copied paths and reuse
  status.
- Ported OpenHarness' approval-before-execute pattern into local
  `ToolExecutor`.
- Added:
  - `ToolCallInfo`
  - `ToolApproveFn`
  - `ToolDeniedError`
- Added tests proving approval callbacks run before tool handlers and denied
  tool calls skip handler execution.

Source reuse:

- Upstream source copied:
  - `third_party/open-harness/LICENSE`
  - `third_party/open-harness/README.md`
  - `third_party/open-harness/package.json`
  - `third_party/open-harness/packages/core/**`
- Upstream behavior ported:
  - OpenHarness `ApproveFn`
  - OpenHarness `ToolDeniedError`
  - OpenHarness `wrapToolsWithApproval` pattern
- Local adapted implementation:
  - `packages/core/src/tools/executor.ts`

Files changed:

- `packages/core/src/tools/executor.ts`
- `packages/core/test/toolExecutor.test.ts`
- `third_party/open-harness/**`
- `third_party/open-harness/SOURCE.md`
- `docs/third-party-source-reuse.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/toolExecutor.test.ts test/chatPlannerApproval.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/core` focused tests passed: 3 files, 18 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/core` full tests passed: 13 files, 42 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Wire the new `ToolApproveFn` into chat-session planner execution with an
  explicit approval policy, while preserving direct execution for already
  approved stored actions.
- Continue mining OpenHarness source for reusable middleware patterns,
  especially retry, persistence, and UI stream conversion.

### 2026-06-09 Session Update 4

Phase:

- Phase 1: Safety And Event Protocol
- Phase 4: MCP And Azure DevOps Tool Reuse

Status change:

- Phase 1 completion moved from `55%` to `60%`.
- Phase 4 completion moved from `25%` to `30%`.
- Overall implementation progress moved from `16%` to `17%`.
- Verification progress moved from `35%` to `45%`.

Completed:

- Added `packages/core/src/tools/mcp.ts`, a dependency-free stdio MCP bridge
  that supports:
  - `initialize`
  - `tools/list`
  - `tools/call`
  - JSON-RPC `Content-Length` framing
  - MCP tool definition to local `ToolExecutor` wrapper conversion
- Added focused MCP bridge tests with a fake stdio MCP server.
- Added Azure DevOps MCP tool risk classification:
  - read/list/get/search/query/download MCP tools are low risk
  - create/update/run/link/vote/reply style MCP tools require approval
- Wired optional Azure DevOps MCP tool discovery into daemon chat sessions
  behind `CICD_AGENT_ADO_MCP_ENABLED`.
- Preserved default behavior: MCP is disabled unless explicitly enabled, and
  existing self-authored ADO tools remain registered.
- Fixed daemon test environment isolation by clearing host Azure persistence
  env vars in `packages/daemon/test/server.test.ts`.

Source reuse:

- `microsoft/azure-devops-mcp` is now more than vendored source: the local
  runtime has an external-process bridge designed to launch and reuse its MCP
  server tools directly.
- No upstream package dependency was installed yet.

Files changed:

- `packages/core/src/tools/mcp.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/src/index.ts`
- `packages/core/test/mcpTools.test.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/server.test.ts`
- `docs/third-party-source-reuse.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/core` full tests passed: 14 files, 46 tests.
- `@cicd-agent/daemon` full tests passed: 3 files, 22 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.

Next recommended task:

- Add a profile/UI-backed MCP configuration surface instead of environment-only
  switches.
- Add an integration test using a local fake MCP server through the daemon
  registration path.
- Start replacing or de-prioritizing duplicated self-authored ADO tools once
  Azure DevOps MCP is enabled for a profile.

### 2026-06-09 Session Update 5

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Phase 8 moved from `Not started` to `In progress`.
- Phase 8 completion moved from `0%` to `5%`.
- Overall implementation progress moved from `17%` to `18%`.

Completed:

- Introduced `Project Link` as the user-facing name for the old `Profile`
  concept.
- Kept existing route names, storage keys, and TypeScript model names in place
  for compatibility.
- Added API aliases:
  - `ProjectLink`
  - `ProjectLinkInput`
- Added in-chat Project Link creation when no link exists.
- Added in-chat Project Link creation from the chooser when links exist but no
  link is selected.
- After creation, the chat automatically selects the new link, applies its
  repo path, and returns focus to the message input.
- Updated the sidebar label and Project Link management page text.

Naming decision:

Use `Project Link` because the object maps a local repository to Azure DevOps
project/repository/branch/pipeline settings. It is not a user profile or a
person-owned identity.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- Vite dev server was started at `http://localhost:1420/`.

Next recommended task:

- Migrate internal names gradually from `WorkspaceProfile` to `ProjectLink`
  after the UI wording settles.
- Add branch detection and PAT verification into the in-chat creation card,
  reusing the richer controls already present on the management page.

### 2026-06-09 Session Update 6

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Phase 8 completion moved from `5%` to `10%`.
- Overall implementation progress moved from `18%` to `19%`.
- Verification moved from `45%` to `46%`.

Completed:

- Extracted shared Project Link helpers for desktop UI reuse:
  - `fetchGitBranches`
  - `verifyPat`
  - `projectLinkNameFromRepo`
  - `PatStatus`
- Rewired the Project Links management page to use the shared branch and PAT
  helper logic instead of owning a local duplicate.
- Enhanced the in-chat Project Link creation card so a user can configure the
  link without leaving the conversation:
  - branch detection runs after a repo path is entered
  - detected branches are shown as dropdown choices
  - default and PR target branches are auto-aligned to detected branches
  - branch detection can be manually retried
  - Azure DevOps PAT request and verification are available in the advanced
    details section
  - PAT status is shown inline as pending, verified, or invalid
- Cleaned remaining user-facing `profile` wording in the desktop shell, Pull
  Requests page, Review Queue page, Settings, and the old repository placeholder
  page so the product consistently presents this concept as `Project Link`.

Files changed:

- `apps/desktop/src/projectLinks.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/Repos.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `apps/desktop/src/pages/Settings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add an MCP-backed Azure DevOps discovery path for Project Link setup so the
  advanced fields can be populated from reusable upstream MCP tools instead of
  manual entry.
- Add a profile/UI-backed MCP enablement switch instead of relying only on
  environment variables.

### 2026-06-09 Session Update 7

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Phase 4 completion moved from `30%` to `40%`.
- Phase 8 completion moved from `10%` to `12%`.
- Overall implementation progress moved from `19%` to `20%`.
- Verification moved from `46%` to `50%`.

Completed:

- Added Project Link-level Azure DevOps MCP configuration fields:
  - `adoMcpEnabled`
  - `adoMcpCommand`
  - `adoMcpAuthentication`
  - `adoMcpDomains`
- Persisted the new fields through local profile storage, daemon schemas, and
  Azure Table profile storage.
- Passed MCP configuration through tool context for both stored Project Links
  and inline Project Links sent by the desktop chat.
- Updated daemon MCP registration so Azure DevOps MCP can now be enabled by a
  Project Link instead of only through process environment variables.
- Kept environment variables as global fallback controls.
- Added MCP controls to:
  - the Project Links management page
  - the in-chat Project Link creation card
- Refreshed cross-package build declarations for `@cicd-agent/core` and
  `@cicd-agent/review-agent`; daemon typecheck depends on those package
  declaration outputs.
- Updated the third-party reuse registry with the new Project Link-backed MCP
  enablement boundary.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Profiles.tsx`
- `packages/core/src/profiles.ts`
- `packages/core/src/store/tableProfileStore.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` build passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/core` full tests passed: 14 files, 46 tests.
- `@cicd-agent/daemon` full tests passed: 3 files, 22 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a fake Azure DevOps MCP daemon integration test that proves a
  Project Link with `adoMcpEnabled: true` registers `mcp_ado_*` tools through
  the chat runtime.
- Add MCP-backed discovery for organization projects, repositories, and
  pipelines so Project Link setup can auto-fill ADO fields from upstream MCP
  tools.

### 2026-06-10 Session Update 8

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Status change:

- Phase 4 completion moved from `40%` to `45%`.
- Overall implementation progress moved from `20%` to `21%`.
- Verification moved from `50%` to `52%`.

Completed:

- Exported the daemon chat tool executor factory as an internal testable
  boundary.
- Added support for `adoMcpCommand` values that include the command plus extra
  arguments, such as `node fake-server.mjs`.
- Added daemon coverage proving a Project Link-style tool context with
  `ado_mcp_enabled: true` registers `mcp_ado_*` tools.
- The new test uses a fake stdio MCP server and verifies:
  - the MCP server is launched through the Project Link MCP command setting
  - `mcp_ado_repo_list_repos_by_project` appears in the chat action executor
  - the wrapped MCP tool can be called through the local `ToolExecutor`
  - MCP result metadata is preserved as `mcp_server`, `mcp_tool`, and `text`
- Daemon full tests now include the MCP registration test.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionMcp.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionMcp.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- Focused MCP registration test passed.
- `@cicd-agent/daemon` full tests passed: 4 files, 23 tests.

Next recommended task:

- Add MCP-backed discovery actions for Project Link setup:
  - list Azure DevOps projects
  - list repositories for a selected project
  - list pipelines for a selected repository/project

### 2026-06-11 Session Update 31

Phase:

Phase 1: Safety And Event Protocol

Phase 2: Repository Understanding

Phase 8: Product Hardening And Distribution

Status change:

- No broad percentage change; this was the first source-first streaming-output
  reuse migration slice.

Completed:

- Reviewed concrete OpenHarness upstream source files for streaming/event logic:
  - `third_party/open-harness/packages/core/src/agent.ts`
  - `third_party/open-harness/packages/core/src/stream.ts`
  - `third_party/open-harness/packages/core/src/ui-stream.ts`
  - `third_party/open-harness/packages/core/src/middleware/turn-tracking.ts`
  - `third_party/open-harness/packages/core/src/__tests__/ui-stream.test.ts`
- Created a local source-reuse intake file with selected upstream code blocks,
  reuse decisions, and migration slices:
  - `docs/source-reuse-streaming-event-intake.md`
- Migrated the first OpenHarness UI stream lifecycle pattern into local runtime
  code:
  - `packages/core/src/chatUiStream.ts`
- The new adapter maps current `ChatEvent` values into UI lifecycle chunks:
  - `start`
  - `text-start`
  - `text-delta`
  - `text-end`
  - `progress`
  - `tool-input-start`
  - `tool-input-available`
  - `tool-output-available`
  - `tool-output-error`
  - `approval-required`
  - `approval-resolved`
  - `workflow-updated`
  - `finish`
  - `error`
- Exported the adapter from the core package barrel for future daemon/frontend
  integration.
- Added focused tests covering text lifecycle, progress/tool text closure,
  tool output/error mapping, and approval chunk mapping.

Files changed:

- `docs/source-reuse-streaming-event-intake.md`
- `packages/core/src/chatUiStream.ts`
- `packages/core/src/index.ts`
- `packages/core/test/chatUiStream.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatUiStream.test.ts test/gitOptions.test.ts test/chatContext.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
```

Result:

- Focused core tests passed: 3 files, 9 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/core` build passed.

Next recommended task:

- Wire `chatEventsToUiChunks` into daemon SSE as a parallel compatibility
  stream or a new `/chat/ui` endpoint.
- Update Conversation rendering to consume text/tool/progress chunks with
  explicit text lifecycle instead of relying only on `statusText`.
- Continue source-first migration by porting OpenHarness stream transforms
  (`tap`, `map`, `filter`, `takeUntil`) for instrumentation and abort handling.

### 2026-06-11 Session Update 29

Phase:

Phase 2: Repository Understanding

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- No broad percentage change; this was a focused UX/auth/tool-capability
  hardening pass.

Completed:

- Fixed the in-chat Project Link creation branch controls so Default branch and
  PR target branch no longer overlap in constrained layouts.
- Applied the same branch-control width safeguards to the Project Links
  management page.
- Added shared desktop default ADO organization URL:
  `https://tebssg.visualstudio.com/`.
- Improved Project Link discovery error handling so ADO OAuth failures are
  surfaced as meaningful auth diagnostics instead of opaque HTTP 400 text.
- Verified the current local user identity can be resolved:
  `Zhou Ping <Zhou.Ping@totalebizsolutions.com>`.
- Verified that the same signed-in user currently cannot acquire an Azure
  DevOps OAuth token for Project Link discovery; `/profiles/discover` returns
  `Azure DevOps OAuth token is unavailable`, so the next UX step should be an
  explicit Azure DevOps access/consent action or PAT fallback.
- Extended structured Git tools with common real-world options:
  - `git_status` supports short/branch/ignored/untracked options.
  - `git_diff` supports staged/cached/name-only/stat/context/path filters.
  - `git_add` supports paths/all/update/intent-to-add/dry-run.
  - `git_commit` supports amend/no-verify/allow-empty/all.
  - `git_push` supports set-upstream/force-with-lease/tags/dry-run.
  - Added `git_switch` for branch switching and branch creation.
- Updated the chat planner prompt so workspace-change questions should explain
  what the change is about, not only list files.
- Added repository context change interpretation and diff excerpts for
  Git-state questions, giving the model enough context to summarize intent,
  affected areas, and risk.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/projectLinks.ts`
- `packages/core/src/chatContext.ts`
- `packages/core/src/chatPlanner.ts`
- `packages/core/src/tools/git.ts`
- `packages/core/test/chatContext.test.ts`
- `packages/core/test/gitOptions.test.ts`
- `packages/daemon/src/server.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/gitOptions.test.ts test/chatContext.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- Focused core tests passed: 2 files, 6 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/core` build passed.
- Focused daemon server tests passed: 1 file, 23 tests.

Next recommended task:

- Add an explicit "Enable Azure DevOps access" flow that triggers ADO resource
  consent/token acquisition separately from basic Microsoft identity sign-in.
- Continue Git capability expansion with a fuller command/flag matrix and
  focused tests for `git restore`, `git stash`, `git log`, `git show`,
  `git branch`, and safe pathspec handling.
- Improve visible Chat process feedback with progress events such as "reading
  workspace diff", "summarizing change intent", and "checking ADO auth" while
  avoiding exposure of private model chain-of-thought.

### 2026-06-11 Session Update 28

Phase:

Phase 2: Repository Understanding, Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from 95% to 96%.
- Phase 2 moved from 13% to 15%.
- Phase 8 moved from 25% to 27%.

Completed:

- Reframed Project understanding as an agent-internal context/tool capability
  instead of a right-side visual card in Conversation.
- Removed the right-side Project understanding status card and its manual
  refresh control from the Conversation panel.
- Kept automatic repository index status loading so Conversation suggestions can
  still adapt to whether the project has been understood.
- Streamlined in-chat Project Link creation copy and removed over-explaining
  from the setup card.
- Reworked the Azure DevOps details area to use theme-aware surfaces instead of
  hardcoded dark blocks, improving light-theme rendering.
- Moved Conversation model selection into the composer itself, matching the
  Codex-style model chooser pattern.
- Preserved Built-in model as the default and exposed user-configured providers
  only as additional selectable models.
- Fixed the desktop API path so `chatStream` actually applies the selected
  Conversation model when a custom provider is chosen.
- Reworked the right Conversation panel into an Environment/workflow surface:
  - changes summary
  - local repository indicator
  - branch menu that routes branch actions through the agent
  - commit/push menu that routes commit and push intents through the agent
  - active Project Link/repository/ADO mapping summary
  - workflow progress display
- Made welcome prompts context-aware:
  - repository-understanding prompts when the index is missing or not semantic
  - PR/CI/CD prompts when ADO mapping or pipeline data exists
  - local test/build/commit prompts when ADO mapping is not ready

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add direct Conversation-side workflow affordances for PR insight:
  - pick a PR from ADO when the Project Link has ADO mapping
  - show saved PR insight availability inside agent responses, not as raw UI
    cards
  - route analyze/refresh/compare requests through the existing PR insight
    artifact store
- Continue reducing Project Link parameters by inferring project/repo/pipeline
  candidates from git remotes and ADO discovery.

### 2026-06-11 Session Update 29

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- No overall percentage change; this was a focused Conversation workflow and
  visual verification pass.

Completed:

- Removed the Project Link setup info sentence:
  `Local chat, repository indexing, git analysis, and test/build commands can
  start now.`
- Removed the right-side Environment panel's standalone `Local` row.
- Changed right-side Environment actions from "fill the composer with text" to
  direct agent workflow triggers:
  - Changes starts a git status/diff inspection turn.
  - Refresh branch state starts a branch inspection turn.
  - Branch checkout actions start a safe checkout workflow through the agent.
  - New branch creation accepts a branch name in the right panel and starts a
    safe create-checkout workflow through the agent.
  - Commit, commit-and-push, and push start the existing agent workflow and
    approval path directly.
- Added initial/unknown state handling for the right panel:
  - Changes shows `not checked` until git status/diff has been inspected.
  - Branch shows `not checked` when no current branch or Project Link default is
    available.
  - Busy actions are disabled and show running/disabled state instead of
    queueing duplicate work.
- Constrained branch and commit popovers to the right Environment panel instead
  of letting them overlap the main Conversation column.
- Reduced the Conversation middle-panel minimum width from 520px to 420px and
  increased the default right panel width to 260px so the Environment panel is
  fully visible in narrower windows.
- Performed headless Chrome visual verification against the local Vite app:
  - no-profile Project Link setup plus model menu
  - Project Link selected with branch menu open
  - Project Link selected with commit menu open
- Verified by script that the removed setup text is absent, the `Local` row is
  absent, and the `not checked` initial state is present.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/index.css`
- `docs/dev-agent-progress-tracker.md`

Tests and verification run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Visual verification artifacts:

- `C:\Users\15492\AppData\Local\Temp\cicd-agent-visual-check\no-profile-model-menu-2.png`
- `C:\Users\15492\AppData\Local\Temp\cicd-agent-visual-check\profile-branch-menu-2.png`
- `C:\Users\15492\AppData\Local\Temp\cicd-agent-visual-check\profile-commit-menu-2.png`

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- Headless Chrome visual checks passed for the targeted Conversation states.

Next recommended task:

- Continue replacing Conversation quick actions with direct workflow starts for
  PR insight and CI/CD pipeline actions.
- Add a richer Environment state source so branch/change counts can initialize
  from lightweight daemon git endpoints before the first agent turn.

### 2026-06-11 Session Update 102

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- No percentage change; this was a workflow-control correction.

Completed:

- Replaced the right Environment panel's direct prompt/start callback with a
  typed `WorkspaceAction` dispatcher.
- Right-side controls now send semantic actions to the parent instead of raw
  prompt strings:
  - inspect environment
  - inspect changes
  - refresh branch state
  - checkout branch
  - create branch
  - commit / commit-and-push / push
- Added workflow-state-aware handling in the parent Conversation component:
  - matching pending action cards are confirmed directly through the structured
    confirmation path.
  - matching `workflowState.pendingApproval` is recognized instead of starting
    another turn.
  - non-matching pending approvals block new right-panel actions and surface a
    status message.
  - active planning/running workflows block duplicate starts.
  - blocked workflows surface their blocked step instead of launching unrelated
    work.
- Kept natural-language workflow starts only as the fallback when there is no
  active or pending workflow to continue.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Initialize Environment branch/change state from lightweight daemon git
  endpoints so the panel can show real state before the first agent workflow
  turn.

### 2026-06-11 Session Update 103

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- No percentage change; this was a Conversation Environment action guard fix.

Completed:

- Fixed the right Environment panel so `Changes` does not start a chat turn when
  there is no local repository context.
- Disabled Environment actions that require a repository until `repoPath` is
  available.
- Added silent workflow starts for right-panel actions that do have repository
  context, so workflow controls no longer render as blue user chat bubbles.
- Kept normal typed composer messages unchanged.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests and verification run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Headless Chrome verification:

- New Conversation with no Project Link/repo:
  - `Changes` button is disabled.
  - clicking it does not change the page text.
  - no `running` state appears.
  - no `Planning response` appears.

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Initialize Environment branch/change state from lightweight daemon git
  endpoints so controls can become enabled as soon as a repo path is known.

### 2026-06-11 Session Update 28

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `38%` to `41%`.
- Verification moved from `69%` to `71%`.
- Phase 5 completion moved from `30%` to `38%`.

Completed:

- Extended the Review Agent cloud context model with Azure DevOps PR readiness
  signals:
  - title, description, status, draft state, source/target branch
  - author, work items, reviewer counts, vote summary
  - thread count, active thread count, failed build count, latest build status
- Added these ADO signals to the full review prompt so the AI insight path can
  reason from PR metadata, review state, and CI state instead of only changed
  file contents.
- Updated `review-run` to enrich the Review Agent bundle with internal ADO
  PR/thread/build data before calling the planner.
- Kept ADO signal enrichment non-blocking: if metadata enrichment fails, the
  full review still runs with diff context.
- Expanded route-level mocks so the daemon `review-run` test covers PR detail,
  thread, build, changed file, item content, and reviewer identity calls.
- Removed an unstable route-level Azure OpenAI SDK mock test; LLM compression
  behavior remains covered by Review Agent unit tests.
- Added PR-Agent-style finding post-processing:
  - changed-file path normalization
  - invalid file and invalid line filtering
  - empty message filtering
  - duplicate finding filtering
- Full `review-run` responses now expose `discardedFindings` so the UI can show
  when model output was rejected before reaching reviewers.
- Desktop Pull Requests full insight cards now show a compact discarded model
  comment count when post-processing filters output.

Files changed:

- `packages/review-agent/src/cloudContext.ts`
- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 6 files, 24 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add compact desktop tests around full insight rendering helpers or extract the
  insight summary view into a testable component.
- Continue PR-Agent reuse by adding a patch/diff-focused context builder so
  line anchors can refer to changed hunks instead of whole-file line numbers.

### 2026-06-11 Session Update 29

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `41%` to `43%`.
- Verification moved from `71%` to `72%`.
- Phase 5 completion moved from `38%` to `42%`.

Completed:

- Ported Azure DevOps MCP-style filediffs retrieval into the local Review Agent
  ADO client.
- Extended cloud review context with changed hunk metadata:
  - original start/count
  - modified start/count
  - original lines
  - modified lines
- `buildCloudContext` now requests ADO file diffs when both base and source
  commits are available.
- Full `review-run` now passes the PR iteration common commit as the base
  commit so hunk context can be built.
- Review prompts now render changed hunks when ADO line diff blocks are
  available.
- Finding post-processing now rejects findings outside changed hunks when hunk
  metadata exists, keeping AI comments anchored to actual PR changes.
- Added route-level daemon coverage proving `review-run` requests ADO
  filediffs.

Files changed:

- `packages/review-agent/src/adoClient.ts`
- `packages/review-agent/src/cloudContext.ts`
- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/test/cloudContext.test.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 7 files, 27 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add compact desktop tests around full insight rendering helpers or extract the
  insight summary view into a testable component.
- Continue PR-Agent reuse by adding changed-hunk-aware compression priority so
  files with actionable hunk data are preferred over whole-file-only context
  when prompt budget is tight.

### 2026-06-11 Session Update 30

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `43%` to `44%`.
- Verification moved from `72%` to `73%`.
- Phase 5 completion moved from `42%` to `44%`.

Completed:

- Added hunk-aware compression priority to the Review Agent planner.
- Files with actionable changed hunk metadata now receive extra priority when
  the prompt is budget-limited.
- This keeps real PR diff evidence ahead of low-signal whole-file content in
  large reviews.
- Added focused coverage proving a file with changed hunk data is included
  ahead of a large low-signal file when compression is active.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 7 files, 28 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add compact desktop tests around full insight rendering helpers or extract the
  insight summary view into a testable component.
- Add richer review-run response metadata for hunk coverage, such as the number
  of files with hunk data versus whole-file-only context.

### 2026-06-11 Session Update 31

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `44%` to `45%`.
- Verification moved from `73%` to `74%`.
- Phase 5 completion moved from `44%` to `46%`.

Completed:

- Added Review Agent context coverage metadata:
  - total changed files
  - files with ADO hunk data
  - whole-file-only fallback files
  - hunk count
  - changed hunk line count
- `review-run` now returns this coverage metadata with the full AI insight.
- Pull Requests UI now displays hunk coverage next to compression details so
  users can understand whether the AI review used line-level diff context or
  whole-file fallback context.
- Added Review Agent coverage unit tests and daemon route-level coverage
  assertions.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 7 files, 29 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add compact desktop tests around full insight rendering helpers or extract the
  insight summary view into a testable component.
- Start Phase 6 groundwork by persisting hunk coverage and discarded finding
  counts in review history so Review Queue can rank low-confidence reviews.

### 2026-06-11 Session Update 32

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `45%` to `47%`.
- Verification moved from `74%` to `76%`.
- Phase 6 completion moved from `0%` to `16%`.

Completed:

- Persisted low-confidence review signals into Review History:
  - discarded model finding count
  - files with hunk-level coverage
  - whole-file fallback files
  - changed hunk line count
- Propagated those signals through the core local history model, Azure Review
  Queue item mapping, Review Agent state store, daemon history schema,
  daemon `review-run`, desktop local cache, and desktop API sync path.
- Added Review Queue attention-priority ordering:
  - blocked and human-review items sort ahead of watching and auto-approved
    items
  - higher risk sorts ahead of lower risk
  - more findings, discarded findings, and whole-file fallback files increase
    attention priority
  - recency remains the tie-breaker
- Added priority reason codes so Review Queue cards can explain why an item
  needs attention, such as blocked queue, high risk, discarded findings,
  whole-file fallback, or missing hunk coverage.
- Added desktop Review Queue controls for:
  - filtering by queue lane
  - switching between attention-first and most-recent ordering
- Restored auto-approval audit details on Review Queue cards while keeping the
  newer confidence metadata visible.
- Kept this work aligned with the product goal: ADO remains the source of PR
  and diff signals, while the local product adds AI insight, confidence, and
  reviewer workflow semantics.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/reviewService.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 7 files, 29 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Promote the attention-priority helper into a full Review Queue policy object
  that can also drive auto-approval eligibility and blocked/human-review
  routing.

### 2026-06-11 Session Update 33

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `47%` to `48%`.
- Verification moved from `76%` to `77%`.
- Phase 6 completion moved from `16%` to `22%`.

Completed:

- Promoted low-confidence signals from queue display into review decision
  policy:
  - discarded model findings
  - whole-file fallback files
  - missing hunk coverage
  - empty hunk coverage
- Review decisions now include:
  - `contextConfidence`
  - `reasonCodes`
- Auto-approval is now blocked when review context confidence is not high,
  routing the PR to human review instead of approving from weak AI evidence.
- Daemon full `review-run` responses now return context confidence and reason
  codes so the Pull Requests workspace can explain policy decisions.
- Pull Requests AI Insight cards now display context confidence and compact
  reason-code chips.
- Route-level daemon tests now assert the new decision contract.

Files changed:

- `packages/review-agent/src/reviewDecision.ts`
- `packages/review-agent/src/reviewService.ts`
- `packages/review-agent/test/reviewDecision.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test -- test/reviewDecision.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` focused decision tests passed: 1 file, 7 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/review-agent` full tests passed: 7 files, 30 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Persist `contextConfidence` and `reasonCodes` in Review History so Review
  Queue can show the exact policy decision from the run, not only recomputed
  attention reasons.

### 2026-06-11 Session Update 34

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `48%` to `49%`.
- Verification moved from `77%` to `78%`.
- Phase 6 completion moved from `22%` to `26%`.

Completed:

- Persisted review policy result fields through Review History:
  - `decisionReasonCodes`
  - `contextConfidence`
- Added these fields to:
  - core Review Queue item model
  - core local review history
  - Review Agent Table/File state stores
  - daemon manual review-history upsert schema
  - daemon full `review-run` history writes
  - desktop API model
  - desktop local browser history cache
  - Pull Requests history writes
- Review Queue attention explanations now prefer stored policy reason codes
  when available, while still retaining computed fallback signals.
- Azure Table state writes serialize reason codes as JSON strings so Table
  Storage does not receive unsupported array properties.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/review-agent/src/reviewService.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 7 files, 30 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add explicit queue action controls for human review disposition, such as
  acknowledge, mark safe, mark blocked, or request changes, with those actions
  persisted as audit events rather than transient UI state.

### 2026-06-11 Session Update 35

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `49%` to `50%`.
- Verification moved from `78%` to `79%`.
- Phase 6 completion moved from `26%` to `32%`.

Completed:

- Added persisted manual Review Queue disposition fields:
  - `manualDisposition`
  - `manualDispositionAt`
  - `manualDispositionActor`
  - `manualDispositionNote`
- Added these fields to core queue/history models, Review Agent state stores,
  daemon review-history upsert schema, daemon `review-run` default writes,
  desktop API types, and desktop browser history.
- Added Review Queue card actions:
  - Acknowledge
  - Mark safe
  - Block
  - Request changes
- Manual dispositions update the local queue immediately and persist through
  the existing daemon/browser review-history path.
- Manual safe/block/change-request dispositions adjust the queue lane and risk
  level so the Review Queue stays operational even before deeper ADO write-back
  actions are implemented.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 7 files, 30 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.

Next recommended task:

- Convert manual dispositions from summary fields into append-only audit
  events, then add optional ADO write-back for request-changes/blocking actions.

### 2026-06-11 Session Update 36

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `50%` to `51%`.
- Verification moved from `79%` to `80%`.
- Phase 6 completion moved from `32%` to `36%`.

Completed:

- Added append-only manual disposition audit events:
  - `disposition`
  - `at`
  - `actor`
  - `note`
- Kept the latest `manualDisposition*` summary fields for fast queue display,
  while preserving the full event list for audit history.
- Added event persistence across:
  - core Review Queue model
  - core local review history
  - Review Agent Table/File state stores
  - daemon review-history schema
  - daemon `review-run` default history rows
  - desktop API model
  - desktop local browser history
- Azure Table state writes serialize disposition events as JSON strings.
- Review Queue actions now append events instead of only replacing the latest
  summary fields.
- Review Queue cards now show disposition event count and latest event label.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 7 files, 30 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.

Next recommended task:

- Add an explicit ADO write-back path for request-changes/blocking disposition
  actions so reviewer decisions can optionally create PR threads/comments in
  Azure DevOps.

### 2026-06-11 Session Update 37

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `51%` to `52%`.
- Verification moved from `80%` to `81%`.
- Phase 6 completion moved from `36%` to `40%`.

Completed:

- Added daemon `POST /profiles/:id/review-disposition`.
- The new route:
  - accepts the full review history/disposition payload
  - persists the disposition and append-only event list through local review
    history
  - supports `writeBackToAdo`
  - creates an ADO PR thread for `changes_requested` and `marked_blocked`
    dispositions when write-back is enabled
  - reports whether ADO write-back was attempted and whether it succeeded
- Added desktop `recordProfileReviewDisposition` API helper.
- Review Queue action buttons now call the disposition endpoint and request ADO
  write-back for blocking/change-request actions.
- Added route-level daemon coverage for disposition persistence without network
  ADO write-back.
- Added route-level daemon coverage for mocked ADO PR-thread write-back payloads
  when `changes_requested` is submitted.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Focused daemon server tests passed: 1 file, 16 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Surface ADO write-back success/failure in the Review Queue UI so users can
  tell whether a manual disposition only updated local audit history or also
  reached Azure DevOps.

### 2026-06-11 Session Update 38

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `52%` to `53%`.
- Verification moved from `82%` to `83%`.
- Phase 6 completion moved from `40%` to `44%`.

Completed:

- Added persisted ADO write-back summary fields:
  - `manualDispositionWriteBackAttempted`
  - `manualDispositionWriteBackOk`
  - `manualDispositionWriteBackError`
  - `manualDispositionWriteBackAt`
- Added these fields through core Review Queue models, local review history,
  Review Agent state stores, daemon schemas, desktop API models, browser
  history, and Pull Requests history writes.
- The daemon disposition endpoint now saves write-back results after ADO PR
  thread creation succeeds or fails.
- The desktop disposition API now returns the daemon-saved record and refreshes
  local browser history with the authoritative write-back result.
- Review Queue cards now display whether ADO write-back was posted, not posted,
  or failed with an error.
- Daemon route tests now assert persisted write-back status for both no-write
  and mocked-success paths.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` tests passed: 7 files, 30 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 33 tests.
- Focused daemon server tests passed: 1 file, 16 tests.

Next recommended task:

- Add a retry write-back action for disposition records whose ADO write-back
  failed, reusing the saved disposition event and note.

### 2026-06-11 Session Update 39

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `53%` to `54%`.
- Verification moved from `83%` to `84%`.
- Phase 6 completion moved from `44%` to `46%`.

Completed:

- Added a `Retry ADO` Review Queue action for `marked_blocked` and
  `changes_requested` dispositions when Azure DevOps write-back is failed or
  still pending.
- The retry path reuses the saved disposition, actor, note, and audit event
  history instead of appending duplicate manual disposition events.
- Retry optimistically marks the record as write-back attempted, then replaces
  local state with the daemon-saved authoritative record.
- Review Queue cards continue to show ADO write-back posted/not-posted status,
  timestamp, and error details.

Files changed:

- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/desktop` production build passed.
- Focused daemon server tests passed: 1 file, 16 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Persist the Azure DevOps thread id and URL returned by successful
  disposition write-back, then display that link in Review Queue so reviewers
  can jump from Dev Agent audit history to the exact ADO PR discussion.

### 2026-06-11 Session Update 40

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `54%` to `55%`.
- Verification moved from `84%` to `85%`.
- Phase 6 completion moved from `46%` to `50%`.

Completed:

- Persisted ADO PR-thread link metadata for successful disposition write-back:
  - `manualDispositionWriteBackThreadId`
  - `manualDispositionWriteBackUrl`
- The daemon now extracts thread id/url from the Azure DevOps `createThread`
  response and builds a fallback PR discussion URL when ADO returns an id but
  not a web link.
- Thread metadata now flows through:
  - core Review Queue models
  - local review history
  - Review Agent table/file state stores
  - daemon schemas and route records
  - desktop API models
  - desktop browser history
  - Review Queue cards
- Review Queue cards now show the ADO thread id and an `open thread` link when
  write-back succeeds.
- Retry write-back controls now have an in-flight guard so a repeated click
  does not create duplicate Azure DevOps PR threads.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed: 1 file, 16 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a richer Review Queue audit panel that lists disposition events,
  write-back attempts, ADO thread links, and review context-confidence signals
  in one place.

### 2026-06-11 Session Update 41

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `55%` to `56%`.
- Verification moved from `85%` to `86%`.
- Phase 6 completion moved from `50%` to `52%`.

Completed:

- Extended the Review Queue findings side panel with a disposition audit
  section.
- The side panel now shows:
  - latest manual disposition summary
  - reverse-chronological disposition events
  - ADO write-back posted/not-posted status
  - ADO write-back error details
  - ADO PR thread id
  - open-thread link when available
- This makes the local AI review audit trail easier to inspect without leaving
  the PR findings surface.

Files changed:

- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add action-level audit entries for ADO write-back retries so successful and
  failed retry attempts appear as first-class audit events instead of only
  updating the latest write-back summary fields.

### 2026-06-11 Session Update 42

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `56%` to `57%`.
- Verification moved from `86%` to `87%`.
- Phase 6 completion moved from `52%` to `55%`.

Completed:

- Added append-only ADO write-back attempt events:
  - disposition
  - timestamp
  - success/failure status
  - actor
  - note
  - error
  - ADO thread id
  - ADO thread URL
- The daemon now appends one write-back attempt event every time it actually
  tries to create an Azure DevOps PR thread, including retry attempts.
- Write-back attempt events now flow through:
  - core Review Queue models
  - local review history
  - Review Agent Azure Table/file state stores
  - daemon schemas and route records
  - desktop API models
  - desktop browser history
  - Pull Requests placeholder/history writes
  - Review Queue cards and audit side panel
- The Review Queue audit side panel now lists write-back attempts in reverse
  chronological order.
- The side panel selected item now refreshes after disposition save or retry so
  the open panel shows the daemon-saved audit record immediately.

Files changed:

- `packages/core/src/reviewQueue.ts`
- `packages/core/src/reviewHistoryLocal.ts`
- `packages/core/test/reviewHistoryLocal.test.ts`
- `packages/review-agent/src/stateStore.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/reviewHistoryLocal.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` focused review-history tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- Focused daemon server tests passed: 1 file, 16 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a small daemon route test for failed ADO write-back attempts so the
  append-only attempt-event contract is covered for both success and failure.

### 2026-06-11 Session Update 43

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Verification moved from `87%` to `88%`.
- No implementation percentage change; this was contract hardening for the
  append-only write-back audit path.

Completed:

- Added daemon route coverage for failed Azure DevOps disposition write-back.
- The new test mocks an ADO PR-thread creation failure and verifies:
  - the route still returns a saved local audit record
  - latest write-back summary fields are marked attempted/failed
  - the write-back error is persisted
  - thread id and URL remain empty
  - an append-only write-back attempt event is stored with `ok: false`
  - Review Queue retrieval returns the failed attempt event
- Focused daemon server coverage now includes 17 tests.

Files changed:

- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Focused daemon server tests passed: 1 file, 17 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Add a compact desktop unit test around Review Queue local history merge or
  extract the write-back audit rendering helper for focused UI coverage.

### 2026-06-11 Session Update 44

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Verification moved from `88%` to `89%`.
- No implementation percentage change; this was desktop-side persistence and
  merge coverage for the write-back audit trail.

Completed:

- Added desktop unit coverage for browser Review Queue history handling.
- New tests verify:
  - write-back attempt events persist through `upsertReviewHistoryLocal`
  - daemon queue sync preserves write-back attempt history
  - Review Queue merge keeps the newest item and its write-back attempts
  - corrupt browser review-history cache is ignored instead of throwing
- Desktop tests now cover both Project Link pipeline recommendation and Review
  Queue local history behavior.

Files changed:

- `apps/desktop/src/reviewHistoryLocal.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewHistoryLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop review-history tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 2 files, 6 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Extract the Review Queue audit rendering into a small pure view helper or
  component to make write-back attempt presentation easier to test without a
  full page render.

### 2026-06-11 Session Update 45

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Verification moved from `89%` to `90%`.
- No implementation percentage change; this was UI audit presentation
  hardening and testability work.

Completed:

- Extracted Review Queue audit presentation data into a pure helper:
  - `buildReviewAuditViewModel`
  - `dispositionLabel`
- The Review Queue findings panel now renders disposition audit, latest ADO
  write-back status, and write-back attempts from the helper instead of
  embedding all ordering/label/fallback decisions inline.
- Added focused desktop unit coverage for:
  - disposition labels
  - audit summary text
  - reverse chronological write-back attempt ordering
  - posted/failed status labels
  - unknown actor fallback text
  - no-audit empty state
- Desktop tests now cover 3 files and 10 tests.

Files changed:

- `apps/desktop/src/reviewAudit.ts`
- `apps/desktop/src/reviewAudit.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewAudit.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop audit view-model tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 3 files, 10 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a Review Queue rerun action that triggers the existing full Review Agent
  `review-run` path from the queue surface and refreshes the audit/history
  record after completion.

### 2026-06-11 Session Update 46

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `57%` to `58%`.
- Verification moved from `90%` to `91%`.
- Phase 6 completion moved from `55%` to `58%`.

Completed:

- Added `Rerun review` controls to Review Queue cards.
- The rerun action reuses the existing full Review Agent route:
  - `POST /profiles/:id/review-run`
- Rerun state is tracked per repository/PR so repeated clicks are guarded and
  the button shows `Rerunning...` while active.
- On success, the Review Queue item is refreshed with the new Review Agent
  result:
  - iteration id
  - finding count
  - decision queue/risk/reason/reason codes
  - context confidence
  - auto-approval metadata
  - discarded finding count
  - hunk coverage and fallback counts
- Existing manual disposition history and ADO write-back audit history are
  preserved across reruns.
- Rerun findings are saved into desktop local findings storage, including empty
  result sets so stale findings can be cleared.
- If a findings panel is open for the rerun PR, the selected item and displayed
  findings refresh after completion.

Files changed:

- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/desktop` tests passed: 3 files, 10 tests.
- Focused daemon server tests passed: 1 file, 17 tests.

### 2026-06-11 Session Update 47

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Verification moved from `91%` to `92%`.
- Overall implementation progress remains `58%`.
- Phase 6 completion remains `58%`.

Completed:

- Extracted Review Queue rerun result mapping from
  `ReviewFindings.tsx` into a pure desktop helper:
  - `applyReviewRunToQueueItem`
- The helper maps Review Agent `review-run` results back into the queue item:
  - iteration id
  - finding count
  - decision queue/risk/reason/reason codes
  - context confidence
  - auto-approval metadata
  - discarded finding count
  - hunk coverage and whole-file fallback counts
- Added focused unit tests proving rerun result mapping preserves existing
  manual disposition and ADO write-back audit history.
- Added focused unit tests proving stale auto-approval metadata is cleared when
  a rerun moves a PR back to human review.
- Review Queue UI now delegates rerun result merging to the helper while keeping
  the same user-facing behavior.

Files changed:

- `apps/desktop/src/reviewRunHistory.ts`
- `apps/desktop/src/reviewRunHistory.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewRunHistory.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop rerun-history tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 14 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a Review Queue batch/refresh workflow that can rerun stale queue items
  from the current Project Link while preserving the same audited history model.

### 2026-06-11 Session Update 48

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `58%` to `59%`.
- Verification moved from `92%` to `93%`.
- Phase 6 completion moved from `58%` to `60%`.

Completed:

- Added a visible-list batch rerun workflow to the Review Queue.
- The batch action respects the current queue filter and sort order, so an
  operator can filter to `blocked`, `needs_human_review`, or any other visible
  subset before rerunning.
- Batch rerun executes the existing full Review Agent path for each visible
  queue item:
  - `POST /profiles/:id/review-run`
- Batch progress is shown inline as `done/total`.
- Per-item rerun buttons still guard repeated clicks while a PR is active.
- Added a shared stable Review Queue item key helper and reused it for:
  - rerun state
  - ADO write-back retry state
  - batch rerun skip logic
- The batch workflow inherits the same audited result merge path, so manual
  disposition and ADO write-back history are preserved.

Files changed:

- `apps/desktop/src/reviewRunHistory.ts`
- `apps/desktop/src/reviewRunHistory.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewRunHistory.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop rerun-history tests passed: 1 file, 5 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 15 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add stale-review selection rules so batch rerun can target only decisions
  older than a configurable age or decisions that are missing current PR
  context confidence.

### 2026-06-11 Session Update 49

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `59%` to `60%`.
- Verification moved from `93%` to `94%`.
- Phase 6 completion moved from `60%` to `62%`.

Completed:

- Added stale-review selection helpers for Review Queue rerun workflows.
- A review queue item is currently stale when:
  - context confidence is missing
  - or the last run is older than the default stale age of 24 hours
- Added `staleReviewQueueItems` so stale selection can be tested and reused
  outside the React page.
- Added `Rerun stale` to Review Queue controls.
- `Rerun stale` respects the current visible filter/sort context, then reruns
  only the stale subset.
- Batch progress now tracks whether the active batch is `visible` or `stale`
  so the right control displays progress.
- The stale workflow still uses the audited Review Agent result merge path, so
  manual disposition and ADO write-back history are preserved.

Files changed:

- `apps/desktop/src/reviewRunHistory.ts`
- `apps/desktop/src/reviewRunHistory.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewRunHistory.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop rerun-history tests passed: 1 file, 8 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 18 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Make stale-review age configurable from daemon/desktop config instead of
  using only the current desktop helper default.

### 2026-06-11 Session Update 50

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `60%` to `61%`.
- Verification moved from `94%` to `95%`.
- Phase 6 completion moved from `62%` to `64%`.

Completed:

- Added `reviewStaleAgeHours` to core settings.
- Added `REVIEW_STALE_AGE_HOURS` environment support with a default of 24
  hours.
- Exposed `reviewStaleAgeHours` through daemon `/daemon/config`.
- Added `/daemon/configure` support for persisting and hot-reloading
  `REVIEW_STALE_AGE_HOURS`.
- Added desktop API types for the new daemon config field.
- Review Queue now reads the configured stale age from daemon config.
- Added a compact stale-age control to the Review Queue toolbar.
- `Rerun stale` now uses the configured age instead of the helper default.
- Added core settings coverage for the stale-age default and environment
  override.

Files changed:

- `packages/core/src/settings.ts`
- `packages/core/test/settings.test.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/settings.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- Focused core settings tests passed: 1 file, 2 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 18 tests.
- `@cicd-agent/desktop` production build passed.
- Focused daemon server tests passed: 1 file, 17 tests.

Next recommended task:

- Add Review Queue freshness/audit badges per item so stale status is visible
  before the operator decides whether to rerun stale items.

### 2026-06-11 Session Update 51

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `61%` to `62%`.
- Verification remains `95%`.
- Phase 6 completion moved from `64%` to `65%`.

Completed:

- Added a reusable Review Queue freshness view model:
  - `reviewQueueFreshnessStatus`
- Freshness status now reports:
  - stale/fresh boolean
  - display label
  - reason code
  - computed age in hours when available
- `isReviewQueueItemStale` now delegates to the freshness helper so stale
  selection and UI badges share one rule.
- Review Queue cards now show a freshness badge for each item:
  - stale by missing context confidence
  - stale by age
  - fresh with current age
- Added focused unit coverage for freshness labels and reason codes.

Files changed:

- `apps/desktop/src/reviewRunHistory.ts`
- `apps/desktop/src/reviewRunHistory.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewRunHistory.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop rerun-history tests passed: 1 file, 8 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 18 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add operator-visible audit counters or compact timeline summaries to Review
  Queue cards so disposition and ADO write-back history are visible before the
  findings panel is opened.

### 2026-06-11 Session Update 52

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `62%` to `63%`.
- Verification remains `95%`.
- Phase 6 completion moved from `65%` to `66%`.

Completed:

- Added a reusable compact card-level audit summary:
  - `buildReviewAuditCardSummary`
- The summary reports:
  - whether manual audit data exists
  - compact label text
  - display tone
  - manual disposition event count
  - ADO write-back attempt count
  - latest disposition label
  - latest ADO write-back state
  - latest ADO thread id/link when available
- Review Queue cards now render one compact audit line instead of several
  scattered disposition/write-back lines.
- The findings side panel still renders the full detailed audit timeline.
- Added focused unit coverage for:
  - successful ADO write-back summaries
  - pending/failed ADO write-back summaries
  - manual-only audit summaries
  - no-audit empty summaries

Files changed:

- `apps/desktop/src/reviewAudit.ts`
- `apps/desktop/src/reviewAudit.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewAudit.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop audit tests passed: 1 file, 8 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 4 files, 22 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a review-operation activity feed that records rerun, batch rerun, stale
  rerun, disposition, and ADO write-back retry actions for operator traceability.

### 2026-06-11 Session Update 53

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `63%` to `64%`.
- Verification moved from `95%` to `96%`.
- Phase 6 completion moved from `66%` to `68%`.

Completed:

- Added a local Review Queue operation activity store:
  - `reviewOperations.ts`
- Activity events currently cover:
  - single review rerun
  - visible-list batch rerun
  - stale-review batch rerun
  - manual disposition actions
  - ADO write-back retry actions
- The activity store:
  - keeps newest events first
  - caps stored events at 50
  - tolerates corrupt localStorage data
  - safely degrades when localStorage is unavailable
- Review Queue now records operation events for successful and failed actions.
- Review Queue now renders a compact `Recent activity` feed with the latest six
  operation events.
- Added focused unit coverage for operation append/list ordering, retention
  cap, corrupt-cache fallback, and stable target keys.

Files changed:

- `apps/desktop/src/reviewOperations.ts`
- `apps/desktop/src/reviewOperations.test.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewOperations.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused desktop review-operation tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 5 files, 26 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Persist review-operation activity through the daemon so activity survives
  across browsers/devices and can eventually appear in the global Activity page.

### 2026-06-11 Session Update 54

Phase:

Phase 6: Review Queue And Auto-Approval

Status change:

- Overall implementation progress moved from `64%` to `65%`.
- Verification moved from `96%` to `97%`.
- Phase 6 completion moved from `68%` to `70%`.

Completed:

- Added daemon-local Review Queue operation persistence in core:
  - `reviewOperationsLocal.ts`
- The daemon-local store writes to:
  - `review-operations.json`
- Added core helpers for:
  - appending review operation records
  - listing operations newest-first
  - filtering operations by repository
  - limiting returned operations
  - tolerating corrupt operation stores
- Exported review-operation helpers through `@cicd-agent/core`.
- Added daemon endpoints:
  - `GET /profiles/:id/review-operations`
  - `POST /profiles/:id/review-operations`
- Desktop activity feed now loads through the daemon when available.
- Desktop operation recording now posts through the daemon while preserving the
  browser-local fallback path.
- Added daemon route coverage proving operation activity is persisted and
  listed for a Project Link repository.

Files changed:

- `packages/core/src/reviewOperationsLocal.ts`
- `packages/core/src/index.ts`
- `packages/core/test/reviewOperationsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewOperationsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused core review-operation tests passed: 1 file, 4 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- Focused daemon server tests passed: 1 file, 18 tests.
- `@cicd-agent/desktop` tests passed: 5 files, 26 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Surface daemon-backed review-operation activity in the global Activity page,
  then unify Review Queue and Activity page filtering around Project Link and
  repository context.

### 2026-06-11 Session Update 55

Phase:

Phase 6: Review Queue And Auto-Approval

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `65%` to `66%`.
- Verification remains `97%`.
- Phase 6 completion moved from `70%` to `72%`.
- Phase 7 has its first Activity Timeline integration slice, but remains `Not started`
  in the phase summary until checkpoint/rollback work begins.

Completed:

- Extended the global Activity page beyond task runs.
- Activity now loads review-operation records for all Project Links.
- Review-operation records are sorted newest-first across Project Links.
- The Activity left rail now includes a `Review Activity` section below agent
  task runs.
- Selecting a review-operation event shows a details view with:
  - operation status
  - operation kind
  - timestamp
  - Project Link name
  - repository
  - pull request id or queue-level marker
  - actor
  - details
- Existing task run inspection remains intact.
- Activity refresh now reloads both task runs and review operations.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 5 files, 26 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add Activity-page filtering by Project Link and event type so task runs and
  review operations can be narrowed to the current repository/workflow context.

### 2026-06-11 Session Update 56

Phase:

Phase 6: Review Queue And Auto-Approval

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `66%` to `67%`.
- Verification remains `97%`.
- Phase 6 completion moved from `72%` to `73%`.

Completed:

- Added Activity-page filtering for review-operation activity.
- Review activity can now be filtered by:
  - Project Link
  - review event type
- Supported review event-type filters:
  - rerun
  - batch rerun
  - stale rerun
  - disposition
  - ADO retry
- Review activity selection now remains stable when filters change, and moves
  to the first visible event when the selected event is filtered out.
- Agent task run inspection remains unchanged.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 5 files, 26 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Start Phase 7 checkpoint/rollback work by reusing existing Git checkpoint
  patterns and connecting successful review/agent actions to replayable
  Activity entries.

### 2026-06-11 Session Update 57

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `67%` to `68%`.
- Verification remains `97%`.
- Phase 7 moved from `Not started` / `0%` to `In progress` / `5%`.

Completed:

- Added a non-destructive Git checkpoint tool:
  - `git_checkpoint`
- The checkpoint tool snapshots the current working tree without modifying it.
- Checkpoint snapshots include:
  - checkpoint id
  - created timestamp
  - repository path
  - reason
  - current branch
  - HEAD revision
  - porcelain status
  - binary-capable diff text
- Checkpoints are written under the agent data directory:
  - `checkpoints/<checkpoint-id>.json`
- Classified `git_checkpoint` as low-risk, read-only, and not approval-required.
- Added focused coverage proving checkpoint files are created and contain status
  plus diff data.

Files changed:

- `packages/core/src/tools/git.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Focused core Git checkpoint/capability tests passed: 2 files, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Automatically create a Git checkpoint before approved medium/high-risk Git
  write tools run, and link the checkpoint id into the Activity timeline.

### 2026-06-11 Session Update 58

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `68%` to `69%`.
- Verification moved from `97%` to `98%`.
- Phase 7 completion moved from `5%` to `10%`.

Completed:

- Added a generic `beforeExecute` hook to `ToolExecutor`.
- The hook runs after approval but before the tool handler.
- The hook does not run when approval denies the tool call.
- Exported `createGitCheckpoint` from the Git tool module for runtime reuse.
- Confirmed-action chat executors now automatically create a Git checkpoint
  before approved Git write actions run.
- Planner executors still deny medium/high-risk Git write tools before
  checkpointing or execution.
- Added daemon-level tests proving:
  - confirmed `git_add` creates a checkpoint before staging
  - denied planner `git_add` does not create a checkpoint
- This is the first automatic pre-write checkpoint slice for Phase 7.

Files changed:

- `packages/core/src/tools/executor.ts`
- `packages/core/src/tools/git.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/toolExecutor.test.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/toolExecutor.test.ts test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
```

Result:

- Focused core executor/checkpoint/capability tests passed: 3 files, 13 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- Focused daemon checkpoint tests passed: 1 file, 2 tests.

Next recommended task:

- Return checkpoint ids from automatic checkpoint creation and include them in
  chat tool execution/activity records so users can trace which checkpoint
  protects each approved Git write.

### 2026-06-11 Session Update 59

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress remains `69%`.
- Verification remains `98%`.
- Phase 7 completion moved from `10%` to `12%`.

Completed:

- Extended `ToolExecutor` before-execute hooks so they can return metadata.
- Tool results now include before-execute metadata under:
  - `execution_metadata.beforeExecute`
- Confirmed Git write actions now return automatic checkpoint metadata:
  - checkpoint id
  - checkpoint file path
- Added core tests for before-execute metadata propagation.
- Added daemon checkpoint test coverage proving confirmed Git writes expose
  checkpoint metadata in the tool result.
- This creates the data bridge needed to link future chat tool activity records
  to the checkpoint that protects each approved Git write.

Files changed:

- `packages/core/src/tools/executor.ts`
- `packages/core/test/toolExecutor.test.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/toolExecutor.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
```

Result:

- Focused core ToolExecutor tests passed: 1 file, 11 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- Focused daemon checkpoint tests passed: 1 file, 2 tests.

Next recommended task:

- Persist checkpoint ids into chat/session activity entries for confirmed Git
  write actions, then expose checkpoint links in the Activity page detail view.

### 2026-06-11 Session Update 60

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `69%` to `70%`.
- Verification remains `98%`.
- Phase 7 completion moved from `12%` to `18%`.

Completed:

- Added direct checkpoint fields to persisted chat/session tool bubbles:
  - `checkpointId`
  - `checkpointPath`
- Added a focused metadata extractor for automatic checkpoint metadata returned
  by confirmed Git write tool execution.
- Confirmed-action tool bubbles now persist checkpoint metadata at the top level
  instead of requiring later UI code to parse nested `toolResult` JSON.
- Added daemon-side checkpoint activity listing:
  - `ChatSessionManager.listCheckpointActivity`
  - `GET /chat/checkpoints`
- The activity listing works from persisted chat/session bubbles and keeps the
  same local/Cosmos session-store boundary used by normal chat history.
- Added desktop API support for checkpoint activity.
- Added a global Activity page `Checkpoint Activity` section.
- Added checkpoint detail rendering with:
  - protected Git tool name
  - session id
  - repository path
  - checkpoint id
  - snapshot file path
  - stored tool result summary
- Adjusted Activity selection so checkpoint/review events do not automatically
  steal the detail pane from the main task list on initial load.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- Focused daemon checkpoint tests passed: 1 file, 4 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.

Next recommended task:

- Add a restore/compare path for checkpoint snapshots so Activity can move from
  passive traceability to user-directed rollback support.
- Add a focused desktop test for checkpoint Activity rendering if the Activity
  page presentation logic is extracted into pure helpers.

### 2026-06-11 Session Update 61

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `70%` to `71%`.
- Verification remains `98%`.
- Phase 7 completion moved from `18%` to `20%`.

Completed:

- Added `git_checkpoint_show`, a low-risk read-only Git tool for reading a
  stored checkpoint snapshot by checkpoint id.
- The tool returns checkpoint metadata plus the stored status and binary diff
  without changing the working tree.
- Added checkpoint id validation so callers cannot use the checkpoint reader as
  an arbitrary file-read primitive.
- Registered `git_checkpoint_show` in the tool capability registry as:
  - low risk
  - read-only
  - no approval required
- Added core checkpoint coverage proving a created checkpoint can be read back
  through the new tool.
- Added capability coverage proving `git_checkpoint_show` appears in the
  prompt-visible registry with the expected risk and required parameter.

Files changed:

- `packages/core/src/tools/git.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Focused core checkpoint/capability tests passed: 2 files, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Add a checkpoint compare/preview endpoint that can power Activity detail UI
  without exposing full diffs by default.
- Keep actual rollback as a confirmed medium-risk action rather than a
  background or read-only Activity operation.

### 2026-06-11 Session Update 62

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `71%` to `72%`.
- Verification remains `98%`.
- Phase 7 completion moved from `20%` to `25%`.

Completed:

- Added core checkpoint preview support:
  - status line extraction
  - changed-file extraction from stored diff headers
  - bounded diff preview
  - `diffChars` and `diffTruncated` metadata
- Added daemon endpoint:
  - `GET /chat/checkpoints/:checkpointId/preview`
  - supports bounded `maxDiffChars`
  - reads only from the configured checkpoint store
- Added desktop API support for checkpoint preview loading.
- Activity checkpoint details now show:
  - branch
  - changed-file count
  - changed-file chips
  - status snapshot
  - bounded diff preview
  - truncation indicator
- Fixed daemon checkpoint activity test isolation by using the real
  `RUNTIME_DATA_DIR` settings path and resetting settings after the test.
- Kept actual rollback out of this slice; preview remains read-only and safe.

Files changed:

- `packages/core/src/tools/git.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused core checkpoint/capability tests passed: 2 files, 3 tests.
- `@cicd-agent/core` build passed.
- Focused daemon checkpoint tests passed: 1 file, 4 tests.
- Daemon HTTP tests passed: 1 file, 19 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a confirmed rollback planning path that converts a selected checkpoint
  into explicit restore proposals instead of applying rollback directly.
- Add focused UI-level coverage for Activity checkpoint preview rendering once
  the presentation logic is extracted from the page component.

### 2026-06-11 Session Update 63

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `72%` to `73%`.
- Verification remains `98%`.
- Phase 7 completion moved from `25%` to `30%`.

Completed:

- Added read-only checkpoint rollback planning in core.
- The planner distinguishes between:
  - clean checkpoints that can be represented with existing confirmed
    `git_restore` tooling
  - checkpoints with non-empty stored diffs that require future checkpoint patch
    application support
  - repositories already matching a clean checkpoint
  - untracked-only states that current restore tooling cannot remove
- Rollback planning returns an explicit proposal object only when safe:
  - tool: `git_restore`
  - args: tracked changed paths
  - description and next hint
- Added daemon endpoint:
  - `GET /chat/checkpoints/:checkpointId/rollback-plan`
- Added desktop API support for rollback plans.
- Activity checkpoint details now show:
  - whether a proposal is ready
  - why rollback is or is not supported with current tooling
  - the proposed confirmed action JSON when available
  - required future capability when patch application is needed
  - tracked paths and warnings
- Kept rollback execution outside this slice; Activity remains read-only and
  cannot bypass chat approval.

Files changed:

- `packages/core/src/tools/git.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused core checkpoint/capability tests passed: 2 files, 4 tests.
- `@cicd-agent/core` build passed.
- Daemon HTTP tests passed: 1 file, 20 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a confirmed `git_checkpoint_apply` / patch-apply capability so
  non-empty checkpoint snapshots can be restored safely after approval.
- Keep the new capability medium risk and create an automatic safety checkpoint
  before applying a stored checkpoint patch.

### 2026-06-11 Session Update 64

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `73%` to `74%`.
- Verification remains `98%`.
- Phase 7 completion moved from `30%` to `36%`.

Completed:

- Added confirmed checkpoint patch application:
  - `git_checkpoint_apply`
  - medium risk
  - approval required
  - not read-only
- The apply tool restores tracked checkpoint files to HEAD first, then applies
  the stored checkpoint patch via `git apply --binary -`.
- Added safety checks before applying:
  - checkpoint id validation
  - checkpoint repoPath must match the current tool repo
  - current HEAD must match checkpoint HEAD
- Fixed checkpoint diff persistence so stored patches keep their trailing
  newline instead of being trimmed into corrupt patches.
- Added backward-compatible patch handling for older checkpoint files by adding
  a missing trailing newline before `git apply`.
- Updated rollback planning so non-empty checkpoint diffs now produce a
  confirmed `git_checkpoint_apply` proposal.
- Verified confirmed-action execution creates a separate automatic safety
  checkpoint before `git_checkpoint_apply` runs.
- Clean checkpoints still use `git_restore`; non-empty checkpoint snapshots now
  use `git_checkpoint_apply`.

Files changed:

- `packages/core/src/tools/git.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/gitCheckpoint.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/gitCheckpoint.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused core checkpoint/capability tests passed: 2 files, 5 tests.
- `@cicd-agent/core` build passed.
- Daemon checkpoint and HTTP tests passed: 2 files, 25 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a UI/chat bridge from Activity rollback proposals into the existing
  approval workflow, so users can send `git_checkpoint_apply` or `git_restore`
  proposals to chat instead of copying JSON manually.
- Add checkpoint apply activity metadata to the Activity timeline after
  confirmed rollback execution.

### 2026-06-11 Session Update 65

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `74%` to `75%`.
- Verification remains `98%`.
- Phase 7 completion moved from `36%` to `40%`.

Completed:

- Added an Activity-to-Chat handoff for checkpoint rollback proposals.
- Checkpoint rollback detail cards now include an `Open in Chat for approval`
  action when a proposal is available.
- The handoff stores a one-time draft in `sessionStorage` and navigates to
  `/chat`.
- Chat consumes the draft once, clears it immediately, resets the active chat
  conversation, applies the proposal repo/profile context, and fills the input.
- The draft explicitly instructs Chat to create an `approval_proposal` for the
  exact rollback tool and args.
- This preserves the existing approval workflow:
  - Activity does not execute write tools.
  - Activity does not call confirm-action directly.
  - Users still review and send the chat request before an approval card is
    created.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Persist checkpoint apply results into Activity metadata after confirmed
  rollback execution, including the safety checkpoint id created before apply.
- Add focused UI tests for the Activity-to-Chat handoff by extracting the draft
  payload builder into a pure helper.

### 2026-06-11 Session Update 66

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `75%` to `76%`.
- Verification moved from `98%` to `99%`.
- Phase 7 completion moved from `40%` to `44%`.

Completed:

- Added checkpoint-apply metadata extraction for Activity records.
- Activity now distinguishes:
  - the pre-apply safety checkpoint created before `git_checkpoint_apply`
  - the target checkpoint that was restored by `git_checkpoint_apply`
- Preserved the existing behavior where preview and rollback planning operate
  on the safety checkpoint for the apply event.
- Updated Activity list rows to label checkpoint apply events separately.
- Updated Activity detail rendering to show restored checkpoint id, apply mode,
  restored files, and a note explaining that preview/rollback uses the safety
  snapshot.
- Added daemon coverage for persisted checkpoint activity records containing
  checkpoint-apply target metadata.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/daemon` checkpoint tests passed: 1 file, 6 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.

Next recommended task:

- Extract the Activity-to-Chat rollback handoff draft builder into a pure helper
  and add focused tests for exact proposal payload preservation.
- Add a small Activity API/UI test around checkpoint-apply display metadata if
  the TaskViewer checkpoint rendering helpers are extracted.

### 2026-06-11 Session Update 67

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress remains `76%`.
- Verification remains `99%`.
- Phase 7 completion moved from `44%` to `45%`.

Completed:

- Extracted Activity-to-Chat rollback handoff payload construction into a shared
  desktop helper.
- Chat and Activity now share the same `CHAT_HANDOFF_KEY` constant.
- Activity now uses the helper instead of constructing rollback approval drafts
  inline inside the page component.
- Added focused desktop tests proving the handoff preserves:
  - exact tool name
  - exact serialized args
  - rollback description
  - next hint
  - checkpoint id
  - repository path
  - explicit "do not execute until approved" instruction

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/checkpointHandoff.test.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/desktop` handoff tests passed: 1 file, 2 tests.
- `@cicd-agent/desktop` typecheck passed.

Next recommended task:

- Continue toward the ADO AI insight goal by improving PR insight persistence
  and review-run traceability in the Activity timeline, so generated insights
  become auditable product artifacts rather than one-off UI responses.

### 2026-06-11 Session Update 68

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `76%` to `77%`.
- Verification remains `99%`.
- Phase 5 completion moved from `46%` to `48%`.

Completed:

- Added review-operation activity kinds for PR AI insight work:
  - `insight_preview`
  - `review_run`
- Pull Requests now records successful and failed non-mutating insight previews
  into the existing review-operation activity feed.
- Pull Requests now records successful and failed full Review Agent runs into
  the same activity feed.
- Activity details include compact PR analysis trace metadata:
  - readiness
  - risk count
  - file/thread/build signal counts
  - decision queue
  - decision risk
  - confidence
  - findings/discarded finding counts
  - token counts
- Activity and Review Queue operation feeds now label the new AI insight event
  kinds.
- Daemon review-operation route schema now accepts the new AI insight event
  kinds, preserving local daemon persistence for Activity.

Files changed:

- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `apps/desktop/src/pages/ReviewFindings.tsx`
- `apps/desktop/src/reviewOperations.ts`
- `apps/desktop/src/reviewOperations.test.ts`
- `packages/core/src/reviewOperationsLocal.ts`
- `packages/core/test/reviewOperationsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/reviewOperationsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/reviewOperations.test.ts src/checkpointHandoff.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- `@cicd-agent/core` review-operation tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` focused tests passed: 2 files, 6 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` server tests passed: 1 file, 20 tests.

Next recommended task:

- Persist richer PR insight artifacts beyond compact activity details, so users
  can reopen the last AI insight summary/categories for a PR without rerunning
  the analysis.

### 2026-06-11 Session Update 69

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `77%` to `78%`.
- Verification remains `99%`.
- Phase 5 completion moved from `48%` to `50%`.

Completed:

- Added a desktop-local PR insight artifact store.
- Successful insight previews now persist the latest summary, readiness,
  categories, risks, PR signals, and token counts.
- Successful full Review Agent runs now persist the latest summary, readiness,
  decision queue/risk, context confidence, finding counts, categories, and
  token counts.
- Pull Requests reloads saved artifacts for the selected Project Link.
- PR cards now show the latest saved AI insight when there is no fresh preview
  or full review result in the current page session.
- This separates product artifacts from compact Activity events:
  - Activity answers "what happened and when?"
  - PR insight artifacts answer "what did the AI conclude last time?"

Files changed:

- `apps/desktop/src/prInsightArtifacts.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts src/reviewOperations.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` focused tests passed: 2 files, 7 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Promote PR insight artifacts from browser-local storage to daemon-backed local
  persistence so Activity, Pull Requests, and future chat context can share the
  same saved AI conclusions.

### 2026-06-11 Session Update 70

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `78%` to `79%`.
- Verification remains `99%`.
- Phase 5 completion moved from `50%` to `54%`.

Completed:

- Added core daemon-local persistence for saved PR insight artifacts.
- Added `GET /profiles/:id/pr-insights` and `POST /profiles/:id/pr-insights`.
- PR insight artifact persistence is Project Link scoped and repository-bound
  through `adoRepoName`.
- Pull Requests now:
  - loads browser-local artifacts immediately
  - fetches daemon-backed artifacts when available
  - merges local and daemon results by stable artifact id
  - writes successful preview/full review artifacts to browser-local storage
  - asynchronously syncs successful artifacts to daemon storage
- This moves saved PR AI conclusions closer to a shared product data model that
  future Chat context and Activity views can reuse.

Files changed:

- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `packages/core/src/index.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` PR insight artifact tests passed: 1 file, 3 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` server tests passed: 1 file, 21 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add Chat-side retrieval of the latest PR insight artifact when the user asks
  about an already analyzed PR, so ADO AI conclusions become reusable context
  instead of only Pull Requests page state.

### 2026-06-11 Session Update 71

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `79%` to `80%`.
- Verification remains `99%`.
- Phase 5 completion moved from `54%` to `57%`.

Completed:

- Chat context now can reuse daemon-backed saved PR insight artifacts.
- Chat detects PR-oriented prompts such as:
  - `PR #42`
  - `pull request 42`
  - review/insight/risk/finding/approval-related questions
- When the message targets a specific PR, Chat injects the latest saved preview
  or full review artifact for that PR.
- When the message is PR-oriented but has no PR number, Chat injects the latest
  saved artifacts for the current Project Link/repository.
- Injected context includes:
  - title
  - summary
  - readiness
  - decision queue/risk/confidence
  - finding counts
  - PR signal counts
  - risks
  - token counts
- The injected context explicitly tells the planner not to rerun analysis unless
  the user asks for a fresh result.
- Added focused daemon tests for PR id extraction and saved insight prompt
  formatting.
- Added daemon coverage that writes real PR insight artifacts to the local store
  and verifies Chat context retrieval filters by targeted PR id.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon build
```

Result:

- `@cicd-agent/daemon` checkpoint/chat context tests passed: 1 file, 8 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` build passed.

Next recommended task:

- Add visible Chat UI affordances for saved PR insight reuse, so users can tell
  when a response used a saved AI conclusion rather than a fresh ADO/LLM run.

### 2026-06-11 Session Update 72

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `80%`.
- Verification remains `99%`.
- Phase 5 completion moved from `57%` to `58%`.

Completed:

- Added visible Chat metadata when saved PR AI insight context is reused.
- `buildContextPrompt` now returns both the prompt and context notes.
- Chat planner persistence merges context notes into assistant `suggestions`,
  so the existing Chat Details affordance can show:
  - `Used saved PR AI insight context.`
- This keeps the saved-insight reuse visible without changing the Chat event
  protocol or adding another UI model.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon build
```

Result:

- `@cicd-agent/daemon` checkpoint/chat context tests passed: 1 file, 8 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` build passed.

Next recommended task:

- Add a compact Pull Requests or Activity affordance to jump from a saved PR
  insight artifact into Chat with the right PR question prefilled.

### 2026-06-11 Session Update 73

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `80%` to `81%`.
- Verification remains `99%`.
- Phase 5 completion moved from `58%` to `60%`.

Completed:

- Added a PR insight-to-Chat handoff builder.
- Saved PR insight cards in Pull Requests now include `Ask in Chat`.
- The handoff opens Chat with:
  - the selected Project Link id
  - the repository path
  - the PR id
  - the saved insight type
  - a prefilled instruction to reuse the saved AI conclusion
- The draft explicitly says not to rerun Azure DevOps or LLM analysis unless
  the user asks for a fresh result.
- This reuses the existing one-time `sessionStorage` Chat handoff mechanism
  already used for checkpoint rollback proposals.

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/checkpointHandoff.test.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts src/prInsightArtifacts.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` focused tests passed: 2 files, 6 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add Activity visibility for PR insight artifacts themselves, so users can
  inspect saved AI conclusions from the global Activity view and then open them
  in Chat.

### 2026-06-11 Session Update 74

Phase:

Phase 5: Pull Requests Workspace

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `81%` to `82%`.
- Verification remains `99%`.
- Phase 5 completion moved from `60%` to `62%`.
- Phase 7 completion moved from `45%` to `47%`.

Completed:

- Added global Activity visibility for saved PR insight artifacts.
- Activity now loads daemon-backed PR insight artifacts for every Project Link.
- Added a `Saved PR Insights` feed with:
  - PR id/title
  - Project Link
  - repository
  - saved insight kind
  - timestamp
- Added saved PR insight detail view with:
  - Project Link/repository
  - summary
  - readiness
  - decision queue/risk/confidence
  - token counts
  - PR signal counts
  - finding counts
  - risks
- Added `Ask in Chat` from Activity PR insight details, reusing the shared Chat
  handoff payload.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a compact Activity filter for saved PR insight artifact kind/profile once
  the feed starts to get noisy, or continue toward PR workspace maturity by
  adding persisted artifact comparison between latest preview and latest full
  review.

### 2026-06-11 Session Update 75

Phase:

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress remains `82%`.
- Verification remains `99%`.
- Phase 7 completion moved from `47%` to `48%`.

Completed:

- Added Activity filters for saved PR insight artifacts.
- Saved PR Insights can now be filtered by:
  - Project Link
  - artifact type (`insight_preview` or `review_run`)
- Selection resets to the first visible matching artifact when a filter hides
  the currently selected item.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add persisted comparison between latest preview and latest full review for a
  PR, so users can see what changed between fast heuristic/LLM preview and the
  full Review Agent result.

### 2026-06-11 Session Update 76

Phase:

Phase 5: Pull Requests Workspace

Phase 7: Verification, Rollback, And Activity Timeline

Status change:

- Overall implementation progress moved from `82%` to `83%`.
- Verification remains `99%`.
- Phase 5 completion moved from `62%` to `64%`.
- Phase 7 completion moved from `48%` to `49%`.

Completed:

- Added a pure PR insight artifact comparison helper.
- The comparison reports:
  - readiness changes
  - risks added by the full review
  - preview risks no longer present in the full review
  - finding-count delta when both sides have counts
  - token delta
- Activity saved PR insight details now show a `Preview vs Full Review`
  comparison when both artifacts exist for the same Project Link, repository,
  and PR.
- Normalized desktop-local artifact typing so empty context confidence values
  from daemon/API records compare cleanly.

Files changed:

- `apps/desktop/src/prInsightArtifacts.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` PR insight artifact tests passed: 1 file, 4 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue toward PR workspace maturity by adding explicit stale/changed
  artifact detection when the current ADO PR iteration/source commit no longer
  matches the saved AI conclusion.

### 2026-06-11 Session Update 77

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `83%` to `84%`.
- Verification remains `99%`.
- Phase 5 completion moved from `64%` to `66%`.

Completed:

- Added analysis-baseline fields to saved PR insight artifacts:
  - `iterationId`
  - `sourceCommit`
- Full Review Agent artifacts now save the returned PR iteration id and source
  commit when available.
- Daemon PR insight artifact routes accept and persist the new baseline fields.
- Activity PR insight detail view now shows the saved analysis baseline.
- This prepares explicit stale/changed artifact detection in a later step.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/prInsightArtifacts.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/daemon build
```

Result:

- `@cicd-agent/core` PR insight artifact tests passed: 1 file, 3 tests.
- `@cicd-agent/desktop` PR insight artifact tests passed: 1 file, 4 tests.
- `@cicd-agent/core` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed after core build refreshed exported types.
- `@cicd-agent/daemon` server tests passed: 1 file, 21 tests.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/daemon` build passed.

Next recommended task:

- Use the saved iteration/source commit baseline to mark PR insight artifacts as
  stale when current PR context no longer matches the saved analysis baseline.

### 2026-06-11 Session Update 78

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `84%` to `85%`.
- Verification remains `99%`.
- Phase 5 completion moved from `66%` to `68%`.

Completed:

- Added a saved PR insight freshness helper.
- Freshness states:
  - `fresh`: saved baseline matches the current PR context
  - `stale`: saved iteration/source commit differs from current PR context
  - `unknown`: no saved baseline or current PR context is unavailable
- Pull Requests now shows freshness badges on saved insight cards.
- When details/context are loaded for a PR, freshness is computed against the
  current PR iteration/source commit.
- Stale or unknown saved insights include a short explanatory label.
- Activity still shows the saved baseline but does not claim fresh/stale without
  current PR context.

Files changed:

- `apps/desktop/src/prInsightArtifacts.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` PR insight artifact tests passed: 1 file, 5 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a one-click refresh action for stale saved PR insights that reruns the
  appropriate preview/full review while preserving the old artifact for audit.

### 2026-06-11 Session Update 79

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `85%` to `86%`.
- Verification remains `99%`.
- Phase 5 completion moved from `69%` to `70%`.

Completed:

- Added a one-click `Refresh insight` action for stale saved PR insight cards in
  the Pull Requests workspace.
- Stale preview artifacts now rerun the lightweight `Preview Insight` flow.
- Stale full-review artifacts now rerun the full `Run AI Insight` flow.
- Changed PR insight artifact ids from one stable id per PR/kind to versioned
  run ids that include the analysis timestamp.
- Refreshes now preserve previous saved AI conclusions as history entries while
  latest-card views continue to show the newest artifact.
- Kept explicit-id replacement compatibility in daemon-local storage so older
  or intentionally addressed artifacts can still be updated by id.

Files changed:

- `apps/desktop/src/prInsightArtifacts.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
```

Result:

- `@cicd-agent/desktop` PR insight artifact tests passed: 1 file, 6 tests.
- `@cicd-agent/core` PR insight artifact local-store tests passed: 1 file, 4
  tests.

Next recommended task:

- Add a PR insight artifact history/detail view in Activity and Pull Requests so
  users can inspect older saved conclusions, compare refreshes, and reopen any
  historical run in Chat.

### 2026-06-11 Session Update 80

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `86%`.
- Verification remains `99%`.
- Phase 5 completion moved from `70%` to `71%`.

Completed:

- Pull Requests saved insight cards now show the total number of saved AI runs
  for the PR when historical artifacts exist.
- The latest saved AI insight remains the primary card content.
- Up to three previous saved runs are now shown inline below the latest
  conclusion.
- Each previous saved run shows kind, timestamp, summary, and an `Ask in Chat`
  action so users can reopen older AI conclusions without rerunning analysis.

Files changed:

- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Extend the global Activity page saved PR insight detail with same-kind
  refresh-to-refresh comparisons, not only preview-vs-full-review comparisons.

### 2026-06-11 Session Update 81

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `86%`.
- Verification remains `99%`.
- Phase 5 completion moved from `71%` to `72%`.

Completed:

- Added same-kind saved PR insight refresh comparisons to the global Activity
  detail panel.
- When a selected saved PR insight has an older run of the same kind for the
  same PR, Activity now compares:
  - readiness
  - token delta
  - finding delta when both runs have finding counts
  - newly introduced risks
  - risks no longer present
- This complements the existing preview-vs-full-review comparison by showing how
  repeated preview or full-review refreshes changed over time.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Improve Chat-side saved PR insight reuse so responses can cite exactly which
  saved artifact ids/timestamps were used, not only that saved PR AI insight
  context was included.

### 2026-06-11 Session Update 82

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `86%` to `87%`.
- Verification remains `99%`.
- Phase 5 completion moved from `72%` to `73%`.

Completed:

- Chat saved PR insight context now includes the saved artifact id in the prompt
  block provided to the planner.
- Added a structured PR insight context bundle that returns:
  - the prompt text
  - exact artifact ids
  - assistant metadata notes naming the artifact id, PR number, kind, and
    timestamp reused
- Chat assistant bubbles now record precise saved-PR-insight usage notes instead
  of only a generic saved-context message.
- Kept the existing `buildPrInsightContextPrompt` helper for compatibility while
  adding the richer bundle helper.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` checkpoint/chat-context tests passed: 1 file, 9 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Surface the precise saved PR insight artifact references more clearly in the
  Chat UI, so users can see which historical AI analysis informed a response.

### 2026-06-11 Session Update 83

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `87%`.
- Verification remains `99%`.
- Phase 5 completion moved from `73%` to `74%`.

Completed:

- Chat assistant metadata now renders precise saved PR insight references as a
  dedicated source block instead of blending them into generic suggestion text.
- The source block shows:
  - PR number
  - saved insight kind
  - saved timestamp
  - artifact id
- Generic assistant suggestions still render separately when present.
- This makes Chat answers that reuse historical PR AI analysis visibly
  traceable from the conversation UI.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Initial sandboxed runs failed because the sandboxed Node process could not see
  pnpm's TypeScript/Vite files under `node_modules/.pnpm`.
- Re-running the same commands with approved elevated execution passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by adding explicit saved PR insight version selection or
  artifact-opening actions from Chat source cards back to Activity/Pull
  Requests.

### 2026-06-11 Session Update 84

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `87%`.
- Verification remains `99%`.
- Phase 5 completion moved from `74%` to `75%`.

Completed:

- Added an Activity handoff key and draft type for PR insight artifact navigation.
- Chat saved PR insight source cards now include an `Open in Activity` action.
- Clicking the action records the artifact id in `sessionStorage` and navigates
  to the Activity page.
- Activity now reads the handoff, waits for saved PR insight artifacts to load,
  selects the referenced artifact, narrows filters to its Project Link and
  insight kind, and clears the handoff.
- This completes a traceability loop from Chat answers back to the exact saved
  AI insight artifact that informed the response.

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a reverse navigation action from Activity saved PR insight details back to
  the Pull Requests workspace with the relevant PR expanded or highlighted.

### 2026-06-11 Session Update 85

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `87%` to `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `75%` to `76%`.

Completed:

- Added a Pull Requests handoff key and draft type for PR navigation.
- Activity saved PR insight detail now includes an `Open in Pull Requests`
  action.
- The action records the Project Link id, repository, PR number, and source
  artifact id, then navigates to `/pulls`.
- Pull Requests now consumes that handoff by:
  - switching to the referenced Project Link
  - switching the status filter to `All`
  - selecting and expanding the target PR
  - loading PR details when needed
  - highlighting the target PR card briefly
- This completes the reverse traceability path from saved insight audit detail
  back to the operational PR workspace.

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add focused tests around the shared handoff builders and pure parsing helpers
  so the Chat/Activity/Pull Requests traceability loop is less dependent on
  manual UI verification.

### 2026-06-11 Session Update 86

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `76%` to `77%`.

Completed:

- Added shared handoff builders for:
  - Chat source-card to Activity saved PR insight navigation
  - Activity saved PR insight detail to Pull Requests PR navigation
- Updated Chat and Activity pages to use the shared builders instead of
  hand-rolled draft objects.
- Expanded `checkpointHandoff` tests to cover:
  - all stable sessionStorage keys
  - Activity PR insight artifact handoff drafts
  - Pull Requests PR handoff drafts
- This gives the Chat/Activity/Pull Requests PR insight traceability loop a
  small but direct unit-test safety net.

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/checkpointHandoff.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` handoff tests passed: 1 file, 5 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by adding artifact-aware Chat prompts for explicit historical
  run selection, so users can ask about a specific saved artifact id instead of
  only the latest PR insight context.

### 2026-06-11 Session Update 87

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `77%` to `78%`.

Completed:

- Added Chat-side parsing for explicit saved PR insight artifact ids.
- Chat context selection now prefers an exact artifact id when the user says
  `artifact <id>` or `artifact id <id>`.
- Artifact-id selection works even when the same PR has a newer saved run.
- The previous behavior remains unchanged when no artifact id is specified:
  Chat still selects by PR number when present or recent saved insights when the
  user asks generally about PR review, risks, findings, approval, or insights.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/daemon` checkpoint/chat-context tests passed: 1 file, 10 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Add a concise saved-insight provenance line to Chat handoff prompts so source
  cards, copied artifact ids, and explicit artifact-id questions all use the
  same user-facing vocabulary.

### 2026-06-11 Session Update 88

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `78%` to `79%`.

Completed:

- Saved PR insight Chat handoff prompts now include a concise provenance line
  when the originating artifact id is known.
- Pull Requests-to-Chat handoff now passes the saved artifact id.
- Activity-to-Chat handoff now passes the saved artifact id.
- The handoff prompt vocabulary now aligns with Chat source cards and explicit
  `artifact <id>` questions:
  - `Saved insight artifact: <artifact id>`
- Updated handoff tests to assert the artifact provenance line.

Files changed:

- `apps/desktop/src/checkpointHandoff.ts`
- `apps/desktop/src/checkpointHandoff.test.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` handoff tests passed: 1 file, 5 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a small saved PR insight provenance summary to Activity detail itself,
  including direct copy-ready artifact id text and the available navigation
  paths.

### 2026-06-11 Session Update 89

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `79%` to `80%`.

Completed:

- Added a saved PR insight provenance summary block to Activity detail.
- The provenance block shows:
  - saved artifact id
  - saved timestamp
  - PR number
  - artifact kind
- Added a copy action for the saved artifact id.
- Added compact navigation actions from the provenance block to:
  - Pull Requests
  - Chat
- This makes saved PR AI insight artifacts easier to cite, copy, reopen, and
  trace across the PR analysis workflow.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by adding a compact artifact history count and latest/older
  marker to the global Activity saved PR insight list.

### 2026-06-11 Session Update 90

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `80%` to `81%`.

Completed:

- Added saved PR insight history metadata to the Activity page.
- Activity now groups saved PR insight artifacts by Project Link, repository, PR,
  and artifact kind.
- The Saved PR Insights list now marks versioned histories with:
  - `latest of N`
  - `older X/N`
- This lets users distinguish the current saved conclusion from older preserved
  refresh history before opening a detail panel.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by adding a similar latest/older marker to Pull Requests'
  inline previous saved-runs list.

### 2026-06-11 Session Update 91

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `88%`.
- Verification remains `99%`.
- Phase 5 completion moved from `81%` to `82%`.

Completed:

- Pull Requests inline previous saved-runs list now uses the same version
  vocabulary as Activity.
- Older saved PR insight runs are marked as `older X/N` relative to the latest
  saved run shown in the main card.
- This makes versioned saved AI conclusions easier to understand consistently
  across Pull Requests and Activity.

Files changed:

- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by exposing saved PR insight artifact counts in the daemon
  API response metadata, so the UI does not need to infer all version counts
  locally forever.

### 2026-06-11 Session Update 92

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `88%` to `89%`.
- Verification remains `99%`.
- Phase 5 completion moved from `82%` to `83%`.

Completed:

- Added core PR insight artifact history metadata summarization.
- History metadata groups artifacts by:
  - Project Link id
  - repository
  - PR number
  - artifact kind
- Each artifact now has backend-computable metadata:
  - artifact id
  - index within its version history
  - total history length
  - whether it is the latest artifact in that group
- Daemon `GET /profiles/:id/pr-insights` now returns `history` metadata next
  to the existing `items` array.
- Added route-level coverage for the new `history` response field.

Files changed:

- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- `@cicd-agent/core` PR insight artifact tests passed: 1 file, 5 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` server tests passed: 1 file, 21 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Update the desktop API wrapper to expose daemon-returned PR insight history
  metadata and let Activity use backend metadata when available, with local
  inference as fallback.

### 2026-06-11 Session Update 93

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `89%`.
- Verification remains `99%`.
- Phase 5 completion moved from `83%` to `84%`.

Completed:

- Added a desktop API wrapper for daemon-returned PR insight history metadata.
- Kept the existing artifact-list API wrapper compatible by returning only
  `items`.
- Activity now reads PR insight artifacts with backend `history` metadata.
- Activity prefers backend history metadata for latest/older badges when
  available.
- Activity keeps local history inference as a fallback for older daemon
  responses or browser-local-only data.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Phase 5 by adding saved PR insight artifact-id lookup to the desktop
  API layer or Activity actions, so direct artifact links can be resolved without
  scanning all visible artifacts.

### 2026-06-11 Session Update 94

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress remains `89%`.
- Verification remains `99%`.
- Phase 5 completion moved from `84%` to `85%`.

Completed:

- Added core direct lookup for saved PR insight artifacts by artifact id.
- Added daemon direct lookup route:
  - `GET /profiles/:id/pr-insights/artifact?artifactId=...`
- Added desktop API helper for artifact-id lookup.
- The direct lookup route respects Project Link/profile isolation.
- This finishes the Activity-side artifact resolution path so future source
  cards, direct artifact links, and Chat references do not need to scan all
  visible artifacts.

Files changed:

- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/core` PR insight artifact tests passed: 1 file, 6 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` server tests passed: 1 file, 21 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.

Next recommended task:

- Shift focus back to Conversation work:
  - context design
  - reducing required Project Link parameters
  - agent indexing and project-understanding flow
  - conversation interaction quality
  - light-theme chat bubble rendering issues
  - necessary conversation-side agent capabilities for CI/CD and PR insight.

### 2026-06-11 Session Update 95

Phase:

Phase 2: Repository Understanding

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `89%` to `90%`.
- Verification remains `99%`.
- Phase 2 moved from `Not started` to `In progress`.
- Phase 2 completion moved from `0%` to `8%`.
- Phase 8 completion moved from `20%` to `22%`.

Completed:

- Returned development focus from Activity/PR insight traceability back to
  Conversation, as planned.
- Fixed Chat light-theme bubble rendering by moving user, assistant, system, and
  busy/status bubbles onto semantic app theme variables.
- Added light-theme compatibility mappings for `bg-zinc-800/70` and
  `bg-zinc-800/80`, which were still rendering too dark in light mode.
- Made Chat repository context more truthful and useful:
  - tracks indexed file/chunk counts
  - tracks embedded versus pending chunks
  - defaults to semantic retrieval when embeddings already exist
  - avoids spending embedding calls when no embedded chunks are available
  - reports quick-scan versus index-backed context in assistant metadata
- Added an internal Conversation tool:
  - `repo_refresh_index`
  - refreshes the local repository understanding index for the current Project
    Link
  - is classified as low-risk/read-only from the user repository perspective
  - gives the planner a direct path for "understand this project" and "refresh
    project index" requests
- Improved no-Project-Link onboarding in Chat:
  - the setup card now presents local-repo-first creation as the default path
  - inferred ADO mapping is shown as ready for PR insight/CI/CD when available
  - missing ADO mapping is framed as only needed for PR insight, pipelines, and
    review automation
  - PAT is explicitly described as optional fallback because Microsoft sign-in
    is tried first
- Added Conversation quick suggestions for:
  - `Understand this project`
  - `Refresh project index`

Files changed:

- `apps/desktop/src/index.css`
- `apps/desktop/src/pages/Chat.tsx`
- `packages/core/src/chatContext.ts`
- `packages/core/src/vectorIndex.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/chatContext.test.ts`
- `packages/daemon/src/chatSession.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatContext.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionMcp.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/core` chat context tests passed: 1 file, 3 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` checkpoint tests passed: 1 file, 10 tests.
- `@cicd-agent/daemon` MCP/chat registration tests passed: 1 file, 1 test.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/desktop` typecheck passed after adding Conversation quick
  suggestions.

Next recommended task:

- Continue Conversation work by adding visible context/index status controls in
  Chat, then reduce Project Link ADO parameters further by auto-discovering
  project/repo/pipeline choices from OAuth-authenticated ADO when remote
  inference is incomplete.

### 2026-06-11 Session Update 96

Phase:

Phase 8: Product Hardening And Distribution

Phase 2: Repository Understanding

Status change:

- Overall implementation progress remains `90%`.
- Verification remains `99%`.
- Phase 8 completion moved from `22%` to `23%`.
- Phase 2 completion remains `8%`.

Completed:

- Removed raw tool JSON from normal Chat tool details.
- Added a dedicated Chat metadata card for repository context source, so quick
  scan/index/semantic-index provenance is not mixed into ordinary suggestions.
- Confirmed and documented the current Conversation streaming state:
  - daemon-to-desktop transport is SSE/event-stream based
  - workflow/tool/approval events are incremental
  - frontend already supports `assistant_delta`
  - the main planner currently consumes LLM token deltas internally because it
    requires final structured JSON for workflow control
  - user-visible prose is therefore not yet true token-by-token streaming in the
    main planner path
- Added `docs/conversation-streaming-design.md` with the target design:
  - user-facing text channel
  - separate structured control channel
  - no raw protocol JSON in assistant bubbles
  - final `done.result.response` as reconciliation metadata or fallback text
- Added a core planner regression test proving structured planner JSON is not
  emitted as visible `assistant_delta` text.
- Clarified the model/API configuration boundary:
  - project-bundled API remains daemon-owned
  - Settings is now framed as optional additional model providers
  - empty/default Settings no longer sends an inline `llmConfig`
  - `gpt-4o` is no longer exposed as a Settings page default or placeholder
  - Conversation keeps the built-in model as the default unless a complete
    additional provider is explicitly selected

Files changed:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Settings.tsx`
- `packages/core/test/chatPlannerApproval.test.ts`
- `docs/conversation-streaming-design.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/core` ChatPlanner approval/JSON guard tests passed: 1 file, 9
  tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` typecheck passed after Context source metadata rendering.

Next recommended task:

- Implement the streaming split described in
  `docs/conversation-streaming-design.md` so visible assistant prose can stream
  without exposing structured planner JSON.

### 2026-06-11 Session Update 97

Phase:

Phase 2: Repository Understanding

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `90%` to `91%`.
- Verification remains `99%`.
- Phase 2 completion moved from `8%` to `10%`.
- Phase 8 completion remains `23%`.

Completed:

- Implemented the first layer of the Conversation streaming split.
- `ChatPlanner` now extracts only the structured JSON `response` field from LLM
  deltas and emits that value as `assistant_delta`.
- JSON syntax and control fields such as `risk_level`, `actions_taken`,
  `suggestions`, and `approval_proposal` are not emitted into assistant bubbles.
- `ChatPlannerResult` now carries `streamedResponse` so the desktop can
  reconcile final metadata without duplicating a streamed assistant bubble.
- Chat finalization now attaches metadata to the last streamed assistant bubble
  when the final response matches the streamed text.
- Extracted Chat assistant-bubble finalization into a pure helper and added
  desktop tests proving streamed/final reconciliation does not duplicate
  assistant bubbles.
- Added focused planner tests proving:
  - visible deltas contain only response prose
  - structured JSON keys are not exposed as assistant text
  - response text can stream incrementally across multiple JSON chunks
- Updated `docs/conversation-streaming-design.md` to mark this temporary
  response-field extraction layer as implemented and to keep the later true
  two-channel protocol as the next target.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/chatBubbles.ts`
- `apps/desktop/src/chatBubbles.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/conversation-streaming-design.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` ChatPlanner approval/streaming tests passed: 1 file, 10
  tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` Chat bubble finalization tests passed: 1 file, 3 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue toward a true two-channel planner protocol where visible prose no
  longer has to be embedded inside the structured JSON response field.

### 2026-06-11 Session Update 98

Phase:

Phase 2: Repository Understanding

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `91%` to `92%`.
- Verification remains `99%`.
- Phase 2 completion moved from `10%` to `11%`.
- Phase 8 completion remains `23%`.

Completed:

- Advanced Conversation streaming from response-field extraction to an explicit
  visible/control marker protocol.
- `ChatPlanner` now asks the model to stream normal user-facing prose first,
  then emit one final `__CONTROL_JSON__{...}` control line.
- The planner emits only visible prose before the marker as `assistant_delta`.
- The marker payload is parsed as internal control state for final response
  text, risk level, actions, suggestions, and approval proposals.
- Legacy structured JSON response parsing remains as a compatibility fallback.
- Partial marker prefixes are suppressed so fragments such as `__CON` do not
  leak into assistant bubbles.
- Updated the Conversation streaming design document to describe the current
  marker protocol and the remaining future target: a transport-level structured
  control channel.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `docs/conversation-streaming-design.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` ChatPlanner approval/streaming tests passed: 1 file, 12
  tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Conversation work by making the built-in API/custom API boundary
  visible in runtime health state, then improve project-understanding UX with a
  visible index status/control surface in Chat.

### 2026-06-11 Session Update 99

Phase:

Phase 8: Product Hardening And Distribution

Phase 2: Repository Understanding

Status change:

- Overall implementation progress moved from `92%` to `93%`.
- Verification remains `99%`.
- Phase 8 completion moved from `23%` to `24%`.
- Phase 2 completion remains `11%`.

Completed:

- Tightened the built-in API versus custom API boundary requested for
  Conversation and Settings.
- Removed remaining hard-coded `gpt-4o` defaults from runtime config and
  deployment template defaults.
- Added project-owned deployment aliases:
  - `PROJECT_CHAT_DEPLOYMENT`
  - `PROJECT_EMBEDDING_DEPLOYMENT`
- Extended core settings and `LLMClient` so both supported providers are
  encapsulated in the project runtime:
  - Azure-backed built-in/project API
  - OpenAI-compatible custom API when the user explicitly configures one
- Updated daemon custom API config persistence:
  - writes `LLM_PROVIDER`
  - writes `AZURE_OPENAI_CHAT_DEPLOYMENT` instead of the old
    `AZURE_OPENAI_DEPLOYMENT`
  - still reads the old deployment env var as a compatibility fallback
  - hot-reloads provider, endpoint, key, deployment, API version, and OpenAI
    custom model into the live settings object
- Updated Chat and review-run settings merging so selected additional model
  providers set the correct fields instead of pretending OpenAI settings were
  Azure settings.
- Added focused settings tests for:
  - Azure project API configuration
  - OpenAI custom API configuration
  - OpenAI custom API not being considered configured when no model is supplied

Files changed:

- `packages/core/src/settings.ts`
- `packages/core/src/llm.ts`
- `packages/core/test/settings.test.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `packages/review-agent/src/config.ts`
- `packages/review-agent/deploy/containerapp.bicep`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/settings.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` settings tests passed: 1 file, 5 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Conversation work with a visible project index/status control in Chat
  and a clearer runtime health card that distinguishes the default model,
  Microsoft sign-in/ADO auth, and additional model providers.

### 2026-06-11 Session Update 100

Phase:

Phase 8: Product Hardening And Distribution

Phase 2: Repository Understanding

Status change:

- Overall implementation progress moved from `93%` to `94%`.
- Verification remains `99%`.
- Phase 8 completion moved from `24%` to `25%`.
- Phase 2 completion remains `11%`.

Completed:

- Corrected the Conversation model-selection product semantics:
  - the built-in model is the default Conversation model
  - the UI no longer warns users that the built-in API is unavailable
  - user-provided APIs are additional selectable model choices, not global
    overrides
- Removed the daemon-ready setup banner that prompted users about a missing
  built-in API.
- Added a Conversation model selector beside the Project Link selector:
  - defaults to `Built-in model`
  - shows a saved Azure OpenAI deployment or OpenAI model only when the
    additional provider has the required fields
  - persists selection through `dev_agent_active_model`
  - resets back to the built-in model when the additional provider is no
    longer complete
- Tightened frontend custom-model validation:
  - Azure additional provider requires endpoint, API key, and deployment
  - OpenAI additional provider requires API key and model
- Updated Settings copy from `Custom API`/override language to `Additional
  Models`.
- Updated selected-model fallback text so deterministic fallback does not tell
  users the built-in API is unavailable.

Files changed:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/Settings.tsx`
- `packages/core/src/llm.ts`
- `packages/core/src/chatPlanner.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue Conversation work with visible project-understanding controls:
  current index status, refresh action, and a compact explanation of what
  repository context the agent will use for CI/CD and PR insight.

### 2026-06-11 Session Update 101

Phase:

Phase 2: Repository Understanding

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `94%` to `95%`.
- Verification remains `99%`.
- Phase 2 completion moved from `11%` to `13%`.
- Phase 8 completion remains `25%`.

Completed:

- Added a first visible Project understanding control surface to Conversation.
- Added `getChatIndexStatus()` in core so the app can inspect repository index
  readiness without building a full chat prompt.
- Added daemon endpoints:
  - `POST /chat/index-status`
  - `POST /chat/index-refresh`
- The refresh endpoint reuses the selected Conversation model and current
  Project Link data so embeddings and ignored/profile context stay aligned with
  the active chat.
- Added desktop API helpers:
  - `fetchChatIndexStatus`
  - `refreshChatIndexStatus`
- Added a Project understanding card in the Chat right-side Context panel:
  - shows semantic-ready, pending-embedding, or quick-scan-only state
  - shows indexed file count, embedded chunks, and pending chunks
  - includes a direct Refresh action
  - updates status after refresh
- Added focused core test coverage for index status before and after refresh.

Files changed:

- `packages/core/src/chatContext.ts`
- `packages/core/test/chatContext.test.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/chatContext.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/core` chat context tests passed: 1 file, 3 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Make Conversation use this project-understanding status more actively:
  surface whether PR insight artifacts, ADO mapping, and local index are being
  used before a turn starts, then use that same state to improve suggested
  prompts for CI/CD and PR insight workflows.

### 2026-06-10 Session Update 10

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `21%` to `22%`.
- Verification moved from `52%` to `54%`.
- Phase 4 completion moved from `45%` to `50%`.
- Phase 8 completion moved from `12%` to `14%`.

Completed:

- Added daemon-side Azure DevOps discovery endpoint:
  - `POST /profiles/discover`
  - supports `projects`, `repositories`, and `pipelines`
  - originally used the external MCP bridge, then was superseded by the
    internal implementation in Session Update 12
- Reused upstream Azure DevOps MCP tool contracts as the target capability
  shape:
  - `core_list_projects`
  - `repo_list_repos_by_project`
  - `pipelines_get_build_definitions`
- Added normalization into stable desktop options:
  - `id`
  - `name`
  - `description`
  - `url`
- Added daemon route coverage for `/profiles/discover`; this was later changed
  from fake MCP server coverage to mocked ADO REST coverage.
- Added desktop API bindings for Project Link discovery.
- Added discovery controls to the Project Links management form.
- Added the same discovery controls to the in-chat Project Link onboarding card
  so users with no Project Link can create one without navigating away from the
  conversation.
- Discovery now auto-applies a result when exactly one option is returned.
- Discovery no longer enables the external Project Link MCP bridge after the
  Session Update 12 correction.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed.
- `@cicd-agent/daemon` full tests passed: 4 files, 24 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Current product impact:

- The no-Project-Link path is now closer to the target workflow: the user can
  start in chat, fill the minimum local repo details, expand Azure DevOps
  details, discover projects/repos/pipelines through internally ported ADO
  logic, create the Project Link, and continue the same chat with that Project
  Link active.

Next recommended task:

- Start replacing more custom Azure DevOps operations with internally ported
  Azure DevOps MCP-style paths behind the same Project Link configuration:
  - PR listing/details
  - pipeline run lookup
  - work item lookup/linking
- Add visible per-Project-Link health/status checks for the internal ADO tool
  path before running an agent workflow.

### 2026-06-10 Session Update 11

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `22%` to `23%`.
- Verification moved from `54%` to `55%`.
- Phase 4 completion moved from `50%` to `52%`.
- Phase 8 completion moved from `14%` to `15%`.

Completed:

- Added daemon-side Azure DevOps tool health endpoint:
  - `POST /profiles/check-ado-tools`
  - originally validated the external MCP bridge, then was superseded by the
    internal ADO tool health implementation in Session Update 12
  - returns `ok`, `toolCount`, and tool metadata
- Added focused daemon route coverage; this was later changed from fake MCP
  server coverage to mocked ADO REST coverage.
- Added desktop API binding, later renamed to:
  - `checkAdoProjectLinkTools`
- Added ADO tool health controls to:
  - Project Links management form
  - in-chat Project Link onboarding card
- A successful health check no longer enables the external Project Link MCP
  bridge after the Session Update 12 correction.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed: 8 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 25 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Reuse upstream Azure DevOps MCP PR and pipeline tools for read-only workspace
  surfaces first:
  - active pull request list
  - pull request detail context
  - latest pipeline runs
  - linked work items

### 2026-06-10 Session Update 12

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Status change:

- Overall implementation progress moved from `23%` to `24%`.
- Verification moved from `55%` to `56%`.
- Phase 4 completion moved from `52%` to `56%`.

Direction correction:

- Final product goal is to implement Azure DevOps MCP capabilities inside this
  project, not to permanently call an external MCP server.
- The stdio MCP bridge remains useful as compatibility infrastructure and as a
  way to compare behavior against upstream, but it is no longer the main Phase
  4 implementation path.
- Product APIs should prefer internally ported code. External MCP settings are
  now described as fallback/compatibility settings in the UI.

Completed:

- Added internally ported Azure DevOps discovery helpers to
  `packages/core/src/tools/azureDevOps.ts`:
  - `listAzureProjects`
  - `listAzureRepositories`
  - `listAzureBuildDefinitions`
  - `checkAzureDevOpsTools`
  - `INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST`
- Reused the upstream Azure DevOps MCP logic shape, but implemented it locally
  through the existing ADO REST/auth layer instead of launching the upstream
  MCP server.
- Reworked daemon `/profiles/discover` so Project Link discovery now returns
  `source: "internal"` and does not start an external MCP process.
- Reworked daemon health checks so `/profiles/check-ado-tools` validates the
  internal ADO tool path and returns `source: "internal"`. The older
  `/profiles/check-mcp` route remains as a compatibility alias.
- Updated server tests to mock Azure DevOps REST responses instead of starting
  a fake MCP server for product-level discovery/check routes.
- Updated desktop API types so discovery and health checks can report
  `internal` source.
- Updated Profiles and Chat onboarding copy:
  - `Check MCP bridge` became `Check ADO tools`
  - external MCP configuration is now labeled as a fallback path
- Discovery no longer auto-enables the external MCP bridge in form state.

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` typecheck and build passed.
- `@cicd-agent/core` full tests passed: 14 files, 46 tests.
- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed: 8 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 25 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Continue internalizing Azure DevOps MCP read-only repo and PR tools before
  adding more mutating operations:
  - `repo_list_pull_requests_by_repo_or_project`
  - `repo_get_pull_request_by_id`
  - `repo_list_pull_request_threads`
  - `pipelines_get_builds`
  - `pipelines_get_run`

### 2026-06-10 Session Update 13

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Status change:

- Overall implementation progress moved from `24%` to `25%`.
- Verification moved from `56%` to `57%`.
- Phase 4 completion moved from `56%` to `61%`.

Completed:

- Continued internal source-porting from Azure DevOps MCP read-only tools.
- Added internally ported helpers in `packages/core/src/tools/azureDevOps.ts`:
  - `getAzurePullRequestById`
  - `listAzurePullRequestThreads`
  - `listAzureBuilds`
  - `getAzurePipelineRun`
- Added local result types for:
  - PR detail
  - PR threads/comments
  - build summaries
- Added focused core tests in `packages/core/test/azureDevOpsInternal.test.ts`
  proving URL construction, branch normalization, response trimming, author
  filtering, status filtering, and deleted-comment filtering.
- Added daemon Project Link endpoint:
  - `GET /profiles/:id/pull-requests/:pullRequestId/context`
- The PR context endpoint returns:
  - `source: "internal"`
  - pull request detail
  - pull request threads
  - matching builds for the PR source branch when a Project Link has a pipeline
    configured
- Added desktop API types and fetch helper:
  - `fetchProfilePullRequestContext`

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/core` typecheck passed.
- Focused Azure DevOps internal-port tests passed: 4 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed: 9 tests.
- `@cicd-agent/core` full tests passed: 15 files, 50 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 26 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Use `fetchProfilePullRequestContext` in the Pull Requests workspace UI to
  show expandable PR detail, threads, work items, and build history.
- Continue internalizing mutating Azure DevOps MCP tools only after read-only
  PR workspace behavior is stable:
  - vote PR
  - reply to thread
  - create/update thread
  - update PR metadata

### 2026-06-10 Session Update 14

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `25%` to `26%`.
- Verification moved from `57%` to `58%`.
- Phase 4 completion moved from `61%` to `64%`.

Completed:

- Connected the internally ported PR context API into the Pull Requests
  workspace.
- Added on-demand PR detail loading in `apps/desktop/src/pages/PullRequests.tsx`.
- Added an expandable details panel per PR showing:
  - PR description
  - internal/source marker
  - work item references
  - thread/comment summary
  - matching build history
- The details panel calls `fetchProfilePullRequestContext`, which uses:
  - `GET /profiles/:id/pull-requests/:pullRequestId/context`
  - internally ported Azure DevOps logic
  - `source: "internal"`
- Loading is lazy per PR so the PR list remains lightweight.

Files changed:

- `apps/desktop/src/pages/PullRequests.tsx`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add action affordances on top of this internal PR context:
  - queue review with current PR detail included
  - open work items
  - filter unresolved threads
  - compare latest matching build status
- Then continue internalizing mutating Azure DevOps MCP tools with approval
  gates:
  - vote PR
  - reply to thread
  - create/update thread
- Feed those discovery actions into the in-chat Project Link setup card so ADO
  fields can be populated from upstream MCP logic instead of manual typing.

### 2026-06-10 Session Update 15

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 5: Pull Requests Workspace

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `26%` to `27%`.
- Verification moved from `58%` to `59%`.
- Phase 4 completion moved from `64%` to `66%`.
- Phase 5 is now marked `In progress` at `8%` because the Pull Requests
  workspace has internal PR context loading and detail rendering.

Completed:

- Added daemon-side local git remote inference:
  - `GET /git/azure-devops-remote`
  - reads `git remote -v` for a repository path
  - recognizes common Azure DevOps HTTPS remotes:
    - `https://dev.azure.com/{org}/{project}/_git/{repo}`
    - `https://{org}.visualstudio.com/{project}/_git/{repo}`
  - recognizes Azure DevOps SSH remotes:
    - `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`
    - `ssh.dev.azure.com/v3/{org}/{project}/{repo}`
- Added desktop API/helper support:
  - `fetchAzureDevOpsRemoteSuggestionFromDaemon`
  - `fetchAzureDevOpsRemoteSuggestion`
- Project Link management and in-chat Project Link creation now auto-fill empty
  ADO fields from the local git remote:
  - organization URL
  - project name
  - repository name
- Auto-fill is conservative and does not overwrite fields the user has already
  typed.
- The UI now shows a small confirmation hint when ADO fields were inferred from
  a remote.
- Updated daemon tests so PR context mocks are URL-based instead of
  order-based, matching the route's parallel ADO fetch behavior.

Current Project Link field behavior:

- Local repository path:
  - still needs a source from the user or workspace selection because it points
    to local disk.
- Project Link name:
  - auto-suggested from the local repository folder and editable.
- Default branch and PR target branch:
  - auto-detected from local git branches and editable.
- ADO organization URL, project, and repository:
  - auto-inferred from Azure DevOps git remote when possible.
  - can still be manually edited.
  - can still be discovered from ADO after PAT/auth is available.
- ADO pipeline:
  - still selected through internal ADO discovery after organization/project
    are known.
- ADO authorization:
  - the intended primary path is the signed-in user's Azure DevOps OAuth token.
  - Project Link PAT is now best understood as a fallback for tenants/accounts
    where ADO OAuth consent or token acquisition is unavailable.
  - current UI copy still over-emphasizes PAT setup and should be corrected in
    the next product-hardening pass.
- Build/test commands:
  - still project-specific and manual for now.
- External MCP command/auth/domains:
  - optional fallback-only compatibility fields, not required for the internal
    ADO implementation path.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/projectLinks.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- Focused daemon server tests passed: 10 tests.
- Focused Azure DevOps internal-port tests passed: 5 tests.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/core` full tests passed: 15 files, 51 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 27 tests.

Next recommended task:

- Add pipeline auto-selection heuristics:
  - match ADO build definitions by repository ID/name
  - prefer YAML pipelines whose path exists in the local repo
  - prefer definitions that recently built the default branch
- Update Project Link auth UX so Microsoft sign-in is shown as the primary ADO
  auth path and PAT is clearly labeled as an optional fallback.
- Add auth diagnostics so a Project Link can say whether a capability is
  blocked by ADO OAuth consent/token acquisition or by fallback PAT scope.

### 2026-06-11 Session Update 16

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 5: Pull Requests Workspace

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `27%` to `28%`.
- Verification moved from `59%` to `60%`.
- Phase 4 completion moved from `66%` to `67%`.
- Phase 5 completion moved from `8%` to `12%`.
- Phase 8 completion moved from `15%` to `16%`.

Completed:

- Clarified the ADO auth model in code and UI:
  - Microsoft sign-in / ADO OAuth is the primary path.
  - Project Link PAT is an optional fallback.
- Extended internal ADO tool health to return `authMode`:
  - `oauth`
  - `pat`
- Project Link management and in-chat setup now report:
  - `ADO tools ready via OAuth`
  - or `ADO tools ready via PAT fallback`
- Updated desktop API comments so `review-run` no longer claims it is PAT-only.
- Repositioned Pull Requests workspace review action as AI insight:
  - `Queue for Review` became `Run AI Insight`
  - running state now says `Analyzing...`
- Reused the existing `POST /profiles/:id/review-run` Review Agent path for
  PR insight instead of creating a duplicate service.
- Pull Requests workspace now renders AI insight output inline:
  - review summary
  - token usage
  - first five findings with severity, category, file, line, and message

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Focused Azure DevOps internal-port tests passed: 6 tests.
- `@cicd-agent/core` build passed.
- Focused daemon server tests passed: 10 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/core` full tests passed: 15 files, 52 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 27 tests.
- `@cicd-agent/daemon` typecheck passed.

Next recommended task:

- Add a non-mutating PR insight preview path that can summarize PR context even
  when full Review Agent diff context cannot be built.
- Add ADO OAuth diagnostic errors that distinguish:
  - not signed in
  - ADO OAuth consent missing
  - signed in but no organization access
  - fallback PAT present but missing scopes

### 2026-06-11 Session Update 17

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `28%` to `29%`.
- Verification moved from `60%` to `61%`.
- Phase 5 completion moved from `12%` to `18%`.

Completed:

- Added a non-mutating PR insight preview endpoint:
  - `POST /profiles/:id/pull-requests/:pullRequestId/insight-preview`
- The preview endpoint reuses internal ADO PR context helpers:
  - PR detail
  - PR threads
  - PR changed files
  - matching builds
- If LLM is configured, the endpoint asks the model for a concise readiness
  summary over PR metadata.
- If LLM is not configured, it returns a deterministic heuristic summary so the
  product still gives useful PR signals.
- Preview does not write review history and does not perform auto-approval.
- Added desktop API support:
  - `fetchProfilePullRequestInsightPreview`
- Added Pull Requests workspace UI:
  - `Preview Insight`
  - displays preview source, summary, risk chips, file/thread/build signals
- This complements the full `Run AI Insight` path, which still uses the existing
  Review Agent route and can persist review results.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/core test
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- Focused daemon server tests passed: 11 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/daemon` full tests passed: 4 files, 28 tests.
- `@cicd-agent/core` full tests passed: 15 files, 52 tests.

Next recommended task:

- Add clearer auth failure classification for preview and full insight:
  - OAuth unavailable
  - OAuth lacks organization access
  - PAT fallback invalid or missing scopes
- Add pipeline auto-selection so Project Link setup can infer a best default
  pipeline after project/repo are known.

### 2026-06-11 Session Update 18

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `29%` to `30%`.
- Verification moved from `61%` to `62%`.
- Phase 4 completion moved from `67%` to `68%`.
- Phase 8 completion moved from `16%` to `18%`.

Completed:

- Added structured ADO auth diagnostics in `@cicd-agent/core`.
- Added diagnostic statuses:
  - `ok`
  - `oauth_unavailable`
  - `oauth_no_org_access`
  - `pat_invalid_or_missing_scope`
  - `unknown_error`
- ADO fetch now classifies redirect, `401`, and `403` responses based on auth
  mode.
- Internal ADO health now returns:
  - `authMode`
  - `authStatus`
  - `authMessage`
- `/profiles/check-ado-tools` now returns structured diagnostic JSON on auth
  failure instead of only a plain error string.
- Desktop API parses structured diagnostic failures and returns them to callers.
- Project Link management and in-chat setup display actionable auth diagnostics:
  - OAuth issue
  - PAT fallback issue
  - exact diagnostic message

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- Focused Azure DevOps internal-port tests passed: 7 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` typecheck passed.
- Focused daemon server tests passed: 12 tests.
- `@cicd-agent/core` full tests passed: 15 files, 53 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 29 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Use the same auth diagnostic shape in PR context, preview insight, and full
  `review-run` failures so every ADO-powered surface reports consistent
  remediation guidance.
- Add pipeline auto-selection after project/repo discovery.

### 2026-06-11 Session Update 19

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `30%` to `31%`.
- Phase 4 completion moved from `68%` to `69%`.
- Phase 8 completion moved from `18%` to `19%`.

Completed:

- Added shared desktop pipeline recommendation helper:
  - `pickRecommendedPipeline`
- Added desktop unit test coverage for Project Link pipeline recommendation.
- The helper scores discovered pipelines using:
  - repository name from ADO or local path
  - project name
  - CI/build/PR/validation naming signals
  - Azure Pipelines YAML naming signals
  - negative weight for release/deploy/prod signals
- Project Link management now auto-selects a recommended pipeline when:
  - multiple pipelines are discovered
  - no pipeline is already selected
- In-chat Project Link creation uses the same recommendation logic.
- The UI shows a small recommendation hint when a pipeline is auto-selected.

Files changed:

- `apps/desktop/src/projectLinks.ts`
- `apps/desktop/src/projectLinks.test.ts`
- `apps/desktop/package.json`
- `pnpm-lock.yaml`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe install --lockfile-only
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- Lockfile-only install completed.
- `@cicd-agent/desktop` tests passed: 1 file, 2 tests.

Next recommended task:

- Add backend-enriched pipeline discovery metadata when ADO build definitions
  expose repository and YAML path details.
- Extend the same structured ADO auth diagnostics to PR context, preview
  insight, and full `review-run`.

### 2026-06-11 Session Update 20

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 5: Pull Requests Workspace

Phase 8: Product Hardening And Distribution

Status change:

- No percentage change; this was a consistency hardening pass across existing
  ADO-powered surfaces.

Completed:

- Added shared daemon helper for ADO diagnostic responses.
- Extended structured ADO auth diagnostics to:
  - PR context endpoint
  - PR insight preview endpoint
  - full `review-run` ADO iteration/context failures
- Desktop API now parses diagnostic JSON for PR context, preview insight, and
  full review errors, surfacing `authMessage` instead of raw JSON.
- This makes Project Link checks, PR details, preview insight, and full AI
  insight use the same remediation language.

Files changed:

- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- Focused daemon server tests passed: 12 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add backend-enriched pipeline discovery metadata and tests for automatic
  pipeline recommendation.
- Add a small desktop unit test harness for shared Project Link heuristics.

### 2026-06-11 Session Update 21

Phase:

Phase 4: MCP And Azure DevOps Tool Reuse

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `31%` to `32%`.
- Verification moved from `62%` to `63%`.
- Phase 4 completion moved from `69%` to `70%`.
- Phase 8 completion moved from `19%` to `20%`.

Completed:

- Enriched internal ADO build definition discovery with repository and YAML
  metadata when Azure DevOps returns it.
- Build definition discovery descriptions now include:
  - definition path
  - repository name
  - repository type
  - YAML filename
- This makes desktop pipeline recommendation more accurate without changing the
  external API shape.
- Added focused core test coverage for enriched build definition discovery.
- Added daemon route-level coverage proving `/profiles/discover` can resolve a
  Project Link repository name to an Azure DevOps repository id before listing
  repository-filtered build definitions.
- This means Project Link setup can avoid manual pipeline entry in the normal
  case once org/project/repo are known.

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
```

Result:

- Focused Azure DevOps internal-port tests passed: 8 tests.
- `@cicd-agent/core` build passed.
- `@cicd-agent/desktop` tests passed: 1 file, 2 tests.
- `@cicd-agent/daemon` full tests passed: 4 files, 30 tests.

Next recommended task:

- Start the next PR-Agent reuse slice for richer PR insight summarization and
  finding categorization.
- Add browser-level/manual UI verification once a dev server is intentionally
  started.

### 2026-06-11 Session Update 22

Phase:

Phase 5: Pull Requests Workspace

Phase 8: Product Hardening And Distribution

Status change:

- Overall implementation progress moved from `32%` to `33%`.
- Verification moved from `63%` to `64%`.
- Phase 5 completion moved from `18%` to `20%`.

Completed:

- Vendored `qodo-ai/pr-agent` under `third_party/pr-agent` for direct
  source-first reuse.
- Recorded upstream commit:
  - `31d7dd027968e5fad1f9cbb074be047c4869058e`
- Kept high-value PR-Agent source areas available locally:
  - review prompts and PR reviewer flow
  - diff preparation/compression logic
  - token handling
  - Azure DevOps provider mapping
  - tests for future porting references
- Removed the nested `.git` directory after recording the upstream commit so
  `third_party/pr-agent` is a normal vendored source copy, not an external
  runtime dependency or submodule.
- Ported a first PR-Agent-style readiness/risk categorization slice into the
  local PR insight preview:
  - `ready`
  - `needs_attention`
  - `blocked`
  - blocking/warning/info signal buckets
- Desktop Preview Insight cards now show readiness and category-colored risk
  chips while keeping the existing `risks` field compatible.
- Full AI Insight responses now expose the same readiness vocabulary and
  finding-derived blocking/warning/info buckets, so preview and full analysis
  can converge on one product language.

Files changed:

- `third_party/pr-agent/**`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/daemon` tests passed: 4 files, 30 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 1 file, 2 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Port the next PR-Agent review prompt/output slice into the full AI insight
  path so preview and full review share the same categorization vocabulary.
- Add browser-level/manual UI verification once a dev server is intentionally
  started.

### 2026-06-11 Session Update 23

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `33%` to `34%`.
- Verification moved from `64%` to `65%`.
- Phase 5 completion moved from `20%` to `22%`.

Completed:

- Ported a second PR-Agent review-output slice into the local Review Agent.
- Extended the full AI insight model contract with structured metadata:
  - estimated review effort from `1` to `5`
  - whether tests are required
  - whether security concerns are present
  - whether the PR should be split
  - key issues for human reviewers
- Added deterministic defaults for metadata when the LLM is not configured or
  the model output is not structured.
- Exported and tested the review response parser so the metadata contract is
  directly covered by unit tests.
- Daemon `review-run` now returns the metadata in full AI insight results.
- Pull Requests UI now displays metadata chips in the full AI Insight card.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 6 files, 19 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 30 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` tests passed: 1 file, 2 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Port PR-Agent diff preparation/compression concepts so full AI insight can
  scale beyond small PRs without naive prompt truncation.
- Add browser-level/manual UI verification once a dev server is intentionally
  started.

### 2026-06-11 Session Update 24

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `34%` to `35%`.
- Verification moved from `65%` to `66%`.
- Phase 5 completion moved from `22%` to `24%`.

Completed:

- Ported a lightweight PR-Agent-style prompt compression layer into the local
  Review Agent.
- Replaced naive full-prompt slicing in `runReviewPlanner` with
  `bundleToCompressedReviewPrompt`.
- The compression path now:
  - emits a clear compression note
  - includes only complete file blocks that fit the configured prompt budget
  - lists omitted added, modified, and deleted files explicitly
  - avoids cutting through a file block mid-content
  - preserves related context only when it still fits
- Exported the compression helper for direct testing and future tuning.
- Added review-agent unit coverage for large PR compression behavior.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 6 files, 20 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 30 tests.
- `@cicd-agent/desktop` production build passed.
- Vite dev server HTTP smoke test passed on `http://127.0.0.1:1421`:
  - `/` returned `200`
  - app shell contained `#root` and `/src/main.tsx`
  - `/src/main.tsx` returned `200` and loaded `App`

Next recommended task:

- Add full browser/manual UI verification for Project Link onboarding and Pull
  Requests insight display when browser automation is available.
- Continue PR-Agent reuse by porting diff/file prioritization signals rather
  than only using size-based prompt compression.

### 2026-06-11 Session Update 25

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `35%` to `36%`.
- Verification moved from `66%` to `67%`.
- Phase 5 completion moved from `24%` to `26%`.

Completed:

- Ported PR-Agent-style file prioritization into the local Review Agent prompt
  compression path.
- Added `scoreReviewFilePriority` so compression prefers high-value files
  instead of sorting only by size.
- Priority scoring currently accounts for:
  - security/auth/token/permission-sensitive paths
  - infrastructure, deployment, migration, schema, and pipeline paths
  - source-code extensions
  - tests
  - change type
  - very large generated-looking content
- Compression now includes high-risk files first when prompt budget is tight
  and still lists omitted files by change type.
- Added unit coverage proving security-sensitive files outrank a large
  low-signal generated file.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/review-agent/test/reviewPlanner.test.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 6 files, 21 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 30 tests.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Feed compression/omission metadata back into full AI insight output so the UI
  can explain when analysis was budget-limited.
- Add full browser/manual UI verification for Project Link onboarding and Pull
  Requests insight display when browser automation is available.

### 2026-06-11 Session Update 26

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `36%` to `37%`.
- Verification moved from `67%` to `68%`.
- Phase 5 completion moved from `26%` to `28%`.

Completed:

- Added compression boundary reporting to full AI insight results.
- `ReviewResult` now includes a lightweight compression summary:
  - whether the prompt was compressed
  - files included in model context
  - files omitted due to prompt budget
- The daemon `review-run` response now passes this compression summary through
  to desktop.
- Pull Requests full AI Insight cards now show whether context was complete or
  compressed, plus included/omitted file counts and the first omitted files.
- The full prompt text is not exposed through the API; only the lightweight
  compression summary is returned.

Files changed:

- `packages/review-agent/src/reviewPlanner.ts`
- `packages/review-agent/src/index.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/PullRequests.tsx`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/review-agent` tests passed: 6 files, 21 tests.
- `@cicd-agent/review-agent` build passed.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/daemon` tests passed: 4 files, 30 tests.
- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add a route-level test around `review-run` response metadata once a compact
  mock for `buildCloudContext`/Review Agent can be isolated.
- Add full browser/manual UI verification for Project Link onboarding and Pull
  Requests insight display when browser automation is available.

### 2026-06-11 Session Update 27

Phase:

Phase 5: Pull Requests Workspace

Status change:

- Overall implementation progress moved from `37%` to `38%`.
- Verification moved from `68%` to `69%`.
- Phase 5 completion moved from `28%` to `30%`.

Completed:

- Added daemon route-level coverage for full AI insight `review-run` response
  fields.
- The test exercises the real daemon route with mocked ADO REST calls for:
  - pull request iterations
  - changed files
  - item content
  - authenticated reviewer identity
- The test verifies that `review-run` returns:
  - `metadata`
  - `compression`
  - `readiness`
  - decision queue/risk fields
- This locks the API contract used by the Pull Requests UI instead of relying
  only on typecheck/build coverage.

Files changed:

- `packages/daemon/test/server.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent test
.\.tools\pnpm.exe --filter @cicd-agent/review-agent typecheck
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
```

Result:

- `@cicd-agent/daemon` tests passed: 4 files, 31 tests.
- `@cicd-agent/daemon` typecheck passed.
- `@cicd-agent/desktop` production build passed.
- `@cicd-agent/review-agent` tests passed: 6 files, 22 tests.
- `@cicd-agent/review-agent` typecheck passed.
- `@cicd-agent/review-agent` build passed.

Next recommended task:

- Add compact desktop tests for full AI insight rendering helpers if the UI
  logic is extracted from the page component.
- Add full browser/manual UI verification for Project Link onboarding and Pull
  Requests insight display when browser automation is available.

### 2026-06-10 Session Update 9

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- No phase percentage change; this was a compatibility hardening pass.

Completed:

- Added desktop-side Project Link default normalization helpers:
  - `withProjectLinkInputDefaults`
  - `withProjectLinkDefaults`
- Normalized Project Links loaded from localStorage before they enter shared app
  state.
- Normalized daemon-returned Project Links before storing them in desktop state
  and localStorage cache.
- Normalized locally created and locally updated Project Links in daemon
  fallback mode.
- This keeps older stored `WorkspaceProfile` records compatible with the newer
  MCP fields and prevents undefined values from reaching controlled form
  inputs.

Files changed:

- `apps/desktop/src/projectLinks.ts`
- `apps/desktop/src/App.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```

Result:

- `@cicd-agent/desktop` typecheck passed.
- `@cicd-agent/desktop` production build passed.

Next recommended task:

- Add MCP-backed discovery actions for Project Link setup:
  - list Azure DevOps projects
  - list repositories for a selected project
  - list pipelines for a selected repository/project

### 2026-06-12 Session Update 106

Phase:

Phase 5: Conversational Dev Agent Runtime

Status change:

- Phase 5 moved from 78% to 82%.
- Overall product progress moved from 68% to 70%.

Completed:

- Continued source-first reuse of OpenHarness-style streaming logic by adding
  local tool-output delta events instead of calling an external agent runtime.
- Added command-output streaming at the core execution layer:
  - `runCommand` now supports redacted `onOutput` chunks for stdout and stderr.
  - `ToolExecutor.call()` remains backward compatible.
  - `ToolExecutor.callStream()` emits runtime output events before the final
    structured tool result.
- Forwarded command output from local Git, NPM, DotNet, and Pytest tools through
  `ToolContext.emitToolEvent`.
- Added `tool_output_delta` chat events and canonical `tool.output.delta` SSE
  aliases.
- Mapped tool output deltas into `tool-output-delta` UI chunks.
- Updated Chat rendering so the active tool card opens and appends live output
  while the command is still running, then preserves the final structured tool
  renderer after completion.
- Applied this to both normal planner tool calls and confirmed-action execution.

Files changed:

- `packages/core/src/tools/executor.ts`
- `packages/core/src/tools/git.ts`
- `packages/core/src/tools/npm.ts`
- `packages/core/src/tools/dotnet.ts`
- `packages/core/src/tools/pytest.ts`
- `packages/core/src/chatPlanner.ts`
- `packages/core/src/chatUiStream.ts`
- `packages/core/test/toolExecutor.test.ts`
- `packages/core/test/chatUiStream.test.ts`
- `packages/daemon/src/chatEvents.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatEvents.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/source-reuse-streaming-event-intake.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/toolExecutor.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

Result:

- Core focused tests passed: 2 files, 16 tests.
- Core typecheck and build passed.
- Daemon chat event tests passed: 1 file, 9 tests.
- Daemon typecheck passed.
- Daemon HTTP tests passed: 1 file, 24 tests.
- Desktop typecheck and production build passed.

Next recommended task:

- Continue the source-first stream migration by splitting final/approval
  metadata out of model text so `__CONTROL_JSON__` can be retired from the
  long-term architecture.

### 2026-06-12 Session Update 107

Phase:

Phase 5: Conversational Dev Agent Runtime

Status change:

- Phase 5 moved from 82% to 84%.
- Overall product progress moved from 70% to 71%.

Completed:

- Checked the current runtime against popular agent architecture patterns from:
  - OpenAI Agents SDK
  - LangGraph
  - Vercel AI SDK
  - AutoGen Core
- Added an architecture alignment document that records:
  - where the current project is aligned
  - where it is only partially aligned
  - the main remaining deviation
  - recommended next corrections
- Confirmed that recent work is directionally aligned with mainstream agent
  runtime architecture:
  - application-owned orchestration
  - typed tool execution
  - human approval gates
  - stateful sessions
  - streaming text/tool/UI events
  - durable checkpoints
- Started correcting the main deviation: control metadata embedded in model
  text via `__CONTROL_JSON__`.
- Added a typed runtime control event layer:
  - core `assistant_control`
  - canonical SSE `assistant.control`
  - UI chunk `metadata-available`
- Kept `done` and existing workflow-state behavior as compatibility layers.

Files changed:

- `docs/agent-architecture-alignment.md`
- `docs/source-reuse-streaming-event-intake.md`
- `docs/dev-agent-progress-tracker.md`
- `packages/core/src/chatPlanner.ts`
- `packages/core/src/chatUiStream.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `packages/core/test/chatUiStream.test.ts`
- `packages/daemon/src/chatEvents.ts`
- `packages/daemon/test/chatEvents.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- Core focused tests passed: 2 files, 17 tests.
- Core typecheck and build passed.
- Daemon chat event tests passed: 1 file, 10 tests.
- Desktop typecheck and production build passed.
- Daemon typecheck passed.
- Daemon HTTP tests passed: 1 file, 24 tests.

Next recommended task:

- Replace the legacy `__CONTROL_JSON__` input format with a structured
  finalization tool or model structured output, using `assistant_control` as
  the stable runtime event surface.

### 2026-06-12 Session Update 108

Phase:

Phase 5: Conversational Dev Agent Runtime

Status change:

- Phase 5 moved from 84% to 85%.
- Overall product progress remains at 71% until the structured finalization
  path is validated against live model traffic.

Completed:

- Started replacing the legacy `__CONTROL_JSON__` control-marker path with a
  structured internal finalization tool.
- Added `agent_final` as a synthetic model tool appended by `ChatPlanner`.
- Kept `agent_final` out of `ToolExecutor`, so it cannot run as an external
  command or service.
- Converted `agent_final` tool arguments into the existing typed runtime flow:
  - `assistant_control`
  - canonical `assistant.control`
  - UI `metadata-available`
  - existing `done` result compatibility
- Preserved approval proposals from `agent_final` in the same
  `PendingToolAction` shape used by the current approval workflow.
- Left `__CONTROL_JSON__` available only as a compatibility fallback for
  model/provider paths that cannot emit tool calls.
- Updated architecture and source-reuse notes to reflect the new
  source-first finalization migration step.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `docs/source-reuse-streaming-event-intake.md`
- `docs/agent-architecture-alignment.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
```

Result:

- Core focused tests passed: 2 files, 18 tests.
- Core typecheck and build passed.
- Daemon chat event tests passed: 1 file, 10 tests.
- Desktop typecheck and production build passed.
- Daemon typecheck passed.
- Daemon HTTP tests passed: 1 file, 24 tests.

Next recommended task:

- Validate `agent_final` with the live Conversation model path, then reduce
  prompt reliance on the fallback `__CONTROL_JSON__` examples.

### 2026-06-12 Session Update 109

Phase:

Phase 5: Conversational Dev Agent Runtime

Status change:

- Phase 5 moved from 85% to 86%.
- Overall product progress remains at 71% pending live Conversation model
  validation.

Completed:

- Hardened `agent_final` as the preferred structured finalization path.
- Removed legacy `__CONTROL_JSON__` examples from the main system-prompt
  examples and replaced them with `agent_final` argument examples.
- Changed the no-finalization retry nudge so it asks the model to call
  `agent_final` first, with `__CONTROL_JSON__` only as compatibility fallback.
- Added a guard for mixed tool-call batches:
  - if a batch contains executable tools and `agent_final`, execute the real
    tools first
  - then ask the model to finalize after tool results are available
- Added regression coverage for:
  - retry nudges preferring `agent_final`
  - mixed `agent_final` plus read-only tool batches not skipping the real tool

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `docs/source-reuse-streaming-event-intake.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

Result:

- Core focused tests passed: 2 files, 20 tests.
- Core typecheck and build passed.
- Daemon chat event tests passed: 1 file, 10 tests.
- Daemon typecheck passed.
- Daemon HTTP tests passed: 1 file, 24 tests.
- Desktop typecheck and production build passed.

Next recommended task:

- Add a live-model diagnostics path or development-only trace that confirms
  whether the selected Conversation model is actually using `agent_final`
  instead of the fallback marker during normal chat.

### 2026-06-12 Session Update 110

Phase:

Phase 5: Conversational Dev Agent Runtime

Status change:

- Phase 5 moved from 86% to 87%.
- Overall product progress moved from 71% to 72%.

Completed:

- Closed the structured-finalization observability loop by carrying the
  resolved finalization path through runtime metadata.
- Added `finalizationMode` to assistant results and assistant bubble metadata:
  - `agent_final`
  - `control_marker`
  - `plain_json`
  - `none`
- Persisted `finalizationMode` on daemon assistant bubbles.
- Exposed `finalizationMode` through desktop chat event and chat-history types.
- Updated Chat details rendering so restored assistant messages can show the
  runtime finalization path, risk level, and actions as compact metadata chips.
- Updated the source-reuse intake document to record this verification loop.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/chatBubbles.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `packages/daemon/src/chatSession.ts`
- `docs/source-reuse-streaming-event-intake.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts
```

Result:

- Core focused tests passed: 2 files, 20 tests.
- Core typecheck passed.
- Daemon typecheck passed.
- Desktop typecheck passed.
- Desktop chat bubble tests passed: 1 file, 3 tests.

Next recommended task:

- Run one manual Conversation turn with the built-in model and confirm the
  assistant details show `Finalization: agent final`.

### 2026-06-13 Session Update 111

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Verification remains at 98%.
- Conversation frontend browser QA is no longer blocked on missing Playwright
  dependencies.

Completed:

- Installed Playwright test dependencies in the root workspace.
- Installed the Chromium browser binary for repository-local Playwright runs.
- Added root Playwright configuration for desktop Chat smoke tests.
- Added `e2e:chat` for the focused Chat layout smoke suite.
- Added a Playwright regression test that:
  - mocks daemon health/profile/history/index responses
  - seeds a Project Link in local storage
  - opens a new Chat session
  - expands the right Environment panel
  - opens the model menu
  - checks normal and narrow widths for visible horizontal overflow
- Fixed the right Environment panel width and text constraints so Changes,
  branch, commit/push, and PR follow-up controls stay inside the viewport.

Files changed:

- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `tests/e2e/chat-layout.spec.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
git diff --check
```

Result:

- Playwright Chat layout suite passed: 2 tests.
- Desktop typecheck passed.
- `git diff --check` reported only existing Windows line-ending warnings and no
  patch whitespace errors.

Next recommended task:

- Extend Playwright from static layout smoke coverage into live Conversation
  workflows: composer state transitions, suggested actions, approval/timeline
  attachment, and project-context answers.

### 2026-06-13 Session Update 112

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Verification remains at 98%.
- Conversation input upgrade moved forward by making approval-pending composer
  state explicit and test-covered.

Completed:

- Added a centralized composer input-state helper for:
  - textarea disabled state
  - Send disabled state
  - attachment/model control disabled state
  - state-specific placeholders and titles
- Locked the composer while a protected action approval is pending so the user
  cannot start a second request from a typed draft before approving or
  cancelling the current workflow action.
- Expanded focused desktop tests for idle, busy, and approval-pending composer
  input states.
- Expanded Playwright Chat layout coverage to verify:
  - command-chip density and composer-fill routing
  - approval notice visibility
  - approval-pending textarea lockout
  - Send/model/attachment disabled state
  - no visible horizontal overflow

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Desktop focused composer/suggestion tests passed: 26 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 4 tests.

Next recommended task:

- Continue from composer state polish into live workflow QA: queued follow-up
  state, approval/timeline attachment, and project-context answers in a running
  Conversation session.

### 2026-06-13 Session Update 113

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Verification remains at 98%.
- Conversation execution timeline quality improved with exact row-level
  approval attachment.

Completed:

- Extended `ExecutionTimelineItem` with pending approval metadata.
- Added an `Approval pending` badge and optional row-level approval render slot
  inside `ExecutionTimeline`.
- Updated Chat execution rendering so a pending approval is attached to the
  exact matching tool row by `pendingTool`, falling back to the last tool only
  when no exact match exists.
- Removed the separate group-level approval card rendering path for tool-group
  approvals.
- Expanded Playwright pending-approval coverage so the browser verifies a
  `git_add` approval on the `git_add` execution row, plus composer lockout and
  no visible horizontal overflow.

Files changed:

- `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`
- `apps/desktop/src/components/conversation/ExecutionTimeline.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx src/chatRenderItems.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Desktop timeline/grouping tests passed: 6 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 4 tests.

Next recommended task:

- Continue live workflow QA by exercising queued follow-ups and project-context
  answers in a running Conversation session.

### 2026-06-13 Session Update 114

Phase:

Phase 8: Product Hardening And Distribution

Status change:

- Verification remains at 98%.
- Conversation input workflow state handling improved for restored running
  sessions and queued follow-ups.

Completed:

- Extended composer notice and input-state helpers so restored
  `workflowState.status` values of `planning` or `running` are treated as busy
  even when the local React `busy` flag is false.
- Restored running workflows now show the Working notice, disable textarea,
  Send, attachment, and model selector controls, and still allow suggestion
  buttons to queue a follow-up.
- Added browser coverage for selecting a suggestion while a restored workflow is
  running, showing the queued follow-up notice, cancelling it, and preserving
  no visible horizontal overflow.

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Desktop focused composer/suggestion tests passed: 28 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 5 tests.

Next recommended task:

- Continue live workflow QA by validating project-context answers and source
  references in a running Conversation session.

### 2026-06-13 Session Update 115

Phase:

Phase 2: Repository Understanding

Status change:

- Verification remains at 98%.
- Repository-understanding source grounding improved for architecture and
  project-context answers.

Completed:

- Extended `chatContextSources` so project-structure signals become structured
  `source_document` references, not only prompt text.
- Architecture/project-understanding answers can now receive source references
  for app/package/source/test files even when the user did not ask about Git
  changes and no diff exists.
- Extended `repo_refresh_index` tool results with `contextSources` so an agent
  that refreshes the repository index has normalized source references ready to
  copy into final answer metadata.
- Updated the refresh-index instruction to tell the planner to copy relevant
  `contextSources` into final `sources`.

Files changed:

- `packages/core/src/chatContext.ts`
- `packages/core/test/chatContext.test.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatContext.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Core chat context tests passed: 5 tests.
- Core typecheck passed.
- Daemon chat workflow tests passed: 19 tests.
- Daemon typecheck passed.

Next recommended task:

- Add browser or route-level QA for a project architecture prompt to verify the
  final Conversation UI shows these `source_document` references as cards.

### 2026-06-13 Session Update 129

Phase:

Phase 8: Product Hardening And Distribution / Conversation Artifact Workspace

Status change:

- Verification remains at 98%.
- Conversation PR insight artifacts are now usable from the Chat result
  workspace, not only from Pull Requests or Activity surfaces.

Completed:

- Completed the F10.4 persisted PR insight artifact loading batch.
- Saved PR insight source metadata in assistant details can now open the
  Conversation Result workspace.
- The workspace loads the persisted PR insight artifact record through the
  active Project Link and renders it as a markdown report.
- Loading and lookup-error states are visible in the workspace.
- Ordinary artifact shells without inline content no longer accidentally call
  the PR insight artifact lookup route.
- Replaced fragile local lookup cancellation with request-id tracking so
  persisted artifact responses are not dropped by React effect cleanup during
  development/browser QA.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Playwright Chat layout suite passed: 10 tests.
- Desktop typecheck passed.

Next recommended task:

- Continue F10.5 with Mermaid rendering and artifact actions: safe diagram
  rendering, copy/export affordances, render-error states, and Playwright
  coverage.

### 2026-06-13 Session Update 130

Phase:

Phase 8: Product Hardening And Distribution / Conversation Artifact Workspace

Status change:

- Verification remains at 98%.
- Conversation artifact workspace moved forward from source-only Mermaid
  display to real diagram rendering with browser-covered error fallback.

Completed:

- Added `mermaid` to the desktop app dependencies.
- Implemented dynamic Mermaid rendering in the Conversation Result workspace so
  architecture and PR insight diagram artifacts render as SVG without forcing
  the base Chat bundle to eagerly load the diagram library.
- Kept Mermaid source visible below the rendered diagram.
- Added clear Mermaid parse/render error UI that preserves source visibility.
- Preserved the artifact copy-content action for Mermaid, markdown, text, and
  persisted PR insight report content.
- Hardened the Playwright overflow helper against a one-time Vite page reload
  while newly optimized dependencies are being served.

Files changed:

- `apps/desktop/package.json`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`
- `pnpm-lock.yaml`

Tests run:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Playwright Chat layout suite passed: 11 tests.
- Desktop typecheck passed.

Next recommended task:

- Finish the remaining artifact action edge with export/save behavior, or move
  to F7.1 visual-system polish if export should wait for packaging and Tauri
  file-dialog hardening.

### 2026-06-13 Session Update 131

Phase:

Phase 8: Product Hardening And Distribution / Conversation Artifact Workspace

Status change:

- Verification remains at 98%.
- Conversation browser QA is now installed, runnable, and verified through the
  repository-local Playwright stack.
- F10.5 artifact actions are complete: rendered artifacts can now be copied or
  downloaded from the Conversation Result workspace.

Completed:

- Confirmed the root Playwright dependencies are installed and the pnpm lockfile
  is already synchronized.
- Installed or refreshed the Chromium browser binary for repository-local
  Playwright runs.
- Added browser download/export coverage for artifact workspace content,
  including the generated `.mmd` filename and downloaded Mermaid source.
- Verified that Mermaid rendering, Mermaid parse-error fallback, persisted PR
  insight loading, ordinary artifact bypass, copy action, and download action
  are all covered by the Chat layout suite.
- Ran a production desktop build after the Playwright and artifact-action
  verification pass.

Files changed:

- `apps/desktop/package.json`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`
- `package.json`
- `playwright.config.ts`
- `pnpm-lock.yaml`

Tests run:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe install
.\.tools\pnpm.exe exec playwright install chromium
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

Result:

- pnpm install reported the workspace was already up to date.
- Playwright Chromium install completed successfully.
- Playwright Chat layout suite passed: 11 tests.
- Desktop typecheck passed.
- Desktop production build passed.
- Vite still reports large chunk warnings from Mermaid/Shiki-related dynamic
  chunks, but the build succeeds.

Next recommended task:

- Move to `F7.2 Full visual system pass`: align response blocks, timeline rows,
  references, artifact workspace controls, and composer controls around the same
  restrained workbench visual language.

### 2026-06-13 Session Update 132

Phase:

Phase 8: Product Hardening And Distribution / Conversation Visual System

Status change:

- Verification remains at 98%.
- F7.4 is now partially complete: timeline rows, approval evidence, composer
  input, model menu, branch menu, commit menu, and composer popover behavior
  have moved into the same restrained workbench visual language.

Completed:

- Used the `impeccable` product-register flow with `PRODUCT.md` to keep the pass
  focused on task-oriented developer-tool UI rather than decorative polish.
- Updated `ConversationPartRenderer` response blocks so grouped references,
  source cards, inline tool calls, inline approvals, artifact cards, and code
  controls share consistent surface layering, focus rings, compact radii, and
  current Result workspace language.
- Removed stale artifact-card copy that still described the Result workspace as
  a future plan.
- Updated `ExecutionTimeline` and `ApprovalEvidence` to use the same evidence
  block hierarchy as approvals and artifacts.
- Polished Result workspace panels and artifact action buttons so copy/download
  controls have consistent hover, focus, and active states.
- Adjusted composer/model controls and right-panel branch/commit menus to use
  the same radii, focus color, and surface vocabulary.
- Changed the input panel from `overflow: hidden` to `overflow: visible` with a
  local z-index so composer popovers are not clipped by the fixed input area.

Files changed:

- `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`
- `apps/desktop/src/components/conversation/ConversationPartRenderer.test.tsx`
- `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/index.css`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

Result:

- Focused conversation component tests passed: 4 files, 49 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 11 tests.
- Desktop production build passed.
- Vite still reports large chunk warnings from Mermaid/Shiki-related dynamic
  chunks, but the build succeeds.

Next recommended task:

- Finish the remaining F7.4 visual pass for suggestion chips, queued notices,
  command-chip edge states, and broader live visual screenshot review before
  moving into F8.1 streaming stability.

### 2026-06-13 Session Update 133

Phase:

Phase 8: Product Hardening And Distribution / Conversation Visual System

Status change:

- Verification remains at 98%.
- F7.4 visual-system polish is complete in the current tracker.
- The next active batch is `F8.1 Streaming stability pass`.

Completed:

- Polished suggestion chips and command chips with compact state indicators
  that distinguish composer-fill, workspace-action, and approval-gated actions
  without changing their behavior or accessible labels.
- Added `data-action-kind` hooks to suggestion and command chips so future
  browser/visual tests can target the intended interaction class directly.
- Polished queued/busy/approval composer notices with visible state dots,
  `data-composer-notice`, `aria-live`, and a consistent cancel button treatment.
- Preserved existing Playwright-visible text such as `Queued follow-up:` and
  command button names so current browser scenarios remain stable.

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

Result:

- SuggestionReplyBar focused tests passed: 29 tests.
- Focused conversation component tests passed: 4 files, 50 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 11 tests.
- Desktop production build passed.
- Vite still reports large chunk warnings from Mermaid/Shiki-related dynamic
  chunks, but the build succeeds.

Next recommended task:

- Start `F8.1 Streaming stability pass`: audit streaming merge/finalization for
  long markdown, reference streaming, tool output deltas, and scroll-state
  assumptions before changing behavior.

### 2026-06-13 Session Update 134

Phase:

Phase 8: Product Hardening And Distribution / Streaming UX Hardening

Status change:

- Verification remains at 98%.
- `F8.1 Streaming stability pass` advanced from planned/start state to 84% in
  the conversation frontend tracker.
- The streaming architecture now has a stable tool lifecycle identifier across
  planner events, daemon confirm-action events, UI chunks, and desktop tool
  bubbles.

Completed:

- Added optional `toolCallId` to chat tool lifecycle events so repeated
  same-name tools do not depend on tool name matching during streaming.
- Updated the UI chunk adapter to preserve explicit tool call ids for
  `tool-input-*`, `tool-output-delta`, `tool-output-available`, and
  `tool-output-error`.
- Added `toolCallId` to direct stored-approval execution paths, including the
  legacy yes/no confirmation path and the structured `/confirm-action` path.
- Updated desktop SSE parsing to recognize canonical `tool.completed` and
  `final` events when mapping result payloads.
- Made the Chat UI upsert tool bubbles from structured UI chunks instead of
  relying only on legacy `tool_start`/`tool_end` events.
- Added a regression test proving final metadata and sources still attach to
  the existing streamed assistant bubble after UI `text-end` has already
  stopped the visible stream.
- Fixed the real UI-stream ordering bug where an assistant answer could be
  duplicated when tool bubbles arrived between `text-end` and final `done`.
- Added a core UI-stream regression test proving repeated same-name tool calls
  keep distinct ids when explicit tool call ids are available.
- Added Playwright SSE coverage for a UI-chunk-only streamed tool lifecycle so
  the desktop app proves one final answer, tool evidence, and source references
  without relying on legacy tool events.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/src/chatUiStream.ts`
- `packages/core/test/chatUiStream.test.ts`
- `packages/daemon/src/chatSession.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/chatBubbles.test.ts`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatEvents.test.ts test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
git diff --check
```

Result:

- Desktop chat bubble focused tests passed: 22 tests.
- Core UI stream tests passed: 6 tests.
- Core typecheck passed.
- Core build passed and refreshed `dist` declarations for daemon consumers.
- Daemon chat event/server tests passed: 2 files, 55 tests.
- Daemon typecheck passed.
- Focused desktop conversation tests passed: 4 files, 65 tests.
- Desktop typecheck passed.
- Playwright Chat layout suite passed: 12 tests.
- `git diff --check` only reported existing LF/CRLF conversion warnings.

Next recommended task:

- Continue F8.1 with live long-answer/reference-streaming QA: simulate long
  markdown with sources, long-running tool output, cancellation, and resume
  finalization to prove the UI does not duplicate answers, lose references, or
  misplace tool output.

### 2026-06-13 Session Update 135

Phase:

Phase 8: Product Hardening And Distribution / Streaming UX Hardening

Status change:

- `F8.1 Streaming stability pass` advanced from 88% to 90% in the
  conversation frontend tracker.
- Streaming UX advanced from 88% to 90%.
- Conversation test coverage advanced from 94% to 95%.

Completed:

- Added a deduplicated desktop error-bubble path so a real daemon response that
  emits both legacy `error` events and UI-stream `error` chunks only creates
  one visible error.
- Updated UI-stream `error` chunks to release busy state, clear status text,
  clear the cancel handle, and restore the composer without requiring a legacy
  event to arrive afterward.
- Updated UI-stream `finish` chunks to clear UI-stream state and release the
  composer for UI-chunk-only terminal streams.
- Added Playwright coverage for duplicate legacy plus UI-stream errors,
  including partial streamed text preservation, single visible error rendering,
  Stop-button cleanup, composer re-enable, and overflow checks.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "deduplicates legacy and UI stream error events"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Desktop typecheck passed.
- Focused duplicate stream-error Playwright test passed.
- Full Playwright Chat layout suite passed: 14 tests.

Next recommended task:

- Continue F8.1 with live long-answer and resume streaming QA, then either add
  resumable finalization coverage if it can be represented without a live LLM
  dependency or move into the next Conversation workflow hardening slice.

### 2026-06-13 Session Update 136

Phase:

Phase 8: Product Hardening And Distribution / Streaming UX Hardening

Status change:

- `F8.1 Streaming stability pass` advanced from 90% to 92% in the
  conversation frontend tracker.
- Streaming UX advanced from 90% to 92%.
- Conversation test coverage advanced from 95% to 96%.

Completed:

- Added browser coverage for a long streamed markdown answer with source
  metadata and tool output arriving in the middle of the text stream.
- Fixed the bug exposed by that coverage: text deltas that arrive after a tool
  output card now append to the active streaming assistant bubble instead of
  creating a second assistant answer.
- Updated stream stopping/finalization to find the active streaming assistant
  bubble even when it is no longer the last bubble because tool evidence was
  inserted after it.
- Verified that the long streamed answer remains one response, source
  references render once, tool evidence renders once, the composer is restored,
  and the chat shell has no visible horizontal overflow.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "renders long streamed markdown with sources and tool output"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Focused long streamed markdown/source/tool-output Playwright test passed.
- Desktop typecheck passed.
- Full Playwright Chat layout suite passed: 16 tests.

Next recommended task:

- Continue F8.1 with real-backend/manual long-answer and resume streaming QA, or
  move into the next Conversation workflow hardening slice if the mockable
  streaming failure modes remain green.

### 2026-06-13 Session Update 137

Phase:

Phase 8: Product Hardening And Distribution / Streaming UX Hardening

Status change:

- `F8.1 Streaming stability pass` advanced from 92% to 93% in the
  conversation frontend tracker.
- Streaming UX advanced from 92% to 93%.

Completed:

- Added Playwright coverage proving a UI-stream-only response can finish without
  a legacy `done` event while still restoring the composer and hiding Stop.
- Kept the visible assistant answer stable for that terminal UI-stream-only
  path.
- Fixed the untracked desktop `api.test.ts` controller typing issue that was
  blocking full desktop typecheck, then verified the test itself still passes.

Files changed:

- `apps/desktop/src/api.test.ts`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-frontend-ux-progress-tracker.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/api.test.ts
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "releases the composer after a UI-stream-only finish"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Focused UI-stream-only finish Playwright test passed.
- Desktop typecheck passed.
- Desktop API streaming test passed: 1 test.
- Full Playwright Chat layout suite passed: 17 tests.

Next recommended task:

- Continue with real-backend/manual long-answer streaming QA and then shift
  back toward Conversation workflow breadth: project-context tool use,
  state-aware actions, and git/PR insight interactions.

### 2026-06-13 Session Update 138

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation workflow hardening resumed after the F8.1 mockable streaming
  failure modes reached stable coverage.
- Git workflow alignment improved by removing a remaining deterministic
  translator path from production chat fallback behavior.

Completed:

- Removed `translateIntent()` from `ChatPlanner` production offline fallback.
- The model-unavailable fallback now explicitly says no Git/PR workflow was
  inferred or executed, preserving the user's goal boundary instead of emitting
  canned `git_push` / `ado_create_pr` style step lists.
- Removed `git_intent_translator` from the read-only production capability
  classification set.
- Added planner regression coverage proving an unavailable model does not turn
  "push and create PR" into concrete Git/ADO steps or approval proposals.
- Added capability prompt coverage proving registered chat capabilities do not
  expose `git_intent_translator`.
- Updated the Git agent optimization document to record that the translator is
  retained only as an offline/test reference, not as production chat behavior.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/src/tools/capabilities.ts`
- `packages/core/test/chatPlannerApproval.test.ts`
- `packages/core/test/toolCapabilities.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts test/chatUseCases.test.ts test/toolCapabilities.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Focused core planner/use-case/capability tests passed: 3 files, 28 tests.
- Core typecheck passed.
- Core build passed.
- Daemon typecheck passed against the rebuilt core package.

Next recommended task:

- Continue reducing canned workflow behavior in Conversation by splitting
  `commit_flow` UI/state handling into more explicit state-aware actions, then
  verify PR insight/policy/work-item actions still use latest-active-PR fallback
  without requiring users to type PR IDs.

### 2026-06-13 Session Update 139

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Reduced another canned workflow surface in the Conversation right panel.
- The commit/push menu now routes through explicit state-aware frontend actions
  instead of a generic `commit_flow` action.

Completed:

- Replaced the frontend `WorkspaceAction` union member `commit_flow` with:
  - `prepare_commit`
  - `commit_and_push`
  - `push_branch`
- Kept backend API behavior explicit:
  - Commit maps to `prepare_commit` with `commitMode: "commit"`.
  - Commit and push maps to `prepare_commit` with `commitMode:
    "commit-push"`.
  - Push maps directly to `push_branch`.
- Added accessible action labels for right-panel commit controls so tests and
  users can distinguish the action boundaries.
- Added Playwright coverage that clicks the right-panel commit controls and
  verifies the exact `/chat/workflow-action` payloads.
- Updated the Git agent optimization document to mark the generic frontend
  `commit_flow` path as split.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes right-panel commit controls as explicit structured actions"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Desktop typecheck passed.
- Focused right-panel commit action Playwright test passed.
- Full Playwright Chat layout suite passed: 19 tests.

Next recommended task:

- Verify PR insight, policy, and work-item Conversation actions from the
  command chips/right panel use latest-active-PR fallback cleanly and present
  missing ADO mapping/auth states without asking users to manually fill PR IDs.

### 2026-06-13 Session Update 140

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- PR insight Conversation actions now have stronger evidence that they do not
  require users to manually type PR IDs for the common latest-active-PR path.

Completed:

- Updated daemon coverage so `check_pr_policy` and `list_pr_work_items` are
  tested without an explicit `pullRequestId`, forcing the same latest-active-PR
  fallback already used by `inspect_pr_insight`.
- Added Playwright coverage proving Conversation PR controls send structured
  workflow actions without a `pullRequestId`:
  - command chip `PR insight` -> `inspect_pr_insight`
  - command chip `ADO policy` -> `check_pr_policy`
  - right-panel `Work items` -> `list_pr_work_items`
- Confirmed the frontend does not ask for or inject a PR ID in those controls;
  the daemon remains responsible for resolving the latest active PR from Azure
  DevOps.
- Updated the Git agent optimization document with this PR follow-up behavior.

Files changed:

- `packages/daemon/test/server.test.ts`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts -t "latest active PR fallback"
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes PR insight controls without requiring a typed PR id"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Daemon HTTP test suite passed: 45 tests.
- Desktop typecheck passed.
- Daemon typecheck passed.
- Focused PR-control Playwright test passed.
- Full Playwright Chat layout suite passed: 20 tests.

Next recommended task:

- Add explicit missing-state coverage for PR follow-up controls: Project Link
  without ADO mapping and ADO authentication failure should surface clear
  Conversation errors without asking users to fill low-level parameters.

### 2026-06-13 Session Update 141

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- PR follow-up Conversation failure states are now more product-ready for the
  two most important blocked states: incomplete Project Link mapping and Azure
  DevOps OAuth/token failure.

Completed:

- Added a structured workflow-action failure formatter for `/chat/workflow-action`.
- ADO PR workflow action failures now preserve auth diagnostics in the response
  and `workflowState`:
  - `authStatus`
  - `authMode`
  - `authMessage`
  - `retryable`
  - `workflowPhase: "auth_required"` for auth failures
- OAuth-unavailable PR workflow failures now return HTTP 401 with
  `currentStep: "Azure DevOps OAuth unavailable"` instead of a generic
  workflow failure.
- Kept missing Project Link mapping as a normal failed workflow state with a
  clear summary explaining which ADO fields are missing.
- Extended the shared chat workflow state and desktop workflow state typings so
  Conversation can carry ADO auth diagnostics without lossy casts.
- Updated the right-side Progress details so failed ADO workflow states can show
  the human-readable auth message and whether the issue is retryable.
- Added daemon regression coverage proving OAuth-unavailable PR actions surface
  structured diagnostics without telling the user to configure a PAT fallback.
- Updated the Git agent optimization document to mark structured ADO failure
  states as implemented.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `packages/core/src/chatPlanner.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Daemon HTTP test suite passed: 47 tests.
- Daemon typecheck passed.
- Desktop typecheck passed.
- Core typecheck passed.
- Full Playwright Chat layout suite passed: 20 tests.

Next recommended task:

- Continue the Conversation workflow breadth pass by adding a dedicated
  validation workflow state for build/test execution: initialization, running,
  passed, failed, and recommended follow-up.

### 2026-06-13 Session Update 142

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation validation moved from generic prompt/tool behavior toward a
  structured CI workflow with explicit approval and progress state.

Completed:

- Added a constrained `validation_command` core tool for Project Link build/test
  commands.
- Registered `validation_command` in the chat runtime so Conversation approval
  proposals can execute it.
- Added `/chat/workflow-action` actions:
  - `run_tests`
  - `run_build`
- `run_tests` and `run_build` now inspect lightweight workspace state and create
  a medium-risk approval proposal instead of executing immediately.
- The proposal reuses the selected Project Link's configured `testCommand` or
  `buildCommand`, with safe defaults when no command is configured.
- Added deterministic post-confirmation CI completion:
  - `ci/test_passed`
  - `ci/test_failed`
  - `ci/build_passed`
  - `ci/build_failed`
- Added CI workflow state rendering in the right-side Progress panel:
  inspect workspace, approve validation, run validation, review result.
- Changed command chips so `Run tests` starts `run_tests` as a structured
  workflow action instead of inserting text into the composer.
- Changed the welcome `Run tests` chip to do the same, preserving the earlier
  fix that workflow controls should not send hidden natural-language prompts.
- Extended approval evidence rendering to show `ci:test` and `ci:build`
  boundaries and command previews.
- Added daemon regression coverage for `run_tests` approval proposals.
- Updated desktop command chip tests and Playwright layout coverage for the new
  structured validation behavior.

Files changed:

- `packages/core/src/tools/validation.ts`
- `packages/core/src/index.ts`
- `packages/core/src/chatPlanner.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Core build passed.
- Core typecheck passed.
- Daemon typecheck passed.
- Desktop typecheck passed.
- Daemon HTTP test suite passed: 48 tests.
- Desktop SuggestionReplyBar tests passed: 29 tests.
- Full Playwright Chat layout suite passed: 20 tests.

Next recommended task:

- Improve validation intelligence by selecting focused test/build commands from
  repo context and changed files, then preserve failing output as a structured
  Conversation artifact instead of only showing raw tool output.

### 2026-06-13 Session Update 143

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation validation gained a stronger agent-style preflight layer:
  validation actions now explain which command will run, where it came from,
  which changed files were considered, and what failed when the command exits
  non-zero.

Completed:

- Added validation preflight metadata to pending approval proposals:
  - validation kind: `test` or `build`
  - selected command
  - command source: override, Project Link profile, or default
  - changed files gathered from `git diff --name-only` and porcelain status
  - compact summary for the approval card/right-panel workflow state
- Extended `/chat/workflow-action` validation probes to include changed-file
  discovery before creating `run_tests` or `run_build` approvals.
- Added structured failure summaries to `validation_command` results:
  - `summary`
  - `failure_excerpt`
- Updated deterministic post-confirmation CI responses so failed test/build
  workflows include the concise failure excerpt instead of forcing users to
  inspect raw tool output first.
- Fixed Windows validation execution for `npm`/`pnpm.cmd` style runners by
  wrapping only validation command shims through `cmd.exe /d /s /c`; generic Git
  command execution remains shell-free.
- Added core regression coverage for failed validation output extraction.
- Extended daemon coverage so `run_tests` approvals prove profile command
  selection and changed-file preflight.
- Updated the Git agent optimization document with the current validation
  workflow status and remaining gaps.

Files changed:

- `packages/core/src/tools/validation.ts`
- `packages/core/test/validationTools.test.ts`
- `packages/core/src/chatPlanner.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/validationTools.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts
```

Result:

- Core validation tool test passed: 1 test.
- Core typecheck passed.
- Desktop typecheck passed.
- Core build passed.
- Daemon typecheck passed.
- Daemon HTTP test suite passed: 48 tests.
- Desktop SuggestionReplyBar tests passed: 29 tests.
- Full Playwright Chat layout suite passed: 20 tests.

Next recommended task:

- Continue validation intelligence by deriving focused test/build commands from
  repo metadata, changed paths, package/workspace ownership, and known test
  framework conventions, then render failed validation as a first-class
  Conversation artifact.

### 2026-06-13 Session Update 144

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Validation command selection now has an initial package-aware derivation path
  instead of only using explicit Project Link commands or root-level defaults.

Completed:

- Added `derived` as a validation command source in shared approval/preflight
  types.
- Added daemon-side package ownership detection for validation actions:
  - inspect changed files from Git status/diff
  - find the nearest owning `package.json`
  - select a matching `test`, `test:unit`, `vitest`, or `build` script
  - use pnpm workspace filters when a pnpm workspace and local wrapper are
    available
  - fall back to `npm --prefix <package> run <script>` for package-local npm
    execution
- Kept explicit user overrides and Project Link `testCommand`/`buildCommand`
  higher priority than derived commands.
- Added daemon regression coverage proving a changed file under
  `packages/core` derives `npm --prefix packages/core run test` when no
  Project Link test command is configured.
- Updated the Git agent optimization document to show that validation now has
  single-package command derivation, while multi-package selection remains a
  future gap.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/validationTools.test.ts
```

Result:

- Daemon HTTP test suite passed: 49 tests.
- Daemon typecheck passed after rebuilding core declarations.
- Desktop typecheck passed.
- Core build passed.
- Core typecheck passed.
- Core validation tool test passed: 1 test.

Next recommended task:

- Extend validation derivation from the single-package case to multi-package
  changes and root/package mixed changes, then expose the selected validation
  scope more explicitly in the Conversation approval UI.

### 2026-06-13 Session Update 145

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Validation command derivation now covers compatible multi-package pnpm
  workspace changes, reducing unnecessary root-level validation when multiple
  packages are touched.

Completed:

- Extended daemon validation derivation from the single-package case to the
  compatible multi-package case.
- Multi-package derivation now:
  - finds changed files' nearest `package.json` owners
  - requires every touched package to expose the same selected validation script
  - requires package names for every touched package
  - requires a pnpm workspace plus repository-local `pnpm-project.ps1`
  - generates one approval command with repeated pnpm `--filter` selectors
- Left unsafe or ambiguous cases as fallback behavior instead of generating
  shell command chains.
- Added daemon regression coverage for two changed pnpm workspace packages
  producing:
  `.\scripts\windows\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core test`
- Updated the Conversation Git agent optimization document to mark compatible
  multi-package derivation as implemented and narrow the remaining validation
  gap to richer framework-specific selection and artifact rendering.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
```

Result:

- Daemon HTTP test suite passed: 50 tests.
- Daemon typecheck passed.
- Core typecheck passed.

Next recommended task:

- Expose validation scope in the approval UI more clearly: package filters,
  selected script, changed-file count, and why the agent selected that command.

### 2026-06-13 Session Update 146

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Validation approvals now expose their selection evidence in the Conversation
  approval card, making test/build approvals easier to audit before execution.

Completed:

- Extended validation preflight metadata with:
  - `changedFileCount`
  - `selectedScript`
  - `packageFilters`
  - `packageRoots`
  - `selectionReason`
- Populated these fields from derived validation command selection in the
  daemon.
- Preserved existing command priority:
  - explicit validation override
  - Project Link test/build command
  - derived package/workspace command
  - root-level default
- Updated desktop `ApprovalEvidence` so validation approvals render structured
  scope rows instead of hiding all selection details inside a summary sentence.
- Added desktop regression coverage for validation approval evidence rendering.
- Extended daemon validation tests so derived single-package and multi-package
  approvals assert scope metadata.
- Fixed a stale TypeScript incremental cache issue by clearing generated
  `tsconfig.tsbuildinfo` files after core declaration changes; core build and
  daemon typecheck then passed.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.test.tsx`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Desktop ApprovalEvidence tests passed: 4 tests.
- Daemon HTTP test suite passed: 50 tests.
- Core typecheck passed.
- Core build passed using repository-local `.tools` Node/pnpm.
- Desktop typecheck passed using repository-local `.tools` Node/pnpm.
- Daemon typecheck passed after clearing stale TypeScript incremental cache and
  rebuilding core declarations.

Note:

- The managed sandbox blocked Node from reading `node_modules/.pnpm` TypeScript
  files. Verification commands were rerun through the repository-local
  `.tools` toolchain with approved elevated execution.

Next recommended task:

- Turn validation failures into richer Conversation artifacts so users can see
  failing command, package scope, key output excerpt, and suggested next action
  without opening raw tool output.

### 2026-06-13 Session Update 147

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Failed test/build confirmations now produce structured Conversation artifacts
  instead of forcing users to inspect raw tool output.

Completed:

- Added `artifacts` to the core `ChatPlannerResult` contract and regenerated
  core declaration output.
- Extended desktop assistant metadata handling so planner/daemon artifacts are:
  - parsed from metadata chunks
  - merged into existing assistant bubbles
  - appended as `artifact` conversation parts
  - preserved when loading saved chat history
- Added daemon validation failure artifact generation for confirmed
  `validation_command` actions.
- The generated validation artifact includes:
  - command
  - exit code
  - duration
  - command source
  - selected script
  - package filters and package roots
  - changed-file count
  - key failure excerpt
  - stdout/stderr excerpts
- Kept successful validation confirmations lightweight; they do not create an
  artifact unless there is failure content worth inspecting.
- Added regression coverage for desktop artifact metadata mapping and daemon
  validation failure artifact generation.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/core/dist/chatPlanner.d.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/chatBubbles.ts`
- `apps/desktop/src/chatBubbles.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Desktop chat bubble tests passed: 23 tests.
- Daemon chat session workflow tests passed: 20 tests.
- Core build passed.
- Desktop typecheck passed.
- Daemon typecheck passed after clearing stale TypeScript incremental cache and
  rebuilding core declarations.

Note:

- The first normal sandbox test attempt could not resolve workspace Vitest
  links. Verification was rerun through the repository-local `.tools` Node/pnpm
  toolchain with approved elevated execution.

Next recommended task:

- Use the validation failure artifact as input for the next recovery turn:
  suggest targeted reruns, likely failing files, and safe follow-up actions
  based on the artifact content and changed-file context.

### 2026-06-13 Session Update 148

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Validation failure artifacts now drive the next recovery interaction instead
  of only sitting in the Result workspace.

Completed:

- Added CI-specific suggestion replies after failed validation workflows:
  - analyze failure
  - rerun tests or rerun build
  - review changed files against the failure
- Mapped rerun suggestions to structured workspace actions:
  - `run_tests`
  - `run_build`
  - `inspect_changes`
- Added daemon-side validation artifact context injection:
  - detects user follow-up messages about validation, tests, builds, failure,
    retry, rerun, fix, or analysis
  - finds the latest validation markdown artifact in the current chat session
  - injects a capped artifact summary into the next planner prompt
  - explicitly tells the agent not to rerun validation unless the user asks
- Added focused regression coverage for CI suggestion replies and validation
  artifact context formatting.
- Added `output/` to `.gitignore` so Playwright screenshots and local reports
  stay out of future commits.

Files changed:

- `.gitignore`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\.tools\pnpm.exe --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
```

Result:

- Desktop SuggestionReplyBar tests passed: 31 tests.
- Daemon chat session workflow tests passed: 25 tests.
- Desktop typecheck passed.
- Daemon typecheck passed.

Note:

- Local Vite/daemon Node processes were holding native modules open, which
  prevented pnpm from repairing workspace links. Those repo-local processes
  were stopped, then `.\.tools\pnpm.exe install --frozen-lockfile` restored
  pnpm links and test shims.

Next recommended task:

- Use the recovery signals in the next agent decision step so failed validation
  follow-ups can choose between source investigation, focused rerun, or broader
  validation based on the captured failure type.

### 2026-06-13 Session Update 149

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Validation failure artifacts now include initial framework-specific recovery
  signals, moving failed test/build recovery closer to agent-style diagnosis
  instead of generic rerun prompts.

Completed:

- Added validation failure signal extraction for common failure output shapes:
  - Vitest/Jest test files such as `.test.tsx` and `.spec.ts`
  - pytest node ids such as `tests/test_api.py::test_case`
  - dotnet project files, compiler diagnostics, and failed test names
- Added recovery signal sections to failed validation artifacts:
  - likely framework
  - failing files
  - failing tests
  - candidate focused rerun commands
  - compact diagnostics
- Added focused tests for Vitest, pytest, and dotnet extraction behavior.
- Fixed dotnet failed-test extraction so project filenames are not mistaken for
  test names when the failure output spans multiple lines.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
```

Result:

- Daemon chat session workflow tests passed: 25 tests.
- Desktop SuggestionReplyBar tests passed: 31 tests.

Next recommended task:

- Extend the same recovery guidance into frontend affordances and future
  validation action derivation so failed validation can present focused rerun
  options without relying on broad preset workflows.

### 2026-06-13 Session Update 150

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Extracted validation recovery signals are now promoted into planner-priority
  context for the next Conversation turn, instead of only being embedded in the
  human-readable failure artifact.

Completed:

- Added a dedicated Validation Recovery Guidance block to validation follow-up
  context.
- The planner is now instructed to:
  - inspect failing files, failing tests, and diagnostics first for analyze/fix
    requests
  - prefer candidate focused rerun commands for retry/rerun requests
  - avoid repeating the exact failed command with the same arguments unless the
    user explicitly asks for a full rerun or no focused candidate exists
  - keep source edits and repository writes behind normal approval proposals
- Added regression coverage so validation follow-up context must include the
  planner-priority guidance and focused-rerun instruction.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Daemon chat session workflow tests passed: 25 tests.
- Daemon typecheck passed.

Next recommended task:

- Extend focused validation recovery into the UI details and agent summaries so
  users can see why a rerun command was selected from a previous failure.

### 2026-06-13 Session Update 151

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Structured validation rerun actions now consume focused rerun candidates from
  the latest matching validation failure artifact, instead of always falling
  back to profile, derived, or default validation commands.

Completed:

- Added `artifact` as a validation command source in shared chat planner and
  desktop approval evidence types.
- Updated workspace workflow preflight so `run_tests` and `run_build`:
  - inspect the current session for the latest matching failed validation
    artifact
  - extract the first `Candidate rerun` command from its Recovery Signals
  - use that focused command as the approval proposal command
  - fall back to the existing profile, derived, or default command path when no
    matching artifact candidate exists
- Added route-level daemon tests proving:
  - `run_tests` uses a matching test failure artifact candidate rerun
  - `run_build` ignores test failure artifacts and keeps the build command
    source from the profile
- Repaired local pnpm dependency links with a force install after Fastify's
  `fast-json-stringify` dependency chain was missing AJV junctions.

Files changed:

- `packages/core/src/chatPlanner.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\.tools\pnpm.exe install --frozen-lockfile --force
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
```

Result:

- Daemon server tests passed: 52 tests.
- Daemon chat session workflow tests passed: 25 tests.
- Core, daemon, and desktop typecheck passed.

Next recommended task:

- Continue toward PR/CI insight workflows that combine validation artifacts,
  PR policy, work-item context, and review history in one Conversation path.

### 2026-06-13 Session Update 152

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Artifact-sourced validation rerun approvals are now clearer in the UI, so
  users can see that a rerun command came from the previous failure report
  rather than from a generic profile/default command.

Completed:

- Updated validation approval evidence display so `commandSource: artifact`
  renders as `failure artifact`.
- Added frontend regression coverage for artifact-sourced validation approval
  evidence.
- Re-ran desktop typecheck after tightening the validation preflight union type.

Files changed:

- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.test.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Desktop ApprovalEvidence tests passed: 5 tests.
- Desktop typecheck passed.

Next recommended task:

- Extend PR/CI readiness answers so saved PR AI insight artifacts, policy/work
  item workflow results, and validation failure artifacts are summarized as one
  readiness model instead of separate context sections.

### 2026-06-13 Session Update 153

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- PR/CI readiness turns now receive recent validation failure context even when
  the user asks in PR language rather than explicit test/build language.

Completed:

- Extended validation artifact context detection to include PR readiness,
  approval, blocker, merge, CI, pipeline, policy, review queue, and linked work
  item questions when they also mention a PR or pull request.
- Added planner guidance for PR/CI readiness turns:
  - combine validation failure artifacts with saved PR AI insight
  - consider policy status, linked work items, builds, and review history before
    recommending approval or merge readiness
- Added regression coverage proving PR readiness questions inject the latest
  validation failure artifact and preserve the combined readiness guidance.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Daemon chat session workflow tests passed: 26 tests.
- Daemon typecheck passed.

Next recommended task:

- Carry the compact readiness context into visible Conversation metadata and
  right-panel PR/CI progress so users can see which signals drove the answer.

### 2026-06-13 Session Update 154

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Saved PR insight artifacts now provide a compact planner-facing readiness
  summary before their detailed artifact history.

Completed:

- Added a `PR Readiness Context` section to saved PR insight context.
- The compact section summarizes:
  - readiness state
  - decision queue, risk, and context confidence
  - changed-file, thread, failed-build, and work-item signal counts
  - blocking categories and top risks
- Expanded saved PR insight context triggering to include readiness, policy,
  work item, CI, and pipeline wording, not only direct "PR insight" phrasing.
- Added regression coverage for:
  - readiness summary formatting
  - policy/readiness phrasing loading saved PR insight context

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Daemon chat session checkpoint tests passed: 11 tests.
- Daemon typecheck passed.

Next recommended task:

- Continue right-panel PR/CI progress improvements so the Environment panel can
  show readiness blockers and direct actions without relying only on chat chips.

### 2026-06-13 Session Update 155

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation follow-up suggestions now reflect PR/CI readiness blockers by
  prioritizing validation recovery, policy checks, and linked work items.

Completed:

- Updated PR workflow suggestion derivation:
  - normal PR context still suggests PR risks, policy status, and work items
  - PR readiness/CI blocker context now suggests validation recovery first
  - policy and work-item actions stay visible in the three-chip limit
- Added frontend regression coverage for blocked PR readiness suggestions.

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Desktop SuggestionReplyBar tests passed: 32 tests.
- Desktop typecheck passed.

Next recommended task:

- Continue tightening Conversation UI around PR/CI readiness by connecting
  right-panel blocker steps to direct actions where possible.

### 2026-06-13 Session Update 156

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- The right-side workflow panel can now surface PR/CI readiness blockers from
  direct workflow action summaries.

Completed:

- Added a local `workflowSummary` field for frontend workflow state derived from
  direct workflow action responses.
- Added PR workflow panel logic that detects:
  - failed/canceled builds or validation failure wording
  - failed/error policy evaluations
  - missing linked work items
- The PR workflow panel now adds focused progress steps such as:
  - `Review CI blockers`
  - `Check policy blockers`
  - `Review work items`
- Added focused frontend tests for PR readiness blocker panel steps and the
  normal PR policy flow.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/ChatWorkflowState.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatWorkflowState.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Desktop ChatWorkflowState tests passed: 2 tests.
- Desktop typecheck passed.

Next recommended task:

- Continue hardening right-panel PR/CI action wiring with visual verification
  against the running desktop UI.

### 2026-06-13 Session Update 157

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Right-panel PR readiness blocker steps now carry direct workspace actions.

Completed:

- Added optional actions to right-panel workflow steps.
- Wired PR readiness blocker steps to existing workspace actions:
  - `Review CI blockers` -> `run_tests`
  - `Check policy blockers` -> `check_pr_policy`
  - `Review work items` -> `list_pr_work_items`
- Rendered actionable progress steps as clickable text buttons, disabled while
  a workflow is busy.
- Extended Chat workflow state tests to prove blocker steps expose the expected
  actions.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/ChatWorkflowState.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatWorkflowState.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Desktop ChatWorkflowState tests passed: 2 tests.
- Desktop typecheck passed.

Next recommended task:

- Continue PR/CI readiness hardening by adding richer metadata from live policy,
  work-item, and validation results into saved/readable artifacts.

### 2026-06-13 Session Update 158

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Right-panel PR readiness blocker actions have browser-level coverage.

Completed:

- Extended the existing Chat layout Playwright spec so a blocked PR insight
  response displays right-panel blocker steps.
- Verified the blocker steps route to structured workspace actions:
  - `Review CI blockers` sends `run_tests`
  - existing PR policy and work-item controls still send `check_pr_policy` and
    `list_pr_work_items` without requiring a typed PR id
- Re-ran related frontend unit tests and layout overflow checks.

Files changed:

- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes PR insight controls" --project=chromium
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatWorkflowState.test.ts src/components/conversation/SuggestionReplyBar.test.tsx
git diff --check
```

Result:

- Playwright PR insight/right-panel smoke passed: 1 test.
- Desktop focused tests passed: 34 tests.
- `git diff --check` passed with CRLF warnings only.

Next recommended task:

- Add richer PR readiness metadata to artifacts or workflow summaries so future
  Conversation turns can cite exact policy/work-item/validation blockers more
  precisely.

### 2026-06-13 Session Update 159

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Workflow PR insight summaries now include exact readiness blocker details,
  not only counts.

Completed:

- Added compact formatter helpers for PR readiness signals from:
  - failed or canceled builds
  - failed policy evaluations
  - active review threads
  - linked work items
- Extended `inspect_pr_insight` summaries with lines such as:
  - `Blocking builds: ...`
  - `Policy blockers: ...`
  - `Active threads: ...`
  - `Linked work items: ...`
- Preserved the existing readiness count line so frontend follow-up detection
  and right-panel PR blocker steps continue to work.
- Added daemon regression coverage proving a PR insight workflow response can
  cite the exact failed build, blocking policy, active thread, and missing
  linked work-item signal.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Daemon server tests passed: 52 tests.
- Daemon typecheck passed.

Next recommended task:

- Persist the exact PR readiness blocker details as structured PR insight
  artifact metadata so later Conversation turns can retrieve and reason over
  them without reparsing prose summaries.

### 2026-06-13 Session Update 160

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- PR insight artifacts can now preserve exact readiness blocker metadata as
  structured signals.

Completed:

- Extended PR insight `signals` metadata with optional structured arrays for:
  - `buildBlockers`
  - `policyBlockers`
  - `activeThreads`
  - `linkedWorkItems`
  - `failedPolicyCount`
- Updated the daemon PR insight preview endpoint to fetch policy evaluations
  and linked work-item details alongside threads, changes, and builds.
- The preview endpoint now returns exact blocker metadata while retaining the
  existing count fields used by older UI code.
- Updated the PR insight artifact persistence schema so saved artifacts keep
  the richer signal details.
- Updated desktop and core artifact types/tests so local artifact storage
  preserves those metadata fields.

Files changed:

- `apps/desktop/src/api.ts`
- `apps/desktop/src/prInsightArtifacts.test.ts`
- `packages/core/src/prInsightArtifactsLocal.ts`
- `packages/core/test/prInsightArtifactsLocal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/prInsightArtifactsLocal.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/prInsightArtifacts.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Daemon server tests passed: 52 tests.
- Daemon typecheck passed.
- Core PR insight artifact tests passed: 6 tests.
- Core build passed.
- Desktop PR insight artifact tests passed: 6 tests.
- Desktop typecheck passed.

Next recommended task:

- Feed the structured PR insight artifact metadata into Conversation context
  retrieval so follow-up turns can cite exact build, policy, thread, and
  work-item blockers without reparsing summary text.

### 2026-06-13 Session Update 161

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation PR insight context now consumes structured artifact blocker
  metadata directly.

Completed:

- Updated `formatPrInsightArtifactsForChat` so saved PR insight context
  includes `failedPolicies` alongside the existing file/thread/build/work-item
  counts.
- Added exact blocker evidence lines to Conversation context prompts:
  - `Build blockers: ...`
  - `Policy blockers: ...`
  - `Active threads: ...`
  - `Linked work items: ...`
- Added compact exact-blocker snippets to the top `PR Readiness Context` line
  so the planner sees concrete blockers before the longer saved insight body.
- Added daemon regression coverage proving saved PR insight artifacts inject
  exact build, policy, and thread blocker details into chat context.

Files changed:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionCheckpoint.test.ts`
- `docs/conversation-git-agent-optimization.md`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionCheckpoint.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
```

Result:

- Daemon chat session checkpoint tests passed: 11 tests.
- Daemon typecheck passed.

Next recommended task:

- Surface the same structured PR readiness blocker metadata in Activity/PR
  insight detail views, while keeping Conversation as the primary workflow
  surface.

### 2026-06-13 Session Update 162

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Activity PR insight details now display structured readiness blocker
  metadata for saved artifacts.

Completed:

- Added Activity detail formatting for saved PR insight blocker metadata:
  - build blockers
  - policy blockers
  - active threads
  - linked work items
- Extended the PR insight signal cards with failed policy and work-item counts.
- Kept Activity as a historical detail surface while preserving Conversation as
  the primary workflow and follow-up action surface.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Desktop typecheck passed.

Next recommended task:

- Add focused rendering coverage for the Activity PR insight detail panel, then
  continue Conversation workflow hardening around PR insight follow-up actions.

### 2026-06-13 Session Update 163

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Saved PR insight blocker metadata now has focused frontend rendering coverage
  in both Activity and Chat artifact workspace paths.

Completed:

- Extracted the Activity PR insight readiness blocker section into a focused
  `PrInsightReadinessBlockers` component.
- Added a rendering test proving Activity detail views show structured build,
  policy, thread, and work-item blocker metadata.
- Extended saved PR insight workspace markdown in Chat so opening a saved
  artifact includes:
  - failed policy count
  - build blockers
  - policy blockers
  - active threads
  - linked work items
- Added a focused Chat markdown regression test for the saved PR insight
  artifact workspace path.

Files changed:

- `apps/desktop/src/pages/TaskViewer.tsx`
- `apps/desktop/src/pages/TaskViewer.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/ChatPrInsightArtifact.test.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatPrInsightArtifact.test.ts src/pages/TaskViewer.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Focused desktop rendering tests passed: 3 tests.
- Desktop typecheck passed.

Next recommended task:

- Continue Conversation workflow hardening by making PR readiness follow-up
  suggestions prefer structured saved artifact metadata when available.

### 2026-06-13 Session Update 164

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation PR readiness suggestions now prefer direct follow-up actions
  when structured saved artifact metadata exposes exact blockers.

Completed:

- Updated PR workflow suggestion derivation so structured saved metadata such
  as `Build blockers: ...`, `Policy blockers: ...`, and `workItems=0` maps to
  direct workspace actions.
- Exact build blockers now suggest `Rerun validation` with the `run_tests`
  workspace action.
- Exact policy blockers now suggest `Policy status` with the
  `check_pr_policy` workspace action.
- Missing or linked work-item signals now suggest `Work items` with the
  `list_pr_work_items` workspace action.
- Kept the existing generic PR CI readiness flow unchanged when the context is
  prose-only and does not include structured blocker metadata.

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- SuggestionReplyBar tests passed: 33 tests.
- Desktop typecheck passed.

Next recommended task:

- Add an end-to-end Chat smoke that proves saved PR insight blocker metadata
  flows from artifact context into direct PR readiness follow-up suggestions.

### 2026-06-13 Session Update 165

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Added an end-to-end Chat regression path for saved PR insight blocker
  metadata and direct workflow actions.

Completed:

- Extended the saved PR insight e2e fixture with structured blocker metadata:
  failed build count, failed policy count, build blockers, policy blockers,
  active review threads, and missing work-item signal.
- Verified that loading a saved PR insight source shows direct follow-up
  actions derived from blocker metadata instead of generic prose-only prompts:
  `Rerun validation`, `Policy status`, and `Work items`.
- Verified that the saved artifact workspace renders exact blocker details
  from persisted metadata.
- Verified that the direct `Rerun validation` suggestion dispatches a
  structured workflow action instead of only inserting prompt text.

Files changed:

- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "loads a saved PR insight artifact source" --project=chromium
git diff --check
```

Next recommended task:

- Continue hardening Conversation workflow actions so each visible suggestion
  maps to a state-aware operation with clear idle/running/success/failure UI.

### 2026-06-13 Session Update 166

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Conversation suggestion actions now expose visible state instead of looking
  like static prompt chips during active workflows.

Completed:

- Added a state model for suggestion reply buttons: `idle`, `running`,
  `queued`, and `blocked`.
- Running workflows now mark visible suggestion actions as queueable with a
  pulsing state dot and `Queue` badge while keeping them clickable for the
  existing queued-follow-up behavior.
- Queued suggestions now show a `Queued` badge and disable duplicate clicks.
- Blocked workflows now show `Blocked` state and surface the workflow blocker
  reason in the button title.
- Wired Chat's current `busy`, workflow status, queued suggestion, and blocked
  reason into the suggestion bar.
- Added focused component coverage for state derivation and rendered
  running/queued/blocked button states.

Files changed:

- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/pages/Chat.tsx`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "loads a saved PR insight artifact source" --project=chromium
```

Result:

- SuggestionReplyBar tests passed: 36 tests.
- Desktop typecheck passed.
- Focused Chat Playwright e2e passed.

Next recommended task:

- Extend the same state-aware treatment to right-panel workflow step actions
  so branch, PR, validation, and recovery controls expose running/queued/blocked
  state consistently.

### 2026-06-13 Session Update 167

Phase:

Phase 8: Product Hardening And Distribution / Conversation Workflow Breadth

Status change:

- Right-panel Progress step actions now expose workflow-aware state instead of
  relying only on disabled text links.

Completed:

- Added a reusable right-panel step action state model:
  `idle`, `running`, `waiting`, `done`, and `blocked`.
- Active steps in a running workflow now show a `Running` badge and blue state
  marker.
- Other runnable steps now show `Wait` while a workflow is busy, avoiding
  unclear disabled buttons.
- Completed runnable steps show `Done` while staying reusable when the workflow
  is idle.
- Blocked workflows now mark step actions as `Blocked` and surface the current
  blocker reason in the action title.
- PR readiness follow-up steps are now sequential: only the first unresolved
  blocker is active while later blockers wait their turn.
- Added focused coverage for Progress step state derivation.
- Added focused Playwright coverage proving the right-panel Progress UI shows
  `Running` and `Wait` badges during an active PR readiness workflow.

Files changed:

- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/ChatWorkflowState.test.ts`
- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatWorkflowState.test.ts src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "shows right-panel PR readiness step states" --project=chromium
```

Result:

- Focused desktop tests passed: 39 tests.
- Desktop typecheck passed.
- Focused Chat Playwright e2e passed for right-panel PR readiness step states.

Next recommended task:

- Start first-class Chat CI/CD pipeline workflow coverage: inspect pipeline
  readiness, prepare trigger approval, and render pipeline workflow state
  without relying on generic PR insight or local validation actions.

### 2026-06-13 Session Update 168

Phase:

Phase 8: Product Hardening And Distribution / First-Class CI/CD Workflow

Status change:

- Chat now has a first first-class Azure DevOps pipeline workflow path instead
  of treating pipeline state only as PR insight metadata or local validation.

Completed:

- Added structured Chat workflow actions for `inspect_pipeline` and
  `trigger_pipeline`.
- `inspect_pipeline` reads recent Azure Pipeline runs through the internal ADO
  REST client and returns deterministic `ci/pipeline_inspected` workflow state.
- `trigger_pipeline` creates a high-risk `ado_trigger_pipeline` approval
  proposal instead of directly triggering a remote pipeline.
- Added pipeline ID support to the Chat workflow action API payload.
- Added pipeline readiness and run-trigger controls to the Conversation
  command chips and right-side Project Link action area.
- Updated right-panel CI task rendering so pipeline workflows show
  `Inspect pipeline`, `Review latest runs`, `Trigger pipeline`, and
  `Review run status` steps.
- Added pipeline trigger approval boundary copy so users can see that the
  approval only triggers the configured Azure DevOps pipeline.
- Added daemon, desktop workflow-state, and Playwright coverage for the new
  pipeline path.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `packages/core/src/chatPlanner.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/pages/ChatWorkflowState.test.ts`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/pages/ChatWorkflowState.test.ts src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes pipeline controls" --project=chromium
```

Result:

- Core build passed.
- Daemon server tests passed: 53 tests.
- Daemon typecheck passed after rebuilding core types.
- Focused desktop tests passed: 40 tests.
- Desktop typecheck passed.
- Focused Chat Playwright e2e passed for pipeline controls.

Next recommended task:

- Add pipeline run result artifacts and recovery suggestions so failed Azure
  Pipeline runs can feed the next Chat turn the same way local validation
  failure artifacts do.

### 2026-06-13 Session Update 169

Phase:

Phase 8: Product Hardening And Distribution / First-Class CI/CD Workflow

Status change:

- Failed Azure Pipeline inspection now produces Conversation evidence instead
  of only a plain status summary.

Completed:

- Extended `/chat/workflow-action` responses with optional Conversation
  artifacts so deterministic workflow actions can share the same evidence
  surface as streamed planner responses.
- Updated the Chat page to render workflow-action artifacts as assistant
  artifact parts, making failed remote CI evidence selectable in the Result
  workspace.
- Added a markdown failure artifact for `inspect_pipeline` when recent Azure
  Pipeline runs include failed or canceled runs.
- Added the internal `ado_get_build_timeline` Azure DevOps tool and use-case
  catalog entry so the agent can inspect failed task and issue details without
  relying on an external MCP bridge.
- `inspect_pipeline` now attempts to read the failed run's Azure Build
  Timeline and includes failed task records plus error issue messages in the
  artifact when Azure DevOps returns them.
- The artifact records the pipeline ID, run ID, branch, status, timestamps,
  URL, recent failed/canceled runs, failed timeline records, error issues, and
  recovery guidance.
- Workflow-action pipeline artifacts are now persisted as assistant bubbles in
  the daemon Chat session so follow-up turns can use the same evidence that was
  rendered in the Conversation UI.
- Follow-up CI, pipeline, build, rerun, retry, and PR readiness turns now inject
  the latest saved pipeline failure artifact into planner context with guidance
  to treat it as remote CI/CD evidence rather than a local validation failure.
- Updated CI follow-up suggestions so `ci/pipeline_inspected` failure evidence
  suggests `Analyze pipeline`, `Rerun pipeline`, and `Local validation` instead
  of treating the remote pipeline failure as a generic local test/build failure.
- `Rerun pipeline` now routes to the structured `trigger_pipeline` workflow
  action, preserving the high-risk approval boundary before remote CI is
  triggered.

Files changed:

- `packages/daemon/src/server.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/server.test.ts`
- `packages/daemon/test/chatSessionWorkflow.test.ts`
- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/core/src/chatUseCases.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/conversation-git-agent-optimization.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes pipeline controls" --project=chromium
git diff --check
```

Result:

- Focused suggestion tests passed: 37 tests.
- Chat workflow tests passed: 27 tests.
- Core build passed after adding the internal build-timeline ADO tool.
- Daemon server tests passed: 53 tests.
- Desktop typecheck passed.
- Daemon typecheck passed.
- Focused Chat Playwright e2e passed for pipeline controls and artifact
  rendering.
- `git diff --check` passed.

Next recommended task:

- Add Azure Pipeline run log extraction for failed timeline records so pipeline
  failure artifacts can include concise task log excerpts in addition to failed
  task names and issue messages.

### 2026-06-13 Session Update 170

Phase:

Phase 8: Product Hardening And Distribution / First-Class CI/CD Workflow

Status change:

- Failed Azure Pipeline inspection now includes concise failed-task log
  excerpts when Azure DevOps exposes log IDs from the build timeline.

Completed:

- Added the internal `ado_get_build_log_excerpt` Azure DevOps tool to the
  built-in ADO tool manifest and Chat CI/CD use-case catalog.
- Implemented build log excerpt retrieval through the Azure DevOps Build Logs
  REST API, using the failed timeline record `logId` instead of requiring the
  user to paste log URLs.
- Added diagnostic excerpt selection that prefers nearby error/failure lines
  and falls back to the tail of the task log.
- `inspect_pipeline` now attempts to fetch log excerpts for up to three failed
  timeline records after reading the Azure Build Timeline.
- Pipeline failure artifacts now include a `Log excerpts` section with fenced
  text snippets, so follow-up CI recovery turns can reason from task-level
  output instead of only run/task names.
- The pipeline workflow state now records `ado_get_build_log_excerpt` as a
  completed internal tool when log excerpts are returned.

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/src/chatUseCases.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `tests/e2e/chat-layout.spec.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/conversation-git-agent-optimization.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/server.test.ts
.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts -g "routes pipeline controls" --project=chromium
git diff --check
```

Result:

- Core build passed.
- Core Azure DevOps internal tests passed: 12 tests.
- Daemon typecheck passed.
- Desktop typecheck passed.
- Daemon server tests passed: 53 tests.
- Focused Chat Playwright e2e passed for pipeline controls.
- `git diff --check` passed.

Next recommended task:

- Expand pipeline follow-up behavior so a successful rerun request can inspect
  the newly queued run instead of stopping at the trigger approval.

### 2026-06-13 Session Update 171

Phase:

Phase 8: Product Hardening And Distribution / Typed Agent Tool Architecture

Status change:

- The optimization plan has been re-centered on a full typed agent tool
  architecture instead of adding isolated structured workflow actions.

Completed:

- Documented the target execution chain as:
  `user intent -> typed tool selection -> exact args -> policy/preflight ->
  approval -> execute -> artifact/result -> next-step suggestions`.
- Re-prioritized near-term work away from new pipeline expansion and toward:
  typed Git proposals, lower-friction Project Link completion, PR maintenance
  tools, conflict-file UI, and ADO OAuth real-environment regression.
- Added internal typed Azure DevOps PR maintenance tools:
  `ado_update_pull_request`, `ado_add_pull_request_reviewer`,
  `ado_remove_pull_request_reviewer`, `ado_add_pull_request_label`, and
  `ado_remove_pull_request_label`.
- Added typed REST helpers for PR title/description/status updates, reviewer
  add/remove, and label/tag add/remove.
- Updated the Chat use-case catalog so PR creation/maintenance exposes these
  operations as approval-required write tools rather than implicit prose-driven
  actions.
- Added focused tests for PR title/description patching, reviewer add/remove,
  and label/tag add/remove.

Files changed:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/src/chatUseCases.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `docs/dev-agent-progress-tracker.md`
- `docs/conversation-git-agent-optimization.md`

Tests run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/azureDevOpsInternal.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Result:

- Core build passed.
- Core Azure DevOps internal tests passed: 15 tests.
- Daemon typecheck passed.
- Desktop typecheck passed.

Next recommended task:

- Build the typed proposal/policy bridge for Git and PR maintenance so Chat can
  generate `PendingToolAction` proposals from selected typed tools instead of
  relying on preset workflow branches or prose inference.
