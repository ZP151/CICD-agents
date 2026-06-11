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
| Implementation phases | In progress | 88% | Phase 1 has execution-layer approval enforcement, explicit risky-tool tests, a backward-compatible canonical event alias layer, and first source-first upstream reuse from OpenHarness wired into the daemon runtime. Phase 4 now has Azure DevOps MCP source intake, an MCP stdio bridge as temporary compatibility infrastructure, Project Link-level MCP fallback configuration, internally ported Azure DevOps MCP-style capabilities for discovery/health/PR/build context, local git remote inference for ADO Project Link fields, structured ADO auth diagnostics, enriched pipeline discovery metadata, and pipeline recommendation during setup. Phase 5 now has PR-Agent source intake, PR context, non-mutating insight preview, readiness/risk categorization, PR-Agent-style review metadata, hunk-aware priority compression for larger PRs, compression boundary reporting, hunk coverage reporting, route-level review-run contract coverage, ADO PR signal enrichment for full review runs, ADO filediffs/hunk context, finding post-processing, full AI review output from the reused Review Agent path, Activity-tracked AI insight preview/full review-run events for PR analysis traceability, a PR insight artifact store that lets users reopen saved preview/full review summaries without rerunning analysis, daemon-backed local persistence/sync for those saved AI conclusions, Chat-side retrieval of saved PR AI insights as reusable context when users ask about already analyzed PRs, visible Chat metadata showing exactly which saved PR insight artifact ids/timestamps were reused, a Pull Requests-to-Chat handoff that opens saved PR insights in Chat with the right Project Link/repo context, global Activity visibility/details for saved PR insight artifacts with Chat handoff, preview-vs-full-review artifact comparison in Activity, same-kind refresh-to-refresh comparison in Activity, saved PR insight analysis-baseline persistence for full-review iteration/source commit, Pull Requests freshness/staleness labeling for saved insights once current PR context is loaded, one-click refresh for stale saved insights using the existing preview/full-review flows, versioned saved insight artifacts so refreshes preserve previous AI conclusions while latest views still show the newest run, and a Pull Requests card-level saved-run history list with Chat handoff for older runs. Phase 6 now persists low-confidence review signals, policy results, manual disposition summary fields, append-only manual disposition audit events, ADO write-back status/thread links, and append-only ADO write-back attempt events into Review History; uses them for Review Queue attention ordering/filtering/reason-code explanations; feeds context confidence into auto-approval decisions; has daemon endpoints for review dispositions and review-operation activity; can optionally write blocking/request-change decisions back to ADO PR threads; exposes guarded retry for failed or pending ADO write-back; shows a richer Review Queue audit panel; supports single-PR rerun, visible-list batch rerun, stale-review rerun, configurable stale-review age, per-item freshness badges, compact card-level audit summaries, a recent review-operation activity feed backed by daemon local persistence with browser fallback, global Activity page visibility for review operations, and Activity-page filtering by Project Link plus review event type. Phase 7 has a non-destructive Git checkpoint snapshot tool, automatically creates checkpoints before confirmed medium/high-risk Git write tools run, returns checkpoint metadata with tool results, persists checkpoint ids into chat/session tool bubbles, exposes checkpoint activity through the daemon, displays checkpoint activity/detail records in the global Activity page, provides a low-risk `git_checkpoint_show` tool for reading stored checkpoint snapshots, exposes safe checkpoint previews in Activity with status, changed files, and truncated diff content, provides rollback planning with explicit confirmed-action proposals, includes a medium-risk `git_checkpoint_apply` write tool that restores tracked files to a stored checkpoint patch after approval, lets Activity hand rollback proposals to Chat for the existing approval workflow through a tested shared draft builder, and distinguishes checkpoint-apply target snapshots from pre-apply safety snapshots in Activity metadata and UI. Product UX uses Project Link wording and supports richer in-chat Project Link creation. |
| Verification | Partial | 99% | `.tools` runner works when `.tools/node-v22.11.0-win-x64` and `.tools` are prepended to `PATH`. Core full tests, daemon full tests, core/daemon/desktop/review-agent typechecks, and desktop/review-agent production builds pass. Daemon tests now cover internal ADO discovery, repository-filtered pipeline discovery, internal ADO tool health with auth diagnostics, PR context routing, PR insight preview readiness categories, `review-run` metadata/compression/coverage/context-confidence response fields, review disposition persistence, ADO write-back endpoint contract without network write-back, mocked successful ADO PR-thread write-back payloads, mocked failed ADO PR-thread write-back payloads, persisted write-back status/thread-link fields, append-only write-back attempt events for both success and failure, review-operation POST/GET route persistence, automatic Git checkpoint creation before confirmed Git write actions, checkpoint metadata returned with confirmed Git write results, checkpoint metadata extraction, checkpoint activity listing from persisted tool bubbles, checkpoint-apply target/safety metadata in activity records, checkpoint preview routing with truncation, read-only checkpoint rollback planning that does not mutate the repo, and automatic safety checkpoint creation before confirmed checkpoint apply; review-agent tests cover PR-Agent-style metadata parsing, ADO PR readiness signals in review prompts, ADO hunk context extraction, hunk coverage summaries, changed-hunk prompt rendering, hunk-aware compression priority, finding post-processing, large PR prompt compression, security-sensitive file prioritization, context-quality auto-approval gating, review policy persistence through state stores, manual disposition compatibility, and append-only disposition/write-back event serialization; core local review-history tests cover confidence metadata persistence, attention-priority ordering, priority reason codes, manual disposition persistence, disposition event round-tripping, and write-back status/thread-link/attempt-event persistence; core review-operation tests cover daemon-local activity persistence, repository filtering, limits, and corrupt-store fallback; core PR insight artifact tests cover daemon-local versioned refresh history plus explicit-id replacement compatibility; core Git checkpoint tests cover non-destructive status/diff snapshot creation, low-risk capability classification, ToolExecutor before-execute hook ordering, before-execute metadata propagation, checkpoint readback, checkpoint preview summaries, checkpoint rollback planning, checkpoint patch apply, clean-checkpoint restore behavior, HEAD mismatch rejection, and medium-risk checkpoint apply classification; core settings tests cover the configurable review stale age default and environment override; desktop tests cover Project Link pipeline recommendation, browser review-history persistence, daemon-to-browser sync, merge behavior, corrupt-cache handling for write-back attempt events, review operation activity persistence/capping/corrupt-cache fallback, PR insight artifact freshness and versioned refresh history, pure Review Queue audit presentation data for labels, summary, ordering, fallbacks, empty state, and compact card summaries, Review Queue stable item keys, stale review selection rules, and Review Queue rerun result mapping that preserves manual disposition plus ADO write-back audit history; desktop typecheck covers the Activity page checkpoint activity integration and checkpoint apply metadata rendering; desktop build covers the PR context panel, Project Link autofill integration, preview readiness display, full insight metadata/compression/coverage/context-confidence display, discarded finding count display, Review Queue confidence signal display, attention sorting/filtering controls, configurable stale age control, compact card-level audit summaries, recent review-operation activity feed, global Activity page review-operation list/detail rendering, Activity-page checkpoint preview and rollback-plan rendering, Activity-page Project Link and review event-type filters, disposition event display, ADO write-back status/thread-link display, guarded retry write-back controls, richer audit panel rendering, write-back attempt history rendering, single-item Review Queue rerun controls, visible-list batch rerun controls, stale-review batch rerun controls, and AI insight output. Low-level MCP bridge registration remains covered as compatibility infrastructure. |

