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
| Implementation phases | In progress | 20% | Phase 1 has execution-layer approval enforcement, explicit risky-tool tests, a backward-compatible canonical event alias layer, and first source-first upstream reuse from OpenHarness wired into the daemon runtime. Phase 4 now has Azure DevOps MCP source intake, an MCP stdio bridge, and Project Link-level MCP enablement. Product UX now uses Project Link wording and supports richer in-chat Project Link creation. |
| Verification | Partial | 50% | `.tools` runner works when `.tools/node-v22.11.0-win-x64` and `.tools` are prepended to `PATH`. Core full tests, daemon full tests, core/daemon/desktop typechecks, and desktop production build pass. |

## Phase Progress Summary

| Phase | Name | Status | Completion | Primary Goal | Reuse Target |
| --- | --- | --- | ---: | --- | --- |
| 0 | Planning, Audit, And Reuse Strategy | Complete | 100% | Understand current gaps and choose source-first reuse path. | All candidate repos |
| 1 | Safety And Event Protocol | In progress | 60% | Hard approval gate and clean event protocol. | OpenHarness, Goose |
| 2 | Repository Understanding | Not started | 0% | Make semantic repo context first-class. | Aider, Continue, OpenHands |
| 3 | Durable Workflow Engine | Not started | 0% | Replace shallow workflow state with real workflow model. | OpenHarness, mcp-agent, Harness Agents |
| 4 | MCP And Azure DevOps Tool Reuse | In progress | 40% | Reuse ADO MCP and map MCP tools into local policies. | microsoft/azure-devops-mcp |
| 5 | Pull Requests Workspace | Not started | 0% | PR readiness workspace with ADO and local repo context. | Azure DevOps MCP, PR-Agent |
| 6 | Review Queue And Auto-Approval | Not started | 0% | Auditable review decisions and low-risk auto-approval. | PR-Agent, Harness Agents |
| 7 | Verification, Rollback, And Activity Timeline | Not started | 0% | Checkpoints, validation, replayable audit history. | Aider, OpenHands |
| 8 | Product Hardening And Distribution | In progress | 12% | Installer, onboarding, auth, workspace policies, real validation. | Goose, OpenCode |

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

Completion: `5%`

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

## Phase 3: Durable Workflow Engine

Status: `Not started`

Completion: `0%`

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

## Phase 4: MCP And Azure DevOps Tool Reuse

Status: `In progress`

Completion: `30%`

Goal:

Stop hand-building every ADO tool. Add MCP support and reuse Azure DevOps MCP
where possible.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `microsoft/azure-devops-mcp` | External process first; selective source reuse if needed | ADO tools for repos, work items, pipelines, test plans, wiki, search |
| `modelcontextprotocol/servers` | Reference only | MCP server/client conventions |
| `lastmile-ai/mcp-agent` | Port concepts | MCP orchestration and server management |

Work items:

- Vendor Azure DevOps MCP source for direct reuse.
- Add a minimal stdio MCP client bridge.
- Convert MCP tool definitions into local `ToolExecutor` tools.
- Map Azure DevOps MCP tool names into local capability and approval policy.
- Add MCP client to daemon.
- Add profile-level MCP server configuration.
- Add Azure DevOps MCP integration.
- Map MCP tools into local capability registry.
- Apply local approval policy to MCP tools.
- Add audit logging for MCP calls.
- Keep custom wrappers for product-specific PR readiness and Review Queue
  decisions.

Acceptance criteria:

- The daemon can start or connect to Azure DevOps MCP.
- ADO MCP tools are visible through the local tool registry.
- Risky ADO MCP tools require approval.
- Tool traces include MCP server, tool name, args, summary, and result status.

Current integration switch:

- Set `CICD_AGENT_ADO_MCP_ENABLED=1` to enable optional Azure DevOps MCP tool
  discovery in chat sessions.
- Optional overrides:
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

## Phase 5: Pull Requests Workspace

Status: `Not started`

Completion: `0%`

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

Status: `Not started`

Completion: `0%`

Goal:

Make Review Queue the decision surface for reviewers and automation.

Source-first reuse targets:

| Upstream | Reuse Mode | What To Reuse |
| --- | --- | --- |
| `The-PR-Agent/pr-agent` | Fork or selective port | Review prompts, categories, compression, platform adapters |
| Harness Agents | Product reference | Approval policy, audit, DevOps governance |
| `microsoft/azure-devops-mcp` | External process | PR review and approval operations |

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

Acceptance criteria:

- Low-risk PRs can be auto-approved only when profile policy allows.
- Every decision has an audit record.
- Review Queue clearly separates safe, uncertain, blocked, and waiting PRs.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-09 | Phase defined; no implementation started. |

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

Status: `Not started`

Completion: `0%`

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
