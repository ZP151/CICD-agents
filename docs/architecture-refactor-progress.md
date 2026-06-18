# Architecture Refactor Progress

## Purpose

This document tracks the architecture refactor plan for file splitting,
project structure cleanup, and chat streaming standardization.

It is separate from `docs/mergepilot-progress-tracker.md` because this work is
an engineering-quality track that cuts across product phases.

## Status Legend

| Status        | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `Not started` | No implementation work has begun.                            |
| `In progress` | A compatible implementation slice has landed.                |
| `Partial`     | Useful code exists, but the planned seam is not complete.    |
| `Blocked`     | Progress requires a credential, decision, or external state. |
| `Complete`    | Acceptance criteria are implemented and verified.            |

## Overall Progress

| Track                                 | Status   | Completion | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Remaining Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat streaming contract               | Complete |       100% | `packages/core/src/chat-stream/*`, `packages/daemon/src/routes/chatSse.ts`, `apps/desktop/src/api/sse.ts`, `apps/desktop/src/pages/chat/chatStreaming.ts`, `chatEventReducer.ts`, `chatBubbleReducer.ts`, `chatBubbleReducer.test.ts`, `chatStreamDispatcher.ts`, `chatStreamDispatcher.test.ts`, `chatUiChunkDispatcher.ts`, `chatUiChunkDispatcher.test.ts`, `chatToolStreamState.ts`, `chatWorkflowStreamState.ts`, `chatTerminalStreamState.ts`, `chatBubbleTransitions.ts`, `useChatRuntime.ts`, `tests/e2e/chat-layout.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None for the planned streaming contract. Canonical `ui.chunk` owns assistant text, tool timeline, approval/workflow control, metadata, terminal, and error UI state through tested Modules. Dispatcher-level tests prove legacy render events do not duplicate visible output after `ui.chunk` starts, reducer-level tests prove visible bubble transitions are centralized, and Playwright browser/SSE acceptance covers mixed canonical+legacy text/tool events plus canonical approval cards.                                                                                                                                                                                                                                                                 |
| Core Chat planner split               | Complete |       100% | `packages/core/src/chatPlanner.ts`, `chatPlannerTypes.ts`, `chatPlannerControl.ts`, `chatPlannerAffirmation.ts`, `chatPlannerGuards.ts`, `chatPlannerOffline.ts`, `chatPlannerRequest.ts`, `chatPlannerStepStream.ts`, `chatPlannerToolExecution.ts`, `chatPlannerFinalizationTool.ts`, `chatPlannerPrompt.ts`, `chatPlannerApproval.test.ts`, `chatPlannerFinalization.test.ts`, `chatPlannerAgentFinalTool.test.ts`, `chatPlannerApprovalGuards.test.ts`, `chatPlannerTestDoubles.ts`, `chatUiStream.test.ts`, `chatUseCases.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None for this slice. The planner entry Module is reduced to 296 lines and now owns orchestration only: runtime loop, tool execution decisions, and finalization flow. Public planner types, finalization/control parsing, finalization tool schema, system prompt text, affirmation parsing, offline fallback, request construction, write-scope guards, provider step-stream collection, tool execution streaming, repeated tool-failure handling, and planner approval/finalization/agent-final test Interfaces have separate focused Module Interfaces while preserving compatibility exports from `chatPlanner.ts` and the legacy `chatPlannerApproval.test.ts` test entry.                                                                                                                                                                                                                                                                                                                     |
| Core Git tools split                  | Complete |       100% | `packages/core/src/tools/git.ts`, `gitCommand.ts`, `gitCheckpoint.ts`, `gitReadTools.ts`, `gitWriteTools.ts`, `gitHistoryTools.ts`, `gitOptions.test.ts`, `gitCheckpoint.test.ts`, `toolCapabilities.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None for this slice. The Git tool entry Module is reduced from 810 to 66 lines and now acts as a compatibility registry composer. Command execution, checkpoint/rollback logic, read-only tools, local/remote-changing write tools, and history mutation/continuation tools have separate Module Interfaces. Existing tool names and behavior are preserved.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Core Chat context split               | Complete |       100% | `packages/core/src/chatContext.ts`, `chatContextTypes.ts`, `chatContextFormat.ts`, `chatContextScan.ts`, `chatContextChanges.ts`, `chatContext.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for this slice. The chat context entry Module is reduced from 611 to 171 lines and now owns context/index orchestration only. Context bundle types, prompt/source formatting, quick repository scanning, and Git change inspection live behind separate Module Interfaces while preserving compatibility exports from `chatContext.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Core pipeline agent split             | Complete |       100% | `packages/core/src/pipelineAgent.ts`, `packages/core/src/pipelineAgentSupport.ts`, `packages/core/test/pipelineAgentOffline.test.ts`; core typecheck. | None for this slice. `pipelineAgent.ts` is reduced from 342 to 226 lines and now owns submit-pipeline orchestration only. Git diff computation, build/test command execution, PR creation/linking, and ToolError-to-step mapping live behind the focused `pipelineAgentSupport.ts` Module while preserving `runPipelineTask` and `PipelinePayload` Interfaces. |
| Core pipeline planner split           | Complete |       100% | `packages/core/src/planner.ts`, `packages/core/src/plannerSupport.ts`, `packages/core/test/plannerOffline.test.ts`, `packages/core/test/pipelineAgentOffline.test.ts`; core typecheck. | None for this slice. `planner.ts` is reduced from 364 to 283 lines and now owns planner orchestration only: non-streaming run loop, streaming run loop, tool-call execution flow, LLM fallback, and final result shaping. The pipeline agent system prompt, final JSON extraction, text truncation, first-line fallback, and deterministic offline summary live behind `plannerSupport.ts` while preserving `SYSTEM_PROMPT` and `Planner.buildOfflineSummary(...)`. |
| Core Azure auth split                 | Complete |       100% | `packages/core/src/store/azureAuth.ts`, `azureAuthCredential.ts`, `azureAuthIdentity.ts`, `azureAuthSession.ts`, `azureAuthAccountSelection.ts`, `azureAuthTypes.ts`, `azureAuthConfig.ts`, `azureAuthBrowser.ts`, `azureAuthMsal.ts`, `azureAuthUserCache.ts`, `azureDevOpsInternal.test.ts`, `adoClient.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | None for this slice. `azureAuth.ts` is now a 30-line compatibility entry Module; credential construction, JWT/avatar identity helpers, MSAL session/token flow, active-account selection, auth DTOs/errors, environment/config discovery, browser login rendering/opening, MSAL persistence setup, and file-based user cache live behind focused Module Interfaces. Public exports remain compatible through `azureAuth.ts`.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Core ADO tool registry split          | Complete |       100% | `packages/core/src/ado/toolRegistry.ts`, `toolRegistryContext.ts`, `toolRegistryPullRequests.ts`, `toolRegistryBuildPipeline.ts`, `azureDevOpsInternal.test.ts`, `adoClient.test.ts`, `adoPullRequestMutations.test.ts` | None for this slice. `toolRegistry.ts` is now a 61-line compatibility composer for manifest, health check, and tool list assembly. Pull request/work-item/policy tools, build/pipeline tools, and shared payload/context resolution live behind focused Module Interfaces. Existing tool names, schemas, return shapes, and ordering remain stable. |
| Desktop Chat split                    | Complete |       100% | `apps/desktop/src/pages/Chat.tsx`, `useChatPageRuntime.ts`, `useChatPageState.ts`, `useChatPageReadModel.ts`, `chatShellPropsAdapter.ts`, `useChatTurnRuntime.ts`, `layout/ChatShell.tsx`, `layout/ChatShell.types.ts`, `layout/ChatWorkspaceLayout.tsx`, `layout/ChatMessageList.tsx`, `layout/ChatEmptyState.tsx`, `layout/ChatAssistantMetaPanel.tsx`, `layout/ChatThinkingDots.tsx`, `layout/WorkspaceEnvironmentCard.tsx`, `layout/WorkspaceEnvironmentHeader.tsx`, `layout/WorkspaceChangesButton.tsx`, `layout/WorkspaceBranchMenu.tsx`, `layout/WorkspaceCommitMenu.tsx`, `layout/WorkspaceGitRecoveryPanel.tsx`, `layout/WorkspaceProjectLinkPanel.tsx`, `layout/HistorySidebar.tsx`, `layout/HistorySidebarItem.tsx`, `layout/HistorySidebarMenu.tsx`, `layout/HistorySidebarPagination.tsx`, `layout/HistorySidebarIcons.tsx`, focused chat stream/reducer/layout tests, desktop typecheck, desktop build | None for the planned route-shell, shell-layout, message-list, workspace-environment, page-runtime, and history-sidebar targets. `Chat.tsx` is a 22-line route shell; `useChatPageRuntime.ts` is a 153-line orchestration Module; `chatShellPropsAdapter.ts` is a 144-line Adapter from runtime Modules to the ChatShell Interface; `ChatShell.tsx` is a 60-line outer shell; `ChatWorkspaceLayout.tsx` is 239 lines; `ChatMessageList.tsx` is 218 lines; `WorkspaceEnvironmentCard.tsx` is 115 lines; `HistorySidebar.tsx` is 123 lines after extracting item/menu/pagination/icon Modules. |
| Desktop global styles split           | Complete |       100% | `apps/desktop/src/index.css`, `main.tsx`, `styles/base.css`, `styles/theme-compat.css`, `styles/settings.css`, `styles/settings-layout.css`, `styles/settings-controls.css`, `styles/settings-feedback.css`, `styles/chat-workspace.css`, `styles/conversation-markdown.css`; desktop typecheck; desktop build. | None for this slice. `index.css` is now a 3-line Tailwind entry Module. Global tokens/base rules, light-theme Tailwind compatibility, Settings layout, Settings controls, Settings feedback/status rules, Chat workspace flex layout, and conversation markdown streaming styles live behind focused CSS Module Interfaces. All handwritten CSS Modules are under 300 lines. |
| Desktop bundle split                  | In progress |        95% | `apps/desktop/vite.config.ts`, `MarkdownContentRuntime.tsx`, `MarkdownContentFallback.tsx`, `MarkdownContent.types.ts`, `MarkdownContent.tsx`, `CodeBlock.tsx`, `codeHighlight.ts`, `ConversationPartRenderer.tsx`, `MermaidArtifactPreview.tsx`, `mermaidArtifactRenderer.ts`; renderer/artifact tests; desktop typecheck; desktop build. | The Vite entry chunk is reduced from the prior 1,298.27 kB baseline to 444.38 kB. React runtime, router, and icon vendor Modules are grouped by package-name-based manual chunks. Streamdown-heavy markdown rendering now sits behind a lazy runtime Adapter with a lightweight synchronous fallback for SSR/static renderer tests and first-paint readability. Direct Shiki usage and the unused `@streamdown/code` plugin dependency are removed from the desktop app; code blocks use a lightweight local highlighter Module while retaining copy/collapse/language-label behavior. Mermaid artifact rendering is now an explicit on-demand Adapter instead of an automatic artifact-workspace side effect. Vite still reports large lazy vendor chunks for Mermaid core and Wardley diagram support, so the remaining gap is dependency weight or supported-diagram subset work rather than initial Chat renderer size. |
| Conversation renderer split           | Complete |       100% | `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`, `MarkdownContent.tsx`, `markdownSourceLinks.ts`, `CodeBlock.tsx`, `ReferenceParts.tsx`, `ArtifactCard.tsx`, `conversationPartGrouping.ts`, `conversationPartStyles.ts`, `conversationTheme.ts`, `ConversationPartRenderer.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None for the bot-response renderer split. Markdown, code, source references, artifacts, grouping, shared styles, and theme detection now have focused Module Interfaces; existing renderer API and `MarkdownContent` compatibility export remain stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Chat bubble model split               | Complete |       100% | `apps/desktop/src/chatBubbles.ts`, `chatBubbleTypes.ts`, `chatBubbleMeta.ts`, `conversationParts.ts`, `chatBubbleTools.ts`, `chatBubbleFinalization.ts`, `chatBubbleFinalization.test.ts`, `chatConversationParts.test.ts`, `chatBubbleMetadata.test.ts`, `chatToolParts.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | None for this slice. The chat bubble compatibility Module is reduced from 626 to 30 lines. Assistant metadata parsing, conversation part composition, tool call/approval part handling, and assistant finalization now live behind focused Module Interfaces. The old 743-line combined `chatBubbles.test.ts` is split by Interface into finalization, conversation part composition, assistant metadata, and tool/approval part tests; focused chat bubble tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Execution timeline split              | Complete |       100% | `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`, `ExecutionCommandRow.tsx`, `ExecutionTimelineIcons.tsx`, `executionTimelineModel.ts`, `executionTimelineStyles.ts`, `ExecutionTimeline.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | None for this slice. The timeline entry is reduced from 571 to 178 lines. `executionTimelineModel.ts` is now 278 lines after moving timeline style class derivation behind `executionTimelineStyles.ts`. Grouping, summaries, state labels, output formatting, shell evidence, and timeline styling live in focused Module Interfaces, while command-row rendering and icon rendering are separate. Focused timeline tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Approval evidence split              | Complete |       100% | `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`, `ApprovalEvidenceModel.ts`, `ApprovalEvidence.test.tsx`; desktop typecheck. | None for this slice. `ApprovalEvidence.tsx` is reduced from 344 to 98 lines and now owns rendering only. Approval evidence DTOs, preflight rows, scope rows, command preview generation, workflow-boundary text, and argument formatting live behind the focused `ApprovalEvidenceModel.ts` Module while preserving existing type and `toolCommandPreview` exports. |
| Suggestion reply controls split       | Complete |       100% | `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`, `SuggestionReplyControls.tsx`, `suggestionReplyTypes.ts`, `suggestionReplyState.ts`, `suggestionReplyDerivation.ts`, `suggestionReplyWorkflowSuggestions.ts`, `SuggestionReplyBar.test.tsx`, `suggestionReplyDerivation.test.ts`, `suggestionReplyCommandChips.test.tsx`, `suggestionReplyComposerState.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None for the quick-reply/control split. The old `SuggestionReplyBar` import remains a compatibility Interface while state derivation, composer state, command/suggestion derivation, workflow suggestion logic, and compact chip rendering are separated behind focused Modules. The old 487-line combined `SuggestionReplyBar.test.tsx` is split by Interface into suggestion derivation, command chips, composer state, and visual control rendering tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Pull Requests page split              | Complete |       100% | `apps/desktop/src/pages/PullRequests.tsx`, `pullRequests/usePullRequestsRuntime.ts`, `pullRequests/usePullRequestActions.ts`, `usePullRequestHandoff.ts`, `PullRequestCard.tsx`, `PullRequestInsightPanels.tsx`, `StoredInsightPanel.tsx`, `InsightPreviewPanel.tsx`, `ReviewRunPanel.tsx`, `InsightRiskBadges.tsx`, `PullRequestPageHeader.tsx`, `PullRequestContextPanel.tsx`, `pullRequestViewModel.ts`, `pullRequestTypes.ts`, `pullRequestViewModel.test.ts`; desktop typecheck; focused PR insight tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Complete for the planned PR page split. PR list loading, Project Link selection persistence, branch scoping, category/pagination state, PR context expansion, insight artifact hydration, handoff/sessionStorage handling, and preview/review action runtime now live behind `usePullRequestsRuntime.ts` and focused child Modules. `PullRequests.tsx` is reduced to 141 lines and now owns route rendering only; `PullRequestInsightPanels.tsx` is a 3-line compatibility export Module.                                                                                                                                                                                                                                                                                 |
| Pipelines page split                  | Complete |       100% | `apps/desktop/src/pages/Pipelines.tsx`, `pipelines/usePipelinesRuntime.ts`, `PipelineRowCard.tsx`, `PipelineStatusFilters.tsx`, `pipelineModel.ts`, `pipelineActions.ts`, `pipelineTypes.ts`; desktop typecheck; focused pipeline workflow tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | None for this slice. The route is reduced from 417 to 101 lines and now acts as a pipeline workspace shell. Project Link selection, linked PR loading, inspect/trigger workflow actions, pagination, filtering, row construction, run tone derivation, and card rendering live behind focused Module Interfaces. This completes the frontend structure follow-up after moving pipeline behavior into a dedicated page.                                                                                                                                                                                                                                                                                                                                                   |
| Review Queue page split               | Complete |       100% | `apps/desktop/src/pages/ReviewFindings.tsx`, `reviewFindings/useReviewQueueRuntime.ts`, `useReviewQueueView.ts`, `useReviewQueueBatchRerun.ts`, `useReviewQueueSettings.ts`, `useReviewOperationActivity.ts`, `ReviewQueueCard.tsx`, `ReviewQueueControls.tsx`, `ReviewQueuePageHeader.tsx`, `FindingsPanel.tsx`, `ReviewActivityRail.tsx`, `reviewQueueViewModel.ts`, `reviewQueueViewModel.test.ts`, `reviewQueueRuntime.ts`, `reviewQueueRuntime.test.ts`; desktop typecheck; focused Review Queue tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None for this slice. The route is reduced from 1171 to 188 lines and now acts as a route shell. `useReviewQueueRuntime.ts` is reduced from 419 to 288 lines and now owns queue loading, disposition persistence, ADO write-back retry, single-item rerun, optimistic updates, and findings panel state. Review Queue counts/filter/sort/stale-selection/pagination live behind `useReviewQueueView.ts`; batch rerun state and loop orchestration live behind `useReviewQueueBatchRerun.ts`; global review settings and review operation activity live behind focused hook Module Interfaces. Pure runtime rules cover disposition state, retry state, stale-age normalization, and queue-item replacement.                                                                                                                                                                                                        |
| TaskViewer / Activity workspace split | Complete |       100% | `apps/desktop/src/pages/TaskViewer.tsx`, `taskViewer/useTaskViewerRuntime.ts`, `taskViewer/ActivitySidebar.tsx`, `taskViewer/PrInsightActivitySection.tsx`, `taskViewer/ReviewActivitySection.tsx`, `taskViewer/ProjectLinkFilter.tsx`, `taskViewer/activityTypes.ts`, `taskViewer/TaskRunDetailPanel.tsx`, `taskViewer/ReviewOperationDetailPanel.tsx`, `taskViewer/activityPresentation.ts`, `taskViewer/PrInsightDetailPanel.tsx`, `taskViewer/PrInsightComparisonPanels.tsx`, `taskViewer/PrInsightReadinessBlockers.tsx`, `taskViewer/prInsightActivity.ts`, `taskViewer/CheckpointDetailPanel.tsx`, `taskViewer/CheckpointPreviewSection.tsx`, `taskViewer/CheckpointRollbackPlanSection.tsx`, `taskViewer/checkpointActivity.ts`, `TaskViewer.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None for this slice. The route is reduced from 1339 to 198 lines and now acts as a route shell. `ActivitySidebar.tsx` is reduced to 246 lines after extracting PR insight and review activity sections. Task/activity refresh, task stream updates, checkpoint preview and rollback loading, PR insight history, review activity loading, filters, handoff restore, and selected-item derivation live behind the `useTaskViewerRuntime` Module. Detail rendering and activity navigation have focused Module Interfaces. `PrInsightDetailPanel.tsx` is now 209 lines after moving preview/full and previous-run comparison rendering behind `PrInsightComparisonPanels.tsx`. `CheckpointDetailPanel.tsx` is now 134 lines after moving snapshot preview and rollback proposal rendering behind focused checkpoint detail Modules.                                                                                                                                                                                                                                                                                                                                                 |
| Settings page split                   | Complete |       100% | `apps/desktop/src/pages/Settings.tsx`, `settings/useSettingsRuntime.ts`, `settings/AdditionalModelsSettingsSection.tsx`, `settings/AdditionalModelEditor.tsx`, `settings/AccountSettingsSection.tsx`, `settings/AppearanceSettingsSection.tsx`, `settings/SettingsControls.tsx`, `settings/settingsTypes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | None for this slice. The route is reduced from 799 to 58 lines and now acts as a route shell. Settings persistence, daemon config hydration/sync, auth/health loading, additional model editing/testing, model availability state, editor form rendering, and storage normalization live behind focused Module Interfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Project Links page split              | Complete |       100% | `apps/desktop/src/pages/ProjectLinks.tsx`, `projectLinks/ProjectLinkForm.tsx`, `useProjectLinkFormRuntime.ts`, `ProjectLinkWorkspaceSection.tsx`, `ProjectLinkAdoSection.tsx`, `ProjectLinkFormControls.tsx`, `ProjectLinkCard.tsx`; desktop typecheck; focused Project Link tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None for this slice. The route is reduced from 702 to 192 lines and now acts as a list/new/edit shell. `ProjectLinkForm.tsx` is reduced from 404 to 114 lines. Project Link form state, branch detection, Azure DevOps remote suggestion, ADO discovery, pipeline recommendation, workspace rendering, ADO rendering, and shared form controls live behind focused Module Interfaces.                                                                                                                                                                                                                                                                                                                                                          |
| MergePilot / Project Link naming migration | Complete |       100% | Package scopes and binaries use `@mergepilot/*`, `mergepilot`, and `mergepilot-daemon`; desktop/core DTOs expose `ProjectLink` / `ProjectLinkInput`; AppData exposes Project Link APIs; runtime config uses `MERGEPILOT_*`; official daemon and desktop routes use `/project-links`; chat, workflow, PR insight, review, checkpoint, and handoff runtime state use `projectLinkId` / `inlineProjectLink`; CLI init writes `.mergepilot/project-link.yaml`; old Project Link-as-Profile request/body/route/CLI/config compatibility has been removed from runtime source; YAML build/test defaults are now `ProjectTemplate` records loaded from `project-templates.yaml`; PAT support remains active for OAuth fallback and explicit user configuration. | None for canonical naming. Remaining `profile` references are historical progress notes or provider terminology such as Microsoft Graph profile photos. |
| Desktop API split                     | Complete |       100% | `apps/desktop/src/api.ts` is a 13-line compatibility barrel; surface modules under `apps/desktop/src/api/*` are all under 300 lines. Chat DTOs now live behind focused Modules: `chatStreamTypes.ts`, `chatConversationTypes.ts`, `chatCheckpointTypes.ts`, `chatWorkflowTypes.ts`, `chatIndexTypes.ts`, with `chatTypes.ts` kept as a compatibility export entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None for the planned desktop API split. Future work can add API-specific tests for each surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Daemon routes split                   | Complete |       100% | Route Modules under `packages/daemon/src/routes/*`, workflow Modules under `packages/daemon/src/workflows/*`, focused route/workflow tests including `serverChatHistoryRoutes.test.ts`, `serverProjectLinkRoutes.test.ts`, `serverPullRequestRoutes.test.ts`, `serverReviewRunRoutes.test.ts`, `serverPrWorkflowRoutes.test.ts`, `serverBranchWorkflowRoutes.test.ts`, `serverPushWorkflowRoutes.test.ts`, `serverPrCreationWorkflowRoutes.test.ts`, `serverCommitValidationWorkflowRoutes.test.ts`, `serverValidationArtifactWorkflowRoutes.test.ts`, `serverRecoveryWorkflowRoutes.test.ts`, and broad `server.test.ts`. | `server.ts` is now 149 lines. Route files own HTTP parsing/response shaping while workflow Modules own orchestration. The broad `server.test.ts` is now 284 lines with 4 smoke tests after extracting twenty focused route/workflow test Modules, including push workflow approval/readiness coverage in `serverPushWorkflowRoutes.test.ts`. |
| Azure DevOps internal modules         | Complete |       100% | `packages/core/src/ado/auth.ts`, `client.ts`, `diagnostics.ts`, `constants.ts`, `core.ts`, `repositories.ts`, `pullRequests.ts`, `pullRequestMutations.ts`, `pullRequestMutationSupport.ts`, `pullRequestThreads.ts`, `pullRequestChanges.ts`, `workItems.ts`, `policy.ts`, `builds.ts`, `buildLogs.ts`, `pipelines.ts`, `toolRegistry.ts`, `refs.ts`, `response.ts`, `types.ts`, `index.ts`, compatibility exports from `packages/core/src/tools/azureDevOps.ts`, `packages/core/test/adoClient.test.ts`, `adoClientAuth.test.ts`, `adoClientDiscovery.test.ts`, `adoClientPullRequests.test.ts`, `packages/core/test/adoPullRequestMutations.test.ts`, `packages/core/test/azureDevOpsInternal.test.ts`, `adoPullRequestsInternal.test.ts`, `adoBuildPipelineInternal.test.ts`, `adoPullRequestMutationsInternal.test.ts`, `adoHealthInternal.test.ts`, `adoTestDoubles.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for the planned ADO internal Module split. PR mutation domain functions are now separated from shared mutation plumbing: PR mutation ID validation, reviewer endpoint construction, and ADO JSON POST/PUT/PATCH helpers live behind `pullRequestMutationSupport.ts`. Build definition/list/timeline behavior remains in `builds.ts`, while build log retrieval and diagnostic excerpt selection now live behind `buildLogs.ts`. Internal ADO tests are now split by domain Interface while legacy `azureDevOpsInternal.test.ts` and `adoClient.test.ts` commands remain compatibility entries. Future product work can port additional Azure DevOps MCP endpoints as separate domain Modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review-agent dependency cleanup       | Complete |       100% | `packages/core/src/review/*`, `packages/core/src/review/stateStoreNormalization.ts`, `packages/core/src/review/reviewFilePriority.ts`, `packages/daemon/package.json`, `packages/daemon/src/server.ts`, `packages/daemon/src/routes/review.routes.ts`, `packages/review-agent/src/index.ts`, `packages/review-agent/src/reviewService.ts`, `packages/review-agent/src/server.ts`, `packages/review-agent/test/reviewPlanner.test.ts`, `reviewPlannerPrompt.test.ts`, `reviewPlannerResponse.test.ts`, `reviewPlannerTestDoubles.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Dependency graph now matches ADR-0007 for daemon/review-agent shared review runtime. `stateStore.ts` is now 276 lines after moving review history normalization behind `stateStoreNormalization.ts`. `prompt.ts` is now 227 lines after moving prompt-compression file priority scoring behind `reviewFilePriority.ts`. Review planner tests now mirror prompt/compression and response post-processing Interfaces while preserving the legacy `reviewPlanner.test.ts` command. No remaining ADR-0007 gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CLI entrypoint split                  | Complete |       100% | `packages/cli/src/commands.ts`, `cliRuntime.ts`, `taskOutput.ts`, `settingsCommand.ts`, `setupGlobalCommand.ts`, `authCommands.ts`, `patCommand.ts`; CLI typecheck; CLI tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | None for this slice. `commands.ts` is reduced from 553 to 236 lines and now acts as the thin CLI command registry. Runtime client creation, task/event output, settings persistence command, global wrapper command, Azure auth command group, and PAT storage command live behind focused Module Interfaces. This is a controlled extension of the refactor plan aligned with ADR-0007 thin entry points.                                                                                                                                                                                                                                                                                                                                                                 |
| Verification baseline                 | Complete |       100% | Focused streaming/API tests, desktop smooth-streaming/Chat derived-state/runtime/transition/draft/handoff/project-link/history/scroll/artifact/session-history/panel-layout/workflow tests, desktop build/typecheck, daemon typecheck, daemon chat event/workflow tests, focused ADO auth/client/diagnostics/discovery/PR/thread/change/mutation/work-item/policy/build/pipeline/tool-registry/internal tests, focused daemon chat history/task/checkpoint-index/Project Link/review storage/PR insight storage/review write-back/pull request route/PR insight preview route/ADO workflow route/auth-git utility/review-run/PR workflow/PR insight workflow/branch workflow/push workflow/PR creation workflow/commit-validation workflow/validation artifact workflow/conflict-recovery workflow route tests, and broad `packages/daemon/test/server.test.ts` with 4 passing tests. | None for the current architecture-refactor verification baseline. Future slices should add or rerun focused tests for their changed seams. |

## Current Progress Addendum

- The latest daemon review disposition route split is aligned with the Review
  Queue write-back and route/runtime locality objective. It moves
  `/review-disposition` request handling and ADO write-back persistence behind
  `review-disposition.routes.ts` while keeping `review.routes.ts` as the
  aggregate review route registration Interface.
- `packages/daemon/src/routes/review.routes.ts` is now 218 lines and owns review
  queue reads, local review history writes, review operation storage, and PR
  insight artifact routes. Review disposition persistence and optional ADO PR
  thread write-back now live in
  `packages/daemon/src/routes/review-disposition.routes.ts` (89 lines).
- Plan deviation check: no material deviation. This is a daemon review route
  source-structure slice. It does not alter `/profiles/:id/review-disposition`
  or `/project-links/:id/review-disposition`, request schemas, local history
  record shaping, write-back eligibility rules, ADO thread write-back behavior,
  failed write-back audit events, storage response shape, or route
  registration compatibility.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewStorageRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewRunRoutes.test.ts`
  passed with 5 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- The latest desktop Review Queue action hook split is aligned with the PR
  review/AI insight workflow locality objective. It moves manual disposition,
  ADO write-back retry, and review rerun orchestration behind
  `useReviewQueueActions.ts` while keeping `useReviewQueueRuntime(...)` as the
  Review Queue page runtime Interface.
- `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts` is now 159
  lines and owns queue loading, view state, panel state, view-model selection,
  batch rerun composition, and returned page runtime shape. Action state and
  side effects now live in
  `apps/desktop/src/pages/reviewFindings/useReviewQueueActions.ts` (186 lines):
  disposition saving, write-back retrying, rerun state, API mutation calls,
  activity recording, local findings persistence, and error reload handling.
- Plan deviation check: no material deviation. This is a desktop Review Queue
  source-structure slice. It does not alter Review Queue API calls, Project
  Link scoping, manual disposition write-back rules, retry behavior, rerun
  target branch selection, local finding persistence, activity labels,
  pagination/filter/sort behavior, or the `useReviewQueueRuntime(...)` return
  Interface.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/reviewFindings/reviewQueueRuntime.test.ts src/pages/reviewFindings/reviewQueueViewModel.test.ts src/reviewRunHistory.test.ts src/reviewHistoryLocal.test.ts`
  passed with 23 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- The latest core ADO pull request mutation registry split is aligned with the
  internal Azure DevOps MCP-porting and PR insight tool locality objective. It
  moves reviewer, label, and work-item mutation tool builders behind
  `toolRegistryPullRequestMutations.ts` while keeping
  `pullRequestRegistryTools()` as the public pull request tool registry
  Interface.
- `packages/core/src/ado/toolRegistryPullRequests.ts` is now 140 lines and owns
  pull request work-item reads, policy reads, PR creation, and PR update tool
  builders. PR reviewer, label, and work-item link mutation registry entries
  now live in `packages/core/src/ado/toolRegistryPullRequestMutations.ts` (151
  lines), with registry-order coverage in
  `packages/core/test/adoToolRegistry.test.ts` (24 lines).
- Plan deviation check: no material deviation. This is an ADO internal Module
  source-structure slice. It does not alter Azure DevOps tool names, registry
  order, manifest membership, required parameters, validation error messages,
  auth resolution, payload resolution, PR mutation domain functions, or public
  compatibility exports.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoToolRegistry.test.ts test/adoPullRequestMutationsInternal.test.ts test/adoPullRequestMutations.test.ts`
  passed with 8 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- The latest core Git checkpoint parsing split is aligned with the Git
  rollback safety and tool Interface locality objective. It moves binary diff
  file extraction and porcelain status path classification behind a focused
  `gitCheckpointParsing.ts` Module while preserving compatibility re-exports
  from `gitCheckpoint.ts`.
- `packages/core/src/tools/gitCheckpoint.ts` is now 270 lines and owns
  checkpoint creation, storage reads, preview shaping, rollback planning, and
  checkpoint apply orchestration. Diff/status parsing now lives in
  `packages/core/src/tools/gitCheckpointParsing.ts` (28 lines), with direct
  Interface coverage in `packages/core/test/gitCheckpointParsing.test.ts` (29
  lines).
- Plan deviation check: no material deviation. This is a core Git tool
  source-structure slice. It does not alter checkpoint IDs, checkpoint storage
  paths, tool names, rollback proposal shape, HEAD mismatch protection,
  repoPath mismatch protection, patch apply behavior, or compatibility exports.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitCheckpoint.test.ts test/gitCheckpointParsing.test.ts test/toolCapabilities.test.ts`
  passed with 7 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- The latest daemon validation command derivation split is aligned with the
  commit/push validation preflight and workflow locality objective. It moves
  package-root discovery, package.json script selection, pnpm wrapper detection,
  and package-filter command construction behind a focused
  `validationCommandDerivation.ts` Module while keeping
  `validationPreflight.ts` as the preflight payload Interface.
- `packages/daemon/src/workflows/validationPreflight.ts` is now 135 lines and
  owns changed-file parsing, artifact-based focused rerun selection, and
  validation preflight payload shaping. Changed-file-to-command derivation now
  lives in `packages/daemon/src/workflows/validationCommandDerivation.ts`
  (157 lines), with direct Interface coverage in
  `packages/daemon/test/validationCommandDerivation.test.ts` (53 lines).
- Plan deviation check: no material deviation. This is a daemon workflow
  source-structure slice. It does not alter changed-file parsing, artifact
  rerun precedence, Project Link validation command precedence, default
  validation fallback, pnpm wrapper command format, package filter ordering,
  route URLs, or approval proposal shape.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/validationPreflight.test.ts test/validationCommandDerivation.test.ts test/serverCommitValidationWorkflowRoutes.test.ts`
  passed with 8 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- The latest daemon confirmed-action runner split is aligned with the chat
  runtime entrypoint and workflow closure locality objective. It moves
  `/confirm-action` orchestration behind a focused `chatConfirmActionRun.ts`
  Module while keeping `ChatSessionManager.confirmAction(...)` as the public
  session Interface.
- `packages/daemon/src/chatSession.ts` is now 233 lines and owns session
  creation, history/bubble access, metadata operations, session deletion,
  chat-turn delegation, and compatibility exports. Confirmed approval
  resolution, active-session registration, runtime setup, confirmed tool
  execution, and next-step outcome streaming now live in
  `packages/daemon/src/chatConfirmActionRun.ts` (84 lines).
- Plan deviation check: no material deviation. This is a daemon chat runtime
  source-structure slice. It does not alter `/chat/:sessionId/confirm-action`,
  approval resolution events, workflow-state emission order, confirmed tool
  execution persistence, Project Link snapshot usage, runtime cleanup, public
  `ChatSessionManager` methods, or compatibility exports.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts test/serverPrCreationWorkflowRoutes.test.ts test/serverRecoveryWorkflowRoutes.test.ts test/chatSessionWorkflowDerivation.test.ts`
  passed with 29 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- The latest daemon chat structured-done split is aligned with the chat
  workflow closure and route/runtime locality objective. It moves confirmed
  action completion shaping behind a focused `chatStructuredDone.ts` Module
  while preserving the public re-export from `chatWorkflowState.ts`.
- `packages/daemon/src/chatWorkflowState.ts` is now 149 lines and owns approval
  IDs, stored approval proposal access, workflow-state construction, source
  merging, and next structured approval derivation. Confirmed-action completion
  results for Git recovery, commit push stop, PR creation/linking, and
  validation command completion now live in
  `packages/daemon/src/chatStructuredDone.ts` (148 lines).
- Plan deviation check: no material deviation. This is a daemon workflow-state
  source-structure slice. It does not alter approval IDs, workflow metadata,
  push-after-commit stopping behavior, PR follow-up text, validation completion
  delegation, route URLs, public exports, or persisted chat workflow state.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts`
  passed with 18 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- The latest Azure auth session cache split is aligned with the Azure auth
  source-structure and Project Link/ADO identity locality objective. It moves
  selected-user memory cache coordination and persisted-user best-effort cache
  handling behind a focused `azureAuthSessionCache.ts` Module while preserving
  the public `azureAuthSession.ts` Interface.
- `packages/core/src/store/azureAuthSession.ts` is now 262 lines and owns the
  authentication flow only: current-user resolution, silent MSAL login,
  browser login, cached-account login, ADO token acquisition, and auth-required
  error detection. New cache orchestration lives in
  `packages/core/src/store/azureAuthSessionCache.ts` (61 lines), with the
  existing low-level file Adapter left in `azureAuthUserCache.ts`.
- Plan deviation check: no material deviation. This is a source-structure slice
  for Azure identity internals. It does not alter OAuth scopes, MSAL account
  selection, browser login templates, ADO token fallback order,
  anonymous-user behavior, public export names, or the best-effort error mode
  for persisted user cache operations.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/azureAuthSessionCache.test.ts`
  passed with 3 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- The latest Review Queue core split is aligned with the Review Queue
  source-structure and route/runtime locality objective. It separates Azure
  Table entity normalization from queue listing and priority scoring while
  preserving the public `reviewQueue.ts` Interface.
- `packages/core/src/reviewQueue.ts` is now 89 lines and owns Table access,
  priority scoring, and queue sorting. New entity normalization lives in
  `packages/core/src/reviewQueueEntity.ts` (175 lines), and shared DTO types
  live in `packages/core/src/reviewQueueTypes.ts` (54 lines).
- Plan deviation check: no material deviation. This is a source-structure slice
  for Review Queue internals. It does not alter storage account routing, Azure
  Table query filters, queue priority scoring, sort order, DTO field names,
  manual disposition parsing semantics, or write-back event parsing semantics.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/reviewQueueEntity.test.ts test/reviewHistoryLocal.test.ts`
  passed with 5 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- The latest Project Link discovery state split is aligned with the Project Link
  onboarding and page-runtime locality objective. It moves shared ADO discovery
  signature generation and discovery-result-to-form transitions behind the
  `projectLinks.ts` Module so the Project Links page runtime and the Chat
  onboarding runtime no longer duplicate those rules.
- `apps/desktop/src/projectLinks.ts` now exposes
  `adoDiscoverySignature(...)` and `applyAdoDiscoveryToProjectLinkInput(...)`.
  `apps/desktop/src/pages/projectLinks/useProjectLinkFormRuntime.ts` is now 191
  lines, and
  `apps/desktop/src/pages/chat/projectLinkOnboarding/useProjectLinkSetupState.ts`
  is now 247 lines after consuming the shared Interface.
- Plan deviation check: no material deviation. This is a source-structure slice
  for Project Link discovery. It does not alter branch detection, ADO discovery
  endpoints, auto-discovery timing, pipeline recommendation behavior, form save
  behavior, route URLs, API calls, or persisted Project Link payloads.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts`
  passed with 7 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- The latest conversation Project Link onboarding split is aligned with the
  no-profile inline setup objective and desktop page-structure cleanup. It
  separates pipeline matching/configuration fields from the ADO org/project/repo
  fields while preserving the `ProjectLinkAdoFields` Interface used by the chat
  onboarding flow.
- `apps/desktop/src/pages/chat/projectLinkOnboarding/ProjectLinkAdoFields.tsx`
  is now 223 lines and owns ADO org, project, repository, and discovery-error
  rendering. New pipeline-specific onboarding UI lives in
  `apps/desktop/src/pages/chat/projectLinkOnboarding/ProjectLinkPipelineFields.tsx`
  (89 lines).
- Plan deviation check: no material deviation. This is a source-structure slice
  for the conversation Project Link setup flow. It does not alter form state,
  ADO discovery behavior, pipeline discovery/selection behavior, route URLs,
  API calls, persisted Project Link payloads, or chat onboarding state.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- The latest Project Link form UI split is aligned with the Project Link
  onboarding and desktop page-structure objective. It separates pipeline
  matching/configuration UI from the shared Project Link form controls while
  preserving the existing `ProjectLinkAdoSection` Interface.
- `apps/desktop/src/pages/projectLinks/ProjectLinkFormControls.tsx` is now 187
  lines and owns generic fields, branch selection, and ADO project/repository
  discovery selectors. New pipeline-specific UI lives in
  `apps/desktop/src/pages/projectLinks/ProjectLinkPipelineDetails.tsx` (106
  lines). `ProjectLinkAdoSection.tsx` remains a thin composition Module at 80
  lines.
- Plan deviation check: no material deviation. This is a source-structure slice
  for the Project Link flow. It does not alter form state, discovery behavior,
  pipeline selection behavior, route URLs, API calls, or persisted Project Link
  payloads.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- The latest source/test size audit is aligned with the file-splitting and
  project-structure cleanup objective. It verifies that no handwritten
  TypeScript/React source Module under `apps/desktop/src`, `packages/core/src`,
  `packages/daemon/src`, `packages/cli/src`, or `packages/review-agent/src`
  remains at or above 300 lines, and no test Module under the matching test
  trees remains at or above 300 lines.
- Plan deviation check: no material deviation. This is an audit slice after
  the source, route, streaming, desktop, and test-locality splits. It confirms
  the current work is within the practical file-size target instead of forcing
  an unnecessary shallow split.
- Verification for this slice: source Module size scan returned no files at or
  above 300 lines; test Module size scan returned no files at or above 300
  lines. The latest scoped desktop and daemon tests plus desktop/daemon
  typechecks remain the verification baseline for the touched implementation
  Modules in this working tree.
- The latest daemon server smoke test split is aligned with the Daemon routes
  split and workflow-route locality goal. It separates `push_branch` approval
  readiness behavior from the broad server smoke file while preserving the
  `/chat/workflow-action` Interface.
- `packages/daemon/test/server.test.ts` is now 284 lines and owns the remaining
  broad smoke coverage for structured commit progression and canonical
  `ui.chunk` SSE emission. New push workflow coverage lives in
  `packages/daemon/test/serverPushWorkflowRoutes.test.ts` (142 lines) for
  stored push approvals and ahead/behind readiness.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Daemon routes/workflow split. It does not alter route URLs,
  request schemas, workflow approval persistence, push readiness semantics,
  tool exposure rules, confirm-action behavior, or `ChatUiChunk` streaming
  semantics.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts test/serverPushWorkflowRoutes.test.ts`
  passed with 6 tests; daemon typecheck passed.
- The latest desktop chat bubble finalization test split is aligned with the
  Chat streaming contract and assistant bubble state locality objective. It
  separates basic final response de-duplication/replacement rules from streamed
  typed-part/source/tool-bubble finalization behavior while preserving the
  `finaliseAssistantResponseBubbles` Interface.
- `apps/desktop/src/chatBubbleFinalization.test.ts` is now 161 lines and owns
  final assistant bubble creation, same-turn replacement, approval-card
  de-duplication, CRLF normalization, and leaked finalization JSON cleanup.
  New streamed part coverage lives in
  `apps/desktop/src/chatBubbleFinalizationStreamedParts.test.ts` (180 lines)
  for parts-only streamed bubbles, final source attachment after `ui.text-end`,
  and streamed assistant bubbles followed by tool bubbles.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed chat streaming and bubble reducer work. It does not alter
  bubble finalization semantics, metadata/source attachment behavior, approval
  card de-duplication, tool timeline behavior, route URLs, API calls, or stream
  event handling.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/chatBubbleFinalization.test.ts src/chatBubbleFinalizationStreamedParts.test.ts`
  passed with 9 tests; desktop typecheck passed.
- The latest desktop conversation renderer test split is aligned with the Chat
  streaming contract and desktop conversation rendering locality objective. It
  separates structured conversation part rendering from markdown/code rendering
  while preserving the `ConversationPartRenderer` Interface.
- `apps/desktop/src/components/conversation/ConversationPartRenderer.test.tsx`
  is now 134 lines and owns markdown, streaming markdown, sanitization, and
  code-fence/code-block behavior. New structured part coverage lives in
  `apps/desktop/src/components/conversation/ConversationPartRendererStructuredParts.test.tsx`
  (203 lines) for tool calls, approval parts, source references, artifact
  cards, artifact status states, and selectable artifacts.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed conversation renderer and `ChatUiChunk` streaming work. It
  does not alter rendered markup contracts, markdown sanitization, source
  reference semantics, artifact selection behavior, approval evidence behavior,
  route URLs, API calls, or stream event handling.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/ConversationPartRendererStructuredParts.test.tsx`
  passed with 15 tests; desktop typecheck passed.
- The latest desktop PR insight artifact test split is aligned with the Pull
  Requests page split and desktop file-locality objective. It separates local
  artifact storage/history behavior from artifact comparison/freshness
  analysis behavior while preserving the existing storage Interface.
- `apps/desktop/src/prInsightArtifacts.test.ts` is now 243 lines and owns
  artifact persistence, replacement, pruning, lookup, and clear behavior. New
  focused analysis coverage lives in
  `apps/desktop/src/prInsightArtifactAnalysis.test.ts` (177 lines) for preview
  versus full-review comparison and saved-artifact freshness classification.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Pull Requests page split. It does not alter localStorage
  keys, artifact DTOs, PR baseline comparison semantics, artifact freshness
  semantics, route URLs, API calls, or `ChatUiChunk` streaming behavior.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/prInsightArtifacts.test.ts src/prInsightArtifactAnalysis.test.ts`
  passed with 7 tests; desktop typecheck passed.
- The latest daemon server test split is aligned with the Daemon routes split
  and route-test locality goal. It now extracts twenty focused route-test Modules
  from the original 4097-line `server.test.ts`: chat history/metadata/delete
  coverage in `serverChatHistoryRoutes.test.ts`, basic health/task/unknown
  workflow-state coverage in `serverTaskRoutes.test.ts`, checkpoint
  preview/rollback plus repository index status/refresh coverage in
  `serverCheckpointIndexRoutes.test.ts`, and Project Link CRUD/discovery/tool
  health coverage in `serverProjectLinkRoutes.test.ts`, and local review
  disposition/operation coverage in
  `serverReviewStorageRoutes.test.ts`, PR insight artifact storage coverage in
  `serverPrInsightStorageRoutes.test.ts`, and review disposition ADO write-back
  coverage in `serverReviewDispositionWritebackRoutes.test.ts`, and pull
  request list/context coverage in
  `serverPullRequestRoutes.test.ts`, heuristic insight-preview coverage in
  `serverPullRequestInsightPreviewRoutes.test.ts`, and ADO pipeline/work-item workflow
  coverage in `serverAdoWorkflowRoutes.test.ts`, and auth/cache plus git remote inference coverage in `serverAuthGitRoutes.test.ts`, and review-run AI insight metadata/compression coverage in `serverReviewRunRoutes.test.ts`, and PR policy/work-item/auth diagnostic workflow coverage in `serverPrWorkflowRoutes.test.ts`, PR insight workflow coverage in `serverPrInsightWorkflowRoutes.test.ts`, and branch checkout/create workflow coverage in `serverBranchWorkflowRoutes.test.ts`, and PR creation lifecycle coverage in `serverPrCreationWorkflowRoutes.test.ts`, and commit/validation command proposal coverage in `serverCommitValidationWorkflowRoutes.test.ts`, validation artifact rerun selection coverage in `serverValidationArtifactWorkflowRoutes.test.ts`, conflict/recovery workflow coverage in `serverRecoveryWorkflowRoutes.test.ts`, and push workflow approval/readiness coverage in `serverPushWorkflowRoutes.test.ts`.
- `packages/daemon/test/server.test.ts` is now 284 lines, down from 4097.
  Focused test Modules: `serverChatHistoryRoutes.test.ts` 146 lines,
  `serverTaskRoutes.test.ts` 92 lines, and
  `serverCheckpointIndexRoutes.test.ts` 208 lines, and
  `serverProjectLinkRoutes.test.ts` 255 lines, and
  `serverReviewStorageRoutes.test.ts` 209 lines, and
  `serverPrInsightStorageRoutes.test.ts` 224 lines, and
  `serverReviewDispositionWritebackRoutes.test.ts` 240 lines, and
  `serverPullRequestRoutes.test.ts` 252 lines, and
  `serverPullRequestInsightPreviewRoutes.test.ts` 246 lines, and
  `serverAdoWorkflowRoutes.test.ts` 279 lines, and
  `serverAuthGitRoutes.test.ts` 76 lines, and
  `serverReviewRunRoutes.test.ts` 230 lines, and
  `serverPrWorkflowRoutes.test.ts` 245 lines, and
  `serverPrInsightWorkflowRoutes.test.ts` 209 lines, and
  `serverBranchWorkflowRoutes.test.ts` 182 lines, and
  `serverPushWorkflowRoutes.test.ts` 142 lines, and
  `serverPrCreationWorkflowRoutes.test.ts` 271 lines, and
  `serverCommitValidationWorkflowRoutes.test.ts` 284 lines, and
  `serverValidationArtifactWorkflowRoutes.test.ts` 188 lines, and
  `serverRecoveryWorkflowRoutes.test.ts` 290 lines. This keeps the broad server smoke
  file green for the remaining route/workflow coverage while improving test
  Locality around the route Interfaces already split in daemon source.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Daemon routes split. It does not alter route URLs, request
  schemas, task lifecycle behavior, checkpoint preview/rollback planning,
  repository index status/refresh behavior, Project Link CRUD/discovery/tool
  health behavior, local review disposition persistence, review operation
  persistence, PR insight artifact persistence, ADO disposition write-back
  success/failure behavior, pull request list/context behavior, heuristic insight-preview
  behavior, ADO pipeline inspection/trigger approval behavior, work item link
  approval behavior, auth cache status/logout behavior, git remote ADO inference
  behavior, review-run AI insight metadata/compression behavior, PR policy/work-item/auth diagnostic workflow behavior, PR insight workflow behavior, branch checkout/create workflow behavior, PR creation approval/preflight/confirmation behavior, commit/validation proposal behavior, validation command derivation behavior, validation artifact rerun selection behavior, conflict blocking behavior, rebase/merge abort behavior, resolved conflict-file staging behavior, chat history
  persistence, metadata update behavior, deletion behavior, workflow behavior, or
  `ChatUiChunk` streaming semantics. The current
  optimization remains compatible with the architecture plan: stable endpoint
  Interfaces, unchanged behavior, and smaller focused Modules.
- Verification for this slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverChatHistoryRoutes.test.ts`
  passed with 3 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverTaskRoutes.test.ts`
  passed with 5 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverCheckpointIndexRoutes.test.ts`
  passed with 4 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverProjectLinkRoutes.test.ts`
  passed with 5 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewStorageRoutes.test.ts test/serverPrInsightStorageRoutes.test.ts`
  passed with 3 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewDispositionWritebackRoutes.test.ts`
  passed with 2 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPullRequestRoutes.test.ts test/serverPullRequestInsightPreviewRoutes.test.ts`
  passed with 3 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAdoWorkflowRoutes.test.ts`
  passed with 2 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAuthGitRoutes.test.ts`
  passed with 2 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts`
  passed with 1 test;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPrWorkflowRoutes.test.ts test/serverPrInsightWorkflowRoutes.test.ts`
  passed with 4 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverBranchWorkflowRoutes.test.ts`
  passed with 4 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPushWorkflowRoutes.test.ts`
  passed with 2 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPrCreationWorkflowRoutes.test.ts`
  passed with 3 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverCommitValidationWorkflowRoutes.test.ts test/serverValidationArtifactWorkflowRoutes.test.ts`
  passed with 6 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverRecoveryWorkflowRoutes.test.ts`
  passed with 4 tests;
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 4 tests; daemon typecheck passed.
- The latest review planner test split is aligned with the Review-agent
  dependency cleanup and shared review runtime locality goal. It separates
  prompt/compression/coverage behavior from model-response parsing and finding
  post-processing while preserving the legacy `reviewPlanner.test.ts` command.
- `packages/review-agent/test/reviewPlanner.test.ts` is now a 2-line
  compatibility entry, down from 411 lines. New focused test/support Modules:
  `reviewPlannerPrompt.test.ts` 252 lines,
  `reviewPlannerResponse.test.ts` 152 lines, and
  `reviewPlannerTestDoubles.ts` 14 lines.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed shared Review planner split. It does not alter prompt
  rendering, compression priority, coverage reporting, model response parsing,
  finding filtering, review-agent imports, result shapes, or daemon/review-agent
  dependency direction.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/review-agent test -- test/reviewPlanner.test.ts`
  passed with 12 tests; the focused command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/review-agent test -- test/reviewPlannerPrompt.test.ts test/reviewPlannerResponse.test.ts`
  passed with 12 tests; review-agent typecheck passed.
- The latest daemon checkpoint test split is aligned with the Daemon routes
  split and checkpoint/activity locality goal. It separates saved PR insight
  chat-context behavior from Git checkpoint safety/activity behavior while
  preserving the legacy `chatSessionCheckpoint.test.ts` command.
- `packages/daemon/test/chatSessionCheckpoint.test.ts` is now a 2-line
  compatibility entry, down from 474 lines. New focused test/support Modules:
  `chatSessionPrInsightContext.test.ts` 265 lines,
  `chatSessionGitCheckpoint.test.ts` 162 lines, and
  `chatSessionCheckpointTestDoubles.ts` 64 lines.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Daemon routes/workflow split. It does not alter chat
  session runtime behavior, PR insight prompt shaping, checkpoint creation,
  checkpoint activity metadata, checkpoint apply behavior, route URLs, or
  `ChatUiChunk` streaming semantics.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts`
  passed with 11 tests; the focused command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionPrInsightContext.test.ts test/chatSessionGitCheckpoint.test.ts`
  passed with 11 tests; daemon typecheck passed.
- The latest daemon chat workflow test split is aligned with the Daemon routes
  split and workflow-orchestration locality goal. It deepens the test seam by
  separating pending action derivation/scope guards, validation and pipeline
  recovery artifacts, and repository index refresh behavior into focused test
  Modules while preserving the legacy `chatSessionWorkflow.test.ts` command.
- `packages/daemon/test/chatSessionWorkflow.test.ts` is now a 3-line
  compatibility entry, down from 522 lines. New focused test/support Modules:
  `chatSessionWorkflowDerivation.test.ts` 258 lines,
  `chatSessionValidationArtifacts.test.ts` 213 lines,
  `chatSessionIndexRefresh.test.ts` 51 lines, and
  `chatSessionWorkflowTestDoubles.ts` 12 lines.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Daemon routes/workflow split. It does not alter daemon
  route URLs, chat workflow runtime behavior, approval proposal scope rules,
  validation artifact content, repository indexing behavior, or `ChatUiChunk`
  streaming semantics.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts`
  passed with 27 tests; the focused command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts test/chatSessionValidationArtifacts.test.ts test/chatSessionIndexRefresh.test.ts`
  passed with 19 tests; daemon typecheck passed.
- The latest ADO client test split is aligned with the Azure DevOps internal
  Module track. It deepens the client/discovery/pull-request test Interfaces by
  moving auth/client diagnostics, discovery/build/pipeline/work-item behavior,
  and PR read-side behavior into separate files while preserving the legacy
  `adoClient.test.ts` test command.
- `packages/core/test/adoClient.test.ts` is now a 3-line compatibility entry,
  down from 579 lines. New focused Modules: `adoClientAuth.test.ts` 86 lines,
  `adoClientDiscovery.test.ts` 222 lines, and
  `adoClientPullRequests.test.ts` 270 lines.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Azure DevOps internal Module track. It does not alter ADO
  auth/header behavior, URL construction, response parsing, discovery
  semantics, PR read behavior, exported function names, or public tool names.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts`
  passed with 18 tests; the focused command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClientAuth.test.ts test/adoClientDiscovery.test.ts test/adoClientPullRequests.test.ts`
  passed with 18 tests; core typecheck passed.
- The latest Azure DevOps internal test split is aligned with the internal ADO
  Module objective and the "reuse MCP logic internally" product direction. It
  deepens the test seam by matching test files to ADO domain Interfaces:
  pull-request reads, build/pipeline reads, PR mutations, and health
  diagnostics.
- `packages/core/test/azureDevOpsInternal.test.ts` is now a 4-line
  compatibility entry, down from 604 lines. New focused test/support Modules:
  `adoPullRequestsInternal.test.ts` 259 lines,
  `adoBuildPipelineInternal.test.ts` 177 lines,
  `adoPullRequestMutationsInternal.test.ts` 129 lines,
  `adoHealthInternal.test.ts` 43 lines, and `adoTestDoubles.ts` 21 lines.
- Plan deviation check: no material deviation. This is a test-structure slice
  for the completed Azure DevOps internal Module track. It does not alter ADO
  request URLs, auth behavior, response shaping, exported function names, tool
  names, or compatibility exports from `packages/core/src/tools/azureDevOps.ts`.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts`
  passed with 15 tests; the focused command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoPullRequestsInternal.test.ts test/adoBuildPipelineInternal.test.ts test/adoPullRequestMutationsInternal.test.ts test/adoHealthInternal.test.ts`
  passed with 15 tests; core typecheck passed.
- The latest Core Chat planner test split is aligned with the Chat planner
  structure and streaming standardization track. It deepens the test Module
  seam by separating planner finalization/visible streaming assertions from
  approval-guard assertions while keeping the legacy
  `chatPlannerApproval.test.ts` entry as a 2-line compatibility import.
- `packages/core/test/chatPlannerApproval.test.ts` is now 2 lines, down from
  648. New focused test/support Modules: `chatPlannerFinalization.test.ts`
  186 lines, `chatPlannerAgentFinalTool.test.ts` 216 lines,
  `chatPlannerApprovalGuards.test.ts` 169 lines, and
  `chatPlannerTestDoubles.ts` 120 lines. Finalization parser/visible streaming
  behavior and `agent_final` tool orchestration now have separate focused test
  Module Interfaces.
- Plan deviation check: no material deviation. This is a structure-only
  extension of the Core Chat planner split. It does not change planner runtime
  behavior, `ChatEvent` names, `ChatUiChunk` streaming semantics, approval
  gating, endpoint URLs, or the public test command documented by earlier
  slices.
- Verification for this slice: the legacy command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerApproval.test.ts`
  passed with 19 tests; the focused approval/finalization command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerFinalization.test.ts test/chatPlannerApprovalGuards.test.ts`
  passed with 19 tests; the focused agent-final command
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerFinalization.test.ts test/chatPlannerAgentFinalTool.test.ts`
  passed with 10 tests; core typecheck passed.
- The latest Desktop bundle split is aligned with the plan's file-splitting and
  structure cleanup goals. It deepens the build/runtime seam by keeping Vite
  chunk grouping behind a small `desktopManualChunk` Adapter and by putting the
  Streamdown markdown implementation behind `MarkdownContentRuntime`.
- `apps/desktop/vite.config.ts` is now 66 lines. Manual chunking is based on
  resolved package names, not broad substring checks; this avoids the previous
  bad grouping where pnpm peer-dependency path suffixes could pull
  Streamdown/Shiki/markdown dependencies into the React runtime chunk.
- The markdown renderer seam now has three focused Modules:
  `MarkdownContentRuntime.tsx` is a 17-line lazy Adapter,
  `MarkdownContentFallback.tsx` is a 231-line synchronous fallback for
  SSR/static tests and first-paint readability, and `MarkdownContent.tsx` keeps
  the 143-line Streamdown implementation.
- Code highlighting is now behind the local `codeHighlight.ts` Module instead
  of direct Shiki runtime imports. `CodeBlock.tsx` stays at 102 lines and keeps
  the existing copy/collapse/language-label Interface while avoiding the large
  Shiki language-pack chunks. The unused `@streamdown/code` dependency and
  Tailwind content path were removed from the desktop package; the lockfile was
  refreshed with the repo-local pnpm runtime.
- Mermaid artifact rendering now has a focused runtime seam:
  `ArtifactWorkspaceContent.tsx` is a 186-line content dispatcher,
  `MermaidArtifactPreview.tsx` is a 107-line explicit preview Module, and
  `mermaidArtifactRenderer.ts` is a 25-line Mermaid Adapter. Opening a Mermaid
  artifact no longer imports or renders Mermaid automatically; users must choose
  `Render diagram`, which preserves the source-first artifact workflow and
  keeps the heavy diagram engine behind an on-demand interaction.
- Verification for this slice: `ConversationPartRenderer.test.tsx` passed with
  15 tests, `ArtifactWorkspace.test.tsx` passed with 4 tests, desktop typecheck
  passed, and desktop build passed. The current build has no circular chunk
  warning. The actual `index.html` entry script is `index-CGNKeV6u.js` at
  444.38 kB, down from the prior 1,298.27 kB baseline and from the interim
  1,099.33 kB result. `vendor-react-DEl_Zknd.js` remains 176.11 kB after the
  package-name fix.
- Plan deviation check: no material deviation. This is a performance/locality
  extension of the Desktop renderer split and does not change endpoint URLs,
  `ChatUiChunk` streaming semantics, SSE compatibility behavior, Azure DevOps
  tool behavior, or the public conversation renderer Interface. Remaining large
  chunk warnings are lazy Mermaid core and Wardley diagram chunks; they are now
  separate dependency-weight candidates instead of evidence that markdown
  rendering, code highlighting, or opening the artifact workspace still loads
  heavy renderer code eagerly.
- The latest Desktop global styles split is aligned with the frontend
  structure/file-size objective. It deepens the global style seam by keeping
  `index.css` as the Tailwind entry Module and moving base tokens, light-theme
  compatibility, Settings styles, Chat workspace layout, and conversation
  markdown streaming styles into focused CSS Modules.
- `apps/desktop/src/index.css` is now 3 lines, down from 787. New style Modules
  and line counts: `base.css` 62, `theme-compat.css` 215, `settings.css` 3,
  `settings-layout.css` 89, `settings-controls.css` 190,
  `settings-feedback.css` 47, `chat-workspace.css` 120, and
  `conversation-markdown.css` 55.
- Plan deviation check: no material deviation. This is a structure-only
  extension of the Desktop Chat / Settings / conversation renderer split. It
  does not alter class names, selector bodies, theme variable values,
  Chat/Settings JSX Interfaces, `ChatUiChunk` streaming semantics, endpoint
  URLs, or runtime behavior.
- Verification for this slice: desktop typecheck passed and desktop build
  passed. Vite still reports existing large chunk warnings after minification;
  that is a separate bundle-splitting/performance candidate, not a CSS split
  failure.
- The latest shared Review planner split is aligned with the review-agent
  dependency cleanup and file-size objective. It deepens the prompt compression
  seam by moving file priority scoring and related path heuristics into
  `reviewFilePriority.ts` while preserving `prompt.ts`,
  `reviewPlanner.ts`, and package-level review exports.
- `packages/core/src/review/prompt.ts` is now 227 lines, down from 315 at the
  start of this slice. It now owns system prompt text, review prompt rendering,
  compression assembly, compression summary, context coverage summary, changed
  file rendering, and PR signal rendering.
- New shared Review planner Module added by this slice:
  `packages/core/src/review/reviewFilePriority.ts` (91 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  shared review planner split and ADR-0007 dependency cleanup. It does not
  alter prompt text, compression budget behavior, file priority scoring
  semantics, exported function names, review-agent imports, or review result
  shapes.
- Verification for this slice: core typecheck passed; review-agent typecheck
  passed; `reviewPlanner.test.ts` plus `reviewDecision.test.ts` passed with 19
  tests. An initial core-package test command was corrected because these
  review planner tests live in `packages/review-agent/test`.
- The latest Core Chat planner split is aligned with the Chat planner
  structure and streaming standardization track. It deepens the tool-execution
  seam by moving planner tool streaming and repeated tool-failure handling into
  `chatPlannerToolExecution.ts` while preserving `ChatPlanner.run(...)`,
  planner compatibility exports, and `ChatEvent` ordering.
- `packages/core/src/chatPlanner.ts` is now 296 lines, down from 348 at the
  start of this slice. It now owns the LLM step loop, planner message
  mutation, approval gating, finalization parsing, and step-limit fallback.
- New Core Chat planner Module added by this slice:
  `packages/core/src/chatPlannerToolExecution.ts` (91 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Core Chat planner split and canonical streaming path. It does not alter
  tool-call event names, tool output streaming semantics, approval behavior,
  finalization behavior, retry threshold, exported type names, or public
  `ChatPlanner` behavior.
- Verification for this slice: core typecheck passed, and
  `chatPlannerApproval.test.ts`, `chatUiStream.test.ts`, plus
  `plannerOffline.test.ts` passed with 28 tests.
- The latest Desktop API DTO split is aligned with the `Split Desktop API
  Client` track and the file-size objective. It deepens the chat API type seam
  by moving stream events, conversation records, checkpoint records, workflow
  DTOs, and index DTOs behind separate focused Modules while preserving the
  existing `apps/desktop/src/api/chatTypes.ts` compatibility Interface and
  `apps/desktop/src/api.ts` barrel exports.
- `apps/desktop/src/api/chatTypes.ts` is now a 5-line compatibility export
  entry, down from 301 lines.
- New desktop chat API type Modules added by this slice:
  `apps/desktop/src/api/chatStreamTypes.ts` (82 lines),
  `apps/desktop/src/api/chatConversationTypes.ts` (52 lines),
  `apps/desktop/src/api/chatCheckpointTypes.ts` (58 lines),
  `apps/desktop/src/api/chatWorkflowTypes.ts` (88 lines), and
  `apps/desktop/src/api/chatIndexTypes.ts` (23 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Desktop API Client split. It does not alter request URLs, SSE parsing,
  `ChatUiChunk` semantics, chat history/checkpoint/workflow response shapes,
  exported type names, or existing `../../api.js` imports.
- Verification for this slice: desktop typecheck passed, and `api.test.ts`,
  `chatStreamDispatcher.test.ts`, plus `chatUiChunkDispatcher.test.ts` passed
  with 11 tests.
- The latest checkpoint detail split is aligned with the TaskViewer / Activity
  workspace split and the file-size objective. It deepens the checkpoint detail
  seam by moving snapshot preview rendering and rollback proposal rendering
  into focused Modules while preserving the existing `CheckpointDetailPanel`
  Interface used by TaskViewer.
- `apps/desktop/src/pages/taskViewer/CheckpointDetailPanel.tsx` is now 134
  lines, down from 304. It now owns the checkpoint detail shell, summary facts,
  apply summary, and tool result section only.
- New checkpoint detail Modules added by this slice:
  `apps/desktop/src/pages/taskViewer/CheckpointPreviewSection.tsx` (88 lines)
  and
  `apps/desktop/src/pages/taskViewer/CheckpointRollbackPlanSection.tsx` (90
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  TaskViewer / Activity workspace split. It does not alter activity selection,
  checkpoint preview data, rollback plan data, approval handoff behavior,
  endpoint URLs, `ChatUiChunk` streaming semantics, or workflow action names.
- Verification for this slice: desktop typecheck passed, and
  `TaskViewer.test.tsx` passed with 2 tests.
- The latest ADO builds split is aligned with the Azure DevOps internal Module
  objective and the PR/pipeline insight objective. It deepens the build
  diagnostics seam by moving build log retrieval and failure-oriented excerpt
  selection into `buildLogs.ts` while preserving `builds.ts` compatibility
  exports.
- `packages/core/src/ado/builds.ts` is now 241 lines, down from 313. It now
  owns build definitions, build list queries, build timeline summarization, and
  repository-id resolution for definition discovery.
- New ADO build diagnostics Module added by this slice:
  `packages/core/src/ado/buildLogs.ts` (79 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Azure DevOps internal Module split and supports pipeline/PR insight
  diagnostics. It does not alter exported function names, build API request
  URLs, log excerpt semantics, response shapes, auth behavior, or tool registry
  behavior.
- Verification for this slice: core typecheck passed, and
  `azureDevOpsInternal.test.ts` plus `adoClient.test.ts` passed with 33 tests.
- The latest ADO PR mutation split is aligned with the Azure DevOps internal
  Module objective and the internal-source-reuse direction. It deepens the PR
  mutation seam by moving shared mutation plumbing into
  `pullRequestMutationSupport.ts`: PR mutation ID validation, reviewer endpoint
  construction, and typed ADO JSON POST/PUT/PATCH helpers.
- `packages/core/src/ado/pullRequestMutations.ts` is now 264 lines, down from
  318. It now owns PR-create, PR metadata update, reviewer add/remove, and label
  add/remove domain behavior only.
- New ADO PR mutation support Module added by this slice:
  `packages/core/src/ado/pullRequestMutationSupport.ts` (65 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Azure DevOps internal Module split. It does not alter exported function names,
  tool names, request URLs, request bodies, response shapes, auth behavior, or
  tool registry behavior.
- Verification for this slice: core typecheck passed, and
  `adoPullRequestMutations.test.ts` plus `azureDevOpsInternal.test.ts` passed
  with 19 tests.
- The latest Review Queue runtime split is aligned with the Review Queue
  classification/pagination objective and the desktop file-splitting objective.
  It deepens the runtime seam by moving queue counts, filter/sort derivation,
  stale-review selection, and pagination into `useReviewQueueView.ts`, and
  moving batch rerun state/progress/loop orchestration into
  `useReviewQueueBatchRerun.ts`.
- `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts` is now 288
  lines, down from 337 at the start of this slice. It now owns queue loading,
  disposition persistence, ADO write-back retry, single-item rerun, optimistic
  item replacement, and findings panel state.
- New Review Queue Modules added by this slice:
  `apps/desktop/src/pages/reviewFindings/useReviewQueueView.ts` (73 lines) and
  `apps/desktop/src/pages/reviewFindings/useReviewQueueBatchRerun.ts` (68
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Review Queue workspace split. It does not alter queue filters, sort modes,
  pagination behavior, stale review selection, batch rerun behavior,
  disposition behavior, ADO write-back retry behavior, route URLs, or API call
  semantics.
- Verification for this slice: desktop typecheck passed, and
  `reviewQueueRuntime.test.ts` plus `reviewQueueViewModel.test.ts` passed with
  11 tests.
- The latest Pull Requests route split is aligned with the PR workspace
  pagination/classification objective and the desktop file-splitting objective.
  It deepens the page seam by moving PR list loading, Project Link selection
  persistence, branch scoping, category/pagination state, PR context expansion,
  insight artifact hydration, handoff wiring, and preview/review action wiring
  into `usePullRequestsRuntime.ts` while preserving the route UI and existing
  child Module Interfaces.
- `apps/desktop/src/pages/PullRequests.tsx` is now 141 lines, down from 330 in
  this working-tree slice. It now owns page rendering only.
- New Pull Requests runtime Module added by this slice:
  `apps/desktop/src/pages/pullRequests/usePullRequestsRuntime.ts` (265 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Pull Requests workspace split. It does not alter PR status filters, category
  filters, pagination, Project Link selection persistence, PR context loading,
  insight artifact behavior, route URLs, or API call semantics.
- Verification for this slice: desktop typecheck passed, and
  `pullRequestViewModel.test.ts` plus `prInsightArtifacts.test.ts` passed with
  12 tests.
- The latest core pipeline planner split is aligned with the file-splitting and
  core runtime structure objective. It deepens the pipeline planner seam by
  moving the system prompt, final JSON extraction, text truncation, first-line
  fallback, and deterministic offline summary into `plannerSupport.ts` while
  preserving the public `Planner` Interface.
- `packages/core/src/planner.ts` is now 283 lines, down from 364. It now owns
  non-streaming planner orchestration, streaming planner orchestration,
  tool-call execution flow, LLM-unavailable fallback, and final result shaping.
- New core pipeline planner Module added by this slice:
  `packages/core/src/plannerSupport.ts` (95 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  core file-splitting objective and directly supports pipeline/PR generation
  maintainability. It does not alter planner prompts, output JSON semantics,
  streaming event names, tool execution behavior, `Planner.buildOfflineSummary`,
  `SYSTEM_PROMPT`, or pipeline task behavior.
- Verification for this slice: core typecheck passed, and
  `plannerOffline.test.ts` plus `pipelineAgentOffline.test.ts` passed with 3
  tests.
- The latest chat session run split is aligned with the daemon Chat runtime and
  streaming standardization objective. It deepens the session seam by moving
  single-turn message execution, runtime setup, Project Link snapshot
  persistence, approval-message handling, and normal planner continuation into
  `chatSessionRun.ts` while preserving `ChatSessionManager.run(...)`.
- `packages/daemon/src/chatSession.ts` is now 291 lines, down from 378. It now
  owns session creation, history/bubble/workflow access, approval proposal
  creation, metadata/checkpoint helpers, confirmation lifecycle, and confirmed
  action orchestration.
- New daemon chat runtime Module added by this slice:
  `packages/daemon/src/chatSessionRun.ts` (120 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon Chat route/runtime split and supports the canonical streaming path. It
  does not alter SSE event names, `ChatUiChunk` semantics, session IDs,
  approval behavior, endpoint URLs, Project Link/Profile compatibility behavior,
  or workflow action names.
- Verification for this slice: daemon typecheck passed, and
  `chatSessionWorkflow.test.ts`, `chatSessionCheckpoint.test.ts`, and
  `chatEvents.test.ts` passed with 48 tests.
- The latest daemon server split is aligned with the Daemon routes split and
  workflow Module objective. It deepens the `server.ts` seam by moving daemon
  env source resolution, Windows sidecar Git PATH discovery, and workspace
  workflow orchestration into focused Modules while preserving the public
  `buildApp`, `startServer`, route URLs, and workflow action Interfaces.
- `packages/daemon/src/server.ts` is now 149 lines, down from 332 in this
  working-tree slice. It now owns Fastify app creation, global hooks/error
  handling, queue/session lifecycle, route registration, and shutdown only.
- New daemon Modules added by this slice:
  `packages/daemon/src/daemonEnv.ts` (40 lines),
  `packages/daemon/src/gitPath.ts` (36 lines), and
  `packages/daemon/src/workflows/workspaceWorkflowRunner.ts` (113 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon route/workflow split. It does not alter endpoint URLs, request/response
  payloads, Project Link/Profile compatibility behavior, `ChatUiChunk`
  streaming semantics, Azure DevOps behavior, or workflow action names.
- Verification for this slice: daemon typecheck passed and
  `packages/daemon/test/server.test.ts` passed with 57 tests.
- The latest approval evidence split is aligned with the Chat approval and
  conversation evidence objective. It deepens the approval evidence seam by
  moving DTOs, preflight row derivation, approval scope rows, command preview
  generation, workflow-boundary text, and argument formatting into a focused
  model Module while preserving the existing `ApprovalEvidence` component
  Interface and `toolCommandPreview` export used by the execution timeline.
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx` is now 98
  lines, down from 344. It now owns rendering only.
- New approval evidence Module added by this slice:
  `apps/desktop/src/components/conversation/ApprovalEvidenceModel.ts` (263
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Chat approvals / conversation evidence split. It does not alter approval
  copy, command previews, scoped workflow boundaries, rendered evidence,
  `ChatUiChunk` streaming semantics, endpoint URLs, or workflow action names.
- The latest TaskViewer PR insight detail split is aligned with the
  TaskViewer / Activity workspace split. It deepens the PR insight detail seam
  by moving preview-vs-full and previous-run comparison rendering into a
  focused comparison Module while preserving the `PrInsightDetailPanel`
  Interface used by TaskViewer.
- `apps/desktop/src/pages/taskViewer/PrInsightDetailPanel.tsx` is now 209
  lines, down from 346. It now owns the detail shell, header, provenance,
  summary, metrics, readiness blockers, and risk sections only.
- New TaskViewer PR insight detail Module added by this slice:
  `apps/desktop/src/pages/taskViewer/PrInsightComparisonPanels.tsx` (148
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  TaskViewer / Activity workspace split and directly supports PR AI insight
  readability. It does not alter activity selection, artifact comparison data,
  endpoint URLs, `ChatUiChunk` streaming semantics, or review action names.
- The latest execution timeline model split is aligned with the desktop
  conversation rendering structure objective. It deepens the timeline model
  seam by moving CSS class derivation for header, status pills, group rails,
  group pills, state pills, and item dots into a focused style Module while
  preserving the existing `executionTimelineModel.ts` exports used by timeline
  rendering Modules.
- `apps/desktop/src/components/conversation/executionTimelineModel.ts` is now
  278 lines, down from 347. It now owns execution grouping, summaries,
  reflections, input/output summarization, shell-output extraction, and generic
  formatting only.
- New desktop execution timeline Module added by this slice:
  `apps/desktop/src/components/conversation/executionTimelineStyles.ts` (84
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  desktop conversation/Execution Timeline split. It does not alter rendered
  timeline content, approval attachment behavior, `ChatUiChunk` streaming
  semantics, endpoint URLs, or workflow action names.
- The latest core pipeline agent split is aligned with the submit-pipeline
  runtime structure objective. It deepens the pipeline agent seam by moving Git
  diff computation, build/test command execution, pull-request creation/linking,
  and ToolError-to-step mapping into a focused support Module while preserving
  the `runPipelineTask` and `PipelinePayload` Interfaces.
- `packages/core/src/pipelineAgent.ts` is now 226 lines, down from 342. It now
  owns submit-pipeline orchestration, Project Link config loading, indexing,
  embedding, context building, planning, telemetry, and final result shaping.
- New core pipeline agent Module added by this slice:
  `packages/core/src/pipelineAgentSupport.ts` (135 lines).
- Plan deviation check: no material deviation. This stays inside the
  file-splitting and core runtime structure objective. It does not alter task
  payload shape, planner behavior, tool names, Azure DevOps behavior, endpoint
  URLs, or `ChatUiChunk` streaming semantics.
- The latest core review state store split is aligned with the review-agent
  dependency cleanup objective. It deepens the state store seam by moving review
  history reason-code, disposition, write-back event, queue, risk, and
  confidence normalization into a focused normalization Module while preserving
  the `StateStore`, `TableStateStore`, `FileStateStore`, and
  `InMemoryStateStore` Interfaces.
- `packages/core/src/review/stateStore.ts` is now 276 lines, down from 381.
  It now owns Table/File/InMemory storage adapters and delegates review history
  normalization.
- New core review state Module added by this slice:
  `packages/core/src/review/stateStoreNormalization.ts` (118 lines).
- Plan deviation check: no material deviation. This stays inside the
  review-agent dependency cleanup and core review runtime structure objective.
  It does not alter review history storage shapes, review planner behavior,
  Azure DevOps behavior, endpoint URLs, or `ChatUiChunk` streaming semantics.
- The latest core Azure auth split is aligned with the Core Azure auth split
  objective. It deepens the auth seam by turning `azureAuth.ts` into a
  compatibility entry Module and moving credential construction, JWT/avatar
  identity helpers, MSAL session/token flow, and active-account selection into
  focused Modules while preserving all existing public auth exports.
- `packages/core/src/store/azureAuth.ts` is now 30 lines, down from 410 in
  this slice. The largest new auth runtime Module,
  `packages/core/src/store/azureAuthSession.ts`, is 296 lines and now owns the
  MSAL/current-user/token/session flow.
- New core Azure auth Modules added by this slice:
  `packages/core/src/store/azureAuthCredential.ts` (56 lines),
  `packages/core/src/store/azureAuthIdentity.ts` (30 lines),
  `packages/core/src/store/azureAuthSession.ts` (296 lines), and
  `packages/core/src/store/azureAuthAccountSelection.ts` (22 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  Core Azure auth split, preserves `getAzureCredential`, `getCurrentUser`,
  `getAzureDevOpsToken`, browser-login, cached-account, and persisted-user
  Interfaces, and does not alter Azure DevOps auth behavior, Project Link
  behavior, endpoint URLs, or `ChatUiChunk` streaming semantics.
- The latest daemon PR workflow split is aligned with the daemon workflow
  structure objective and the PR AI insight objective. It deepens the PR
  workflow seam by moving PR readiness calculation, insight summary formatting,
  policy/work-item summaries, and compact signal formatting into a focused
  insight Module while preserving the existing `runAdoPullRequestWorkflowAction`
  and `buildWorkflowPrInsight` Interfaces.
- `packages/daemon/src/workflows/prWorkflow.ts` is now 249 lines, down from
  340. It now owns PR workflow action orchestration, Project Link validation,
  ADO PR/work-item/policy/build fetching, approval proposal creation, workflow
  result shaping, and tool result wrapping only.
- New daemon PR workflow Module added by this slice:
  `packages/daemon/src/workflows/prWorkflowInsight.ts` (112 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon workflow split and directly supports PR AI insight evidence. It does
  not alter endpoint URLs, `ChatUiChunk` streaming semantics, Azure DevOps
  domain behavior, workflow action names, or PR insight summary semantics.
- The latest daemon pipeline workflow split is aligned with the daemon workflow
  structure objective. It deepens the pipeline workflow seam by moving pipeline
  run summary formatting and failed-run markdown artifact rendering into a
  focused artifact Module while preserving the existing
  `runAdoPipelineWorkflowAction`, `summarizePipelineRuns`, and
  `pipelineFailureArtifacts` Interfaces.
- `packages/daemon/src/workflows/pipelineWorkflow.ts` is now 242 lines, down
  from 367. It now owns pipeline trigger/inspection orchestration, ADO run
  fetching, timeline/log enrichment, workflow state shaping, and chat bubble
  append behavior only.
- New daemon pipeline workflow Module added by this slice:
  `packages/daemon/src/workflows/pipelineWorkflowArtifacts.ts` (138 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon workflow split and directly supports pipeline AI insight evidence. It
  does not alter endpoint URLs, `ChatUiChunk` streaming semantics, Azure DevOps
  domain behavior, workflow action names, or pipeline artifact shapes.
- The latest daemon review-run route split is aligned with the daemon route
  structure objective and the PR/review AI insight objective. It deepens the
  review-run route seam by moving request schemas, Project Link resolution,
  ADO diagnostic response shaping, PR signal enrichment, readiness mapping, and
  review finding category shaping into a focused support Module while
  preserving the `/project-links/:id/review-run` and legacy
  `/profiles/:id/review-run` endpoint Interfaces.
- `packages/daemon/src/routes/review-run.routes.ts` is now 229 lines, down from
  382. It now owns Fastify route registration, request parsing, review-run
  orchestration, state persistence, and response shaping only.
- New daemon review-run route Module added by this slice:
  `packages/daemon/src/routes/reviewRunRouteSupport.ts` (171 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon HTTP route split and directly supports the PR/review AI insight flow.
  It does not alter endpoint URLs, `ChatUiChunk` streaming semantics, Azure
  DevOps domain behavior, persisted review-run history shapes, review action
  names, or Project Link compatibility aliases.
- The latest daemon review route split is aligned with the daemon route
  structure objective. It deepens the review route seam by moving Project Link
  lookup, cloud/local Project Link fallback, review history DTO mapping, route
  constants, route dependency typing, and Azure DevOps disposition write-back
  into a focused helper Module while preserving all `/project-links` and
  `/profiles` review endpoint Interfaces.
- `packages/daemon/src/routes/review.routes.ts` is now 284 lines, down from
  410. It now owns Fastify route registration, request parsing, response
  shaping, and local persistence dispatch only.
- New daemon review route Module added by this slice:
  `packages/daemon/src/routes/reviewRouteSupport.ts` (141 lines). The schema
  Module also now exports typed payload aliases for support-code reuse.
- Plan deviation check: no material deviation. This stays inside the planned
  daemon HTTP route split and directly supports the PR/review AI insight flow.
  It does not alter endpoint URLs, `ChatUiChunk` streaming semantics, Azure
  DevOps domain behavior, persisted review/insight shapes, or review action
  names.
- The latest desktop Review Queue runtime split is aligned with the Review
  Queue page-structure cleanup objective. It deepens the runtime seam by moving
  global review settings hydration/persistence and review operation activity
  refresh/record/filter behavior out of `useReviewQueueRuntime` while
  preserving the existing Review Queue page runtime Interface.
- `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts` is now 337
  lines, down from 419. It now owns queue loading, selected findings panel
  state, disposition actions, ADO write-back retry, rerun review, batch rerun,
  pagination, and queue derivation.
- New desktop Review Queue runtime Modules added by this slice:
  `apps/desktop/src/pages/reviewFindings/useReviewQueueSettings.ts` (66
  lines) and
  `apps/desktop/src/pages/reviewFindings/useReviewOperationActivity.ts` (50
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  desktop Review Queue page/runtime split and directly supports the AI review
  workflow. It does not alter endpoint URLs, `ChatUiChunk` streaming semantics,
  Azure DevOps domain behavior, persisted review queue shapes, or review action
  names.
- The latest desktop Pull Requests insight panel split is aligned with the PR
  AI insight product direction and page-structure cleanup objective. It deepens
  the insight-rendering seam by moving saved insight history, preview insight
  markdown/risk rendering, full review-run metadata/compression/findings
  rendering, and shared risk badge rendering out of the compatibility
  `PullRequestInsightPanels` Module while preserving existing imports from
  `PullRequestCard`.
- `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx` is now 3
  lines, down from 399. It now acts as a compatibility export Module only.
- New desktop Pull Requests insight Modules added by this slice:
  `apps/desktop/src/pages/pullRequests/StoredInsightPanel.tsx` (166 lines),
  `apps/desktop/src/pages/pullRequests/InsightPreviewPanel.tsx` (38 lines),
  `apps/desktop/src/pages/pullRequests/ReviewRunPanel.tsx` (173 lines), and
  `apps/desktop/src/pages/pullRequests/InsightRiskBadges.tsx` (35 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  desktop PR page split and directly supports AI insight readability. It does
  not alter endpoint URLs, `ChatUiChunk` streaming semantics, Azure DevOps
  domain behavior, persisted artifact shapes, or PR action names.
- The latest desktop Project Link form split is aligned with the Project Link
  onboarding and page-structure cleanup objective. It deepens the form seam by
  moving branch detection, Azure DevOps remote suggestion, auto/manual ADO
  discovery, pipeline recommendation, manual project/repository reset logic,
  workspace rendering, and ADO rendering out of the `ProjectLinkForm` route
  sub-Module while preserving the existing `ProjectLinkForm` and
  `BLANK_PROJECT_LINK` exports.
- `apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx` is now 114 lines,
  down from 404. It now owns form submission wiring, save/cancel controls, and
  composition only.
- New desktop Project Link form Modules added by this slice:
  `apps/desktop/src/pages/projectLinks/useProjectLinkFormRuntime.ts` (209
  lines),
  `apps/desktop/src/pages/projectLinks/ProjectLinkWorkspaceSection.tsx` (100
  lines), and
  `apps/desktop/src/pages/projectLinks/ProjectLinkAdoSection.tsx` (79 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  desktop page/runtime split and directly supports in-flow Project Link
  onboarding. It does not alter endpoint URLs, `ChatUiChunk` streaming
  semantics, Azure DevOps domain behavior, persisted storage shapes, or Project
  Link DTO fields.
- The latest desktop Pipelines page split is aligned with the pipeline
  workspace separation requested earlier and with the broader file-splitting
  objective. It deepens the page seam by moving Project Link selection, linked
  PR loading, inspect/trigger workflow actions, pagination, filtering, row
  construction, run tone derivation, and card rendering out of the route shell
  while preserving the existing `/pipelines` behavior.
- `apps/desktop/src/pages/Pipelines.tsx` is now 101 lines, down from 417. It
  now owns route layout, header controls, empty/error/loading placement, and
  wiring only.
- New desktop Pipelines Modules added by this slice:
  `apps/desktop/src/pages/pipelines/usePipelinesRuntime.ts` (147 lines),
  `apps/desktop/src/pages/pipelines/PipelineRowCard.tsx` (134 lines),
  `apps/desktop/src/pages/pipelines/PipelineStatusFilters.tsx` (34 lines),
  `apps/desktop/src/pages/pipelines/pipelineModel.ts` (76 lines),
  `apps/desktop/src/pages/pipelines/pipelineActions.ts` (12 lines), and
  `apps/desktop/src/pages/pipelines/pipelineTypes.ts` (39 lines).
- Plan deviation check: no material deviation. This follows the planned
  frontend page/runtime structure cleanup and the prior product decision that
  pipeline behavior belongs on a dedicated page. It does not alter endpoint
  URLs, `ChatUiChunk` streaming semantics, Azure DevOps domain behavior,
  persisted storage shapes, or workflow action names.
- The latest CLI entrypoint split is aligned with the broader file-splitting
  and project-structure cleanup objective, and with ADR-0007's requirement for
  thin entry points over shared runtime packages. It deepens the CLI command
  seam by moving runtime client creation, task/event output, settings command
  persistence, global wrapper generation, Azure auth commands, and PAT storage
  out of the command registry Module while preserving the existing
  `createProgram()` Interface.
- `packages/cli/src/commands.ts` is now 236 lines, down from 553. It now owns
  command registration and dispatch only.
- New CLI Modules added by this slice:
  `packages/cli/src/cliRuntime.ts` (9 lines),
  `packages/cli/src/taskOutput.ts` (77 lines),
  `packages/cli/src/settingsCommand.ts` (40 lines),
  `packages/cli/src/setupGlobalCommand.ts` (71 lines),
  `packages/cli/src/authCommands.ts` (146 lines), and
  `packages/cli/src/patCommand.ts` (26 lines).
- Plan deviation check: controlled extension, not a material deviation. The
  original concrete plan focused on core/daemon/desktop/ADO, but the active
  objective also requires whole-project file splitting and structure cleanup.
  This slice does not alter endpoint URLs, `ChatUiChunk` streaming semantics,
  Azure DevOps domain behavior, persisted storage shapes, package dependency
  direction, or command names.
- The latest desktop TaskViewer runtime split is aligned with the original
  Architecture Refactor Plan. It deepens the TaskViewer runtime seam by moving
  task stream/list state, checkpoint preview/rollback loading, review/PR
  insight activity loading, and PR insight selectors out of the page runtime
  orchestration Module while preserving the existing `useTaskViewerRuntime`
  Interface.
- `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` is now 260
  lines, down from 480. It now owns high-level TaskViewer orchestration,
  handoff restore, selection wiring, and public runtime shape only.
- New desktop TaskViewer Modules added by this slice:
  `apps/desktop/src/pages/taskViewer/useTaskRuns.ts` (99 lines),
  `apps/desktop/src/pages/taskViewer/useCheckpointDetails.ts` (69 lines),
  `apps/desktop/src/pages/taskViewer/taskViewerActivityLoaders.ts` (67 lines),
  and `apps/desktop/src/pages/taskViewer/taskViewerPrInsightState.ts` (88
  lines).
- Plan deviation check: no material deviation. This stays inside the planned
  desktop page/runtime split and project-structure cleanup. It does not alter
  endpoint URLs, `ChatUiChunk` streaming semantics, tool names, Azure DevOps
  domain behavior, or persisted storage shapes.
- The latest daemon workspace workflow split is aligned with the original
  Architecture Refactor Plan. It deepens the workflow seam by moving Git
  recovery proposal construction, push readiness calculation, and pull-request
  preflight derivation out of the workspace workflow orchestration Module while
  preserving the existing `workspaceWorkflow.ts` compatibility Interface.
- `packages/daemon/src/workflows/workspaceWorkflow.ts` is now 254 lines, down
  from 441. It now owns high-level workspace workflow proposal/preflight/risk
  orchestration and observable summary formatting.
- New daemon workflow Modules added by this slice:
  `packages/daemon/src/workflows/workspaceRecoveryActions.ts` (101 lines),
  `packages/daemon/src/workflows/workspacePushReadiness.ts` (51 lines), and
  `packages/daemon/src/workflows/workspacePrPreflight.ts` (88 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon workflow split, keeps `/chat/workflow-action` behavior stable, and
  does not alter endpoint URLs, tool names, canonical `ui.chunk`, storage, or
  Azure DevOps domain behavior.
- The latest daemon pull-request route split is aligned with the original
  Architecture Refactor Plan. It deepens the route seam by moving Project
  Link/body schemas, ADO diagnostic helpers, PR context aggregation, readiness
  signals, heuristic fallback, and LLM insight prompt shaping out of the HTTP
  route Module while preserving the existing `/project-links` and `/profiles`
  endpoint Interfaces.
- `packages/daemon/src/routes/pull-requests.routes.ts` is now 144 lines, down
  from 488. It now owns endpoint registration, request parsing, response
  shaping, and dispatch only.
- New daemon route Modules added by this slice:
  `packages/daemon/src/routes/pullRequestRouteSupport.ts` (111 lines),
  `packages/daemon/src/routes/pullRequestInsight.ts` (171 lines), and
  `packages/daemon/src/routes/pullRequestInsightSignals.ts` (147 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon HTTP route split, keeps endpoint URLs and response shapes stable, and
  does not alter canonical `ui.chunk`, tool names, storage, or Azure DevOps
  domain Module behavior.
- The latest core Chat planner refinement is aligned with the original
  Architecture Refactor Plan. It deepens the planner seam by moving
  confirmation/denial parsing, offline fallback, request construction,
  write-scope guards, and provider step-stream collection out of the planner
  orchestration Module while preserving the existing `chatPlanner.ts`
  compatibility Interface.
- `packages/core/src/chatPlanner.ts` is now 347 lines, down from the prior
  471-line split state and the original 996-line mixed Module. It remains a
  complex but focused orchestration Module within the accepted 300-500 line
  range.
- New core Modules added by this refinement:
  `packages/core/src/chatPlannerAffirmation.ts` (16 lines),
  `packages/core/src/chatPlannerGuards.ts` (69 lines),
  `packages/core/src/chatPlannerOffline.ts` (34 lines),
  `packages/core/src/chatPlannerRequest.ts` (57 lines), and
  `packages/core/src/chatPlannerStepStream.ts` (46 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  core Chat planner/streaming standardization work, preserves public imports,
  keeps canonical `ui.chunk` semantics unchanged, and does not change tool
  names, endpoint URLs, or Azure DevOps behavior.
- The latest daemon chat-history split is aligned with the original
  Architecture Refactor Plan. It deepens the chat history store seam by moving
  persisted DTO types and Project Link/Profile compatibility serialization out
  of the store IO Adapter while preserving the existing
  `chatHistoryStore.ts` import path.
- `packages/daemon/src/chatHistoryStore.ts` is now 155 lines, down from 303.
  It now owns local JSON/Cosmos load-save-list-delete behavior only.
- New daemon Modules added by this slice:
  `packages/daemon/src/chatHistoryTypes.ts` (85 lines) and
  `packages/daemon/src/chatHistorySerialization.ts` (106 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon Chat workflow/data split and does not change storage file format,
  Cosmos DTO shape, endpoint URLs, tool names, or canonical `ui.chunk`
  streaming semantics.
- The latest daemon pending-action split is aligned with the original
  Architecture Refactor Plan. It deepens the chat approval inference seam by
  moving write-action parsing/argument construction and user-scope protection
  behind focused Interfaces while preserving the existing
  `deriveWorkflowPendingAction` and `inferPendingAction` entrypoints.
- `packages/daemon/src/chatPendingActions.ts` is now 62 lines, down from 343.
  It now owns orchestration only: use planner output, detect confirmation
  language, call the action deriver, then apply scope protection.
- New daemon Modules added by this slice:
  `packages/daemon/src/chatPendingActionDerivers.ts` (201 lines) and
  `packages/daemon/src/chatPendingActionScope.ts` (100 lines).
- Plan deviation check: no material deviation. This stays inside the planned
  daemon Chat workflow split and does not alter endpoint URLs, tool names,
  canonical `ui.chunk` streaming semantics, or Azure DevOps behavior.
- The latest daemon workflow-state split is aligned with the original
  Architecture Refactor Plan. It deepens the daemon workflow Module seam by
  moving validation outcome shaping and workflow metadata derivation behind
  focused Interfaces. It does not change the canonical `ui.chunk` streaming
  contract, endpoint URLs, tool names, or Azure DevOps domain behavior.
- `packages/daemon/src/chatWorkflowState.ts` is now 291 lines, down from 407.
  It stays within the normal handwritten TypeScript target and now focuses on
  workflow-state assembly, approval proposal storage helpers, source merging,
  and confirmed-action dispatch.
- New daemon Modules added by this slice:
  `packages/daemon/src/chatValidationOutcome.ts` (111 lines) and
  `packages/daemon/src/chatWorkflowMetadata.ts` (48 lines).
- The only functional compatibility fix in this slice is intentional:
  `packages/daemon/src/workflows/workflowActions.ts` now prefers
  `payload.projectLink` but still falls back to legacy `payload.profile` when
  detecting PAT-backed Azure DevOps workflow failures.
- Plan deviation check: no material deviation. This is a continuation of the
  planned daemon route/workflow split. The next large architecture work should
  return to whichever remaining Module exceeds the size/responsibility target,
  rather than reopening completed streaming or ADO Module seams.

## Architecture Invariants

- `ChatUiChunk` is the canonical frontend-facing stream contract.
- Once `ui.chunk` is observed in a turn, legacy SSE render events must not
  duplicate visible assistant/tool output.
- Legacy SSE event names remain available during the compatibility window.
- Route modules should own request/response parsing only.
- Workflow modules should own orchestration.
- Extracted modules must have a useful interface; avoid moving code into
  shallow wrappers that only forward arguments.
- Normal handwritten TypeScript/React files should stay under 300 lines where
  practical; complex modules can temporarily remain 300-500 lines if they have
  one clear responsibility.

## Latest Session Result

Date: `2026-06-18`

Completed:

- Checked this approval evidence split against the Architecture Refactor Plan
  and Chat approval evidence objective. It remains aligned:
  `ApprovalEvidence.tsx` keeps the rendering Interface, while approval DTOs,
  row derivation, command previews, workflow-boundary text, and argument
  formatting sit behind `ApprovalEvidenceModel.ts`.
- Split `ApprovalWorkflowEvidence`, `ApprovalReadinessEvidence`,
  `ApprovalPreflightEvidence`, `ApprovalEvidenceProps`,
  `approvalPreflightRows`, `approvalRows`, `toolCommandPreview`, and
  `workflowBoundaryText` out of
  `apps/desktop/src/components/conversation/ApprovalEvidence.tsx` into
  `apps/desktop/src/components/conversation/ApprovalEvidenceModel.ts`.
- Reduced `apps/desktop/src/components/conversation/ApprovalEvidence.tsx` from
  344 lines to 98 lines. The new `ApprovalEvidenceModel.ts` Module is 263
  lines.
- Preserved compatibility exports from `ApprovalEvidence.tsx`, including
  `toolCommandPreview`, so `executionTimelineModel.ts` keeps the same import
  Interface.
- Verified this approval evidence split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx`
  passed with 11 tests.
- Verified this approval evidence split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Checked this TaskViewer PR insight detail split against the Architecture
  Refactor Plan and Activity workspace objective. It remains aligned:
  `PrInsightDetailPanel.tsx` keeps the detail shell and section composition,
  while preview/full and previous-run comparison rendering sit behind
  `PrInsightComparisonPanels.tsx`.
- Split `PrInsightComparisonCard`, `PrInsightRefreshComparisonCard`, comparison
  time formatting, signed deltas, and risk delta grid rendering out of
  `apps/desktop/src/pages/taskViewer/PrInsightDetailPanel.tsx` into
  `apps/desktop/src/pages/taskViewer/PrInsightComparisonPanels.tsx`.
- Reduced `apps/desktop/src/pages/taskViewer/PrInsightDetailPanel.tsx` from
  346 lines to 209 lines. The new `PrInsightComparisonPanels.tsx` Module is
  148 lines.
- Preserved the existing `PrInsightDetailPanel` Interface consumed by
  TaskViewer.
- Verified this TaskViewer PR insight detail split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/TaskViewer.test.tsx`
  passed with 2 tests.
- Verified this TaskViewer PR insight detail split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Checked this execution timeline model split against the Architecture Refactor
  Plan and desktop conversation rendering objective. It remains aligned:
  `executionTimelineModel.ts` keeps grouping, summaries, output evidence, and
  formatting logic, while timeline CSS class derivation sits behind
  `executionTimelineStyles.ts`.
- Split `timelineHeaderIconClass`, `timelineStatusPillClass`,
  `timelineGroupRailClass`, `timelineGroupPillClass`,
  `timelineStatePillClass`, and `timelineDotClass` out of
  `apps/desktop/src/components/conversation/executionTimelineModel.ts` into
  `apps/desktop/src/components/conversation/executionTimelineStyles.ts`.
- Reduced `apps/desktop/src/components/conversation/executionTimelineModel.ts`
  from 347 lines to 278 lines. The new `executionTimelineStyles.ts` Module is
  84 lines.
- Preserved compatibility exports from `executionTimelineModel.ts`, so
  `ExecutionTimeline.tsx` and `ExecutionCommandRow.tsx` keep the same import
  Interface.
- Verified this execution timeline model split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx`
  passed with 6 tests.
- Verified this execution timeline model split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Checked this core pipeline agent split against the Architecture Refactor
  Plan and submit-pipeline runtime objective. It remains aligned:
  `pipelineAgent.ts` now keeps the task orchestration Interface, while Git diff
  computation, validation command execution, PR creation/linking, and
  ToolError-to-step mapping sit behind `pipelineAgentSupport.ts`.
- Split `computePipelineDiff`, `runValidationCommand`,
  `maybeCreatePipelinePr`, and `recordPipelineToolError` out of
  `packages/core/src/pipelineAgent.ts` into
  `packages/core/src/pipelineAgentSupport.ts`.
- Reduced `packages/core/src/pipelineAgent.ts` from 342 lines to 227 lines.
  The new `pipelineAgentSupport.ts` Module is 135 lines.
- Preserved `runPipelineTask` and `PipelinePayload` Interfaces.
- Verified this core pipeline agent split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified this core pipeline agent split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/pipelineAgentOffline.test.ts`
  passed with 1 test.
- Checked this core review state store split against the Architecture Refactor
  Plan and the review-agent dependency cleanup objective. It remains aligned:
  `stateStore.ts` now keeps the storage Adapter Interfaces, while review
  history normalization sits behind `stateStoreNormalization.ts`.
- Split reason-code parsing, disposition event normalization, write-back event
  normalization, queue/risk normalization, and context-confidence normalization
  out of `packages/core/src/review/stateStore.ts` into
  `packages/core/src/review/stateStoreNormalization.ts`.
- Reduced `packages/core/src/review/stateStore.ts` from 381 lines to 276
  lines. The new `stateStoreNormalization.ts` Module is 118 lines.
- Preserved `StateStore`, `TableStateStore`, `FileStateStore`, and
  `InMemoryStateStore` Interfaces.
- Verified this core review state store split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified this core review state store split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/prInsightArtifactsLocal.test.ts test/memoryStore.test.ts`
  passed with 11 tests.
- Checked this core Azure auth split against the Architecture Refactor Plan.
  It remains aligned: `azureAuth.ts` is now the compatibility entry Module,
  while credential construction, JWT/avatar identity helpers, MSAL
  session/token flow, and active-account selection sit behind focused auth
  Modules.
- Split `getAzureCredential` and cache-persistence registration out of
  `packages/core/src/store/azureAuth.ts` into
  `packages/core/src/store/azureAuthCredential.ts`.
- Split JWT identity decoding and Graph avatar loading out of
  `packages/core/src/store/azureAuth.ts` into
  `packages/core/src/store/azureAuthIdentity.ts`.
- Split current-user resolution, silent/cached/browser login, Azure DevOps
  token acquisition, auth availability checks, and persisted user cache
  wrappers out of `packages/core/src/store/azureAuth.ts` into
  `packages/core/src/store/azureAuthSession.ts`.
- Split MSAL active-account selection out of the session flow into
  `packages/core/src/store/azureAuthAccountSelection.ts`.
- Reduced `packages/core/src/store/azureAuth.ts` from 410 lines to 30 lines.
  New auth Module sizes are: `azureAuthCredential.ts` 56 lines,
  `azureAuthIdentity.ts` 30 lines, `azureAuthSession.ts` 296 lines, and
  `azureAuthAccountSelection.ts` 22 lines.
- Preserved public exports from `azureAuth.ts`, so existing core/daemon callers
  keep the same Interface.
- Verified this core Azure auth split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified this core Azure auth split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 33 tests.
- Checked this daemon PR workflow split against the Architecture Refactor Plan
  and the PR AI insight objective. It remains aligned: `prWorkflow.ts` now
  keeps the workflow Interface and orchestration, while PR readiness
  calculation, insight summary formatting, policy/work-item summaries, and
  compact signal formatting sit behind `prWorkflowInsight.ts`.
- Split `buildWorkflowPrInsight`, `summarizePolicies`, `summarizeWorkItems`,
  and readiness signal formatting out of
  `packages/daemon/src/workflows/prWorkflow.ts` into
  `packages/daemon/src/workflows/prWorkflowInsight.ts`.
- Reduced `packages/daemon/src/workflows/prWorkflow.ts` from 340 lines to 249
  lines. The new `prWorkflowInsight.ts` Module is 112 lines.
- Preserved the existing `buildWorkflowPrInsight` export from `prWorkflow.ts`,
  so focused tests and existing callers keep the same Interface.
- Verified this daemon PR workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/prWorkflow.test.ts`
  passed with 2 tests.
- Verified this daemon PR workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Checked this daemon pipeline workflow split against the Architecture Refactor
  Plan and the pipeline AI insight objective. It remains aligned:
  `pipelineWorkflow.ts` now keeps the workflow Interface and orchestration,
  while pipeline run summary formatting and failed-run markdown artifact
  rendering sit behind `pipelineWorkflowArtifacts.ts`.
- Split `summarizePipelineRuns`, `pipelineFailureArtifacts`,
  `WorkflowActionArtifact`, `PipelineLogExcerpt`, and compact text rendering
  out of `packages/daemon/src/workflows/pipelineWorkflow.ts` into
  `packages/daemon/src/workflows/pipelineWorkflowArtifacts.ts`.
- Reduced `packages/daemon/src/workflows/pipelineWorkflow.ts` from 367 lines
  to 242 lines. The new `pipelineWorkflowArtifacts.ts` Module is 138 lines.
- Preserved existing exports from `pipelineWorkflow.ts` for
  `summarizePipelineRuns` and `pipelineFailureArtifacts`, so focused tests and
  existing callers keep the same Interface.
- Verified this daemon pipeline workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/pipelineWorkflow.test.ts`
  passed with 2 tests.
- Verified this daemon pipeline workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Checked this daemon review-run route split against the Architecture Refactor
  Plan and the PR/review AI insight objective. It remains aligned:
  `review-run.routes.ts` now keeps the HTTP route Interface and review-run
  orchestration, while request schemas, Project Link resolution, ADO diagnostic
  response shaping, PR signal enrichment, readiness mapping, and findings
  category shaping sit behind `reviewRunRouteSupport.ts`.
- Split request schemas, route dependency typing, inline Project Link fallback
  parsing, Project Link resolution, ADO diagnostic response shaping, PR signal
  enrichment, readiness mapping, and review finding category shaping out of
  `packages/daemon/src/routes/review-run.routes.ts` into
  `packages/daemon/src/routes/reviewRunRouteSupport.ts`.
- Reduced `packages/daemon/src/routes/review-run.routes.ts` from 382 lines to
  229 lines. The new `reviewRunRouteSupport.ts` Module is 171 lines.
- Preserved existing `/project-links/:id/review-run` and legacy
  `/profiles/:id/review-run` endpoint Interfaces.
- Verified this daemon review-run route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon review-run route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Checked this daemon review route split against the Architecture Refactor Plan
  and the PR/review AI insight objective. It remains aligned: `review.routes.ts`
  now keeps the route Interface, while Project Link resolution, cloud/local
  fallback, DTO mapping, and ADO write-back Implementation sit behind
  `reviewRouteSupport.ts`.
- Split Project Link lookup, repository validation, Project Link cloud/local
  fallback, route constants, and route dependency typing out of
  `packages/daemon/src/routes/review.routes.ts` into
  `packages/daemon/src/routes/reviewRouteSupport.ts`.
- Split review history DTO mapping and Azure DevOps disposition thread
  write-back out of `packages/daemon/src/routes/review.routes.ts` into
  `packages/daemon/src/routes/reviewRouteSupport.ts`.
- Added typed schema aliases in
  `packages/daemon/src/routes/review.schemas.ts` so route support code can
  consume validated body shapes without re-inferring them in the route Module.
- Reduced `packages/daemon/src/routes/review.routes.ts` from 410 lines to 284
  lines. Current daemon review route split file sizes are:
  `reviewRouteSupport.ts` 141 lines and `review.schemas.ts` 124 lines.
- Preserved existing `/project-links/:id/review-*`,
  `/project-links/:id/pr-insights*`, and legacy `/profiles/:id/...` endpoint
  Interfaces.
- Verified this daemon review route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon review route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Verified this daemon review route split:
  `git diff --check -- packages/daemon/src/routes/review.routes.ts packages/daemon/src/routes/reviewRouteSupport.ts packages/daemon/src/routes/review.schemas.ts`
  passed with no whitespace errors.
- Checked this desktop Review Queue runtime split against the Architecture
  Refactor Plan and the AI review workflow objective. It remains aligned:
  `useReviewQueueRuntime` continues to present the same page runtime Interface,
  while global settings and operation activity behavior sit behind focused hook
  Module Interfaces.
- Split review auto-approve hydration, stale-age hydration, auto-approve
  persistence, stale-age persistence, and related saving/error state out of
  `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts` into
  `apps/desktop/src/pages/reviewFindings/useReviewQueueSettings.ts`.
- Split review operation activity loading, best-effort operation recording,
  activity filter state, and filtered activity derivation out of
  `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts` into
  `apps/desktop/src/pages/reviewFindings/useReviewOperationActivity.ts`.
- Reduced `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts`
  from 419 lines to 337 lines. Current Review Queue runtime split file sizes
  are: `useReviewQueueSettings.ts` 66 lines and
  `useReviewOperationActivity.ts` 50 lines.
- Preserved the existing Review Queue runtime return shape consumed by
  `apps/desktop/src/pages/ReviewFindings.tsx`.
- Verified this desktop Review Queue runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified this desktop Review Queue runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/reviewFindings/reviewQueueRuntime.test.ts src/pages/reviewFindings/reviewQueueViewModel.test.ts`
  passed with 11 tests across 2 files.
- Verified this desktop Review Queue runtime split:
  `git diff --check -- apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts apps/desktop/src/pages/reviewFindings/useReviewQueueSettings.ts apps/desktop/src/pages/reviewFindings/useReviewOperationActivity.ts`
  passed with no whitespace errors.
- Checked this desktop Pull Requests insight panel split against the
  Architecture Refactor Plan and the PR AI insight product direction. It
  remains aligned: `PullRequestInsightPanels.tsx` is now a compatibility export
  Module, while saved insight, preview insight, full review-run, and shared risk
  badge rendering sit behind focused Module Interfaces.
- Split saved insight summary/history/freshness rendering out of
  `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx` into
  `apps/desktop/src/pages/pullRequests/StoredInsightPanel.tsx`.
- Split preview insight markdown summary and categorized risk rendering out of
  `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx` into
  `apps/desktop/src/pages/pullRequests/InsightPreviewPanel.tsx`.
- Split full review-run summary, decision badges, metadata, compression,
  coverage, discarded findings, categorized risks, and findings preview out of
  `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx` into
  `apps/desktop/src/pages/pullRequests/ReviewRunPanel.tsx`.
- Split shared categorized risk badge rendering out of
  `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx` into
  `apps/desktop/src/pages/pullRequests/InsightRiskBadges.tsx`.
- Reduced `apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx`
  from 399 lines to 3 lines. Current PR insight panel split file sizes are:
  `StoredInsightPanel.tsx` 166 lines, `InsightPreviewPanel.tsx` 38 lines,
  `ReviewRunPanel.tsx` 173 lines, and `InsightRiskBadges.tsx` 35 lines.
- Preserved the existing `StoredInsightPanel`, `InsightPreviewPanel`, and
  `ReviewRunPanel` exports consumed by `PullRequestCard`.
- Verified this desktop Pull Requests insight panel split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified this desktop Pull Requests insight panel split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/pullRequests/pullRequestViewModel.test.ts src/prInsightArtifacts.test.ts`
  passed with 12 tests across 2 files.
- Verified this desktop Pull Requests insight panel split:
  `git diff --check -- apps/desktop/src/pages/pullRequests/PullRequestInsightPanels.tsx apps/desktop/src/pages/pullRequests/StoredInsightPanel.tsx apps/desktop/src/pages/pullRequests/InsightPreviewPanel.tsx apps/desktop/src/pages/pullRequests/ReviewRunPanel.tsx apps/desktop/src/pages/pullRequests/InsightRiskBadges.tsx`
  passed with no whitespace errors.
- Checked this desktop Project Link form split against the Architecture
  Refactor Plan and the in-flow Project Link onboarding direction. It remains
  aligned: the form Module is now a composition shell, while branch detection,
  remote ADO inference, ADO discovery, pipeline recommendation, manual reset
  rules, and section rendering sit behind focused Module Interfaces.
- Split form state, branch loading, branch retry, ADO remote suggestion,
  auto/manual ADO discovery, pipeline recommendation, manual project reset, and
  manual repository reset out of
  `apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx` into
  `apps/desktop/src/pages/projectLinks/useProjectLinkFormRuntime.ts`.
- Split workspace fields, repo-path branch detection status, branch selectors,
  and branch error rendering out of
  `apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx` into
  `apps/desktop/src/pages/projectLinks/ProjectLinkWorkspaceSection.tsx`.
- Split Azure DevOps organization/project/repository fields, discovery error
  rendering, and pipeline details composition out of
  `apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx` into
  `apps/desktop/src/pages/projectLinks/ProjectLinkAdoSection.tsx`.
- Reduced `apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx` from 404
  lines to 114 lines. Current Project Link form split file sizes are:
  `useProjectLinkFormRuntime.ts` 209 lines,
  `ProjectLinkWorkspaceSection.tsx` 100 lines, and
  `ProjectLinkAdoSection.tsx` 79 lines.
- Preserved the existing `ProjectLinkForm` and `BLANK_PROJECT_LINK` exports,
  Project Link save payload normalization, branch reload behavior, ADO
  discovery behavior, pipeline recommendation behavior, and manual field reset
  semantics.
- Verified this desktop Project Link form split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified this desktop Project Link form split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 8 tests across 3 files.
- Verified this desktop Project Link form split:
  `git diff --check -- apps/desktop/src/pages/projectLinks/ProjectLinkForm.tsx apps/desktop/src/pages/projectLinks/useProjectLinkFormRuntime.ts apps/desktop/src/pages/projectLinks/ProjectLinkWorkspaceSection.tsx apps/desktop/src/pages/projectLinks/ProjectLinkAdoSection.tsx`
  passed with no whitespace errors.
- Checked this desktop Pipelines page split against the Architecture Refactor
  Plan and the dedicated-pipelines-page product direction. It remains aligned:
  the route Module is now a shell, while runtime state, workflow actions,
  pipeline row view-model logic, status filters, and row card rendering sit
  behind focused Module Interfaces.
- Split Project Link selection, linked pull-request loading, inspect pipeline
  action, trigger pipeline action, pagination, filters, loading/error state,
  and per-row inspect state out of `apps/desktop/src/pages/Pipelines.tsx` into
  `apps/desktop/src/pages/pipelines/usePipelinesRuntime.ts`.
- Split row construction, status filtering, filter counts, latest-run sorting,
  date formatting, and run tone derivation out of
  `apps/desktop/src/pages/Pipelines.tsx` into
  `apps/desktop/src/pages/pipelines/pipelineModel.ts`.
- Split pipeline workflow output parsing out of
  `apps/desktop/src/pages/Pipelines.tsx` into
  `apps/desktop/src/pages/pipelines/pipelineActions.ts`.
- Split status filter rendering and pipeline row rendering out of
  `apps/desktop/src/pages/Pipelines.tsx` into
  `apps/desktop/src/pages/pipelines/PipelineStatusFilters.tsx` and
  `apps/desktop/src/pages/pipelines/PipelineRowCard.tsx`.
- Reduced `apps/desktop/src/pages/Pipelines.tsx` from 417 lines to 101 lines.
  Current Pipelines split file sizes are: `usePipelinesRuntime.ts` 147 lines,
  `PipelineRowCard.tsx` 134 lines, `PipelineStatusFilters.tsx` 34 lines,
  `pipelineModel.ts` 76 lines, `pipelineActions.ts` 12 lines, and
  `pipelineTypes.ts` 39 lines.
- Preserved the existing Pipelines page behavior: Project Link selector,
  refresh, status filters, pagination, inspect runs, trigger pipeline approval
  proposal, error/loading/empty states, and linked PR run display.
- Verified this desktop Pipelines page split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified this desktop Pipelines page split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/ChatWorkflowState.test.ts src/pages/chat/workflowTaskState.test.ts`
  passed with 9 tests across 2 files.
- Verified this desktop Pipelines page split:
  `git diff --check -- apps/desktop/src/pages/Pipelines.tsx apps/desktop/src/pages/pipelines/usePipelinesRuntime.ts apps/desktop/src/pages/pipelines/PipelineRowCard.tsx apps/desktop/src/pages/pipelines/PipelineStatusFilters.tsx apps/desktop/src/pages/pipelines/pipelineModel.ts apps/desktop/src/pages/pipelines/pipelineActions.ts apps/desktop/src/pages/pipelines/pipelineTypes.ts`
  passed with no whitespace errors.
- Checked this CLI entrypoint split against the Architecture Refactor Plan and
  ADR-0007. It is a controlled extension of the file-splitting work: CLI
  command registration remains the external seam, while runtime setup, task
  output, settings, global wrapper, auth, and PAT storage Implementation moved
  behind focused internal Interfaces.
- Split runtime client creation and PAT keyring constants out of
  `packages/cli/src/commands.ts` into `packages/cli/src/cliRuntime.ts`.
- Split task step rendering and task SSE follow-up output out of
  `packages/cli/src/commands.ts` into `packages/cli/src/taskOutput.ts`.
- Split `settings`, `setup-global`, `auth`, and `configure-pat` command groups
  out of `packages/cli/src/commands.ts` into
  `packages/cli/src/settingsCommand.ts`,
  `packages/cli/src/setupGlobalCommand.ts`,
  `packages/cli/src/authCommands.ts`, and
  `packages/cli/src/patCommand.ts`.
- Reduced `packages/cli/src/commands.ts` from 553 lines to 236 lines. Current
  CLI command split file sizes are: `cliRuntime.ts` 9 lines, `taskOutput.ts`
  77 lines, `settingsCommand.ts` 40 lines, `setupGlobalCommand.ts` 71 lines,
  `authCommands.ts` 146 lines, and `patCommand.ts` 26 lines.
- Preserved the existing `createProgram()` Interface, command names, options,
  and legacy `--profile` aliases.
- Verified this CLI entrypoint split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck`
  passed.
- Verified this CLI entrypoint split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli test`
  passed with 15 tests across 3 files.
- Verified this CLI entrypoint split:
  `git diff --check -- packages/cli/src/commands.ts packages/cli/src/cliRuntime.ts packages/cli/src/taskOutput.ts packages/cli/src/settingsCommand.ts packages/cli/src/setupGlobalCommand.ts packages/cli/src/authCommands.ts packages/cli/src/patCommand.ts`
  passed with no whitespace errors.
- Checked this desktop TaskViewer runtime split against the Architecture
  Refactor Plan. It remains aligned with the plan: the page/runtime Modules
  keep UI orchestration and selection state, while task streaming, checkpoint
  detail loading, activity loading, and PR insight derived state sit behind
  focused Interfaces.
- Split task run list loading, selected task loading, active task counting,
  task SSE subscription handling, task refresh, and task error state out of
  `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` into
  `apps/desktop/src/pages/taskViewer/useTaskRuns.ts`.
- Split checkpoint preview and rollback-plan loading out of
  `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` into
  `apps/desktop/src/pages/taskViewer/useCheckpointDetails.ts`.
- Split review activity loading and PR insight artifact/history loading out of
  `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` into
  `apps/desktop/src/pages/taskViewer/taskViewerActivityLoaders.ts`.
- Split PR insight history metadata, comparison selection, refresh comparison,
  and filtering selectors out of
  `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` into
  `apps/desktop/src/pages/taskViewer/taskViewerPrInsightState.ts`.
- Reduced `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` from 480
  lines to 260 lines. Current TaskViewer runtime split file sizes are:
  `useTaskRuns.ts` 99 lines, `useCheckpointDetails.ts` 69 lines,
  `taskViewerActivityLoaders.ts` 67 lines, and
  `taskViewerPrInsightState.ts` 88 lines.
- Preserved the existing `useTaskViewerRuntime` external Interface and returned
  runtime shape consumed by `apps/desktop/src/pages/TaskViewer.tsx`.
- Verified this desktop TaskViewer runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified this desktop TaskViewer runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/TaskViewer.test.tsx`
  passed with 2 tests.
- Verified this desktop TaskViewer runtime split:
  `git diff --check -- apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts apps/desktop/src/pages/taskViewer/useTaskRuns.ts apps/desktop/src/pages/taskViewer/useCheckpointDetails.ts apps/desktop/src/pages/taskViewer/taskViewerActivityLoaders.ts apps/desktop/src/pages/taskViewer/taskViewerPrInsightState.ts`
  passed with no whitespace errors.
- Checked this daemon workspace workflow split against the Architecture
  Refactor Plan. It remains aligned with the plan: route Modules keep HTTP
  parsing while workflow Modules own orchestration, with detailed recovery,
  readiness, and PR preflight Implementation behind focused Interfaces.
- Split Git recovery workflow action detection and recovery/stage-conflict
  proposal construction out of
  `packages/daemon/src/workflows/workspaceWorkflow.ts` into
  `packages/daemon/src/workflows/workspaceRecoveryActions.ts`.
- Split push upstream/ahead-behind readiness calculation out of
  `packages/daemon/src/workflows/workspaceWorkflow.ts` into
  `packages/daemon/src/workflows/workspacePushReadiness.ts`.
- Split pull-request preflight derivation out of
  `packages/daemon/src/workflows/workspaceWorkflow.ts` into
  `packages/daemon/src/workflows/workspacePrPreflight.ts`.
- Reduced `packages/daemon/src/workflows/workspaceWorkflow.ts` from 441 lines
  to 254 lines. Current workspace workflow split file sizes are:
  `workspaceRecoveryActions.ts` 101 lines,
  `workspacePushReadiness.ts` 51 lines, and
  `workspacePrPreflight.ts` 88 lines.
- Preserved existing `workspaceWorkflow.ts` exports for
  `buildWorkspaceWorkflowProposal`, `preflightFromTools`,
  `pushReadinessFromTools`, `workflowRiskForAction`,
  `summarizeWorkspaceWorkflow`, `isGitRecoveryWorkflowAction`,
  `GitRecoveryWorkflowAction`, and `PrPreflight`.
- Verified this daemon workspace workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon workspace workflow split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/workspaceWorkflow.test.ts test/server.test.ts`
  passed with 62 tests across 2 files.
- Verified this daemon workspace workflow split:
  `git diff --check -- packages/daemon/src/workflows/workspaceWorkflow.ts packages/daemon/src/workflows/workspaceRecoveryActions.ts packages/daemon/src/workflows/workspacePushReadiness.ts packages/daemon/src/workflows/workspacePrPreflight.ts`
  passed with no whitespace errors.
- Checked this daemon pull-request route split against the Architecture
  Refactor Plan. It remains aligned with the plan: route files should own
  request/response parsing only, while PR insight/context Implementation
  belongs behind focused route helper Module Interfaces.
- Split pull-request route schemas, inline Project Link/Profile compatibility
  payload parsing, ADO diagnostic response shaping, ADO project-link
  validation, and PR status parsing out of
  `packages/daemon/src/routes/pull-requests.routes.ts` into
  `packages/daemon/src/routes/pullRequestRouteSupport.ts`.
- Split Azure DevOps PR context aggregation and PR insight preview
  orchestration out of `packages/daemon/src/routes/pull-requests.routes.ts`
  into `packages/daemon/src/routes/pullRequestInsight.ts`.
- Split PR readiness metadata, heuristic insight summary, risk/category
  derivation, and LLM prompt shaping into
  `packages/daemon/src/routes/pullRequestInsightSignals.ts`.
- Reduced `packages/daemon/src/routes/pull-requests.routes.ts` from 488 lines
  to 144 lines. Current PR route split file sizes are:
  `pullRequestRouteSupport.ts` 111 lines, `pullRequestInsight.ts` 171 lines,
  and `pullRequestInsightSignals.ts` 147 lines.
- Preserved existing endpoint Interfaces:
  `/project-links/:id/pull-requests`,
  `/profiles/:id/pull-requests`,
  `/project-links/:id/pull-requests/:pullRequestId/context`,
  `/profiles/:id/pull-requests/:pullRequestId/context`,
  `/project-links/:id/pull-requests/:pullRequestId/insight-preview`, and
  `/profiles/:id/pull-requests/:pullRequestId/insight-preview`.
- Verified this daemon pull-request route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon pull-request route split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Verified this daemon pull-request route split:
  `git diff --check -- packages/daemon/src/routes/pull-requests.routes.ts packages/daemon/src/routes/pullRequestRouteSupport.ts packages/daemon/src/routes/pullRequestInsight.ts packages/daemon/src/routes/pullRequestInsightSignals.ts`
  passed with no whitespace errors.
- Checked this core Chat planner refinement against the Architecture Refactor
  Plan. It remains aligned with the plan: this is a continuation of the core
  planner and streaming standardization split, not a semantic change to
  `ChatUiChunk`, endpoint URLs, tool names, or Azure DevOps behavior.
- Split confirmation and denial parsing out of
  `packages/core/src/chatPlanner.ts` into
  `packages/core/src/chatPlannerAffirmation.ts`. The compatibility exports
  from `chatPlanner.ts` are preserved.
- Split offline fallback response generation out of
  `packages/core/src/chatPlanner.ts` into
  `packages/core/src/chatPlannerOffline.ts`.
- Split planner request construction and tool schema/capability mapping out of
  `packages/core/src/chatPlanner.ts` into
  `packages/core/src/chatPlannerRequest.ts`.
- Split write-scope and required-change-inspection guard logic out of
  `packages/core/src/chatPlanner.ts` into
  `packages/core/src/chatPlannerGuards.ts`.
- Split provider stream collection and visible assistant-delta extraction out
  of `packages/core/src/chatPlanner.ts` into
  `packages/core/src/chatPlannerStepStream.ts`.
- Reduced `packages/core/src/chatPlanner.ts` from the prior split state of 471
  lines to 347 lines. Current new core planner refinement file sizes are:
  `chatPlannerAffirmation.ts` 16 lines, `chatPlannerGuards.ts` 69 lines,
  `chatPlannerOffline.ts` 34 lines, `chatPlannerRequest.ts` 57 lines, and
  `chatPlannerStepStream.ts` 46 lines.
- Verified this core Chat planner refinement:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified this core Chat planner refinement:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts`
  passed with 26 tests across 2 files.
- Checked this daemon chat-history split against the Architecture Refactor
  Plan. It remains aligned with the plan: this is a continuation of the daemon
  Chat data/workflow split, not a change to streaming, endpoint URLs, tool
  names, storage file format, or Azure DevOps domain behavior.
- Split persisted chat-history DTO types out of
  `packages/daemon/src/chatHistoryStore.ts` into
  `packages/daemon/src/chatHistoryTypes.ts`. The new Module owns
  `InlineProjectLink`, `StoredBubble`, `StoredSession`, `HistoryStore`, and
  `ChatHistoryEntry`.
- Split chat-history serialization and Project Link/Profile compatibility
  normalization out of `packages/daemon/src/chatHistoryStore.ts` into
  `packages/daemon/src/chatHistorySerialization.ts`. The new Module owns
  local/Cosmos session normalization, Cosmos DTO conversion, history entry
  projection, sorting, and Project Link fallback helpers.
- Reduced `packages/daemon/src/chatHistoryStore.ts` from 303 lines to 155
  lines. Current chat-history file sizes are:
  `chatHistoryTypes.ts` 85 lines and `chatHistorySerialization.ts` 106 lines.
- Preserved the external `chatHistoryStore.ts` Interface by re-exporting the
  existing types and compatibility helpers from the original import path.
- Verified this daemon chat-history split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon chat-history split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatHistoryStore.test.ts test/chatSessionWorkflow.test.ts test/server.test.ts`
  passed with 88 tests across 3 files.
- Verified this daemon chat-history split:
  `git diff --check -- packages/daemon/src/chatHistoryStore.ts packages/daemon/src/chatHistoryTypes.ts packages/daemon/src/chatHistorySerialization.ts`
  passed with no whitespace errors.
- Checked this daemon pending-action split against the Architecture Refactor
  Plan. It remains aligned with the plan: this is a continuation of the
  daemon Chat workflow split, not a change to streaming, endpoint URLs, tool
  names, or Azure DevOps domain behavior.
- Split pending approval action parsing and argument construction out of
  `packages/daemon/src/chatPendingActions.ts` into
  `packages/daemon/src/chatPendingActionDerivers.ts`. The new Module owns
  write-tool inference, response-to-tool argument mapping, branch/ref/path
  extraction, and current-branch derivation from prior tool bubbles.
- Split user-scope and unresolved-conflict protection out of
  `packages/daemon/src/chatPendingActions.ts` into
  `packages/daemon/src/chatPendingActionScope.ts`. The new Module owns ADO/Git
  scope checks, conflict-history detection, and failed-push recovery allowance.
- Reduced `packages/daemon/src/chatPendingActions.ts` from 343 lines to 62
  lines. Current pending-action file sizes are:
  `chatPendingActionDerivers.ts` 201 lines and
  `chatPendingActionScope.ts` 100 lines.
- Preserved the external `deriveWorkflowPendingAction` and
  `inferPendingAction` Interfaces; callers still cross the same seam while
  the Implementation now has better locality.
- Verified this daemon pending-action split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon pending-action split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts`
  passed with 84 tests across 2 files.
- Verified this daemon pending-action split:
  `git diff --check -- packages/daemon/src/chatPendingActions.ts packages/daemon/src/chatPendingActionDerivers.ts packages/daemon/src/chatPendingActionScope.ts`
  passed with no whitespace errors.
- Checked this daemon workflow-state slice against the Architecture Refactor
  Plan. It remains aligned with the plan: this is still the planned daemon
  route/workflow split, not a semantic change to the canonical `ui.chunk`
  streaming contract or to Azure DevOps domain behavior.
- Split validation confirmed-action result shaping out of
  `packages/daemon/src/chatWorkflowState.ts` into
  `packages/daemon/src/chatValidationOutcome.ts`. The new Module owns
  validation success/failure response text, validation failure markdown
  artifacts, failure-signal extraction, and result metadata behind one focused
  Interface.
- Split workflow-state approval metadata mapping out of
  `packages/daemon/src/chatWorkflowState.ts` into
  `packages/daemon/src/chatWorkflowMetadata.ts`. The new Module owns
  `workflowKind` / `workflowPhase` derivation for pending approval state.
- Reduced `packages/daemon/src/chatWorkflowState.ts` from 407 lines to 291
  lines. Current touched daemon file sizes are:
  `chatValidationOutcome.ts` 111 lines, `chatWorkflowMetadata.ts` 48 lines,
  and `workflows/workflowActions.ts` 105 lines.
- Preserved the external `structuredDoneAfterConfirmedAction` and workflow
  state Interfaces; callers still cross the same seam while validation
  artifact construction and approval metadata now have better locality.
- Fixed a Project Link/Profile compatibility gap in
  `workflowActionAuthMode`: canonical `payload.projectLink` is preferred, but
  legacy `payload.profile.adoPat` still classifies ADO workflow failures as
  PAT-backed during compatibility reads.
- Verified this daemon workflow-state split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified this daemon workflow-state split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/workflowActions.test.ts test/validationPreflight.test.ts test/server.test.ts`
  passed with 91 tests across 4 files.
- Verified this daemon workflow-state split:
  `git diff --check -- packages/daemon/src/chatWorkflowState.ts packages/daemon/src/chatValidationOutcome.ts packages/daemon/src/chatWorkflowMetadata.ts packages/daemon/src/workflows/workflowActions.ts`
  passed with no whitespace errors.
- Checked the current implementation against the Architecture Refactor Plan.
  The work remains aligned with the plan: the canonical Chat streaming
  contract is already complete, and this slice stays within the planned
  Desktop Chat split instead of changing streaming semantics or Azure DevOps
  behavior.
- Split `apps/desktop/src/pages/chat/layout/WorkspaceEnvironmentCard.tsx`
  from a 389-line mixed UI/runtime Module into a 115-line composition Module.
- Added focused workspace environment Modules:
  `WorkspaceEnvironmentHeader.tsx` (34 lines),
  `WorkspaceChangesButton.tsx` (51 lines),
  `WorkspaceBranchMenu.tsx` (105 lines),
  `WorkspaceCommitMenu.tsx` (135 lines),
  `WorkspaceGitRecoveryPanel.tsx` (44 lines), and
  `WorkspaceProjectLinkPanel.tsx` (103 lines).
- Preserved the existing workspace action Interface while narrowing the Git
  recovery panel Interface to `GitRecoveryWorkspaceAction`, avoiding a broad
  union leak across that seam.
- Verified after the workspace environment split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the workspace environment split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 14 tests.
- Verified after the workspace environment split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build`
  passed. Vite still reports existing chunk-size warnings for large generated
  bundles; this is not a typecheck or build failure.
- Split `apps/desktop/src/pages/chat/useChatPageRuntime.ts` from a 372-line
  page runtime into a 153-line orchestration Module.
- Added `useChatPageState.ts` (78 lines) for draft restore, base page state,
  and new-chat reset locality.
- Added `useChatPageReadModel.ts` (54 lines) for index status, derived
  conversation state, and model-selection runtime.
- Added `chatShellPropsAdapter.ts` (144 lines) as the Adapter from runtime
  Modules to the `ChatShellProps` Interface, keeping layout prop mapping out of
  the orchestration Module.
- Split `apps/desktop/src/pages/chat/layout/HistorySidebar.tsx` from 306 lines
  to 123 lines.
- Added focused HistorySidebar Modules:
  `HistorySidebarItem.tsx` (122 lines), `HistorySidebarMenu.tsx` (59 lines),
  `HistorySidebarPagination.tsx` (85 lines), and
  `HistorySidebarIcons.tsx` (33 lines).
- Verified after the page runtime and HistorySidebar split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the page runtime and HistorySidebar split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/layout/chatPanelLayout.test.ts`
  passed with 17 tests.
- Verified after the page runtime and HistorySidebar split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build`
  passed. Vite still reports existing chunk-size warnings for large generated
  bundles; this is not a typecheck or build failure.
- Tightened the naming seam between Project Link, Template Profile, and
  MergePilot runtime naming. `TemplateProfile`, `loadTemplateProfiles`, and
  `getTemplateProfile` are now the preferred core APIs for YAML build/test
  defaults; old `Profile` APIs remain deprecated aliases only.
- Renamed chat context runtime types and call sites toward Project Link
  semantics: `ChatContextProjectLink`, `InlineProjectLink`,
  `inlineProjectLinkToChatContextProjectLink`, and
  `inlineProjectLinkToToolExtra` are the preferred interfaces. Persisted
  `inlineProfile` fields remain compatibility-only because older
  chat-history/Cosmos records may still use that key.
- Changed repository-context prompt output from `## Profile` to
  `## Project Link`, and updated the chat system prompt to distinguish Project
  Link settings from Template Profile defaults.
- Extracted `packages/cli/src/submitPipelinePayload.ts` so commander and TUI
  submit-pipeline flows share one payload-shaping Module. Blank template
  profile values are now omitted so repo-local `.mergepilot/project-link.yaml`
  can supply the Template Profile.
- Migrated Chat draft and Chat handoff state to preferred
  `activeProjectLinkId` / `projectLinkId` fields while preserving legacy
  `activeProfileId` / `profileId` read compatibility for existing
  sessionStorage payloads. New Activity/Pull Request to Chat handoffs now write
  `projectLinkId` and retain `profileId` only as a compatibility mirror.
- Migrated the desktop-to-daemon Chat HTTP identity seam to prefer
  `projectLinkId`. `apps/desktop/src/api/chat.ts` now sends `projectLinkId`
  for `/chat` and `/chat/workflow-action` while mirroring `profileId` only for
  compatibility, and daemon chat/workflow-action routes normalize
  `projectLinkId` before falling back to legacy `profileId`.
- Verified after the Chat HTTP Project Link identity slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/api.test.ts`
  passed with 4 tests.
- Verified after the Chat HTTP Project Link identity slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatProjectLinkIdRoutes.test.ts`
  passed with 3 tests.
- Verified after the Chat HTTP Project Link identity slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Cleaned non-persisted frontend Project Link naming residue in the in-chat
  Project Link onboarding callback and Pull Requests branch-filter helpers.
- Verified after the frontend Project Link naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/api.test.ts src/pages/pullRequests/pullRequestViewModel.test.ts`
  passed with 9 tests, and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Migrated daemon workflow-action runtime naming so route parsing accepts
  legacy `profile` but normalizes to canonical `projectLink`; PR, pipeline,
  workspace, workflow-auth, and validation preflight Modules now consume
  `payload.projectLink` internally.
- Changed validation approval evidence source from `profile` to
  `project_link`, with desktop rendering it as `Project Link`.
- Verified after the daemon workflow Project Link canonicalization:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts test/prWorkflow.test.ts test/pipelineWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 65 tests.
- Verified after the approval source naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/pages/pullRequests/pullRequestViewModel.test.ts src/api.test.ts`
  passed with 14 tests.
- Verified after changing the core approval preflight type:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed; the core build refreshed declarations used by daemon typecheck.
- Verified after declaration refresh:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Migrated ChatSession runtime Interfaces from `profileId` parameters to
  `projectLinkId` parameters across `ChatSessionManager`, runtime setup,
  context prompt construction, planner continuation, message approval handling,
  confirmed-action outcome handling, and approval proposal creation. Persisted
  `StoredSession.profileId` / `inlineProfile` remain explicit storage
  compatibility fields only.
- Renamed the daemon inline tool-context Module to
  `packages/daemon/src/chatProjectLinkContext.ts`.
- Removed unused Project Link rename compatibility exports from daemon runtime
  Modules. Persisted `inlineProfile` storage, legacy `profile` request-body
  support, and `profileId` storage/artifact fields remain because they are data
  compatibility boundaries.
- Verified after the daemon Project Link context naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified after the daemon Project Link context naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/server.test.ts test/chatProjectLinkIdRoutes.test.ts`
  passed with 87 tests.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Renamed the repository indexer Interface from the deprecated `Profile` alias
  to `TemplateProfile`. The constructor behavior is unchanged, but the Module
  now expresses that ignored globs come from YAML Template Profile defaults,
  not from Project Link mappings.
- Added review-agent `MERGEPILOT_DATA_DIR` support with
  `CICD_AGENT_DATA_DIR` retained as a compatibility fallback.
- Verified after the RepoIndexer and review-agent naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/repoIndexer.test.ts`
  passed with 4 tests.
- Verified after the review-agent data-dir fallback cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/review-agent test -- test/config.test.ts`
  passed with 2 tests.
- Verified after the same cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/review-agent typecheck`
  passed.
- Removed unused deprecated Profile aliases from core Modules:
  `ChatContextProfile`, `Profile`, `loadProfiles`, `getProfile`,
  `applyProjectLinkConfigToProfile`, and `AzureTableProfileStore`.
- Renamed `MemoryStore` repo-profile methods to `setMemory` / `getMemory`.
  The underlying `repo_profile` table name remains a storage implementation
  detail.
- Renamed the desktop PR insight artifact filter parameter from `profileId` to
  `projectLinkId`; stored artifact records now require `projectLinkId` and keep
  `profileId` only as an optional deprecated compatibility field.
- Verified after removing unused core Profile aliases and renaming
  `MemoryStore`:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/repoIndexer.test.ts test/memoryStore.test.ts test/profiles.test.ts test/projectLinkConfig.test.ts`
  passed with 16 tests.
- Verified after the desktop PR insight filter rename:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/prInsightArtifacts.test.ts`
  passed with 6 tests.
- Verified after the same cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Migrated local PR insight artifact storage to canonical Project Link
  identity: `projectLinkId` is now required on saved core records and
  deprecated `profileId` is optional. New writes no longer synthesize a
  `profileId` mirror when called through the canonical `projectLinkId`
  Interface, while legacy `profileId` artifacts continue to read through the
  Project Link filter. Daemon review routes call this Module with
  `projectLinkId`.
- Migrated desktop local PR insight artifact storage to canonical Project Link
  identity. `PrInsightArtifact` and desktop `PrInsightArtifactRecord` now
  require `projectLinkId`, keep deprecated `profileId` optional, and only
  preserve `profileId` when a deprecated caller provides it. List/filter/
  compare logic still goes through `prInsightArtifactProjectLinkId` so old
  local records remain readable.
- Migrated desktop Activity, Pull Requests, and Chat handoff drafts toward
  Project Link identity. New handoff drafts write `projectLinkId`; legacy
  `profileId` remains only as a deprecated mirror/read fallback through
  `handoffProjectLinkId`.
- Updated Task Viewer PR insight filtering, grouping, selected comparison, and
  PR/Chat handoff actions to use Project Link identity helpers instead of
  directly treating `profileId` as the UI runtime identity.
- Updated Key Vault ADO PAT comments, tags, and parameter names from profile
  identity to Project Link identity while preserving the existing
  `ado-pat-{id}` secret naming pattern.
- Migrated chat session persistence toward Project Link identity. Local
  chat-history and Cosmos session records now read/write `projectLinkId` and
  `inlineProjectLink`, while normalizing old `profileId` / `inlineProfile`
  records and dual-writing deprecated mirrors for compatibility.
- Added focused daemon tests for chat-history Project Link compatibility
  helpers covering new-field preference and legacy fallback behavior.
- Updated remaining roadmap wording for ADO/MCP domain selection from
  per-profile policy to per-Project-Link policy.
- Verified after the PR insight artifact and Key Vault naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/prInsightArtifactsLocal.test.ts test/settings.test.ts`
  passed with 12 tests.
- Verified after the desktop PR insight artifact Project Link identity cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/prInsightArtifacts.test.ts src/pages/TaskViewer.test.tsx src/pages/ChatPrInsightArtifact.test.ts src/pages/pullRequests/pullRequestViewModel.test.ts`
  passed with 15 tests.
- Verified after making PR insight artifact payloads canonical:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/prInsightArtifactsLocal.test.ts`
  passed with 7 tests.
- Verified after the same desktop cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the aggressive desktop handoff Project Link identity cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/checkpointHandoff.test.ts src/pages/TaskViewer.test.tsx src/prInsightArtifacts.test.ts src/pages/pullRequests/pullRequestViewModel.test.ts`
  passed with 20 tests.
- Verified after the same handoff cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Returned to file splitting after the aggressive naming slice by extracting
  Pull Requests handoff/sessionStorage logic into
  `apps/desktop/src/pages/pullRequests/usePullRequestHandoff.ts`.
  `PullRequests.tsx` is reduced from 514 to 471 lines, while the new hook is
  105 lines and owns draft parsing, Project Link fallback, PR targeting,
  highlighting, pagination jump, and context loading.
- Extracted Pull Requests preview/review action runtime into
  `apps/desktop/src/pages/pullRequests/usePullRequestActions.ts`. The hook is
  220 lines and owns preview AI insight, Review Agent execution, review-history
  writes, local/remote artifact persistence, operation logging, findings
  storage, and saved-insight Chat handoff.
- `PullRequests.tsx` is now 304 lines after the handoff and action-runtime
  splits.
- Verified after the Pull Requests handoff split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/checkpointHandoff.test.ts src/pages/pullRequests/pullRequestViewModel.test.ts src/prInsightArtifacts.test.ts`
  passed with 18 tests.
- Verified after the same Pull Requests handoff split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the Pull Requests action-runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/checkpointHandoff.test.ts src/pages/pullRequests/pullRequestViewModel.test.ts src/prInsightArtifacts.test.ts src/pages/TaskViewer.test.tsx`
  passed with 20 tests.
- Verified after the same action-runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Returned to TaskViewer structure work by extracting the PR insight activity
  navigation into `apps/desktop/src/pages/taskViewer/PrInsightActivitySection.tsx`.
  The Module owns saved-insight filtering, history freshness badges, and PR
  insight activity row rendering behind one focused Interface.
- Extracted review-operation activity navigation into
  `apps/desktop/src/pages/taskViewer/ReviewActivitySection.tsx`. The Module
  owns review kind filtering, Project Link filtering, status chips, and review
  operation row rendering.
- Moved the shared Project Link filter control to
  `apps/desktop/src/pages/taskViewer/ProjectLinkFilter.tsx` and moved
  `ReviewActivityItem` to `apps/desktop/src/pages/taskViewer/activityTypes.ts`
  so detail/runtime Modules no longer import a domain type from the sidebar
  shell.
- `ActivitySidebar.tsx` is now 246 lines after the activity-section split.
  New file sizes are: `PrInsightActivitySection.tsx` 131 lines,
  `ReviewActivitySection.tsx` 100 lines, `ProjectLinkFilter.tsx` 29 lines,
  and `activityTypes.ts` 5 lines.
- Verified after the TaskViewer activity-section split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/TaskViewer.test.tsx`
  passed with 2 tests.
- Verified after the same TaskViewer activity-section split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the core Chat planner into focused Modules:
  `packages/core/src/chatPlannerTypes.ts` for public planner event/result
  Interfaces, `packages/core/src/chatPlannerControl.ts` for finalization
  parsing and stream-visible response extraction,
  `packages/core/src/chatPlannerFinalizationTool.ts` for the `agent_final`
  tool schema, and `packages/core/src/chatPlannerPrompt.ts` for the system
  prompt.
- Preserved compatibility exports from `packages/core/src/chatPlanner.ts` so
  existing callers and tests can still import `ChatPlanner`, planner types,
  `CHAT_CONTROL_JSON_MARKER`, `CHAT_FINAL_TOOL_NAME`, and
  `CHAT_SYSTEM_PROMPT` from the original Module.
- Updated `chatContext.ts` and `chat-stream/*` type imports to depend on
  `chatPlannerTypes.ts` instead of crossing the planner runtime Module for
  type-only dependencies.
- Reduced `packages/core/src/chatPlanner.ts` from 996 lines to 471 lines.
  New core planner file sizes are: `chatPlannerPrompt.ts` 81 lines,
  `chatPlannerControl.ts` 251 lines, `chatPlannerTypes.ts` 173 lines, and
  `chatPlannerFinalizationTool.ts` 68 lines.
- Verified after the core Chat planner split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts test/chatUseCases.test.ts`
  passed with 34 tests.
- Verified after the same core Chat planner split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Verified after the same core Chat planner split:
  `git diff --check` reported no whitespace errors; only existing LF/CRLF
  conversion warnings were printed.
- Split the core Git tools into focused Modules:
  `packages/core/src/tools/gitCommand.ts` owns Git command execution and output
  streaming, `gitCheckpoint.ts` owns checkpoint creation/preview/rollback/apply
  logic, `gitReadTools.ts` owns read-only Git tool definitions, `gitWriteTools.ts`
  owns local/remote-changing Git tool definitions, and `gitHistoryTools.ts` owns
  merge/cherry-pick/revert/rebase continuation and mutation tools.
- Reduced `packages/core/src/tools/git.ts` from 810 lines to 66 lines. It now
  acts as a compatibility registry composer while preserving existing exports
  for `gitTools`, checkpoint helpers, and tool names.
- Current core Git tool file sizes are: `gitCommand.ts` 32 lines,
  `gitCheckpoint.ts` 270 lines, `gitReadTools.ts` 162 lines,
  `gitWriteTools.ts` 225 lines, and `gitHistoryTools.ts` 110 lines.
- Verified after the core Git tools split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitOptions.test.ts test/gitCheckpoint.test.ts test/toolCapabilities.test.ts`
  passed with 9 tests.
- Verified after the same core Git tools split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Verified after the same core Git tools split:
  `git diff --check -- packages\core\src\tools\git.ts packages\core\src\tools\gitCommand.ts packages\core\src\tools\gitCheckpoint.ts packages\core\src\tools\gitReadTools.ts packages\core\src\tools\gitWriteTools.ts packages\core\src\tools\gitHistoryTools.ts docs\architecture-refactor-progress.md`
  reported no whitespace errors; only LF/CRLF conversion warnings were printed.
- Split the core Chat context Module into focused Modules:
  `packages/core/src/chatContextTypes.ts` owns context bundle/chunk/project-link
  Interfaces, `chatContextFormat.ts` owns repository prompt rendering and
  source metadata generation, `chatContextScan.ts` owns quick repository file
  scanning and heuristic chunk selection, and `chatContextChanges.ts` owns Git
  intent detection, changed-file discovery, diff excerpts, and change
  interpretation.
- Reduced `packages/core/src/chatContext.ts` from 611 lines to 171 lines. It
  now owns context orchestration, index refresh, and index status only while
  preserving compatibility exports for existing imports.
- Current core Chat context file sizes are: `chatContextTypes.ts` 36 lines,
  `chatContextFormat.ts` 205 lines, `chatContextScan.ts` 178 lines, and
  `chatContextChanges.ts` 79 lines.
- Verified after the core Chat context split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatContext.test.ts`
  passed with 5 tests.
- Verified after the same core Chat context split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Verified after the same core Chat context split:
  `git diff --check -- packages\core\src\chatContext.ts packages\core\src\chatContextTypes.ts packages\core\src\chatContextFormat.ts packages\core\src\chatContextScan.ts packages\core\src\chatContextChanges.ts docs\architecture-refactor-progress.md`
  reported no whitespace errors; only LF/CRLF conversion warnings were printed.
- Split the core Azure authentication Module into focused store Modules:
  `packages/core/src/store/azureAuthTypes.ts` owns auth DTOs and auth-required
  errors, `azureAuthConfig.ts` owns environment/config/default scope discovery,
  `azureAuthBrowser.ts` owns browser completion HTML and browser process
  launching, `azureAuthMsal.ts` owns MSAL client and secure persistence setup,
  and `azureAuthUserCache.ts` owns file-based user cache persistence.
- Reduced `packages/core/src/store/azureAuth.ts` from 410 lines to 30 lines in the latest slice after earlier reductions from 661 lines.
  It now acts as the compatibility entry Module for credential resolution,
  token acquisition, cached-account selection, Graph avatar hydration, and
  public export stability.
- Current core Azure auth file sizes are: `azureAuth.ts` 30 lines, `azureAuthCredential.ts` 56 lines, `azureAuthIdentity.ts` 30 lines, `azureAuthSession.ts` 296 lines, `azureAuthAccountSelection.ts` 22 lines,
  `azureAuthBrowser.ts` 100 lines, `azureAuthConfig.ts` 64 lines,
  `azureAuthMsal.ts` 72 lines, `azureAuthTypes.ts` 33 lines, and
  `azureAuthUserCache.ts` 41 lines.
- Verified after the core Azure auth split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified after the same core Azure auth split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts test/adoClient.test.ts`
  passed with 33 tests.
- Verified after the same core Azure auth split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Checked plan alignment after the Azure auth split. The current optimization
  is still aligned with the architecture-refactor plan: it keeps endpoint/tool
  compatibility stable, improves Module locality, keeps the public
  `azureAuth.ts` Interface stable, and continues the file-splitting track
  without reintroducing external Azure DevOps MCP runtime dependencies.
- Split the core ADO tool registry into focused Modules:
  `packages/core/src/ado/toolRegistryContext.ts` owns shared payload/context
  resolution, `toolRegistryPullRequests.ts` owns PR, reviewer, label,
  work-item, and policy tool definitions, and
  `toolRegistryBuildPipeline.ts` owns build timeline/log excerpt and pipeline
  trigger tool definitions.
- Reduced `packages/core/src/ado/toolRegistry.ts` from 459 lines to 61 lines.
  It now owns only the internal tool manifest, health check, and registry
  composition while preserving existing tool names, schemas, return shapes, and
  tool ordering.
- Current core ADO tool-registry file sizes are: `toolRegistry.ts` 61 lines,
  `toolRegistryBuildPipeline.ts` 100 lines, `toolRegistryContext.ts` 58 lines,
  and `toolRegistryPullRequests.ts` 266 lines.
- Verified after the core ADO tool-registry split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified after the same core ADO tool-registry split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts test/adoClient.test.ts test/adoPullRequestMutations.test.ts`
  passed with 37 tests.
- Verified after the same core ADO tool-registry split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Checked plan alignment after the ADO tool-registry split. The current
  optimization is still aligned with the architecture-refactor plan: it
  deepens the internal ADO tool Adapter seam, preserves internalized Azure
  DevOps MCP-style logic, and keeps tool compatibility stable.
- Split the desktop Chat route shell by extracting top-level hook composition
  into `apps/desktop/src/pages/chat/useChatPageRuntime.ts`.
  `apps/desktop/src/pages/Chat.tsx` now acts as a 22-line route shell that
  preserves compatibility re-exports and renders `ChatShell` with the runtime
  props returned by the hook.
- Exported `ChatShellProps` from `apps/desktop/src/pages/chat/layout/ChatShell.tsx`
  so the runtime hook has an explicit Interface matching the layout shell.
- Current Chat route/runtime file sizes are: `Chat.tsx` 22 lines,
  `useChatPageRuntime.ts` 440 lines, and `ChatShell.tsx` 415 lines. The route
  shell target from the plan is now met; `useChatPageRuntime.ts` is the next
  optional split target if runtime hook locality needs further tightening.
- Verified after the Chat route-shell split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the same Chat route-shell split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 14 tests.
- Verified after the same Chat route-shell split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build`
  passed. Vite still reports existing large chunk warnings after minification.
- Split Chat streaming-turn runtime out of
  `apps/desktop/src/pages/chat/useChatPageRuntime.ts` into
  `apps/desktop/src/pages/chat/useChatTurnRuntime.ts`.
  The new Module owns assistant-visible stream wiring, bubble runtime,
  session lifecycle, stream adapter construction, send-message actions,
  confirm/cancel pending action handling, stop-current-turn behavior, and the
  composer send callback.
- Reduced `useChatPageRuntime.ts` from 440 lines to 372 lines. The new
  `useChatTurnRuntime.ts` is 230 lines and provides a focused Interface for
  streaming turn behavior.
- Verified after the Chat streaming-turn runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the same Chat streaming-turn runtime split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 14 tests.
- Split the desktop Chat shell layout by moving the large shell Interface into
  `apps/desktop/src/pages/chat/layout/ChatShell.types.ts` and moving
  history/message/composer/summary/right-panel workspace rendering into
  `apps/desktop/src/pages/chat/layout/ChatWorkspaceLayout.tsx`.
- Reduced `apps/desktop/src/pages/chat/layout/ChatShell.tsx` from 415 lines
  to 60 lines. Current shell-layout file sizes are: `ChatShell.tsx` 60 lines,
  `ChatShell.types.ts` 135 lines, and `ChatWorkspaceLayout.tsx` 239 lines.
- Verified after the Chat shell layout split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the same Chat shell layout split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 14 tests.
- Checked plan alignment after the Chat shell layout split. The current
  optimization remains aligned with the architecture-refactor plan: the
  external `ChatShell` Interface is stable, the shell Module is now a small
  outer layout adapter, and workspace layout behavior is concentrated in a
  focused Module under the 300-line target.
- Split the Chat message-list layout by moving empty-state / Project Link
  onboarding into `apps/desktop/src/pages/chat/layout/ChatEmptyState.tsx`,
  assistant metadata and saved PR insight source controls into
  `ChatAssistantMetaPanel.tsx`, and the shared typing indicator into
  `ChatThinkingDots.tsx`.
- Reduced `apps/desktop/src/pages/chat/layout/ChatMessageList.tsx` from 384
  lines to 218 lines. Current message-list file sizes are:
  `ChatMessageList.tsx` 218 lines, `ChatEmptyState.tsx` 146 lines,
  `ChatAssistantMetaPanel.tsx` 88 lines, and `ChatThinkingDots.tsx` 13 lines.
- Verified after the Chat message-list split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the same Chat message-list split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 14 tests.
- Checked plan alignment after the Chat message-list split. The current
  optimization remains aligned with the architecture-refactor plan: the message
  list Module now owns list dispatch and status placeholder behavior, while
  empty-state onboarding and assistant metadata rendering have focused Module
  Interfaces under the normal 100-300 line target.
- Verified after refreshing core declarations:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`
  passed.
- Verified after routing daemon review artifacts through `projectLinkId`:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts test/chatSessionCheckpoint.test.ts`
  passed with 68 tests.
- Verified after the chat session persistence Project Link compatibility slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified after the chat session persistence Project Link compatibility slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatHistoryStore.test.ts test/chatSessionWorkflow.test.ts test/chatSessionCheckpoint.test.ts test/server.test.ts`
  passed with 99 tests.
- Verified after the ChatSession Project Link runtime Interface cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/chatSessionCheckpoint.test.ts test/server.test.ts test/prWorkflow.test.ts test/pipelineWorkflow.test.ts`
  passed with 99 tests.
- Verified after the ChatSession Project Link runtime Interface cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Kept remaining `CICD_AGENT_*` and `cicd_agent_*` references as explicit
  fallback compatibility keys only; package scopes and product-facing runtime
  names remain `@mergepilot/*`, `mergepilot`, and `mergepilot-daemon`.
- Migrated the product/package naming from the previous `cicd-agent` scope to
  MergePilot across package manifests, package imports, daemon binary names,
  Tauri identifiers, sidecar permissions, and desktop app shell references.
- Migrated the formal Project Link domain API away from `WorkspaceProfile`:
  desktop API DTOs now expose `ProjectLink` / `ProjectLinkInput`, AppData now
  exposes `projectLinks` and Project Link CRUD methods only, core storage
  exposes `listProjectLinks` / `getProjectLink` / `projectLinkToToolExtra`,
  and daemon runtime/review routes consume the new core APIs.
- Preserved compatibility at explicit boundary points: existing `/profiles`
  HTTP endpoints, `profileId` persisted chat/artifact fields, and legacy
  `cicd_agent_*` / `chat_profile_id` localStorage reads remain so existing
  users and stored sessions are not stranded during the rename.
- Added official daemon `/project-links` endpoints for Project Link CRUD,
  ADO discovery, ADO tool checks, and cloud migration. The old `/profiles`
  endpoints now share the same handler as compatibility aliases.
- Moved the desktop Project Link API client from `/profiles` to
  `/project-links`, and changed ADO discovery request bodies from `profile`
  to `projectLink` while keeping daemon support for the legacy body shape.
- Moved desktop PR and review API clients from `/profiles/:id/...` to
  `/project-links/:id/...`.
- Renamed desktop API surface files from
  `apps/desktop/src/api/projectLinks.ts` / `projectLinkTypes.ts` to
  `apps/desktop/src/api/projectLinks.ts` / `projectLinkTypes.ts`.
- Renamed the daemon Project Link route/store files from
  `packages/daemon/src/routes/project-links.routes.ts` and
  `packages/daemon/src/projectLinkStore.ts` to
  `packages/daemon/src/routes/project-links.routes.ts` and
  `packages/daemon/src/projectLinkStore.ts`.
- Added official daemon `/project-links/:id/pull-requests`,
  `/project-links/:id/review-*`, `/project-links/:id/pr-insights`, and
  `/project-links/:id/review-run` routes while preserving the equivalent
  `/profiles` routes as compatibility aliases.
- Changed new PR/review-run request bodies to send `projectLink`; daemon
  routes still accept legacy `profile` bodies for compatibility.
- Renamed desktop PR/review API functions from `fetchProfile*`,
  `recordProfile*`, and `runProfile*` to `fetchProjectLink*`,
  `recordProjectLink*`, and `runProjectLink*`.
- Renamed the desktop Project Links route shell from
  `apps/desktop/src/pages/Profiles.tsx` to
  `apps/desktop/src/pages/ProjectLinks.tsx` and moved its focused child
  Modules from `pages/profiles/*` to `pages/projectLinks/*`.
- Changed the official desktop route from `/profiles` to `/project-links`;
  `/profiles` remains as a redirect for compatibility.
- Changed chat and workflow-action request bodies to send `projectLink` instead
  of `profile`; daemon chat/workflow routes still accept legacy `profile`
  bodies and normalize them internally.
- Added `cloudProjectLinkStore` to daemon health/configure responses and
  updated desktop app/auth/settings state to prefer it while keeping
  `cloudProfileStore` as a compatibility field.
- Verified after the Project Links route/body/health rename slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified after the Project Links route/body/health rename slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the Project Links route/body/health rename slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts`
  passed with 4 tests.
- Verified after the Project Links route/body/health rename slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Removed remaining internal daemon `ProfileStoreAdapter`,
  `createProfileStoreAdapter`, and `getProfileForRequest` compatibility
  Interfaces. Route Modules now consume `ProjectLinkStoreAdapter` and
  `getProjectLinkForRequest`.
- Removed deprecated desktop API aliases for Project Link CRUD. The only remaining
  core `getProfile` API belongs to the separate YAML pipeline-agent profile
  concept, not Project Links.
- Renamed desktop PR, review queue, pipeline, activity, and chat API/page
  variables from Profile-oriented selection names to Project Link names at the
  non-persisted UI and API seams. Persisted `profileId` fields remain only in
  artifact, handoff, chat-session, and compatibility request payloads.
- Renamed Chat layout and runtime hook Interfaces from Profile-oriented
  selection names to Project Link names: `ChatShell`, `ChatMessageList`,
  `ComposerShell`, `WorkspaceEnvironmentCard`, `PinnedSummaryPanel`,
  `WorkspacePanel`, `useChatRuntimeActions`, `useChatIndexStatus`,
  `useWorkspaceActionRuntime`, `useArtifactWorkspace`,
  `useChatSessionLifecycle`, and chat derived-state helpers now expose Project
  Link terminology. Draft and handoff payload fields still map to persisted
  `activeProfileId` / `profileId` compatibility fields.
- Moved the Azure Table Project Link implementation from
  `packages/core/src/store/tableProfileStore.ts` to
  `packages/core/src/store/tableProjectLinkStore.ts`. The old file now only
  re-exports the new module as a compatibility shim.
- Updated README architecture wording so Project Link is the canonical model
  and `/profiles` / `profileId` / `WorkspaceProfile` are described as legacy
  compatibility boundaries, not the formal product concept.
- Added canonical `MERGEPILOT_*` configuration handling for env-file override,
  Azure browser auth, and YAML template-profile path resolution while keeping
  legacy `CICD_AGENT_*` names as fallback-only compatibility.
- Changed daemon config writes to emit `MERGEPILOT_AZURE_TENANT_ID` and
  `MERGEPILOT_AZURE_CLIENT_ID`.
- Renamed daemon pull-request and review route seams from local `profile`
  variables/errors to `projectLink` / `project_link_*` terminology while
  preserving legacy `/profiles` routes and `profile` request-body fallback.
- Removed the legacy app-registration name from current Settings UI copy; docs
  now describe it only as a legacy registration name where historical context
  matters.
- Updated CLI user-facing naming so `mergepilot init` writes
  `.mergepilot/project-link.yaml`, the preferred option is
  `--template-profile`, and the Ink TUI shows `Templates` / `Template
  profiles` instead of treating repository mapping as `Profiles`.
- Kept legacy CLI `--profile`, `suggestProfileFor`, `writeProfileFile`, and
  `.mergepilot/profile.yaml` as compatibility aliases for existing scripts.
- Added `packages/core/src/projectLinkConfig.ts` so the local
  `.mergepilot/project-link.yaml` file is consumed by `submit-pipeline`
  instead of being a write-only init artifact. The runtime now reads
  `template_profile` plus Azure DevOps organization/project/repository/target
  branch/pipeline defaults, with `.mergepilot/profile.yaml` as a legacy
  fallback.
- Updated submit-pipeline payload parsing so `templateProfile` is preferred
  and omitted values can fall through to the repository-local Project Link
  config.
- Normalized blank `templateProfile`, legacy `profile`, and YAML ADO fields so
  empty UI/config values no longer override repository-local Project Link
  configuration or template defaults.
- Renamed the submit-pipeline task step from `load_profile` to
  `load_project_link_config` so execution logs use the current Project Link
  language.
- Verified after the Project Link naming cleanup slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the Azure Table store path rename:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified after the Azure Table store path rename:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified after the final desktop Activity/Pipeline/PR Project Link naming
  cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the Chat layout/runtime hook Project Link naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the Chat layout/runtime hook Project Link naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatHandoff.test.ts`
  passed with 9 tests.
- Verified after the final desktop naming cleanup:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts`
  passed with 4 tests.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts`
  passed with 4 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`,
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`,
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after the MergePilot env/config naming slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Verified after the CLI template-profile naming slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck`
  passed.
- Verified after the CLI template-profile naming slice:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli test -- test/init.test.ts`
  passed with 7 tests.
- Verified after the Repos page copy update:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified after wiring Project Link config into submit-pipeline:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/projectLinkConfig.test.ts`
  passed with 5 tests.
- Verified after renaming the submit-pipeline load step:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/pipelineAgentOffline.test.ts test/projectLinkConfig.test.ts`
  passed with 6 tests.
- Verified after wiring Project Link config into submit-pipeline:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`,
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck`,
  and
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified after wiring Project Link config into submit-pipeline:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 57 tests.
- Split the chat bubble model into focused Modules:
  `chatBubbleTypes.ts`, `chatBubbleMeta.ts`, `conversationParts.ts`,
  `chatBubbleTools.ts`, and `chatBubbleFinalization.ts`.
- Reduced `apps/desktop/src/chatBubbles.ts` from 626 lines to 30 lines. The
  file now acts as a compatibility barrel while metadata parsing, conversation
  part composition, tool call and approval part handling, and assistant
  finalization live behind focused Module Interfaces.
- Current Chat Bubble split file sizes are:
  `chatBubbles.ts` 30 lines,
  `chatBubbleTypes.ts` 107 lines,
  `chatBubbleMeta.ts` 189 lines,
  `conversationParts.ts` 139 lines,
  `chatBubbleTools.ts` 117 lines, and
  `chatBubbleFinalization.ts` 113 lines.
- Added `Chat bubble model split` to the overall progress table at `100%`.
- Split the 743-line `chatBubbles.test.ts` into focused test Modules:
  `chatBubbleFinalization.test.ts` 315 lines,
  `chatConversationParts.test.ts` 157 lines,
  `chatBubbleMetadata.test.ts` 211 lines, and
  `chatToolParts.test.ts` 140 lines. The tests now cross the same focused
  seams as the production Modules instead of exercising finalization,
  conversation part composition, metadata parsing, and tool/approval parts
  from one oversized file.
- Verified after the chat bubble test split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/chatBubbleFinalization.test.ts src/chatConversationParts.test.ts src/chatBubbleMetadata.test.ts src/chatToolParts.test.ts`
  passed with 25 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the execution timeline into focused conversation Modules:
  `ExecutionCommandRow.tsx`, `ExecutionTimelineIcons.tsx`, and
  `executionTimelineModel.ts`.
- Reduced `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`
  from 571 lines to 178 lines. The timeline entry now owns group orchestration
  and delegates command evidence rendering, chevron rendering, grouping,
  summaries, output formatting, and status presentation.
- Current Execution Timeline split file sizes are:
  `ExecutionTimeline.tsx` 178 lines,
  `executionTimelineModel.ts` 341 lines,
  `ExecutionCommandRow.tsx` 169 lines, and
  `ExecutionTimelineIcons.tsx` 11 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx`
  passed with 6 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the Project Links page into focused Modules:
  `ProjectLinkForm.tsx`, `ProjectLinkFormControls.tsx`, and
  `ProjectLinkCard.tsx`.
- Reduced `apps/desktop/src/pages/ProjectLinks.tsx` from 702 lines to 192 lines.
  The route now acts as a shell for list/new/edit mode, Project Link save/delete
  orchestration, and storage status rendering.
- Current Project Links page split file sizes are:
  `ProjectLinks.tsx` 192 lines,
  `ProjectLinkForm.tsx` 404 lines,
  `ProjectLinkFormControls.tsx` 292 lines, and
  `ProjectLinkCard.tsx` 51 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the Settings page into focused settings Modules:
  `useSettingsRuntime.ts`, `AdditionalModelsSettingsSection.tsx`,
  `AdditionalModelEditor.tsx`, `AccountSettingsSection.tsx`,
  `AppearanceSettingsSection.tsx`, `SettingsControls.tsx`, and
  `settingsTypes.ts`.
- Reduced `apps/desktop/src/pages/Settings.tsx` from 799 lines to 58 lines.
  The route now acts as a shell that wires theme state, settings runtime, model
  settings, account settings, and daemon reachability messaging.
- Current Settings split file sizes are:
  `Settings.tsx` 58 lines,
  `useSettingsRuntime.ts` 245 lines,
  `AdditionalModelEditor.tsx` 181 lines,
  `settingsTypes.ts` 174 lines,
  `SettingsControls.tsx` 151 lines,
  `AdditionalModelsSettingsSection.tsx` 133 lines,
  `AccountSettingsSection.tsx` 89 lines, and
  `AppearanceSettingsSection.tsx` 26 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Started the `TaskViewer / Activity workspace split` hardening track for the
  largest remaining desktop route.
- Added `apps/desktop/src/pages/taskViewer/prInsightActivity.ts` for PR
  insight activity types, refresh comparison logic, and readiness blocker
  derivation.
- Added `apps/desktop/src/pages/taskViewer/PrInsightReadinessBlockers.tsx`
  and kept the existing `TaskViewer.tsx` compatibility re-export for the
  existing test import path.
- Added `apps/desktop/src/pages/taskViewer/PrInsightDetailPanel.tsx` for the
  saved PR insight detail workspace, including provenance actions, preview vs
  full-review comparison, previous-run comparison, signal metrics, blockers,
  and risk chips.
- Added `apps/desktop/src/pages/taskViewer/checkpointActivity.ts` and
  `CheckpointDetailPanel.tsx` for checkpoint labels and the checkpoint detail
  workspace, including rollback plan, snapshot preview, apply summary, and
  tool result rendering.
- Added `apps/desktop/src/pages/taskViewer/activityPresentation.ts` for shared
  activity status, time, duration, task title, latest-detail, and review
  operation presentation helpers.
- Added `apps/desktop/src/pages/taskViewer/ActivitySidebar.tsx` for task-run,
  checkpoint, PR insight, review-operation, and Project Link filter navigation.
- Added `apps/desktop/src/pages/taskViewer/PrInsightActivitySection.tsx` for
  saved PR insight navigation, type filtering, Project Link filtering, and
  history freshness badges.
- Added `apps/desktop/src/pages/taskViewer/ReviewActivitySection.tsx` for
  review-operation navigation, event filtering, Project Link filtering, and
  status chips.
- Added `apps/desktop/src/pages/taskViewer/ProjectLinkFilter.tsx` and
  `activityTypes.ts` so shared activity controls and review activity types no
  longer live inside the sidebar shell.
- Added `apps/desktop/src/pages/taskViewer/TaskRunDetailPanel.tsx` for task
  execution headers, step timelines, and task error rendering.
- Added `apps/desktop/src/pages/taskViewer/ReviewOperationDetailPanel.tsx` for
  review operation status, metadata, and details rendering.
- Added `apps/desktop/src/pages/taskViewer/useTaskViewerRuntime.ts` for
  task/activity refresh, task stream updates, checkpoint preview and rollback
  loading, PR insight history, review activity loading, filters, handoff
  restore, and selected-item derivation.
- Reduced `apps/desktop/src/pages/TaskViewer.tsx` from 1339 lines to 198
  lines. The route now acts as a route shell that wires activity navigation,
  detail panels, and cross-page handoff actions.
- Current TaskViewer split file sizes are:
  `TaskViewer.tsx` 198 lines,
  `useTaskViewerRuntime.ts` 450 lines,
  `ActivitySidebar.tsx` 246 lines,
  `PrInsightActivitySection.tsx` 131 lines,
  `ReviewActivitySection.tsx` 100 lines,
  `ProjectLinkFilter.tsx` 29 lines,
  `activityTypes.ts` 5 lines,
  `ReviewOperationDetailPanel.tsx` 67 lines,
  `TaskRunDetailPanel.tsx` 64 lines,
  `PrInsightDetailPanel.tsx` 346 lines,
  `CheckpointDetailPanel.tsx` 304 lines,
  `prInsightActivity.ts` 104 lines,
  `activityPresentation.ts` 60 lines,
  `PrInsightReadinessBlockers.tsx` 31 lines, and
  `checkpointActivity.ts` 10 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/TaskViewer.test.tsx`
  passed with 2 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Added `apps/desktop/src/pages/reviewFindings/useReviewQueueRuntime.ts`
  as the Review Queue side-effect runtime Module. It owns queue loading,
  daemon review config loading/saving, activity refresh, findings panel state,
  manual disposition persistence, ADO write-back retry, rerun review, batch
  rerun progress, optimistic item replacement, and derived pagination/filter
  state.
- Reduced `apps/desktop/src/pages/ReviewFindings.tsx` from 495 lines to
  188 lines. The route now acts as a shell that wires Project Link selection,
  Review Queue layout, cards, pagination, findings drawer, and activity rail
  to the runtime hook.
- Extended `apps/desktop/src/pages/reviewFindings/reviewQueueRuntime.ts` with
  retry-writeback state reset and queue-item replacement helpers, keeping these
  runtime rules directly testable outside React.
- Extended `apps/desktop/src/pages/reviewFindings/reviewQueueRuntime.test.ts`
  to cover retry write-back state reset and matching/replacing queue items.
- Current Review Queue file sizes are:
  `ReviewFindings.tsx` 188 lines,
  `useReviewQueueRuntime.ts` 383 lines,
  `reviewQueueRuntime.ts` 105 lines,
  `reviewQueueRuntime.test.ts` 149 lines,
  `ReviewQueueCard.tsx` 232 lines,
  `ReviewQueueControls.tsx` 185 lines,
  `FindingsPanel.tsx` 181 lines,
  `ReviewActivityRail.tsx` 77 lines,
  `ReviewQueuePageHeader.tsx` 60 lines, and
  `reviewQueueViewModel.ts` 100 lines.
- Marked `Review Queue page split` complete in the overall progress table.
  `useReviewQueueRuntime.ts` remains a single complex runtime Module under the
  300-500 line allowance because it has one clear responsibility: Review Queue
  orchestration.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/reviewFindings/reviewQueueViewModel.test.ts src/pages/reviewFindings/reviewQueueRuntime.test.ts`
  passed with 11 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Added `apps/desktop/src/pages/reviewFindings/reviewQueueRuntime.ts` as
  the first Review Queue runtime Module. It owns stale-age normalization,
  manual disposition write-back requirements, and manual disposition queue-item
  updates.
- Updated `apps/desktop/src/pages/ReviewFindings.tsx` to consume
  `buildManualDispositionUpdate`, `requiresDispositionWriteBack`, and
  `normalizeStaleAgeHours` instead of hand-building disposition state inside
  the page.
- Reduced `apps/desktop/src/pages/ReviewFindings.tsx` from 564 lines to
  495 lines, bringing it within the temporary complex-route target while the
  remaining side-effect orchestration is still being extracted.
- Added `apps/desktop/src/pages/reviewFindings/reviewQueueRuntime.test.ts`
  covering stale-age normalization, ADO write-back requirements, acknowledged
  dispositions, marked-safe dispositions, and blocked/changes-requested
  disposition state resets.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/reviewFindings/reviewQueueViewModel.test.ts src/pages/reviewFindings/reviewQueueRuntime.test.ts`
  passed with 9 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the Review Queue page into focused review workspace Modules:
  `ReviewQueueCard.tsx`, `ReviewQueueControls.tsx`,
  `ReviewQueuePageHeader.tsx`, `FindingsPanel.tsx`,
  `ReviewActivityRail.tsx`, and `reviewQueueViewModel.ts`.
- Reduced `apps/desktop/src/pages/ReviewFindings.tsx` from 1171 lines to
  564 lines. The route now owns data loading, review-operation state, and
  action orchestration, while lane controls, pagination controls, activity
  classification, review queue cards, findings drawer rendering, and compact
  view-model helpers live behind separate Module Interfaces.
- Added `apps/desktop/src/pages/reviewFindings/reviewQueueViewModel.test.ts`
  covering operation activity categorization, label mapping, risk/severity
  tone mapping, and commit short-hash formatting.
- Current Review Queue file sizes are:
  `ReviewFindings.tsx` 564 lines,
  `ReviewQueueCard.tsx` 232 lines,
  `ReviewQueueControls.tsx` 185 lines,
  `FindingsPanel.tsx` 181 lines,
  `ReviewActivityRail.tsx` 77 lines,
  `ReviewQueuePageHeader.tsx` 60 lines, and
  `reviewQueueViewModel.ts` 100 lines.
- Added `Review Queue page split` to the overall progress table as an
  in-progress hardening track. Remaining gap is explicit: extract the review
  queue runtime operations into a hook/runtime Module.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/reviewFindings/reviewQueueViewModel.test.ts`
  passed with 4 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the Pull Requests page into focused PR workspace Modules:
  `PullRequestCard.tsx`, `PullRequestInsightPanels.tsx`,
  `PullRequestPageHeader.tsx`, `PullRequestContextPanel.tsx`,
  `usePullRequestActions.ts`, `usePullRequestHandoff.ts`,
  `pullRequestViewModel.ts`, and `pullRequestTypes.ts`.
- Reduced `apps/desktop/src/pages/PullRequests.tsx` from 1266 lines to
  304 lines. The route now owns page state and data loading, while handoff
  handling, preview/review action runtime, page header controls, PR context
  rendering, PR card composition, insight panels, and
  category/branch/artifact derivation live behind focused Module Interfaces.
- Added `apps/desktop/src/pages/pullRequests/pullRequestViewModel.test.ts`
  covering PR dedupe, category matching, Project Link branch scoping,
  readiness labels, and insight artifact merge order.
- Current Pull Requests file sizes are:
  `PullRequests.tsx` 304 lines,
  `usePullRequestActions.ts` 220 lines,
  `usePullRequestHandoff.ts` 105 lines,
  `PullRequestInsightPanels.tsx` 391 lines,
  `PullRequestCard.tsx` 218 lines,
  `PullRequestContextPanel.tsx` 137 lines,
  `PullRequestPageHeader.tsx` 106 lines,
  `pullRequestViewModel.ts` 84 lines, and
  `pullRequestTypes.ts` 27 lines.
- Added `Pull Requests page split` to the overall progress table as a
  completed post-plan hardening track.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/pullRequests/pullRequestViewModel.test.ts`
  passed with 5 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split quick reply and command chip controls into focused conversation
  Modules: `SuggestionReplyControls.tsx`, `suggestionReplyTypes.ts`,
  `suggestionReplyState.ts`, `suggestionReplyDerivation.ts`, and
  `suggestionReplyWorkflowSuggestions.ts`.
- Reduced `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
  from 583 lines to a 23-line compatibility Interface. Existing imports from
  `./SuggestionReplyBar.js` remain stable for `Chat.tsx`, chat derived state,
  composer shell, workspace suggestions, and the existing test suite.
- Moved composer input/notice state, queued/busy/blocked button state, and
  suggestion button title logic into `suggestionReplyState.ts`.
- Moved command chip derivation and contextual quick-reply derivation into
  `suggestionReplyDerivation.ts`, keeping the agent-product behavior focused
  on observable work: diff-aware review, scoped staging, commit/push boundaries,
  PR readiness, pipeline recovery, auth recovery, and repository-context
  follow-ups.
- Moved CI, commit, and PR workflow-specific quick-reply logic into
  `suggestionReplyWorkflowSuggestions.ts`, keeping the top-level derivation
  Module below the preferred TypeScript file-size range.
- Moved compact operational UI rendering into `SuggestionReplyControls.tsx`
  while preserving the existing restrained product UI vocabulary and stateful
  button affordances.
- Current suggestion reply file sizes are:
  `SuggestionReplyBar.tsx` 23 lines,
  `SuggestionReplyControls.tsx` 116 lines,
  `suggestionReplyDerivation.ts` 157 lines,
  `suggestionReplyWorkflowSuggestions.ts` 158 lines,
  `suggestionReplyState.ts` 99 lines, and
  `suggestionReplyTypes.ts` 106 lines.
- Added `Suggestion reply controls split` to the overall progress table as a
  completed post-plan hardening track.
- Split the 487-line `SuggestionReplyBar.test.tsx` into focused test Modules:
  `suggestionReplyDerivation.test.ts` 237 lines,
  `suggestionReplyCommandChips.test.tsx` 61 lines,
  `suggestionReplyComposerState.test.ts` 105 lines, and
  `SuggestionReplyBar.test.tsx` 94 lines. Derivation policy, command chips,
  composer state, and visual control rendering now have separate test seams.
- Verified after the suggestion reply test split:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/suggestionReplyDerivation.test.ts src/components/conversation/suggestionReplyCommandChips.test.tsx src/components/conversation/suggestionReplyComposerState.test.ts src/components/conversation/SuggestionReplyBar.test.tsx`
  passed with 38 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split the bot-response renderer into focused conversation Modules:
  `ConversationPartRenderer.tsx`, `MarkdownContent.tsx`,
  `markdownSourceLinks.ts`, `CodeBlock.tsx`, `ReferenceParts.tsx`,
  `ArtifactCard.tsx`, `conversationPartGrouping.ts`,
  `conversationPartStyles.ts`, and `conversationTheme.ts`.
- Reduced `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`
  from 967 lines to 201 lines. The file now owns renderer dispatch only,
  while markdown rendering, markdown source-link preprocessing, code block
  rendering, source/reference UI, artifact cards, grouping, styles, and theme
  detection live behind separate Module Interfaces.
- Preserved the existing `ConversationPartRenderer` API and re-exported
  `MarkdownContent` from the same module so existing PR page imports remain
  compatible.
- Current conversation renderer file sizes are:
  `ConversationPartRenderer.tsx` 201 lines,
  `MarkdownContent.tsx` 143 lines,
  `markdownSourceLinks.ts` 163 lines,
  `CodeBlock.tsx` 102 lines,
  `ArtifactCard.tsx` 123 lines,
  `ReferenceParts.tsx` 115 lines,
  `conversationPartGrouping.ts` 55 lines,
  `conversationPartStyles.ts` 27 lines, and
  `conversationTheme.ts` 4 lines.
- Added `Conversation renderer split` to the overall progress table as a
  completed post-plan hardening track.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 15 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/prInsightArtifacts.test.ts`
  passed with 21 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Added `apps/desktop/src/pages/chat/chatBubbleReducer.ts` as the reducer
  Module for visible Chat bubble state transitions.
- Moved assistant visible streaming, streaming finalization, error bubble
  deduplication, final assistant response merging, approval-request rendering,
  tool bubble upsert/output/end handling, metadata merging, local tool toggle,
  legacy confirm resolution, pending approval status updates, terminal
  pending-action cleanup, and direct workflow result append behind the
  `reduceChatBubbles` action Interface.
- Updated `useChatBubbleRuntime.ts`, `useAssistantVisibleStream.ts`,
  `useChatRuntime.ts`, `chatStreamDispatcher.ts`,
  `chatTerminalStreamState.ts`, and `useWorkspaceActionRuntime.ts` to drive
  visible message-state transitions through reducer actions instead of
  hook-local bubble mutation.
- Remaining direct `setBubbles` calls in the Chat surface are reset/hydration
  paths (`newChat`, session load) or the low-level Adapter seam used to apply
  reducer actions; streaming/tool/approval visible transitions now have one
  tested reducer Interface.
- Current reducer-related file sizes are:
  `chatBubbleTransitions.ts` 256 lines,
  `useChatRuntime.ts` 236 lines,
  `useChatBubbleRuntime.ts` 197 lines,
  `chatStreamDispatcher.ts` 194 lines,
  `useWorkspaceActionRuntime.ts` 181 lines,
  `useAssistantVisibleStream.ts` 143 lines,
  `chatBubbleReducer.test.ts` 130 lines,
  `chatBubbleReducer.ts` 122 lines, and
  `chatEventReducer.ts` 53 lines.
- Added `apps/desktop/src/pages/chat/chatBubbleReducer.test.ts` with direct
  coverage for assistant visible streaming, approval/pending states, tool
  execution, tool UI controls, error dedupe, legacy confirm resolution, and
  direct workflow result appends.
- Marked `Add Chat event reducer seam` as complete in the implementation
  queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatBubbleReducer.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts src/pages/chat/chatToolStreamState.test.ts src/pages/chat/chatWorkflowStreamState.test.ts src/pages/chat/chatTerminalStreamState.test.ts src/pages/chat/workspaceActions.test.ts`
  passed with 34 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split pending approval card rendering into
  `apps/desktop/src/pages/chat/approval/PendingActionCard.tsx`.
- Moved approval waiting/executing/done/cancelled visual state, risk badge
  mapping, scoped decision controls, and evidence rendering behind the
  `PendingActionCard` Module Interface.
- Reduced `apps/desktop/src/pages/chat/approval/ApprovalCards.tsx` to an
  execution-log composition Module that groups tool bubbles, maps timeline
  items, and re-exports `PendingActionCard` for compatibility.
- Current approval file sizes are:
  `PendingActionCard.tsx` 149 lines,
  `ApprovalCards.tsx` 105 lines,
  `PendingActionCard.test.tsx` 78 lines, and
  `ConfirmCard.tsx` 53 lines.
- Added `apps/desktop/src/pages/chat/approval/PendingActionCard.test.tsx`
  with focused coverage for actionable approval evidence, scoped decision
  controls, and terminal approval states.
- Marked `Split Chat approvals` as complete in the implementation queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/approval/PendingActionCard.test.tsx src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx`
  passed with 13 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split workspace action mapping into focused Modules:
  `workspaceActionTypes.ts`, `workspaceActionTools.ts`,
  `workspaceActionWorkflow.ts`, and `workspaceActionSuggestions.ts`.
- Reduced `workspaceActions.ts` to a 10-line compatibility barrel. Runtime
  callers now import the narrower tool/workflow/suggestion Interfaces directly
  instead of depending on the broad facade.
- Current workspace action file sizes are:
  `useWorkspaceActionRuntime.ts` 180 lines,
  `workspaceActions.test.ts` 89 lines,
  `workspaceActionWorkflow.ts` 88 lines,
  `workspaceActionTools.ts` 66 lines,
  `workspaceActionSuggestions.ts` 34 lines,
  `workspaceActionTypes.ts` 18 lines, and
  `workspaceActions.ts` 10 lines.
- Added `apps/desktop/src/pages/chat/workspaceActions.test.ts` with direct
  coverage for tool candidates, approval matching, direct workflow adaptation,
  quick-reply adaptation, and welcome-suggestion adaptation.
- Marked `Split workspace action mapping/runtime` as complete in the
  implementation queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/workspaceActions.test.ts`
  passed with 3 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split artifact workspace rendering into
  `apps/desktop/src/pages/chat/artifacts/ArtifactWorkspace.tsx` and
  `ArtifactWorkspaceContent.tsx`.
- `ArtifactWorkspace.tsx` is now a route-panel shell Module for selection
  state, title/status chrome, and clear behavior. `ArtifactWorkspaceContent`
  owns markdown/text/Mermaid/html/react artifact rendering, saved artifact
  lookup states, copy/download actions, and Mermaid preview lifecycle.
- Current artifact/source workspace file sizes are:
  `ArtifactWorkspaceContent.tsx` 271 lines,
  `SourceWorkspace.tsx` 195 lines,
  `useArtifactWorkspace.ts` 157 lines,
  `prInsightArtifacts.ts` 97 lines,
  `ArtifactWorkspace.tsx` 82 lines,
  `artifactWorkspaceHelpers.ts` 77 lines,
  `conversationArtifacts.ts` 64 lines, and
  `ArtifactWorkspace.test.tsx` 62 lines.
- Added `apps/desktop/src/pages/chat/artifacts/ArtifactWorkspace.test.tsx`
  with SSR coverage for empty workspace state, selected markdown artifacts,
  action controls, and saved artifact lookup errors.
- Marked `Split artifact/source workspace` as complete in the implementation
  queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/artifacts/ArtifactWorkspace.test.tsx src/pages/chat/workspaceActions.test.ts`
  passed with 6 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split workflow task state into focused Modules:
  `apps/desktop/src/pages/chat/workflowTaskTypes.ts`,
  `workflowTaskDerivation.ts`, and a small compatibility
  `workflowTaskState.ts` facade.
- Moved PR readiness follow-up derivation, commit workflow steps, CI/pipeline
  workflow steps, workflow detail-line formatting, and action-summary merging
  behind the `workflowTaskDerivation` Module Interface.
- Kept Git recovery panel state and step action state in
  `workflowTaskState.ts`, while preserving old imports through re-exports.
- Reduced `workflowTaskState.ts` from 393 lines to 85 lines. Current workflow
  task file sizes are:
  `workflowTaskDerivation.ts` 260 lines,
  `workflowTaskState.test.ts` 141 lines,
  `workflowTaskTypes.ts` 71 lines, and
  `workflowTaskState.ts` 85 lines.
- Added `apps/desktop/src/pages/chat/workflowTaskState.test.ts` with direct
  coverage for commit, PR readiness, CI/pipeline derivation, step action
  states, Git recovery panel state, and action-summary merging.
- Marked `Split workflow task state` as complete in the implementation queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/workflowTaskState.test.ts src/pages/chat/chatDerivedState.test.ts`
  passed with 7 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Split Project Link onboarding into deeper Modules:
  `apps/desktop/src/pages/chat/projectLinkOnboarding/useProjectLinkSetupState.ts`,
  `ProjectLinkBasicFields.tsx`, and `ProjectLinkAdoFields.tsx`.
- Moved Project Link form state, branch detection, Azure DevOps discovery,
  auto-discovery deduplication, pipeline recommendation, validation, and save
  behavior behind the `useProjectLinkSetupState` Module Interface.
- Reduced `ProjectLinkSetupCard.tsx` from 490 lines to 97 lines. Current
  Project Link onboarding file sizes are:
  `ProjectLinkAdoFields.tsx` 289 lines,
  `useProjectLinkSetupState.ts` 261 lines,
  `ProjectLinkBasicFields.tsx` 82 lines, and
  `BranchSelect.tsx` 59 lines.
- Updated stale chat e2e selectors to accept the current `MergePilot` and
  `GPT-4o` product copy, and made the context-panel check compatible with the
  panel already being open by default.
- Marked `Split Chat Project Link onboarding` as complete in the implementation
  queue.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "keeps the project-linked chat shell inside the viewport|keeps the onboarding form and input usable on narrow screens"`
  passed with 2 browser tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Added two Playwright browser/SSE acceptance scenarios to
  `tests/e2e/chat-layout.spec.ts`.
- The mixed canonical/legacy stream scenario mocks daemon SSE with
  `ui.chunk`, legacy `assistant_delta`, legacy `message`, legacy
  `tool_start`, and legacy `tool_output_delta` in the same turn. The browser
  verifies canonical text appears once, legacy assistant/message/tool output
  does not appear, the execution summary remains one command, and the composer
  is released after completion.
- The canonical approval scenario mocks daemon SSE with only
  `ui.chunk` `approval-required` and `finish` events. The browser verifies the
  approval card renders from the canonical chunk path, including tool,
  description, next hint, Confirm/Skip controls, and no dependency on legacy
  `approval_required`.
- Raised Chat streaming contract progress from `99%` to `100%` and marked the
  track `Complete`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "deduplicates legacy text and tool events after canonical UI chunks start|renders approval cards from canonical UI chunks without legacy approval events"`
  passed with 2 browser tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Added `apps/desktop/src/pages/chat/chatStreamDispatcher.test.ts` to verify
  the stream dispatcher Interface, not just the reducer predicate.
- The new dispatcher tests cover the canonical-first invariant end to end at
  the desktop stream seam: after a `ui.chunk` event starts a turn, legacy
  `assistant_delta`, `message`, `tool_start`, and `tool_output_delta` render
  events are ignored and cannot duplicate visible assistant or tool output.
- The dispatcher tests also verify that control events still work during
  canonical streaming: `workflow_state` updates remain accepted and terminal
  `done` events still finalize the turn, clear canonical availability, and
  refresh history when requested.
- Raised Chat streaming contract progress from `98%` to `99%`; the remaining
  gap is now live browser/SSE acceptance rather than missing unit/integration
  coverage.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts`
  passed with 14 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Extracted canonical `ui.chunk` UI handling from
  `apps/desktop/src/pages/chat/useChatBubbleRuntime.ts` into
  `apps/desktop/src/pages/chat/chatUiChunkDispatcher.ts`.
- The new `chatUiChunkDispatcher` Module now owns the canonical chunk Interface
  for assistant text streaming, tool input/output timeline updates, approval
  requests, workflow-state updates, metadata chunks, terminal finish chunks,
  and error chunks.
- Added defensive guards for internal approval/workflow payloads so malformed
  canonical control chunks cannot corrupt Chat UI state.
- Updated `useChatBubbleRuntime` to act as React wiring only; it now injects
  state setters and bubble update Adapters into the dispatcher instead of
  owning chunk interpretation directly.
- Added `apps/desktop/src/pages/chat/chatUiChunkDispatcher.test.ts` with direct
  coverage for text chunks, tool chunks, approval/workflow chunks,
  terminal/error chunks, and invalid control payloads.
- Raised Chat streaming contract progress from `94%` to `98%`.
- Current file sizes:
  `chatUiChunkDispatcher.ts` is 191 lines,
  `useChatBubbleRuntime.ts` is 204 lines,
  `chatStreamDispatcher.ts` is 192 lines, and
  `Chat.tsx` is 490 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatUiChunkDispatcher.test.ts src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts src/pages/chat/chatToolStreamState.test.ts src/pages/chat/chatWorkflowStreamState.test.ts src/pages/chat/chatTerminalStreamState.test.ts`
  passed with 21 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatUiStream.test.ts`
  passed with 7 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatEvents.test.ts`
  passed with 10 tests.
- Extracted terminal stream handling from
  `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` into
  `apps/desktop/src/pages/chat/chatTerminalStreamState.ts`.
- Moved `done`, `cancelled`, and `error` finalization side effects behind a
  terminal stream Module Interface, including final assistant response
  metadata, pending bubble completion/cancellation, busy/status reset,
  refresh-history-on-done, and error bubble emission.
- Reduced `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` from 222
  lines to 192 lines.
- Kept `apps/desktop/src/pages/chat/chatTerminalStreamState.ts` at 108 lines.
- Added `apps/desktop/src/pages/chat/chatTerminalStreamState.test.ts` with
  direct coverage for done finalization, cancellation bubble creation, pending
  bubble cancellation, and error message fallback.
- Raised Chat streaming contract progress from `90%` to `94%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts src/pages/chat/chatToolStreamState.test.ts src/pages/chat/chatWorkflowStreamState.test.ts src/pages/chat/chatTerminalStreamState.test.ts`
  passed with 16 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Extracted workflow and approval stream state helpers from
  `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` into
  `apps/desktop/src/pages/chat/chatWorkflowStreamState.ts`.
- Moved workflow status text mapping, approval-required workflow-state
  creation, approval-resolved workflow-state updates, and approval resolution
  status text behind a dedicated workflow stream state Module Interface.
- Reduced `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` from 230
  lines to 222 lines.
- Kept `apps/desktop/src/pages/chat/chatWorkflowStreamState.ts` at 42 lines.
- Added `apps/desktop/src/pages/chat/chatWorkflowStreamState.test.ts` with
  direct coverage for workflow status text, approval-required state creation,
  and approval resolution state clearing.
- Raised Chat streaming contract progress from `86%` to `90%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts src/pages/chat/chatToolStreamState.test.ts src/pages/chat/chatWorkflowStreamState.test.ts src/pages/chat/chatBubbleTransitions.test.ts`
  passed with 16 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Extracted legacy tool stream state helpers from
  `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` into
  `apps/desktop/src/pages/chat/chatToolStreamState.ts`.
- Moved tool call id generation, tool result state mapping, `tool_end`
  bubble finalization, and pending confirmation status transitions behind a
  dedicated tool stream state Module Interface.
- Updated approval cards, chat bubble transitions, session history hydration,
  workspace action runtime, and the stream dispatcher to import the shared
  tool stream helpers from the new Module.
- Reduced `apps/desktop/src/pages/chat/chatStreamDispatcher.ts` from 295
  lines to 230 lines.
- Kept `apps/desktop/src/pages/chat/chatToolStreamState.ts` at 78 lines.
- Added `apps/desktop/src/pages/chat/chatToolStreamState.test.ts` with direct
  coverage for result-state mapping, tool-end finalization, and pending
  confirmation status transitions.
- Raised Chat streaming contract progress from `82%` to `86%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatEventReducer.test.ts src/pages/chat/chatStreaming.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/chat/chatToolStreamState.test.ts src/pages/chat/chatSessionHistory.test.ts`
  passed with 15 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Extracted pipeline submission routing from
  `packages/daemon/src/routes/tasks.routes.ts` into
  `packages/daemon/src/routes/pipelines.routes.ts`.
- Kept the existing compatibility URL stable:
  `/tasks/submit-pipeline`.
- Preserved submit-pipeline schema validation, queued task creation, `202`
  response shape, and malformed payload `400` response shape.
- Reduced `packages/daemon/src/routes/tasks.routes.ts` from 89 lines to
  77 lines.
- Kept `packages/daemon/src/routes/pipelines.routes.ts` at 21 lines.
- Raised Daemon routes split progress from `99%` to `100%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted checkpoint HTTP endpoints from
  `packages/daemon/src/routes/chat.routes.ts` into
  `packages/daemon/src/routes/checkpoints.routes.ts`.
- Kept endpoint URLs stable:
  `/chat/checkpoints`, `/chat/checkpoints/:checkpointId/preview`, and
  `/chat/checkpoints/:checkpointId/rollback-plan`.
- Preserved checkpoint activity listing, preview max-diff query validation,
  rollback-plan behavior, and `settings.dataDir` checkpoint lookup.
- Reduced `packages/daemon/src/routes/chat.routes.ts` from 293 lines to
  252 lines.
- Kept `packages/daemon/src/routes/checkpoints.routes.ts` at 57 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/server.test.ts`
  passed with 67 tests.
- Extracted approval proposal lifecycle handling into
  `packages/daemon/src/chatApprovalProposals.ts`.
- Moved stored approval proposal creation, compatibility fallback resolution
  from `approvalProposal`/`pendingAction`/inferred messages, proposal clearing,
  and running workflow-state persistence behind an approval proposal Module
  Interface.
- Replaced inline `createApprovalProposal(...)` and `/confirm-action`
  proposal preflight logic in `packages/daemon/src/chatSession.ts` with
  delegating calls.
- Preserved session profile/inline-profile/LLM config persistence,
  `completedTools` merging, double-click mitigation by clearing the proposal
  before execution, and the existing error response when no proposal exists.
- Reduced `packages/daemon/src/chatSession.ts` from 375 lines to 349 lines.
- Kept `packages/daemon/src/chatApprovalProposals.ts` at 92 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted session record operations into
  `packages/daemon/src/chatSessionRecords.ts`.
- Moved session save with local fallback, history/bubble lookup,
  workflow-state lookup, message/bubble append truncation rules, metadata
  updates, and checkpoint activity listing behind a session records Module
  Interface.
- Replaced direct record mutation helpers in
  `packages/daemon/src/chatSession.ts` with delegating methods so route and
  test compatibility remains stable.
- Preserved message cap `200`, bubble cap `400`, metadata trim/pinned
  behavior, checkpoint activity shape, and local save fallback behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 445 lines to 375 lines.
- Kept `packages/daemon/src/chatSessionRecords.ts` at 130 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted confirmed-action outcome handling into
  `packages/daemon/src/chatConfirmedOutcome.ts`.
- Moved `/confirm-action` post-execution branching for structured next
  approval, structured done finalization, and fallback planner continuation
  behind a confirmed-action outcome Module Interface.
- Preserved structured commit next-step approvals, structured done responses,
  assistant finalization bubbles, workflow-state events, approval-required
  events, and the fallback no-read-tool continuation prompt.
- Reduced `packages/daemon/src/chatSession.ts` from 513 lines to 445 lines.
- Kept `packages/daemon/src/chatConfirmedOutcome.ts` at 133 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed after fixing a missing `setStoredApprovalProposal` import in
  `chatSession.ts`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted chat-message approval handling into
  `packages/daemon/src/chatMessageApprovals.ts`.
- Moved pending approval lookup, confirmation/denial message detection,
  cancellation finalization, confirmed action execution, and post-confirmation
  planner continuation behind a chat-message approval Module Interface.
- Replaced the inline confirmation/denial resolver in
  `packages/daemon/src/chatSession.ts`.
- Preserved user-message persistence order, inferred pending-action fallback,
  approval resolution events, workflow-state events, cancellation response,
  `[executed]` history entries, and follow-up planner continuation behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 580 lines to 513 lines.
- Kept `packages/daemon/src/chatMessageApprovals.ts` at 137 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted contextual planner continuation into
  `packages/daemon/src/chatPlannerContinuation.ts`.
- Moved continuation user-message persistence, history lookup, context prompt
  building, progress event emission, and planner streaming behind a planner
  continuation Module Interface.
- Replaced three repeated planner-continuation paths: post-confirmation chat
  continuation, normal chat run, and `/confirm-action` continuation.
- Preserved history limits, progress messages, inline profile context,
  profile id context, and existing planner persistence behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 608 lines to 580 lines.
- Kept `packages/daemon/src/chatPlannerContinuation.ts` at 83 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted confirmed action execution persistence into
  `packages/daemon/src/chatConfirmedActions.ts`.
- Moved confirmed tool streaming, tool bubble persistence, checkpoint metadata
  attachment, and assistant history entry persistence behind a confirmed-action
  Module Interface.
- Replaced duplicated confirmed-action persistence in both the chat-message
  confirmation branch and the `/confirm-action` endpoint path.
- Preserved legacy `tool_start`/`tool_output_delta`/`tool_end` events,
  checkpoint metadata, `[executed]` history entries, and
  `[confirmed & executed]` history entries.
- Reduced `packages/daemon/src/chatSession.ts` from 629 lines to 608 lines.
- Kept `packages/daemon/src/chatConfirmedActions.ts` at 62 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted Chat runtime setup into
  `packages/daemon/src/chatRuntimeSetup.ts`.
- Moved profile extra resolution, ToolContext construction, effective LLM
  settings, `LLMClient`, planner/action executor creation, and ChatPlanner
  construction behind a runtime setup Module Interface.
- Preserved inline profile precedence, stored profile fallback,
  `chat_message`/`chat_profile` extras for the live chat run path, and
  persisted `inlineProfile`/`profileId`/`llmConfig` reuse for
  `confirmAction(...)`.
- Reduced `packages/daemon/src/chatSession.ts` from 680 lines to 629 lines.
- Kept `packages/daemon/src/chatRuntimeSetup.ts` at 70 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted active chat session lifecycle into
  `packages/daemon/src/chatActiveSessions.ts`.
- Moved active session Map ownership, session start, confirmation resolver
  registration, confirmation resolution, cancellation, abort-controller cleanup,
  and final active-session removal behind an active-session Module Interface.
- Replaced direct `Map` and resolver mutation in
  `packages/daemon/src/chatSession.ts` with `ActiveChatSessions`.
- Preserved `confirm(...)`, `cancel(...)`, run cleanup, confirm-action cleanup,
  and session creation behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 714 lines to 680 lines.
- Kept `packages/daemon/src/chatActiveSessions.ts` at 61 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Checked:
  `git diff --check -- docs\architecture-refactor-progress.md packages\daemon\src\chatSession.ts packages\daemon\src\chatActiveSessions.ts packages\daemon\src\chatToolRuntime.ts packages\daemon\src\chatContextPrompt.ts packages\daemon\src\chatPlannerPersistence.ts packages\daemon\src\chatToolExecution.ts`
  reported only CRLF normalization warnings, with no whitespace errors.
- Extracted chat tool registry and executor construction into
  `packages/daemon/src/chatToolRuntime.ts`.
- Moved base chat tool aggregation, `repo_refresh_index` tool registration,
  planner/action executor construction, write-tool approval filtering, and
  confirmed Git action checkpoint creation behind a chat tool runtime Module
  Interface.
- Kept `createChatToolExecutors` re-exported from
  `packages/daemon/src/chatSession.ts` so existing tests and callers remain
  compatible.
- Preserved `repo_refresh_index` behavior, semantic follow-up context,
  embedding warning reporting, and confirmed-action safety checkpoint behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 852 lines to 714 lines.
- Kept `packages/daemon/src/chatToolRuntime.ts` at 149 lines.
- Corrected a local command typo after accidentally invoking
  `.\scripts\windows\pnm-project.ps1`; the valid repo-local runner remains
  `.\scripts\windows\pnpm-project.ps1`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/chatSessionAdoMcpDisabled.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 48 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Checked:
  `git diff --check -- docs\architecture-refactor-progress.md packages\daemon\src\chatSession.ts packages\daemon\src\chatToolRuntime.ts packages\daemon\src\chatContextPrompt.ts packages\daemon\src\chatPlannerPersistence.ts packages\daemon\src\chatToolExecution.ts`
  reported only CRLF normalization warnings, with no whitespace errors.
- Extracted repository/context prompt construction into
  `packages/daemon/src/chatContextPrompt.ts`.
- Moved repository context loading, background index refresh throttling, current
  branch prompt injection, PR insight context injection, validation failure
  artifact injection, Azure Pipeline failure artifact injection, and inline
  profile to chat-context profile mapping behind a context prompt Module
  Interface.
- Replaced `ChatSessionManager.buildContextPrompt(...)` and its background
  index refresh state with `ChatContextPromptBuilder`.
- Preserved context notes, sources, current branch warning behavior, artifact
  prompt injection, and failure fallback behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 937 lines to 852 lines.
- Kept `packages/daemon/src/chatContextPrompt.ts` at 130 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 47 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Checked:
  `git diff --check -- docs\architecture-refactor-progress.md packages\daemon\src\chatSession.ts packages\daemon\src\chatContextPrompt.ts packages\daemon\src\chatPlannerPersistence.ts packages\daemon\src\chatToolExecution.ts`
  reported only CRLF normalization warnings, with no whitespace errors.
- Extracted Chat planner event persistence into
  `packages/daemon/src/chatPlannerPersistence.ts`.
- Moved planner `tool_start`/`tool_end` tracking, tool bubble persistence,
  `done` result enrichment, context source merging, approval proposal storage,
  workflow-state event emission, error/cancel bubble persistence, and assistant
  history persistence behind a planner persistence Module Interface.
- Replaced the private `ChatSessionManager._runPlannerAndPersist(...)` method
  with `streamPlannerAndPersist(...)` plus a small persistence Adapter, so the
  Chat session class no longer owns planner event normalization.
- Preserved legacy SSE event names, persisted bubble shapes, approval proposal
  storage fields, and assistant message history behavior.
- Reduced `packages/daemon/src/chatSession.ts` from 1004 lines to 937 lines.
- Kept `packages/daemon/src/chatPlannerPersistence.ts` at 139 lines.
- Raised Daemon routes split progress from `98%` to `99%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 47 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Checked:
  `git diff --check -- docs\architecture-refactor-progress.md packages\daemon\src\chatSession.ts packages\daemon\src\chatPlannerPersistence.ts packages\daemon\src\chatToolExecution.ts`
  reported only CRLF normalization warnings, with no whitespace errors.
- Extracted confirmed tool execution streaming into
  `packages/daemon/src/chatToolExecution.ts`.
- Moved confirmed-action `tool_start`, `tool_output_delta`, `tool_end`,
  `ToolExecutor.callStream(...)`, execution error wrapping, result summary
  generation, and checkpoint metadata parsing behind a single tool execution
  Module Interface.
- Removed duplicated confirmed-tool execution Implementation from both the
  inline confirmation branch in `run(...)` and the explicit
  `confirmAction(...)` path while preserving legacy SSE events and persisted
  tool bubbles.
- Kept compatibility re-export for `checkpointMetadataFromToolResult` from
  `packages/daemon/src/chatSession.ts` so existing tests and callers remain
  stable.
- Kept `packages/daemon/src/chatSession.ts` at 1004 lines after moving
  checkpoint parsing into `packages/daemon/src/chatToolExecution.ts`; the line
  count is unchanged from the previous slice because the new work is primarily
  locality and duplication reduction.
- Kept `packages/daemon/src/chatToolExecution.ts` at 91 lines.
- Raised Daemon routes split progress from `97%` to `98%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 47 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Checked:
  `git diff --check` reported only CRLF normalization warnings, with no
  whitespace errors.
- Extracted Chat artifact/context formatting into
  `packages/daemon/src/chatArtifactContext.ts`.
- Moved PR insight artifact id/PR id parsing, saved PR AI insight prompt
  construction, PR readiness compact formatting, validation failure artifact
  prompt injection, Azure Pipeline failure artifact prompt injection, and
  PR/CI readiness intent detection behind the artifact context Module
  Interface.
- Kept compatibility re-exports for artifact/context helpers from
  `packages/daemon/src/chatSession.ts` so existing tests and callers remain
  stable.
- Reduced `packages/daemon/src/chatSession.ts` from 1220 lines to 1004 lines.
- Kept `packages/daemon/src/chatArtifactContext.ts` at 240 lines.
- Raised Daemon routes split progress from `96%` to `97%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionCheckpoint.test.ts test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/validationPreflight.test.ts`
  passed with 47 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted approval/workflow-state rules into
  `packages/daemon/src/chatWorkflowState.ts`.
- Extracted response/history-based pending action derivation into
  `packages/daemon/src/chatPendingActions.ts`.
- Moved approval IDs, stored approval compatibility, workflow state metadata,
  planner source merging, structured next approval generation, confirmed-action
  done results, validation failure artifacts, user-scope checks, conflict
  guards, and write-action inference behind deeper Module Interfaces.
- Kept compatibility re-exports for `deriveWorkflowPendingAction`,
  `inferPendingAction`, and `structuredDoneAfterConfirmedAction` from
  `packages/daemon/src/chatSession.ts` so existing tests and route imports
  remain stable.
- Reduced `packages/daemon/src/chatSession.ts` from 1976 lines to 1220 lines.
- Kept `packages/daemon/src/chatWorkflowState.ts` at 407 lines and
  `packages/daemon/src/chatPendingActions.ts` at 317 lines after splitting the
  initial oversized workflow-state extraction.
- Raised Daemon routes split progress from `95%` to `96%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/gitOperation.test.ts test/validationPreflight.test.ts`
  passed with 41 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted Chat session persistence into
  `packages/daemon/src/chatHistoryStore.ts`.
- Moved Cosmos/local fallback, local JSON store reads/writes, Cosmos document
  mapping, recent-session sorting, delete fallback, and checkpoint-activity
  session loading behind the new history store Module Interface.
- Kept history-entry compatibility through `packages/daemon/src/chatSession.ts`
  type re-exports so route imports remain stable during the initial split.
- Reduced `packages/daemon/src/chatSession.ts` from 2197 lines to 1976 lines.
- Kept `packages/daemon/src/chatHistoryStore.ts` at 237 lines.
- Raised Daemon routes split progress from `94%` to `95%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/gitOperation.test.ts`
  passed with 37 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Extracted Git workflow helper behavior into
  `packages/daemon/src/chatGitWorkflow.ts`.
- Moved Git recovery operation metadata, generated commit message logic,
  name-status parsing, commit type/verb/subject heuristics, and push readiness
  probing behind the new Git workflow Module Interface.
- Kept compatibility imports stable from `packages/daemon/src/chatSession.ts`
  while moving the Implementation to the new Module seam.
- Reduced `packages/daemon/src/chatSession.ts` from 2479 lines to 2197 lines.
- Kept `packages/daemon/src/chatGitWorkflow.ts` at 131 lines.
- Raised Daemon routes split progress from `93%` to `94%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/workspaceWorkflow.test.ts test/gitOperation.test.ts`
  passed with 37 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Extracted validation failure signal parsing and markdown rendering into
  `packages/daemon/src/validationFailureSignals.ts`.
- Kept `extractValidationFailureSignals` re-exported from
  `packages/daemon/src/chatSession.ts` so existing tests and imports remain
  compatible while the Implementation lives behind the new Module Interface.
- Moved framework inference, failing file/test detection, diagnostic capture,
  candidate rerun command generation, recovery markdown, and fenced output
  formatting into the validation failure Module.
- Reduced `packages/daemon/src/chatSession.ts` from 2584 lines to 2479 lines.
- Kept `packages/daemon/src/validationFailureSignals.ts` at 114 lines.
- Raised Daemon routes split progress from `92%` to `93%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts`
  passed with 27 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Re-verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Fixed the carried-forward daemon broad test failures by preserving inline
  Project Link PAT credentials in the Chat tool context.
- Extracted the inline Project Link to tool-context mapping into
  `packages/daemon/src/chatProjectLinkContext.ts`.
- Updated that Module so `confirm-action` can execute confirmed Azure DevOps
  tools through the existing `resolveAdoContextAuth` Interface instead of
  falling back to unavailable OAuth.
- Reduced `packages/daemon/src/chatSession.ts` from 2595 lines to 2584 lines;
  this is only a first profile-context seam, and the file remains the next
  major split target.
- Verified structured PR creation now completes through `ado_create_pr` with
  the mocked PAT-backed ADO request path.
- Verified work-item linking now completes through the structured PR workflow
  done path with `workflowKind: "pr"` and
  `workflowPhase: "work_item_linked"`.
- Raised Daemon routes split progress from `90%` to `92%` because the route
  split now has broad server coverage again.
- Raised Verification baseline from `97%` to `100%`.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts`
  passed with 56 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting top-level visual
  composition into `apps/desktop/src/pages/chat/layout/ChatShell.tsx`.
- Moved top bar, history sidebar wiring, message panel, composer, pinned
  summary panel, and source/artifact side panel composition behind the
  `ChatShell` layout Module Interface.
- Extracted repository index-status loading and debounce behaviour into
  `apps/desktop/src/pages/chat/useChatIndexStatus.ts`.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 617 lines to 489 lines.
- Kept `apps/desktop/src/pages/chat/layout/ChatShell.tsx` at 422 lines,
  inside the complex layout Module allowance because it owns one cohesive
  route-shell composition seam.
- Kept `apps/desktop/src/pages/chat/useChatIndexStatus.ts` at 40 lines.
- Raised Desktop Chat split progress from `99%` to `100%`; remaining work in
  this area is optional Interface polish, not a planned split blocker.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting bubble and canonical
  UI chunk handling into `apps/desktop/src/pages/chat/useChatBubbleRuntime.ts`.
- Moved raw bubble append, error deduplication, final assistant response
  insertion, approval card insertion, tool bubble upsert, tool output delta
  append, assistant metadata merge, canonical `ui.chunk` handling, legacy
  confirm resolution, and tool expand/collapse behind the new bubble runtime
  hook Interface.
- Kept `Chat.tsx` responsible for composing runtime hooks and passing returned
  actions into stream dispatch, workspace actions, session lifecycle, and
  layout Modules.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 787 lines to 617 lines.
- Kept `apps/desktop/src/pages/chat/useChatBubbleRuntime.ts` at 267 lines.
- Raised Desktop Chat split progress from `98%` to `99%`; the remaining gap is
  now primarily top-level shell JSX/wiring extraction.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting suggestion and queued
  follow-up orchestration into
  `apps/desktop/src/pages/chat/useChatSuggestionRuntime.ts`.
- Moved quick-reply prompt insertion, workspace-action mapping, busy workflow
  queueing, queued follow-up replay, and queued follow-up cancellation behind
  the new suggestion runtime hook Interface.
- Kept `queuedSuggestion` state owned by `Chat.tsx` because derived composer
  state needs the queued label before workspace action runtime is available.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 805 lines to 787 lines.
- Kept `apps/desktop/src/pages/chat/useChatSuggestionRuntime.ts` at 84 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting model selection and
  model-menu runtime into
  `apps/desktop/src/pages/chat/useChatModelRuntime.ts`.
- Moved custom model discovery, active model validation, active model
  persistence, focus/storage refresh listeners, model-menu outside-interaction
  dismissal, Escape-key dismissal, and busy/approval menu closing behind the
  new model runtime hook Interface.
- Kept `Chat.tsx` responsible only for passing the active model choice into
  chat runtime and composer layout.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 875 lines to 805 lines.
- Kept `apps/desktop/src/pages/chat/useChatModelRuntime.ts` at 127 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting session lifecycle
  orchestration into
  `apps/desktop/src/pages/chat/useChatSessionLifecycle.ts`.
- Moved saved-session loading, persisted message restoration, workflow state
  restoration, pending approval restoration, handoff consumption, repo-path
  persistence, draft saving, and `/chat?new=1` reset handling behind the new
  lifecycle hook Interface.
- Kept `Chat.tsx` responsible for owning the state values and passing lifecycle
  actions to layout/runtime Modules.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 912 lines to 875 lines.
- Kept `apps/desktop/src/pages/chat/useChatSessionLifecycle.ts` at 170 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat runtime cleanup by extracting visible assistant text
  streaming into
  `apps/desktop/src/pages/chat/useAssistantVisibleStream.ts`.
- Moved requestAnimationFrame scheduling, pending text buffering, dynamic
  smooth-stream take length, immediate drain on part switch/end, frame cleanup,
  and assistant streaming stop transition behind the new visible-stream hook
  Interface.
- Kept `Chat.tsx` responsible only for calling
  `startAssistantTextPart`, `appendAssistantDelta`, and `stopStreaming` from
  canonical `ui.chunk` handling and legacy fallback dispatch.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1008 lines to 912 lines.
- Kept `apps/desktop/src/pages/chat/useAssistantVisibleStream.ts` at 146
  lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/smoothStreamingText.test.ts src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 43 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat layout cleanup by splitting the large workspace panel
  Module into
  `apps/desktop/src/pages/chat/layout/WorkspaceEnvironmentCard.tsx` and
  `apps/desktop/src/pages/chat/layout/WorkspaceProgressPanel.tsx`.
- Moved environment inspection, change summary, branch checkout/create menu,
  commit/push/PR menu, Git recovery actions, Project Link selector, and Azure
  DevOps quick actions behind the new environment card Interface.
- Moved workflow progress rendering, step action-state presentation, badges,
  disabled state, and fallback progress copy behind the new progress panel
  Interface.
- Reduced `apps/desktop/src/pages/chat/layout/WorkspacePanel.tsx` from 496
  lines to 100 lines; it now composes environment, artifact workspace,
  progress, and context-source panels.
- Kept the new files within target ranges:
  `WorkspaceEnvironmentCard.tsx` is 403 lines and
  `WorkspaceProgressPanel.tsx` is 79 lines.
- Removed the stale unused `WorkspacePanel` import from `Chat.tsx` and dropped
  the unused `selectedSource` prop from `WorkspacePanel`.
- Current Chat layout file sizes after this slice:
  `PinnedSummaryPanel.tsx` 266 lines, `ChatMessageList.tsx` 399 lines,
  `ComposerShell.tsx` 251 lines, and `HistorySidebar.tsx` 316 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 40 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting derived
  chat/workspace state into
  `apps/desktop/src/pages/chat/chatDerivedState.ts`.
- Moved current branch, Git status, grouped render items, suggestion replies,
  composer pending approval, composer state notice, composer input state,
  conversation title, branch list, diff stats, welcome suggestions, and
  workflow task state behind the new derived-state Module Interface.
- Kept `Chat.tsx` responsible for wiring the derived state into the layout and
  runtime Modules, without directly parsing Git tool output or deriving
  composer state.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1148 lines to 1009 lines.
- Kept `apps/desktop/src/pages/chat/chatDerivedState.ts` at 207 lines.
- Added `apps/desktop/src/pages/chat/chatDerivedState.test.ts` with 2 tests
  for title/branch/diff derivation, welcome suggestions, and workflow pending
  approval priority.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDerivedState.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 40 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting history list/menu
  runtime behaviour into
  `apps/desktop/src/pages/chat/useChatHistoryRuntime.ts`.
- Moved history fetching, history sorting, menu dismissal listeners, pagination
  clamping, pin updates, rename lifecycle, delete lifecycle, current-session
  title updates, and active-session delete reset coordination behind the new
  history runtime hook Interface.
- Kept `Chat.tsx` responsible for loading a selected session and wiring the
  returned history state/actions into `HistorySidebar` and chat runtime.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1227 lines to 1148 lines.
- Kept `apps/desktop/src/pages/chat/useChatHistoryRuntime.ts` at 180 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 38 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued runtime cleanup by moving the current-turn stop operation into
  `apps/desktop/src/pages/chat/useChatRuntime.ts`.
- Added `stopCurrentTurn` to the chat runtime actions Interface so `Chat.tsx`
  no longer directly cancels the active stream, clears the cancel ref, resets
  canonical-stream availability, stops visible streaming, and clears busy/status
  state from the composer stop button.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1232 lines to 1227 lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 38 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting active Project Link
  runtime behaviour into
  `apps/desktop/src/pages/chat/useActiveProjectLinkRuntime.ts`.
- Moved initial active link resolution, stored active link persistence,
  available-profile reconciliation, missing repo-path backfill, active profile
  derivation, and profile-selection repo-path synchronization behind the new
  active-project-link hook Interface.
- Kept `Chat.tsx` responsible only for passing `activeProfileId`,
  `activeProfile`, and `selectProjectLink` to downstream layout/runtime
  Modules.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1263 lines to 1232 lines.
- Kept `apps/desktop/src/pages/chat/useActiveProjectLinkRuntime.ts` at 76
  lines.
- Added `apps/desktop/src/pages/chat/useActiveProjectLinkRuntime.test.ts` with
  2 tests for initial active-link priority and repo-path lookup.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/useActiveProjectLinkRuntime.test.ts src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 38 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting chat handoff
  consumption into `apps/desktop/src/pages/chat/chatHandoff.ts` and scroll
  follow runtime behaviour into
  `apps/desktop/src/pages/chat/useChatScrollFollow.ts`.
- Moved `CHAT_HANDOFF_KEY` storage reads, handoff JSON parsing, message/repo
  path/profile trimming, malformed handoff handling, and handoff status text
  behind the new handoff Module Interface.
- Moved bottom/scroll container refs, near-bottom tracking, incoming content
  scroll intent, forced scroll-to-bottom intent, and scroll event handling
  behind the new scroll-follow hook Interface.
- Kept `Chat.tsx` responsible only for applying the consumed handoff state to
  React state and wiring the returned scroll refs/callbacks into the layout.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1308 lines to 1263 lines.
- Kept `apps/desktop/src/pages/chat/chatHandoff.ts` at 39 lines and
  `apps/desktop/src/pages/chat/useChatScrollFollow.ts` at 51 lines.
- Added `apps/desktop/src/pages/chat/chatHandoff.test.ts` with 2 tests for
  handoff normalization, one-shot storage consumption, empty payloads, and
  malformed JSON handling.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatHandoff.test.ts src/chatScroll.test.ts src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 36 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting resizable panel
  runtime behaviour into
  `apps/desktop/src/pages/chat/layout/useResizableChatPanels.ts` and pure
  panel sizing rules into
  `apps/desktop/src/pages/chat/layout/chatPanelLayout.ts`.
- Moved history/right panel open state, summary pin state, panel widths,
  drag refs, drag handlers, Tauri auto-expand, and workspace auto-collapse
  behind the new resizable-panels hook Interface.
- Concentrated panel width clamping, required window width calculation, and
  collapse-priority rules in the layout Module, with direct tests.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1403 lines to 1308 lines.
- Kept `apps/desktop/src/pages/chat/layout/useResizableChatPanels.ts` at 120
  lines and `apps/desktop/src/pages/chat/layout/chatPanelLayout.ts` at 109
  lines.
- Added `apps/desktop/src/pages/chat/layout/chatPanelLayout.test.ts` with 3
  tests for required width calculation, drag width constraints, and right-panel
  first collapse behaviour.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/layout/chatPanelLayout.test.ts src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 30 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting persisted chat
  session restoration and history list update rules into
  `apps/desktop/src/pages/chat/chatSessionHistory.ts`.
- Moved persisted message-to-bubble restoration, assistant metadata
  reconstruction, tool-call part restoration, history entry upsert, history
  removal, and history page clamping behind the new session-history Module
  Interface.
- Kept `Chat.tsx` responsible for orchestration only: fetching the saved
  session, applying title/workflow state, restoring pending approval, and
  closing the history panel.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1476 lines to 1403 lines.
- Kept `apps/desktop/src/pages/chat/chatSessionHistory.ts` at 110 lines.
- Added `apps/desktop/src/pages/chat/chatSessionHistory.test.ts` with 2 tests
  for persisted message restoration and history update/remove/page-clamp rules.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 27 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting artifact/source
  workspace selection and persisted PR-insight artifact lookup into
  `apps/desktop/src/pages/chat/artifacts/useArtifactWorkspace.ts`.
- Moved artifact collection, source collection, latest context-source
  derivation, selected artifact/source state, external persisted artifact
  handling, panel-open callbacks, and stale async artifact lookup cancellation
  behind the new artifact workspace hook Interface.
- Kept `Chat.tsx` responsible for routing-only concerns such as navigating PR
  insight sources to the Activity page and passing workspace state into the
  layout.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1566 lines to 1476 lines.
- Kept `apps/desktop/src/pages/chat/artifacts/useArtifactWorkspace.ts` at 157
  lines.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts src/components/conversation/ConversationPartRenderer.test.tsx`
  passed with 25 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting draft persistence and
  interrupted-session restoration into
  `apps/desktop/src/pages/chat/chatDraftPersistence.ts`.
- Moved the draft storage key, draft DTO, active workflow draft detection,
  interrupted assistant-stream restoration, draft load/save, and draft clear
  behaviour out of `apps/desktop/src/pages/Chat.tsx`.
- Kept `Chat.tsx` responsible only for calling the draft Module during initial
  state setup, new-chat reset, and draft persistence effects.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1626 lines to 1566 lines.
- Kept the new `apps/desktop/src/pages/chat/chatDraftPersistence.ts` Module at
  74 lines with one clear responsibility.
- Added `apps/desktop/src/pages/chat/chatDraftPersistence.test.ts` with 3
  tests for interrupted stream restoration, resumable active workflow draft
  handling, storage load/save/clear, and malformed draft tolerance.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts`
  passed with 10 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Chat route-shell reduction by extracting pure conversation
  bubble state transitions into
  `apps/desktop/src/pages/chat/chatBubbleTransitions.ts`.
- Moved assistant streaming-delta application, streaming finalization,
  approval bubble creation/deduplication, error bubble deduplication, tool
  bubble upsert, tool output delta append, metadata merge, and final response
  insertion behind a focused transition Module Interface.
- Kept React-specific concerns in `Chat.tsx`: scroll intent, refs, scheduling,
  and runtime wiring. The extracted Module is pure and directly testable.
- Reduced `apps/desktop/src/pages/Chat.tsx` from 1808 lines to 1626 lines.
- Added `apps/desktop/src/pages/chat/chatBubbleTransitions.test.ts` with 3
  tests for assistant streaming transitions, approval dedupe, and tool output
  fallback/update behaviour.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatBubbleTransitions.test.ts src/pages/ChatWorkflowState.test.ts`
  passed with 7 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Completed the planned Azure DevOps diagnostics Module split by extracting
  diagnostic types, diagnostic errors, and error-to-diagnostic mapping into
  `packages/core/src/ado/diagnostics.ts`.
- Kept compatibility exports from `packages/core/src/ado/auth.ts` and
  `packages/core/src/tools/azureDevOps.ts`, so daemon routes/workflows and old
  tests can still import `AdoAuthDiagnosticError`,
  `adoAuthDiagnosticFromError`, and related diagnostic types from the old
  paths.
- Reduced `packages/core/src/ado/auth.ts` to auth construction, PAT provider
  injection, context-auth resolution, and header construction.
- Updated `packages/core/src/ado/client.ts` to depend on diagnostics for ADO
  redirect/401/403 classification.
- Confirmed the final planned ADO Module inventory:
  `auth`, `client`, `diagnostics`, `core`, `repositories`, `pullRequests`,
  `pullRequestMutations`, `pullRequestThreads`, `pullRequestChanges`,
  `workItems`, `policy`, `builds`, `pipelines`, `toolRegistry`, `refs`,
  `response`, and `types`.
- Confirmed `packages/core/src/tools/azureDevOps.ts` remains a 79-line
  compatibility barrel after the diagnostics split.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/adoPullRequestMutations.test.ts test/azureDevOpsInternal.test.ts`
  passed with 37 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Completed the main Azure DevOps tool-registry Module split by extracting
  the registry Adapter into `packages/core/src/ado/toolRegistry.ts`.
- Converted `packages/core/src/tools/azureDevOps.ts` into a 79-line
  compatibility barrel that preserves all old imports and exports.
- Moved the ADO internal tool manifest, tool health check, org/project payload
  resolution, context auth resolution, and tool handler payload adaptation
  behind the new tool-registry Module Interface.
- Removed direct REST construction from the tool registry by adding domain
  Interfaces for hidden write actions:
  `createAzurePullRequest` in `pullRequestMutations.ts`,
  `linkAzureWorkItemToPullRequest` in `workItems.ts`, and
  `triggerAzurePipelineRun` in `pipelines.ts`.
- Kept `packages/core/src/ado/toolRegistry.ts` at 479 lines, within the
  complex Adapter allowance because it owns one cohesive registry seam.
- Expanded focused coverage:
  `packages/core/test/adoPullRequestMutations.test.ts` now covers PR create
  plus update/reviewer/label mutations, and `packages/core/test/adoClient.test.ts`
  now covers pipeline triggering and work-item linking.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/adoPullRequestMutations.test.ts test/azureDevOpsInternal.test.ts`
  passed with 37 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting pull request
  write operations into `packages/core/src/ado/pullRequestMutations.ts`.
- Moved `AzurePullRequestUpdateResult`,
  `AzurePullRequestReviewerUpdateResult`,
  `AzurePullRequestLabelUpdateResult`, `updateAzurePullRequest`,
  `addAzurePullRequestReviewer`, `removeAzurePullRequestReviewer`,
  `addAzurePullRequestLabel`, and `removeAzurePullRequestLabel` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated PR mutation identity validation, PATCH/PUT/POST/DELETE request
  construction, reviewer/label URL shaping, ADO write-response parsing, and
  typed mutation result shaping behind the new pull-request-mutations Module
  Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon workflows, chat use cases, and existing core tests continue to
  import from the old path.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 914 lines to
  696 lines.
- Kept the new `packages/core/src/ado/pullRequestMutations.ts` Module at 258
  lines.
- Added `packages/core/test/adoPullRequestMutations.test.ts` with 3 tests for
  PR metadata patching, reviewer add/remove, and label add/remove.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/adoPullRequestMutations.test.ts test/azureDevOpsInternal.test.ts`
  passed with 34 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting build
  definitions, build list, timeline, and build-log excerpt reads into
  `packages/core/src/ado/builds.ts`.
- Moved `AzureBuildSummary`, `AzureBuildTimelineIssue`,
  `AzureBuildTimelineRecord`, `AzureBuildTimelineSummary`,
  `AzureBuildLogExcerpt`, `listAzureBuildDefinitions`, `listAzureBuilds`,
  `getAzureBuildTimeline`, and `getAzureBuildLogExcerpt` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated build API query construction, repository-name-to-ID resolution,
  branch ref normalization, failed timeline record filtering, warning/error
  issue extraction, and diagnostic log excerpt selection behind the new builds
  Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon profile routes, PR workflows, pipeline workflows, chat use cases,
  and existing tests continue to import from the old path.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1296 lines to
  1009 lines.
- Kept the new `packages/core/src/ado/builds.ts` Module at 313 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 14 to 15 tests to cover
  the new builds Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 30 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the same slice by extracting pipeline run reads into
  `packages/core/src/ado/pipelines.ts`.
- Moved `AzurePipelineRunSummary`, `listAzurePipelineRuns`, and
  `getAzurePipelineRun` out of `packages/core/src/tools/azureDevOps.ts`.
- Concentrated pipeline run query construction, run payload trimming, source
  branch normalization, and get/list response shaping behind the new pipelines
  Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon pipeline workflows, pull request routes, chat use cases, and
  existing tests continue to import from the old path.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1009 lines to
  914 lines.
- Kept the new `packages/core/src/ado/pipelines.ts` Module at 95 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 15 to 16 tests to cover
  the new pipelines Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 31 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only CRLF conversion warnings were reported,
  with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting PR changed
  file reads into `packages/core/src/ado/pullRequestChanges.ts`.
- Moved `AzurePullRequestChange`, `AzurePullRequestChanges`, and
  `listAzurePullRequestChanges` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated latest-iteration selection, optional explicit iteration use,
  compare/top/skip query construction, changed-file payload trimming, commit
  metadata extraction, and pagination cursors behind the new
  pull-request-changes Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon PR workflows, pull request routes, chat use cases, and existing
  tests continue to import from the old path.
- Aligned the Module shape with the upstream Azure DevOps MCP repositories
  implementation, which also resolves the target iteration before fetching PR
  iteration changes.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1397 lines to
  1296 lines.
- Kept the new `packages/core/src/ado/pullRequestChanges.ts` Module at 119
  lines.
- Expanded `packages/core/test/adoClient.test.ts` from 13 to 14 tests to cover
  the new PR changes Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 29 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting PR thread
  reads into `packages/core/src/ado/pullRequestThreads.ts`.
- Moved `AzurePullRequestThread` and `listAzurePullRequestThreads` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated thread fetch, status/author filtering, stable ID sorting,
  pagination, deleted-comment filtering, and thread/comment trim logic behind
  the new pull-request-threads Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon PR workflows, pull request routes, review-run routes, chat use
  cases, and existing tests continue to import from the old path.
- Aligned the Module shape with the upstream Azure DevOps MCP repositories
  implementation, which also trims PR thread/comment payloads and filters
  deleted comments before returning data to the agent.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1490 lines to
  1397 lines.
- Kept the new `packages/core/src/ado/pullRequestThreads.ts` Module at 127
  lines.
- Expanded `packages/core/test/adoClient.test.ts` from 12 to 13 tests to cover
  the new PR threads Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 28 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting PR policy
  evaluation reads into `packages/core/src/ado/policy.ts`.
- Moved `AzurePullRequestPolicyEvaluation` and
  `listAzurePullRequestPolicyEvaluations` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated CodeReview artifact ID construction, pull request detail reuse,
  policy evaluations fetch, and policy payload trimming behind the new policy
  Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon PR workflows, pull request routes, chat use cases, and existing
  tests continue to import from the old path.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1552 lines to
  1490 lines.
- Kept the new `packages/core/src/ado/policy.ts` Module at 82 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 11 to 12 tests to cover
  the new policy Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 27 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting PR work item
  reading into `packages/core/src/ado/workItems.ts`.
- Moved `AzureWorkItemSummary` and `listAzurePullRequestWorkItems` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Concentrated PR work item refs lookup, ID extraction from WIT URLs, WIT batch
  details retrieval, assigned-user normalization, and tag splitting behind the
  new work-items Module Interface.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon PR workflows, pull request routes, chat use cases, and existing
  tests continue to import from the old path.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1617 lines to
  1552 lines.
- Kept the new `packages/core/src/ado/workItems.ts` Module at 84 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 10 to 11 tests to cover
  the new work-items Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 26 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Continued the Azure DevOps internal Module split by extracting PR query
  behaviour into `packages/core/src/ado/pullRequests.ts`.
- Added `packages/core/src/ado/refs.ts` for shared ref normalization helpers
  used by PR, repository, build, and pipeline domains.
- Moved `AzurePullRequestSummary`, `AzurePullRequestDetail`,
  `listAzurePullRequests`, and `getAzurePullRequestById` out of
  `packages/core/src/tools/azureDevOps.ts`.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so daemon PR workflows, review-run routes, and existing tests continue to
  import from the old path.
- Used the upstream Azure DevOps MCP repository Module as the reference shape:
  ADO raw pull request payloads are trimmed into small agent-facing records
  before crossing the Module Interface.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1785 lines to
  1617 lines.
- Kept the new `packages/core/src/ado/pullRequests.ts` Module at 176 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 9 to 10 tests to cover
  the new PR list Module directly.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 25 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Continued the Azure DevOps internal Module split beyond auth/client by
  extracting ADO discovery and shared response seams.
- Added `packages/core/src/ado/constants.ts` so API version strings have one
  internal source of truth before the remaining domain Modules are split.
- Added `packages/core/src/ado/response.ts` so ADO JSON parsing, non-OK
  response handling, HTML sign-in detection, and invalid JSON diagnostics are
  shared behind one Interface.
- Added `packages/core/src/ado/types.ts` for shared ADO discovery/health DTOs.
- Added `packages/core/src/ado/core.ts` for project discovery.
- Added `packages/core/src/ado/repositories.ts` for repository discovery.
- Preserved old public imports by re-exporting `listAzureProjects`,
  `listAzureRepositories`, and discovery DTO types from
  `packages/core/src/tools/azureDevOps.ts`.
- Reduced `packages/core/src/tools/azureDevOps.ts` further from 1861 lines to
  1785 lines.
- Expanded `packages/core/test/adoClient.test.ts` from 6 to 9 tests to cover
  project discovery, repository discovery, and shared ADO response parsing.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 24 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Started the Azure DevOps internal Module split by extracting auth and HTTP
  client responsibilities out of `packages/core/src/tools/azureDevOps.ts`.
- Added `packages/core/src/ado/auth.ts` for PAT/OAuth auth construction,
  keyring PAT provider injection, context auth resolution, and actionable auth
  diagnostics.
- Added `packages/core/src/ado/client.ts` for ADO base URL normalization,
  fetch defaults, manual redirect handling, and 401/403 diagnostic shaping.
- Added `packages/core/src/ado/index.ts` as the ADO internal Module barrel.
- Preserved compatibility exports from `packages/core/src/tools/azureDevOps.ts`
  so existing daemon, review, CLI, and test imports continue to work.
- Reduced `packages/core/src/tools/azureDevOps.ts` from roughly 1937 lines to
  1861 lines while keeping existing ADO tool names and endpoint behavior
  stable.
- Added `packages/core/test/adoClient.test.ts` to cover the new ADO auth/client
  Interface.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClient.test.ts test/azureDevOpsInternal.test.ts`
  passed with 21 tests.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`
  passed.
- Verified:
  `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`
  passed.
- Verified `git diff --check`; only existing CRLF conversion warnings were
  reported, with no whitespace errors.
- Created this architecture-specific progress tracker.
- Continued the compatibility-first streaming split from the previous session.
- Confirmed current worktree state before making new changes.
- Reused the existing product tracker instead of creating duplicate roadmap
  status language.
- Split Chat API DTOs into `apps/desktop/src/api/chatTypes.ts` and preserved
  compatibility through `apps/desktop/src/api.ts` re-exports.
- Split local Settings/Profile readers into
  `apps/desktop/src/api/localSettings.ts`.
- Moved `chatStream` and `confirmAction` transport logic into
  `apps/desktop/src/api/chat.ts`.
- Moved Chat index, history, message, checkpoint, plan confirmation, and
  workflow-action API calls into `apps/desktop/src/api/chat.ts` while
  preserving existing daemon URLs and function signatures.
- Split Project Link/Profile DTOs into `apps/desktop/src/api/projectLinkTypes.ts`.
- Moved Project Link CRUD, ADO discovery, and profile migration calls into
  `apps/desktop/src/api/projectLinks.ts`.
- Moved Azure authentication DTOs, login stream handling, OAuth enablement, and
  Azure auth error detection into `apps/desktop/src/api/auth.ts`.
- Moved daemon settings, LLM config test, git branch discovery, and ADO remote
  suggestion calls into `apps/desktop/src/api/settings.ts`.
- Updated auth login streaming to reuse the shared desktop SSE parser.
- Split PR and review DTOs into
  `apps/desktop/src/api/pullRequestTypes.ts`.
- Moved pull request list/context/insight/artifact calls into
  `apps/desktop/src/api/pullRequests.ts`.
- Moved review queue/history/disposition/operation/review-run calls into
  `apps/desktop/src/api/review.ts`.
- Consolidated duplicated review-history payload construction behind a local
  helper in `apps/desktop/src/api/review.ts`.
- Moved health, task streaming, and pipeline-submit calls into
  `apps/desktop/src/api/health.ts`, `tasks.ts`, and `pipelines.ts`.
- Converted `apps/desktop/src/api.ts` into a compatibility barrel that keeps
  existing `../api.js` imports working.
- Reduced `apps/desktop/src/api.ts` from roughly 1719 lines before the
  streaming/API split to 13 lines in the current worktree.
- Kept every extracted desktop API module under 300 lines.
- Added `apps/desktop/src/pages/chat/chatEventReducer.ts` as a pure reducer
  seam for chat event acceptance, canonical `ui.chunk` availability, terminal
  stream state, and legacy render-event suppression.
- Wired both normal chat turns and confirm-action continuations in `Chat.tsx`
  through the reducer before executing UI side effects.
- Consolidated the duplicated normal-chat and confirm-action stream event
  switches in `Chat.tsx` behind one shared `dispatchChatStreamEvent` function.
- Removed direct legacy render-event suppression checks from `Chat.tsx`; that
  decision now flows through `chatEventReducer.ts`.
- Moved stream event dispatching from `Chat.tsx` into
  `apps/desktop/src/pages/chat/chatStreamDispatcher.ts`.
- Added an explicit `ChatStreamDispatcherAdapter` Interface so `Chat.tsx`
  owns React state while the dispatcher owns stream event interpretation and
  action order.
- Moved shared stream helpers (`uid`, `makeToolCallId`,
  `toolPartStateFromResult`) into the dispatcher module.
- Reduced `Chat.tsx` from 6006 lines after the previous slice to 5799 lines.
- Moved `ApprovalRequest`, `WorkflowStatus`, and `WorkflowEventState` out of
  `Chat.tsx` into `apps/desktop/src/pages/chat/chat.types.ts`.
- Tightened `ChatStreamDispatcherAdapter` to use concrete workflow/approval
  types instead of generic workflow state plus page-side type assertions.
- Preserved the old `WorkflowEventState` export from `Chat.tsx` as a
  compatibility re-export for existing tests/importers.
- Reduced `Chat.tsx` from 5799 lines to 5701 lines.
- Added `apps/desktop/src/pages/chat/useChatRuntime.ts`.
- Moved dispatcher Adapter creation from `Chat.tsx` into
  `useChatRuntimeAdapter`, concentrating the React state/ref Adapter for chat
  streaming in one Module.
- Reduced `Chat.tsx` from 5701 lines to 5683 lines.
- Moved normal chat send orchestration into `useChatRuntimeActions`.
- Moved confirm-action continuation orchestration into `useChatRuntimeActions`.
- Moved pending-action cancellation orchestration into `useChatRuntimeActions`.
- Reduced `Chat.tsx` from 5683 lines to 5630 lines.
- Moved the no-profile / Project Link onboarding card from `Chat.tsx` into
  `apps/desktop/src/pages/chat/projectLinkOnboarding/ProjectLinkSetupCard.tsx`.
- Split the branch selector into
  `apps/desktop/src/pages/chat/projectLinkOnboarding/BranchSelect.tsx`.
- Kept Project Link onboarding behavior compatible: local repository branch
  detection, Azure DevOps remote inference, project/repository/pipeline
  discovery, pipeline recommendation, and create-and-use flow are still owned
  by the onboarding Module.
- Reduced `Chat.tsx` from 5630 lines to 5108 lines.
- Kept the new onboarding files under the planned complex-module ceiling:
  `ProjectLinkSetupCard.tsx` is 490 lines and `BranchSelect.tsx` is 59 lines.
- Moved execution timeline and pending approval card rendering into
  `apps/desktop/src/pages/chat/approval/ApprovalCards.tsx`.
- Moved the legacy confirm card into
  `apps/desktop/src/pages/chat/approval/ConfirmCard.tsx`.
- Preserved existing approval behavior while creating a dedicated approval UI
  Module for the upcoming flexible approval-card redesign.
- Reduced `Chat.tsx` from 5108 lines to 4824 lines.
- Kept the new approval files within target size:
  `ApprovalCards.tsx` is 250 lines and `ConfirmCard.tsx` is 53 lines.
- Moved workflow task-state derivation, right-panel workflow step state,
  workflow summary enrichment, and Git recovery panel state into
  `apps/desktop/src/pages/chat/workflowTaskState.ts`.
- Preserved compatibility re-exports from `Chat.tsx` for existing workflow
  tests and importers.
- Reduced `Chat.tsx` from 4824 lines to 4406 lines.
- Kept `workflowTaskState.ts` in the allowed complex-module range at 393
  lines; the next candidate is splitting workspace action dispatch mapping
  out of `Chat.tsx`.
- Moved workspace action tool matching, approval matching, direct daemon
  workflow mapping, suggestion mapping, and welcome-suggestion mapping into
  `apps/desktop/src/pages/chat/workspaceActions.ts`.
- Reduced `Chat.tsx` from 4407 lines to 4216 lines.
- Kept `workspaceActions.ts` under the normal TypeScript target at 203 lines.
- Moved workspace action execution orchestration into
  `apps/desktop/src/pages/chat/useWorkspaceActionRuntime.ts`.
- The new runtime hook owns pending approval matching, active-workflow
  guardrails, daemon workflow invocation, workflow-state writeback, tool
  bubble construction, artifact result bubble construction, and error bubble
  fallback.
- Reduced `Chat.tsx` from 4216 lines to 4116 lines.
- Kept `useWorkspaceActionRuntime.ts` under the normal TypeScript target at
  180 lines.
- Moved artifact workspace download naming, MIME selection, kind labels,
  status labels/classes, and placeholder copy into
  `apps/desktop/src/pages/chat/artifacts/artifactWorkspaceHelpers.ts`.
- Reduced `Chat.tsx` from 4115 lines to 4051 lines.
- Kept `artifactWorkspaceHelpers.ts` at 77 lines.
- Moved PR insight artifact title/markdown rendering helpers into
  `apps/desktop/src/pages/chat/artifacts/prInsightArtifacts.ts`.
- Moved artifact workspace UI into
  `apps/desktop/src/pages/chat/artifacts/ArtifactWorkspace.tsx`.
- Moved source/code side panel UI and context-source panel into
  `apps/desktop/src/pages/chat/artifacts/SourceWorkspace.tsx`.
- Preserved `Chat.tsx` compatibility re-export for
  `prInsightArtifactRecordToMarkdown`.
- Reduced `Chat.tsx` from 4051 lines to 3407 lines.
- New artifact/source files are within target ranges:
  `ArtifactWorkspace.tsx` is 350 lines, `SourceWorkspace.tsx` is 195 lines,
  and `prInsightArtifacts.ts` is 97 lines.
- Moved the conversation top bar and left/right panel toggle icons into
  `apps/desktop/src/pages/chat/layout/ConversationTopBar.tsx`.
- Kept history pin/menu tooltip helpers in `Chat.tsx` because they are still
  coupled to the history list and should be moved with that list, not with the
  top bar.
- Reduced `Chat.tsx` from 3408 lines to 3279 lines.
- Kept `ConversationTopBar.tsx` under the normal React component target at
  129 lines.
- Moved the history sidebar, history pagination, context menu, hover preview
  positioning, pin/menu icons, and inline history tooltips into
  `apps/desktop/src/pages/chat/layout/HistorySidebar.tsx`.
- Kept history side effects in `Chat.tsx`: session loading, pin updates,
  rename commits, and deletion still flow through parent-owned handlers.
- Reduced `Chat.tsx` from 3279 lines to 3043 lines.
- `HistorySidebar.tsx` is 316 lines, within the complex UI Module allowance
  because it owns one cohesive sidebar interaction.
- Moved workflow-step display classes, badge labels, disabled state, and
  action title text into
  `apps/desktop/src/pages/chat/layout/workflowStepPresentation.ts`.
- Moved the floating pinned summary panel into
  `apps/desktop/src/pages/chat/layout/PinnedSummaryPanel.tsx`.
- Moved shared workspace diff counters into
  `apps/desktop/src/pages/chat/layout/workspacePanel.types.ts`.
- Reduced `Chat.tsx` from 3043 lines to 2738 lines.
- New layout files remain within target ranges:
  `PinnedSummaryPanel.tsx` is 266 lines,
  `workflowStepPresentation.ts` is 56 lines, and
  `workspacePanel.types.ts` is 5 lines.
- Moved the full right-side workspace panel into
  `apps/desktop/src/pages/chat/layout/WorkspacePanel.tsx`.
- The extracted workspace panel owns environment inspection, change summary,
  branch checkout/create menu, commit/push/PR menu, Git recovery actions,
  Project Link selector, Azure DevOps quick actions, artifact workspace, and
  progress rendering.
- Reduced `Chat.tsx` from 2738 lines to 2253 lines.
- `WorkspacePanel.tsx` is 496 lines, inside the complex UI Module allowance
  and just below the 500-line review threshold.
- Moved message list rendering into
  `apps/desktop/src/pages/chat/layout/ChatMessageList.tsx`.
- The extracted message list owns empty-state Project Link onboarding,
  welcome suggestions, tool-group rendering, assistant/user/system/error
  bubbles, confirm and pending approval cards, assistant metadata source links,
  and busy status rendering.
- Reduced `Chat.tsx` from 2253 lines to 1969 lines.
- `ChatMessageList.tsx` is 399 lines, inside the complex UI Module allowance.
- Moved composer shell rendering into
  `apps/desktop/src/pages/chat/layout/ComposerShell.tsx`.
- The extracted composer shell owns Project Link context chip, composer notice,
  quick replies, textarea rendering/resizing, model menu rendering, stop
  control, and send control.
- Runtime effects remain in `Chat.tsx`: send, stop, model/profile state, and
  queued follow-up state are passed in through explicit props.
- Reduced `Chat.tsx` from 1969 lines to 1808 lines.
- `ComposerShell.tsx` is 251 lines, inside the normal React component target
  range.
- Moved task route request/response parsing and task SSE event replay into
  `packages/daemon/src/routes/tasks.routes.ts`.
- Registered the task route Module from `buildApp()` through the explicit
  `registerTaskRoutes(app, { queue })` Interface.
- Preserved the existing task endpoint URLs:
  `POST /tasks/submit-pipeline`, `GET /tasks`, `GET /tasks/:taskId`, and
  `GET /tasks/:taskId/events`.
- Reduced `packages/daemon/src/server.ts` from 4662 lines to 4588 lines.
- Kept `tasks.routes.ts` at 89 lines; this is a deep enough Module because it
  concentrates task transport parsing, lookup errors, and SSE replay behind one
  small route-registration Interface.
- Moved authentication route request/response parsing, identity-cache reads,
  login SSE streaming, Azure DevOps OAuth enablement, and logout cache clearing
  into `packages/daemon/src/routes/auth.routes.ts`.
- Registered the auth route Module from `buildApp()` through
  `registerAuthRoutes(app, { settings })`, preserving all `/auth/*` endpoint
  URLs and response shapes.
- Reduced `packages/daemon/src/server.ts` from 4588 lines to 4412 lines.
- Kept `auth.routes.ts` at 183 lines, inside the normal TypeScript target
  range.
- Moved Git branch listing and Azure DevOps remote inference into
  `packages/daemon/src/routes/git.routes.ts`.
- Moved the Azure DevOps remote parser into the Git route Module so remote URL
  normalization stays local to the route behaviour that needs it.
- Registered the Git route Module from `buildApp()` through
  `registerGitRoutes(app)`, preserving `/git/branches` and
  `/git/azure-devops-remote`.
- Moved `/healthz`, Azure deployment probing, and the 30-second probe cache into
  `packages/daemon/src/routes/health.routes.ts`.
- Registered the health route Module from `buildApp()` through
  `registerHealthRoutes(app, { settings, startedAt, envSourceLabel })`.
- Reduced `packages/daemon/src/server.ts` from 4412 lines to 4200 lines.
- Kept new daemon route files within target ranges: `health.routes.ts` is 107
  lines and `git.routes.ts` is 125 lines.
- Moved daemon configuration read/write and LLM connection testing into
  `packages/daemon/src/routes/daemon-config.routes.ts`.
- The daemon config Module now owns non-secret config response shaping, `.env`
  merge/update, Azure OpenAI Key Vault fallback, live settings patching, and
  `/daemon/test-llm` smoke testing behind
  `registerDaemonConfigRoutes(app, { settings, buildInlineLlmSettings })`.
- Reduced `packages/daemon/src/server.ts` from 4200 lines to 4010 lines.
- Kept `daemon-config.routes.ts` at 223 lines, inside the normal TypeScript
  target range.
- Added `packages/daemon/src/projectLinkStore.ts` as a shared Project Link persistence
  Adapter for local JSON, Azure Table Storage, Key Vault PAT injection, and
  local-to-cloud migration.
- Moved Project Link CRUD, ADO discovery, ADO tool checks, and Project Link migration into
  `packages/daemon/src/routes/project-links.routes.ts`.
- Registered the Project Link route Module from `buildApp()` through
  `registerProjectLinkRoutes(app, { projectLinkStore })`.
- Left PR/review routes on the same shared Project Link adapter so the next route
  split can reuse `getProjectLinkForRequest`, `injectAdoPat`, Table store, and Key
  Vault access without reintroducing profile lookup logic.
- Reduced `packages/daemon/src/server.ts` from 4010 lines to 3725 lines.
- Kept new Project Link files within target ranges: `project-links.routes.ts` is 184
  lines and `projectLinkStore.ts` is 205 lines.
- Moved PR list, PR context, and PR insight preview endpoints into
  `packages/daemon/src/routes/pull-requests.routes.ts`.
- The PR route Module now exposes one registration Interface,
  `registerPullRequestRoutes(app, { projectLinkStore, buildReviewLlmSettings })`,
  while hiding ADO auth diagnostics, PR context loading, readiness signal
  metadata, heuristic insight fallback, and optional LLM summary generation in
  its Implementation.
- Reused `projectLinkStore.getProjectLinkForRequest` for inline profile and persisted
  profile lookup instead of duplicating Table Storage / Key Vault / local JSON
  resolution inside the PR preview route.
- Reduced `packages/daemon/src/server.ts` from 3725 lines to 3267 lines.
- Kept `pull-requests.routes.ts` at 461 lines, inside the complex-route Module
  allowance because it owns one cohesive PR-readiness Interface.
- Moved review queue, review history, review operation log, PR insight artifact,
  and review disposition endpoints into
  `packages/daemon/src/routes/review.routes.ts`.
- Moved review persistence request schemas into
  `packages/daemon/src/routes/review.schemas.ts`.
- Added `packages/daemon/src/adoThreadLinks.ts` as the shared ADO thread-link
  helper seam used by local review disposition writeback and the remaining
  inline `review-run` path.
- The review route Module exposes one registration Interface,
  `registerReviewRoutes(app, { settings, projectLinkStore })`, while hiding local
  review history record shaping, operation logging, PR insight artifact storage,
  cloud/local profile fallback, and optional ADO disposition writeback in its
  Implementation.
- Left `/profiles/:id/review-run` in `server.ts` because it still depends on
  `@mergepilot/review-agent`; moving it cleanly belongs with the ADR-0007
  dependency cleanup slice.
- Reduced `packages/daemon/src/server.ts` from 3267 lines to 2731 lines.
- Kept new review files within target ranges: `review.routes.ts` is 401 lines,
  `review.schemas.ts` is 122 lines, and `adoThreadLinks.ts` is 41 lines.
- Moved shared review-agent runtime into `packages/core/src/review/*`:
  ADO client, cloud PR context builder, review planner, review decision policy,
  and state-store adapters now live behind the core review Interface.
- Added `packages/core/src/review/index.ts` and exported it from
  `packages/core/src/index.ts`.
- Updated daemon `review-run` and local review disposition writeback to import
  ADO/review runtime from `@mergepilot/core` instead of
  `@mergepilot/review-agent`.
- Removed `@mergepilot/review-agent` from `packages/daemon/package.json` and
  refreshed `pnpm-lock.yaml`.
- Updated review-agent server, review service, public barrel exports, and review
  tests to use the core review Interface.
- Deleted the old duplicate review-agent copies of `adoClient.ts`,
  `cloudContext.ts`, `reviewDecision.ts`, `reviewPlanner.ts`, and
  `stateStore.ts`.
- Verified daemon/core no longer reference `@mergepilot/review-agent`; remaining
  matches are the review-agent package itself and its Dockerfile.
- Split the 531-line `packages/core/src/review/reviewPlanner.ts` into focused
  review-runtime Modules:
  `types.ts`, `prompt.ts`, `responseParsing.ts`, and
  `findingPostProcess.ts`.
- `reviewPlanner.ts` is now an 87-line orchestration and compatibility
  re-export Module.
- The review prompt renderer is now isolated in `prompt.ts` at 227 lines after
  moving prompt-compression file priority scoring into `reviewFilePriority.ts`.
  It owns prompt construction, context compression, and coverage summaries.
- Current core review Module sizes are now: `adoClient.ts` 261 lines,
  `cloudContext.ts` 196 lines, `reviewDecision.ts` 200 lines,
  `stateStore.ts` 381 lines, `reviewPlanner.ts` 87 lines, `prompt.ts` 227
  lines, `reviewFilePriority.ts` 91 lines, `responseParsing.ts` 51 lines,
  `findingPostProcess.ts` 70 lines, and `types.ts` 64 lines.
- Moved `/profiles/:id/review-run` from `packages/daemon/src/server.ts` into
  `packages/daemon/src/routes/review-run.routes.ts`.
- The new review-run route Module owns request parsing, Project Link/profile
  resolution, ADO context loading, PR signal enrichment, review planner
  execution, auto-approval decisioning, and history persistence behind one
  route-registration Interface.
- Reused `projectLinkStore.getProjectLinkForRequest(...)` instead of duplicating local
  JSON / Azure Table Storage / Key Vault fallback logic in the new route.
- Reduced `packages/daemon/src/server.ts` from 2731 lines to 2403 lines.
- Kept `review-run.routes.ts` at 367 lines, inside the complex-route Module
  allowance because it owns one cohesive immediate-review workflow endpoint.
- Moved Chat transport endpoints from `packages/daemon/src/server.ts` into
  `packages/daemon/src/routes/chat.routes.ts`.
- The new Chat route Module owns chat index status/refresh, chat SSE turn
  streaming, confirm/confirm-action streaming, cancellation, history metadata,
  session message/state reads, checkpoint activity, checkpoint preview, and
  rollback-plan endpoints.
- Reduced `packages/daemon/src/server.ts` from 2403 lines to 2165 lines.
- Kept `chat.routes.ts` at 293 lines, inside the normal/complex TypeScript
  target range and with one clear transport responsibility.
- Moved `/chat/workflow-action` HTTP parsing into
  `packages/daemon/src/routes/chat-workflow.routes.ts`.
- The new chat-workflow route Module owns the workflow action schema, inline
  Project Link payload schema, HTTP parsing, HTTP error shaping handoff, and a
  small Adapter Interface for `runWorkflowAction` and `failureResponse`.
- Kept the Git/ADO workflow Implementation in `server.ts` behind that Adapter
  for now. This avoids a shallow wrapper while creating the seam needed for the
  next deep extraction into `packages/daemon/src/workflows/*`.
- Reduced `packages/daemon/src/server.ts` from 2165 lines to 2088 lines.
- Kept `chat-workflow.routes.ts` at 104 lines.
- Added `packages/daemon/src/workflows/gitOperation.ts` as the first daemon
  workflow Module.
- Moved Git operation phase detection, conflict-file extraction, dirty working
  tree summaries, and mutating-action blocking into the Git operation Module.
- The Git operation Module Interface is intentionally small:
  `gitOperationStateFromTools`, `gitOperationBlockForAction`,
  `dirtyWorkingTreeSummary`, and `gitOperationPhaseLabel`.
- This increases locality for the rebase/merge/cherry-pick/revert state
  handling that affects `stage`, `commit`, `push`, and recovery actions.
- Reduced `packages/daemon/src/server.ts` from 2088 lines to 1876 lines.
- Kept `gitOperation.ts` at 108 lines and added focused coverage in
  `packages/daemon/test/gitOperation.test.ts` at 84 lines.
- Added `packages/daemon/src/workflows/validationPreflight.ts` as the second
  daemon workflow Module.
- Moved changed-file extraction, package ownership detection, package.json
  script selection, pnpm workspace wrapper selection, and validation failure
  artifact rerun selection out of `server.ts`.
- The validation Module Interface is intentionally small:
  `changedFilesFromGitOutputs`, `focusedValidationPreflightFromSession`, and
  `validationPreflightFromPayload`.
- This improves locality for the "understand changed files before test/build"
  workflow path that supports review, stage/commit/push, and validation
  approvals.
- Reduced `packages/daemon/src/server.ts` from 1876 lines to 1650 lines.
- Kept `validationPreflight.ts` at 262 lines and added focused coverage in
  `packages/daemon/test/validationPreflight.test.ts` at 103 lines.
- Added `packages/daemon/src/workflows/gitProbes.ts` as the third daemon
  workflow Module.
- Moved Git probe command inventory, per-action Git flags, dynamic upstream
  divergence probing, and non-blocking probe failure rules out of `server.ts`.
- The Git probe Module Interface is intentionally small:
  `runGitWorkflowProbes`, `gitProbePlanForAction`, and
  `failedBlockingGitProbe`.
- Added a runner Adapter seam so focused tests can verify probe ordering and
  failure classification without shelling out to Git.
- Reduced `packages/daemon/src/server.ts` from 1650 lines to 1572 lines.
- Kept `gitProbes.ts` at 153 lines and added focused coverage in
  `packages/daemon/test/gitProbes.test.ts` at 75 lines.
- Added `packages/daemon/src/workflows/prWorkflow.ts` as the fourth daemon
  workflow Module.
- Moved Azure DevOps PR workflow action orchestration out of `server.ts`,
  including PR profile validation, active PR resolution, policy inspection,
  work-item listing/link approval creation, PR context fan-out, and PR
  readiness summary generation.
- The PR workflow Module Interface exposes `runAdoPullRequestWorkflowAction`
  for orchestration and `buildWorkflowPrInsight` as the focused test surface
  for insight summarization.
- This improves locality for PR-specific ADO behavior and leaves `server.ts`
  focused on route registration, pipeline workflow, and local Git workflow
  composition.
- Reduced `packages/daemon/src/server.ts` from 1572 lines to 1299 lines.
- Kept `prWorkflow.ts` at 322 lines, inside the complex Module allowance, and
  added focused coverage in `packages/daemon/test/prWorkflow.test.ts` at 75
  lines.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/api.test.ts src/api/sse.test.ts src/pages/chat/chatStreaming.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
git diff --check
```

Result:

- Desktop focused API/streaming tests passed: 7 tests.
- Desktop typecheck passed.
- Desktop build passed. Vite still reports existing large chunk warnings.
- `git diff --check` passed with line-ending warnings only.
- After the Profile/Auth/Settings split, desktop focused API/streaming tests
  passed again: 7 tests.
- After the Profile/Auth/Settings split, desktop typecheck passed again.
- After moving Chat REST APIs into `apps/desktop/src/api/chat.ts`, desktop
  focused API/streaming tests passed again: 7 tests.
- After moving Chat REST APIs into `apps/desktop/src/api/chat.ts`, desktop
  typecheck passed again.
- `git diff --check` passed after the latest split, with CRLF warnings only.
- After moving PR/review APIs into dedicated modules, desktop typecheck passed.
- After moving PR/review APIs into dedicated modules, focused desktop tests
  passed: 15 tests across API, SSE, Chat streaming, and review history.
- `git diff --check` passed after the PR/review split, with CRLF warnings only.
- After converting `apps/desktop/src/api.ts` into a compatibility barrel,
  desktop typecheck passed.
- After converting `apps/desktop/src/api.ts` into a compatibility barrel,
  focused desktop tests passed again: 15 tests.
- `git diff --check` passed after completing the desktop API split, with CRLF
  warnings only.
- Chat reducer focused tests passed: 4 tests.
- Chat streaming/API focused tests passed after reducer wiring: 11 tests.
- Desktop typecheck passed after reducer wiring.
- Chat streaming/API focused tests passed after consolidating the stream
  dispatcher: 11 tests.
- Desktop typecheck passed after consolidating the stream dispatcher.
- `git diff --check` passed after consolidating the stream dispatcher, with
  CRLF warnings only.
- Chat streaming/API focused tests passed after moving the dispatcher into
  `chatStreamDispatcher.ts`: 11 tests.
- Desktop typecheck passed after moving the dispatcher module.
- `git diff --check` passed after moving the dispatcher module, with CRLF
  warnings only.
- Focused Chat/API tests passed after moving workflow/approval types: 15 tests.
- Desktop typecheck passed after tightening dispatcher adapter types.
- `git diff --check` passed after tightening dispatcher adapter types, with
  CRLF warnings only.
- Focused Chat/API tests passed after moving Adapter creation into
  `useChatRuntime.ts`: 15 tests.
- Desktop typecheck passed after moving Adapter creation into
  `useChatRuntime.ts`.
- `git diff --check` passed after moving Adapter creation into
  `useChatRuntime.ts`, with CRLF warnings only.
- Focused Chat/API tests passed after moving send/confirm runtime
  orchestration into `useChatRuntime.ts`: 15 tests.
- Desktop typecheck passed after moving send/confirm runtime orchestration.
- `git diff --check` passed after moving send/confirm runtime orchestration,
  with CRLF warnings only.
- Focused Chat/API tests passed after extracting Project Link onboarding:
  15 tests.
- Desktop typecheck passed after extracting Project Link onboarding.
- `git diff --check` passed after extracting Project Link onboarding, with
  CRLF warnings only.
- Focused Chat/API/approval tests passed after extracting approval rendering:
  26 tests across 7 files.
- Desktop typecheck passed after extracting approval rendering.
- `git diff --check` passed after extracting approval rendering, with CRLF
  warnings only.
- Focused Chat/API/approval/workflow tests passed after extracting workflow
  task-state derivation: 26 tests across 7 files.
- Desktop typecheck passed after extracting workflow task-state derivation.
- `git diff --check` passed after extracting workflow task-state derivation,
  with CRLF warnings only.
- Focused Chat/API/approval/workflow tests passed after extracting workspace
  action mappings: 26 tests across 7 files.
- Desktop typecheck passed after extracting workspace action mappings.
- `git diff --check` passed after extracting workspace action mappings, with
  CRLF warnings only.
- Focused Chat/API/approval/workflow tests passed after extracting workspace
  action runtime orchestration: 26 tests across 7 files.
- Desktop typecheck passed after extracting workspace action runtime
  orchestration.
- `git diff --check` passed after extracting workspace action runtime
  orchestration, with CRLF warnings only.
- Focused Chat/API/approval/workflow tests passed after extracting artifact
  workspace helpers: 26 tests across 7 files.
- Desktop typecheck passed after extracting artifact workspace helpers.
- `git diff --check` passed after extracting artifact workspace helpers, with
  CRLF warnings only.
- Focused Chat/API/approval/workflow/PR-artifact tests passed after extracting
  artifact/source workspace UI: 27 tests across 8 files.
- Desktop typecheck passed after extracting artifact/source workspace UI.
- `git diff --check` passed after extracting artifact/source workspace UI,
  with CRLF warnings only.
- Focused Chat/API/approval/workflow/PR-artifact tests passed after extracting
  the conversation top bar: 27 tests across 8 files.
- Desktop typecheck passed after extracting the conversation top bar.
- `git diff --check` passed after extracting the conversation top bar, with
  CRLF warnings only.
- Focused Chat/API/approval/workflow/PR-artifact tests passed after extracting
  the history sidebar: 27 tests across 8 files.
- Desktop typecheck passed after extracting the history sidebar.
- `git diff --check` passed after extracting the history sidebar, with CRLF
  warnings only.
- Focused Chat/API/approval/workflow/PR-artifact tests passed after extracting
  the pinned summary panel and workflow-step presentation helpers: 27 tests
  across 8 files.
- Desktop typecheck passed after extracting the pinned summary panel and
  workflow-step presentation helpers.
- `git diff --check` passed after extracting the pinned summary panel and
  workflow-step presentation helpers, with CRLF warnings only.
- Focused Chat/API/approval/workflow/PR-artifact tests passed after extracting
  the full workspace panel: 27 tests across 8 files.
- Desktop typecheck passed after extracting the full workspace panel.
- `git diff --check` passed after extracting the full workspace panel, with
  CRLF warnings only.
- Focused Chat/API/approval/workflow/PR-artifact/conversation-renderer tests
  passed after extracting the message list: 42 tests across 9 files.
- Desktop typecheck passed after extracting the message list.
- `git diff --check` passed after extracting the message list, with CRLF
  warnings only.
- Focused Chat/API/approval/workflow/PR-artifact/conversation-renderer/
  suggestion-reply tests passed after extracting the composer shell: 80 tests
  across 10 files.
- Desktop typecheck passed after extracting the composer shell.
- `git diff --check` passed after extracting the composer shell, with CRLF
  warnings only.
- Daemon typecheck passed after extracting `tasks.routes.ts`.
- `server.test.ts` task-route coverage still passes after extraction. The broad
  file remains red only on the carried-forward ADO/create-PR and work-item
  workflow assertions listed below.
- Daemon typecheck passed after extracting `auth.routes.ts`.
- `server.test.ts` auth coverage for `/auth/status` and `/auth/logout` still
  passes after extraction. The broad file remains red only on the same two
  carried-forward ADO/create-PR and work-item workflow assertions.
- Daemon typecheck passed after extracting `git.routes.ts` and
  `health.routes.ts`.
- `server.test.ts` coverage for `/healthz` and `/git/azure-devops-remote` still
  passes after extraction. The broad file remains red only on the same two
  carried-forward ADO/create-PR and work-item workflow assertions.
- Daemon typecheck passed after extracting `daemon-config.routes.ts`.
- `server.test.ts` still reports the same `54 passed / 2 failed` shape after
  daemon config extraction. No new failure was introduced by the route split.
- Daemon typecheck passed after extracting `project-links.routes.ts` and
  `projectLinkStore.ts`.
- `server.test.ts` Project Link CRUD/discovery/check coverage still passes after
  extraction. The broad file remains red only on the same two carried-forward
  ADO/create-PR and work-item workflow assertions.
- Daemon typecheck passed after extracting `pull-requests.routes.ts`.
- `server.test.ts` still reports `54 passed / 2 failed` after PR route
  extraction. The two failures remain the same carried-forward ADO/create-PR
  and work-item workflow assertions, so this route split did not add a new
  failure shape.
- Daemon typecheck passed after extracting `review.routes.ts`,
  `review.schemas.ts`, and `adoThreadLinks.ts`.
- `server.test.ts` still reports `54 passed / 2 failed` after review route
  extraction. Review queue/disposition/operations/PR insight artifact coverage
  still passes; the two failures remain the same carried-forward ADO/create-PR
  and work-item workflow assertions.
- `git diff --check` passed after review route extraction, with CRLF warnings
  only.
- Core build passed after adding `packages/core/src/review/*`, refreshing
  `dist` declarations consumed by daemon and review-agent.
- Core typecheck passed after moving shared review runtime.
- Daemon typecheck passed after removing its direct
  `@mergepilot/review-agent` dependency.
- Review-agent typecheck passed after switching its server/service/barrel/tests
  to the core review Interface and deleting the duplicate local runtime files.
- Review-agent tests passed after the shared-runtime move: 7 files, 30 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after removing the
  daemon -> review-agent dependency. The two failures remain the same
  carried-forward ADO/create-PR and work-item workflow assertions.
- `git diff --check` passed after dependency cleanup, with CRLF warnings only.
- Core typecheck passed after splitting `reviewPlanner.ts`.
- Core build passed after splitting `reviewPlanner.ts`, refreshing declarations
  consumed by daemon and review-agent.
- Review-agent typecheck passed after splitting the shared review planner.
- Daemon typecheck passed after splitting the shared review planner.
- Review-agent tests still pass after the planner split: 7 files, 30 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the planner split.
  The two failures remain the same carried-forward ADO/create-PR and work-item
  workflow assertions.
- `git diff --check` passed after the planner split, with CRLF warnings only.
- Daemon typecheck passed after extracting `review-run.routes.ts`.
- `server.test.ts` still reports `54 passed / 2 failed` after extracting the
  review-run route. The `POST /profiles/:id/review-run` coverage still passes;
  the two failures remain the same carried-forward ADO/create-PR and work-item
  workflow assertions.
- Daemon typecheck passed after extracting `chat.routes.ts`.
- Daemon chat event focused tests passed after the Chat route split: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after extracting the
  Chat route Module. Chat history, metadata, delete, checkpoint rollback, index
  validation, confirm-action streaming, and review-run coverage still pass; the
  two failures remain the same carried-forward ADO/create-PR and work-item
  workflow assertions.
- Daemon typecheck passed after extracting `chat-workflow.routes.ts`.
- Daemon chat event focused tests still pass after extracting the workflow
  route seam: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after extracting the
  workflow route seam. Structured workflow action coverage still passes; the
  two failures remain the same carried-forward ADO/create-PR and work-item
  workflow assertions.
- Daemon typecheck passed after extracting `workflows/gitOperation.ts`.
- Git operation focused tests pass: 5 tests.
- Daemon chat event focused tests passed after the Git operation extraction:
  10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the Git
  operation extraction. The two failures remain the same carried-forward
  ADO/create-PR and work-item workflow assertions.
- `git diff --check` passed after the Git operation extraction, with CRLF
  warnings only.
- Daemon typecheck passed after extracting `workflows/validationPreflight.ts`.
- Validation/Git workflow focused tests pass: 9 tests.
- Daemon chat event focused tests passed after the validation preflight
  extraction: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the validation
  preflight extraction. The two failures remain the same carried-forward
  ADO/create-PR and work-item workflow assertions.
- `git diff --check` passed after the validation preflight extraction, with
  CRLF warnings only.
- Daemon typecheck passed after extracting `workflows/gitProbes.ts`.
- Git probe/operation/validation workflow focused tests pass: 13 tests.
- Daemon chat event focused tests passed after the Git probe extraction:
  10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the Git probe
  extraction. The two failures remain the same carried-forward ADO/create-PR
  and work-item workflow assertions.
- `git diff --check` passed after the Git probe extraction, with CRLF warnings
  only.
- Daemon typecheck passed after extracting `workflows/prWorkflow.ts`.
- PR/Git/validation workflow focused tests pass: 15 tests.
- Daemon chat event focused tests passed after the PR workflow extraction:
  10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the PR workflow
  extraction. The two failures remain the same carried-forward ADO/create-PR
  and work-item workflow assertions.
- `git diff --check` passed after the PR workflow extraction, with CRLF
  warnings only.
- Extracted Azure DevOps pipeline workflow orchestration into
  `packages/daemon/src/workflows/pipelineWorkflow.ts`.
- The pipeline workflow Module now owns pipeline profile validation, pipeline
  ID resolution, trigger approval proposal creation, recent run inspection,
  failed timeline/log evidence collection, failure artifact markdown, and
  assistant artifact bubble append.
- Exported pipeline workflow Interface functions:
  `runAdoPipelineWorkflowAction`, `summarizePipelineRuns`, and
  `pipelineFailureArtifacts`.
- Removed the duplicate pipeline workflow Implementation from
  `packages/daemon/src/server.ts`.
- Reduced `packages/daemon/src/server.ts` from 1299 lines to 956 lines after
  pipeline extraction.
- Kept `pipelineWorkflow.ts` at 352 lines, inside the complex workflow Module
  allowance because it owns one cohesive Azure Pipeline action seam.
- Added `packages/daemon/test/pipelineWorkflow.test.ts` to cover the public
  summary and failure-artifact Interfaces.
- Daemon typecheck passed after extracting `workflows/pipelineWorkflow.ts`.
- Pipeline/PR/Git/validation workflow focused tests pass: 17 tests across 5
  files.
- Daemon chat event focused tests still pass after the pipeline workflow
  extraction: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the pipeline
  workflow extraction. The two failures remain the same carried-forward
  ADO/create-PR and work-item workflow assertions.
- `git diff --check` passed after the pipeline workflow extraction, with CRLF
  warnings only.
- Extracted workflow action classification and structured failure response
  shaping into `packages/daemon/src/workflows/workflowActions.ts`.
- The workflow action Module now owns ADO PR/CI action classification, auth
  mode selection, auth diagnostic mapping, workflowKind/workflowPhase failure
  metadata, and the compatibility failure response contract consumed by
  `registerChatWorkflowRoutes`.
- Preserved the old `workflowActionFailureResponse` import path through a
  compatibility re-export from `packages/daemon/src/server.ts`.
- Reduced `packages/daemon/src/server.ts` from 956 lines to 867 lines after
  extracting `workflowActions.ts`.
- Kept `workflowActions.ts` at 100 lines and
  `workflowActions.test.ts` at 87 lines.
- Daemon typecheck passed after extracting `workflows/workflowActions.ts`.
- Workflow action / pipeline / PR / Git / validation focused tests pass: 20
  tests across 6 files.
- Daemon chat event focused tests still pass after the workflow action
  extraction: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the workflow
  action extraction. The two failures remain the same carried-forward
  ADO/create-PR and work-item workflow assertions.
- Extracted local Git workspace workflow planning into
  `packages/daemon/src/workflows/workspaceWorkflow.ts`.
- Extracted branch inventory parsing, branch normalization, and branch
  checkout/create preflight into
  `packages/daemon/src/workflows/workspaceBranchPreflight.ts`.
- The workspace workflow Module now owns proposal creation for recovery
  actions, conflict staging, branch checkout/create, push readiness, PR
  creation, validation commands, and staged commit flows.
- The workspace workflow Module also owns local workflow risk labels, observable
  workspace summary text, and push ahead/behind readiness interpretation.
- Reduced `packages/daemon/src/server.ts` from 867 lines to 344 lines after
  extracting workspace workflow planning.
- Kept new files within the target file-size rules:
  `workspaceWorkflow.ts` is 430 lines and
  `workspaceBranchPreflight.ts` is 118 lines.
- Added `packages/daemon/test/workspaceWorkflow.test.ts` to cover branch
  preflight, tracking-branch proposals, push divergence readiness, staged
  commit proposal context, recovery proposal context, and workspace summary
  evidence.
- Daemon typecheck passed after extracting workspace workflow planning.
- Workspace workflow / workflow action / pipeline / PR / Git / validation
  focused tests pass: 25 tests across 7 files.
- Daemon chat event focused tests still pass after the workspace workflow
  extraction: 10 tests.
- `server.test.ts` still reports `54 passed / 2 failed` after the workspace
  workflow extraction. The two failures remain the same carried-forward
  ADO/create-PR and work-item workflow assertions.
- `git diff --check` passed after the workspace workflow extraction, with CRLF
  warnings only.
- Extracted inline LLM settings merging into
  `packages/daemon/src/llmSettings.ts`.
- Moved the shared `InlineLlmConfig` Interface to `llmSettings.ts` and kept a
  compatibility re-export from `chatSession.ts` so existing route imports remain
  stable.
- Replaced duplicated inline/review/chat-session settings builders with
  `buildEffectiveLlmSettings`.
- Removed the unused `LlmConfigSchema` remnant from `server.ts`; route Modules
  remain the owners of request schema parsing.
- Reduced `packages/daemon/src/server.ts` from 344 lines to 286 lines after
  extracting the LLM settings Module.
- Kept `llmSettings.ts` at 39 lines and `llmSettings.test.ts` at 76 lines.
- Daemon typecheck passed after extracting `llmSettings.ts`.
- LLM settings / workspace workflow / workflow action / pipeline / PR / Git /
  validation focused tests pass: 28 tests across 8 files.
- Daemon chat event focused tests still pass after the LLM settings extraction:
  10 tests.
- Chat session workflow/checkpoint tests pass after switching chat runtime to
  the shared LLM settings Module: 38 tests across 2 files.
- `server.test.ts` still reports `54 passed / 2 failed` after the LLM settings
  extraction. The two failures remain the same carried-forward ADO/create-PR
  and work-item workflow assertions.
- `git diff --check` passed after the LLM settings extraction, with CRLF
  warnings only.

Verification for this naming/payload slice:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli test -- test/submitPipelinePayload.test.ts test/init.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/projectLinkConfig.test.ts test/profiles.test.ts test/pipelineAgentOffline.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflow.test.ts test/workflowActions.test.ts test/prWorkflow.test.ts test/pipelineWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/chatHandoff.test.ts src/checkpointHandoff.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
```

Result:

- CLI submit-pipeline/init focused tests passed: 12 tests.
- Core Project Link config/template profile/pipeline offline tests passed: 9
  tests.
- Core build passed so downstream packages consume updated declarations.
- Core, CLI, and daemon typechecks passed.
- Daemon chat/workflow focused tests passed: 34 tests.
- Desktop Chat draft/handoff focused tests passed: 12 tests.
- Desktop typecheck passed.

Verification carried forward from the previous streaming slice:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatEvents.test.ts
```

Resolved broad test:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
```

Current result: `56 / 56` passing.

- ADO create PR confirmation now receives the inline Project Link PAT through
  `ToolContext.extra.ado_pat`.
- Work item link completion now reaches the structured PR workflow done path
  and emits `workflowKind: "pr"` plus
  `workflowPhase: "work_item_linked"`.

## Naming And Fallback Audit

Current scope: stop further file splitting and remove legacy `Profile` and
`cicd-agent` fallback paths while preserving PAT support.

Result:

- `CICD_AGENT_*` runtime env fallbacks have been removed from source config.
  Runtime config now uses `MERGEPILOT_*` names, plus neutral Azure names where
  those were already the canonical provider variables.
- `profileId`, `inlineProfile`, request body `profile`, `/profiles` route
  aliases, CLI `--profile` aliases, and `.mergepilot/profile.yaml` config
  fallback have been removed from runtime source and focused tests.
- Old desktop compatibility storage keys such as `cicd_agent_profiles_v1`,
  `cicd_agent_active_project_link_id`, `chat_profile_id`,
  `dev_agent_settings`, and `dev_agent_active_model` have been removed from
  runtime reads/writes.
- The daemon and desktop health/config surfaces now expose
  `cloudProjectLinkStore` only; the old `cloudProfileStore` response/read
  compatibility field has been removed.
- YAML build/test defaults have been renamed from `TemplateProfile` /
  `profiles.yaml` to `ProjectTemplate` / `project-templates.yaml`.
  Project Link persistence now lives in `projectLinks.ts`; project template
  loading lives in `projectTemplates.ts`.
- PAT support remains active by design. Active surfaces include Project Link
  DTO/store fields, ADO auth resolution, daemon PR/pipeline/review routes,
  workflow diagnostics, CLI `configure-pat`, Key Vault secret helpers, and
  ToolContext `ado_pat` propagation.

Decision:

- Removed old `CICD_AGENT_*` config fallback because it is a branding
  compatibility path and has a clear `MERGEPILOT_*` replacement.
- Removed old Project Link-as-Profile compatibility because Product language is
  now Project Link-only. Existing legacy persisted objects are no longer
  migrated through the old names.
- Kept PAT support because Project Link auth still intentionally supports PAT
  alongside OAuth.

Verification for this naming/fallback slice:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatProjectLinkIdRoutes.test.ts test/chatHistoryStore.test.ts test/serverProjectLinkRoutes.test.ts test/serverPrInsightStorageRoutes.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/api.test.ts src/prInsightArtifacts.test.ts src/checkpointHandoff.test.ts src/pages/chat/chatHandoff.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/projectTemplates.test.ts test/projectLinkConfig.test.ts test/repoIndexer.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli test -- test/submitPipelinePayload.test.ts test/init.test.ts
```

Residual scan:

- No `profileId`, `inlineProfile`, request body `profile`, `/profiles`,
  `legacyProfile`, `CICD_AGENT`, `@cicd-agent`, `cicd_agent_*`,
  `dev_agent_*`, `chat_profile_id`, or `cloudProfileStore` references remain
  in runtime source or focused tests.
- Remaining `profile` references in this document are historical progress
  entries, not current runtime source terminology.

## Next Implementation Queue

| Priority | Task                                      | Target Files                                                                                                                                                                                                                    | Acceptance Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Split Chat API types and transport        | `apps/desktop/src/api/chatTypes.ts`, `apps/desktop/src/api/chat.ts`, `apps/desktop/src/api.ts`                                                                                                                                  | Complete for chat stream/confirm transport. API streaming tests pass; old `../api.js` imports remain compatible.                                                                                                                                                                                                                                                                                                                                                                                               |
| P0       | Split Project Link/Auth/Settings API surfaces  | `apps/desktop/src/api/projectLinkTypes.ts`, `projectLinks.ts`, `auth.ts`, `settings.ts`, `api.ts`                                                                                                                                       | Complete for Project Link CRUD/discovery/migration, auth/OAuth, and daemon settings. Desktop typecheck and focused API tests pass.                                                                                                                                                                                                                                                                                                                                                                                  |
| P0       | Split PR/review API surfaces              | `apps/desktop/src/api/pullRequestTypes.ts`, `pullRequests.ts`, `review.ts`, `api.ts`                                                                                                                                            | Complete for PR list/context/insight/artifacts and review queue/history/run APIs. Desktop typecheck and focused tests pass.                                                                                                                                                                                                                                                                                                                                                                                    |
| P0       | Complete desktop API compatibility barrel | `apps/desktop/src/api.ts`, `health.ts`, `tasks.ts`, `pipelines.ts`, `runtime.ts`                                                                                                                                                | Complete. Root API file is 13 lines; focused tests and typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P0       | Add Chat event reducer seam               | `apps/desktop/src/pages/chat/chatEventReducer.ts`, `chatBubbleReducer.ts`, `chatStreaming.ts`, `chatStreamDispatcher.ts`, `chatBubbleTransitions.ts`, `chat.types.ts`, `useChatRuntime.ts`, `Chat.tsx`                          | Complete. Event acceptance, legacy render suppression, canonical stream dispatch, terminal stream state, and visible bubble state transitions now have focused reducer/dispatcher Module Interfaces; focused streaming/reducer tests and desktop typecheck pass.                                                                                                                                                                                                                                               |
| P1       | Split Chat Project Link onboarding        | `apps/desktop/src/pages/chat/projectLinkOnboarding/*`, `apps/desktop/src/pages/Chat.tsx`                                                                                                                                        | Complete. Project Link setup state, branch detection, Azure DevOps discovery, basic fields, ADO fields, and branch selector are split behind focused Module Interfaces; desktop typecheck and Project Link browser acceptance pass.                                                                                                                                                                                                                                                                            |
| P1       | Split Chat approvals                      | `apps/desktop/src/pages/chat/approval/*`, `apps/desktop/src/pages/Chat.tsx`                                                                                                                                                     | Complete. Execution log composition, pending approval card visual states, scoped decision controls, approval evidence, and legacy confirm card are split behind focused Module Interfaces; focused approval tests and desktop typecheck pass.                                                                                                                                                                                                                                                                  |
| P1       | Split workflow task state                 | `apps/desktop/src/pages/chat/workflowTaskState.ts`, `workflowTaskDerivation.ts`, `workflowTaskTypes.ts`                                                                                                                         | Complete. Task types, workflow derivation, step action state, and Git recovery panel state now have focused Module Interfaces; compatibility re-exports remain and focused tests cover commit, PR readiness, CI/pipeline, recovery, and summary behavior.                                                                                                                                                                                                                                                      |
| P1       | Split workspace action mapping/runtime    | `apps/desktop/src/pages/chat/workspaceAction*.ts`, `useWorkspaceActionRuntime.ts`, `apps/desktop/src/pages/Chat.tsx`                                                                                                            | Complete. Tool matching, approval matching, direct workflow mapping, suggestion mapping, and execution orchestration are behind focused Module Interfaces; `workspaceActions.ts` remains a compatibility barrel; focused tests and desktop typecheck pass.                                                                                                                                                                                                                                                     |
| P1       | Split artifact/source workspace           | `apps/desktop/src/pages/chat/artifacts/*`, `apps/desktop/src/pages/Chat.tsx`                                                                                                                                                    | Complete. Artifact shell, artifact content rendering, source/code side panel, context-source panel, PR insight markdown, artifact lookup state, labels, status classes, placeholders, download names, and MIME helpers are split behind focused Module Interfaces; focused tests and desktop typecheck pass.                                                                                                                                                                                                   |
| P1       | Split Chat layout chrome                  | `apps/desktop/src/pages/chat/layout/*`, `apps/desktop/src/pages/Chat.tsx`                                                                                                                                                       | Complete. Conversation top bar, panel toggle icons, history sidebar, pinned summary panel, full workspace panel, message list, composer shell, top-level `ChatShell`, and workflow-step presentation helpers are extracted. `Chat.tsx` is now 489 lines; future work is optional `ChatShell` prop grouping if this Interface grows further.                                                                                                                                                                    |
| P1       | Split bot-response renderer               | `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`, `MarkdownContent.tsx`, `CodeBlock.tsx`, `ReferenceParts.tsx`, `ArtifactCard.tsx`, `markdownSourceLinks.ts`                                             | Complete. Renderer dispatch, markdown rendering, markdown source-link preprocessing, code block rendering, reference UI, artifact cards, grouping, styles, and theme detection are split behind focused Module Interfaces; renderer tests, PR insight artifact tests, and desktop typecheck pass.                                                                                                                                                                                                              |
| P2       | Deepen markdown renderer loading seam     | `apps/desktop/src/components/conversation/MarkdownContentRuntime.tsx`, `MarkdownContentFallback.tsx`, `MarkdownContent.types.ts`, `MarkdownContent.tsx`, `ConversationPartRenderer.tsx`, renderer tests, Vite build output             | Complete for the planned markdown renderer loading seam. Streamdown-heavy markdown rendering is behind a lazy runtime Adapter, while a lightweight fallback preserves synchronous SSR/static renderer tests and first-paint readability. `ConversationPartRenderer.test.tsx`, desktop typecheck, and desktop build pass; the actual entry script is now 444.38 kB with no circular chunk warning after later code-highlight and Mermaid runtime seam slices.                                                                                                                                                         |
| P2       | Deepen code highlighting seam             | `apps/desktop/src/components/conversation/CodeBlock.tsx`, `codeHighlight.ts`, desktop package metadata, renderer tests, Vite build output                                                                                          | Complete. Direct Shiki runtime usage was removed from `CodeBlock`; code blocks now use a small local highlighting Module while preserving copy/collapse/language-label behavior and raw-code evidence for tests. The unused `@streamdown/code` and direct `shiki` desktop dependencies were removed and the lockfile was refreshed. Renderer tests, desktop typecheck, and desktop build pass.                                                                                                                                                              |
| P2       | Deepen Mermaid artifact renderer seam     | `apps/desktop/src/pages/chat/artifacts/ArtifactWorkspaceContent.tsx`, `MermaidArtifactPreview.tsx`, `mermaidArtifactRenderer.ts`, artifact tests, desktop typecheck, Vite build output                                                    | Complete for runtime behavior and Module locality. Mermaid preview is no longer an automatic artifact-workspace side effect; source opens immediately and users explicitly choose `Render diagram` before the Mermaid Adapter is loaded. `ArtifactWorkspaceContent.tsx` is now 186 lines, `MermaidArtifactPreview.tsx` is 107 lines, and `mermaidArtifactRenderer.ts` is 25 lines. Remaining large chunk warnings are isolated to lazy Mermaid core and Wardley vendor chunks; eliminating those requires dependency replacement or a supported-diagram subset decision, not more file splitting.                                                                                                                     |
| P1       | Split suggestion reply controls           | `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`, `SuggestionReplyControls.tsx`, `suggestionReplyTypes.ts`, `suggestionReplyState.ts`, `suggestionReplyDerivation.ts`, `suggestionReplyWorkflowSuggestions.ts` | Complete. Compatibility exports remain stable; composer state, suggestion derivation, workflow-specific quick replies, command chip derivation, button state, and compact chip rendering now have focused Module Interfaces. Focused suggestion tests and desktop typecheck pass.                                                                                                                                                                                                                              |
| P1       | Split Pull Requests workspace             | `apps/desktop/src/pages/PullRequests.tsx`, `apps/desktop/src/pages/pullRequests/*`                                                                                                                                              | Complete. Route state/data loading, category/pagination derivation, page controls, PR context panel, PR card shell, saved/preview/full insight panels, and branch/artifact view-model helpers are split. Focused view-model tests and desktop typecheck pass.                                                                                                                                                                                                                                                  |
| P1       | Split Review Queue workspace              | `apps/desktop/src/pages/ReviewFindings.tsx`, `apps/desktop/src/pages/reviewFindings/*`                                                                                                                                          | Complete. Route shell, runtime hook, review queue cards, controls, page header, findings drawer, activity rail, view-model helpers, and pure runtime rules are split. Focused Review Queue tests and desktop typecheck pass.                                                                                                                                                                                                                                                                                   |
| P1       | Continue daemon route split               | `packages/daemon/src/routes/*.routes.ts`, schema module, workflow modules                                                                                                                                                       | Complete for the planned route/workflow split. Task, auth, git, health, daemon config, Project Link, pull request, local review, review-run, Chat transport, workflow-action route seams, Git operation state, validation preflight, Git probe/action inventory, PR workflow orchestration, PR insight/readiness rendering, pipeline workflow orchestration, pipeline summary/artifact rendering, workflow action failure shaping, local workspace workflow planning, shared LLM settings merging, validation outcome shaping, and workflow metadata derivation are extracted; daemon typecheck and focused workflow/server tests pass. |
| P1       | Split daemon Chat routes                  | `packages/daemon/src/routes/chat.routes.ts`, `packages/daemon/src/routes/chat-workflow.routes.ts`, workflow modules                                                                                                             | Complete for the planned Chat route split. Chat SSE transport, index refresh/status, history/session/checkpoint routes, `/chat/workflow-action` HTTP parsing, Git operation-state logic, validation preflight logic, Git probe inventory, PR workflow orchestration, pipeline workflow orchestration, workflow failure response shaping, workspace workflow proposal/preflight planning, workspace workflow action routing, shared inline LLM settings merging, validation outcome shaping, and workflow metadata derivation are extracted. `server.ts` is now 149 lines and `chatWorkflowState.ts` is now 291 lines. |
| P1       | Split ADO client                          | `packages/core/src/ado/auth.ts`, `client.ts`, `constants.ts`, `response.ts`, `types.ts`, `index.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                   | Complete for shared auth/client/response/constants seams. Compatibility exports stay stable; `adoClient.test.ts`, `azureDevOpsInternal.test.ts`, core typecheck, and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                    |
| P1       | Split ADO discovery modules               | `packages/core/src/ado/core.ts`, `repositories.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                    | Complete for project and repository discovery. Old exports remain stable; focused tests cover both new Modules.                                                                                                                                                                                                                                                                                                                                                                                                |
| P1       | Split ADO PR query Module                 | `packages/core/src/ado/pullRequests.ts`, `refs.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                    | Complete for PR list/get detail. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                           |
| P1       | Split ADO PR work-items Module            | `packages/core/src/ado/workItems.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                                  | Complete for PR-linked work item reads. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                    |
| P1       | Split ADO PR policy Module                | `packages/core/src/ado/policy.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                                     | Complete for PR policy evaluation reads. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                   |
| P1       | Split ADO PR threads Module               | `packages/core/src/ado/pullRequestThreads.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                         | Complete for PR thread reads. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                              |
| P1       | Split ADO PR changes Module               | `packages/core/src/ado/pullRequestChanges.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                         | Complete for PR changed-file reads. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                        |
| P1       | Split ADO build Module                    | `packages/core/src/ado/builds.ts`, `packages/core/src/ado/buildLogs.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                               | Complete for build definitions, build list, timeline, and log excerpts. Build log retrieval and failure-oriented excerpt selection now live behind `buildLogs.ts`; old exports remain stable; focused tests and core typecheck pass.                                                                                                                                                                                                                                                                             |
| P1       | Split ADO pipeline Module                 | `packages/core/src/ado/pipelines.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                                  | Complete for pipeline run list/get. Old exports remain stable; focused tests and daemon typecheck pass.                                                                                                                                                                                                                                                                                                                                                                                                        |
| P1       | Split ADO PR mutation Module              | `packages/core/src/ado/pullRequestMutations.ts`, `packages/core/src/ado/pullRequestMutationSupport.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                 | Complete for PR create, metadata updates, reviewer add/remove, and label add/remove. Shared mutation plumbing now lives behind `pullRequestMutationSupport.ts`; old exports remain stable; focused tests and core typecheck pass.                                                                                                                                                                                                                                                                              |
| P1       | Split ADO tool registry Module            | `packages/core/src/ado/toolRegistry.ts`, `packages/core/src/tools/azureDevOps.ts`                                                                                                                                               | Complete. `tools/azureDevOps.ts` is now a compatibility barrel; registry Adapter calls domain Modules instead of constructing REST for PR create, work-item link, or pipeline trigger.                                                                                                                                                                                                                                                                                                                         |
| P1       | Split ADO diagnostics Module              | `packages/core/src/ado/diagnostics.ts`, `auth.ts`, `client.ts`, `tools/azureDevOps.ts`                                                                                                                                          | Complete. Diagnostic types/errors/mapping are in `diagnostics.ts`; old auth and facade exports remain compatible; focused tests and typechecks pass.                                                                                                                                                                                                                                                                                                                                                           |
| P2       | Remove daemon review-agent dependency     | `packages/core`, `packages/daemon`, `packages/review-agent`                                                                                                                                                                     | Complete. Shared review runtime moved to `packages/core/src/review/*`; daemon no longer depends on `@mergepilot/review-agent`; core, daemon, and review-agent typecheck pass; review-agent tests pass.                                                                                                                                                                                                                                                                                                         |
| P2       | Split shared review planner               | `packages/core/src/review/reviewPlanner.ts`, `prompt.ts`, `reviewFilePriority.ts`, `responseParsing.ts`, `findingPostProcess.ts`, `types.ts`                                                                                    | Complete. `reviewPlanner.ts` is now an 87-line orchestration Module; parsing, post-processing, prompt rendering, prompt-compression file priority scoring, and DTOs have dedicated Interfaces.                                                                                                                                                                                                                                                                                                                   |