## Phase Progress Summary

| Phase | Name | Status | Completion | Primary Goal | Reuse Target |
| --- | --- | --- | ---: | --- | --- |
| 0 | Planning, Audit, And Reuse Strategy | Complete | 100% | Understand current gaps and choose source-first reuse path. | All candidate repos |
| 1 | Safety And Event Protocol | In progress | 60% | Hard approval gate and clean event protocol. | OpenHarness, Goose |
| 2 | Repository Understanding | Not started | 0% | Make semantic repo context first-class. | Aider, Continue, OpenHands |
| 3 | Durable Workflow Engine | Not started | 0% | Replace shallow workflow state with real workflow model. | OpenHarness, mcp-agent, Harness Agents |
| 4 | MCP And Azure DevOps Tool Reuse | In progress | 70% | Internalize ADO MCP capabilities and map them into local policies. | microsoft/azure-devops-mcp |
| 5 | Pull Requests Workspace | In progress | 77% | PR readiness workspace with ADO and local repo context. | Azure DevOps MCP, PR-Agent |
| 6 | Review Queue And Auto-Approval | In progress | 73% | Auditable review decisions and low-risk auto-approval. | PR-Agent, Harness Agents |
| 7 | Verification, Rollback, And Activity Timeline | In progress | 49% | Checkpoints, validation, replayable audit history. | Aider, OpenHands |
| 8 | Product Hardening And Distribution | In progress | 20% | Installer, onboarding, auth, workspace policies, real validation. | Goose, OpenCode |

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

Status: `Not started`

Completion: `0%`

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

Completion: `20%`

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
