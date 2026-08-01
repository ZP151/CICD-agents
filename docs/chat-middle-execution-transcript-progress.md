# Chat Middle Execution Transcript Progress

## Goal

Redesign the Chat middle panel so Git and Azure DevOps workflows read as a continuous execution transcript: concise assistant narrative, state-aware command groups, collapsible shell evidence, simple approval decisions, optional denial feedback, and compact final summaries.

## Current Status

| Area | Status | Notes |
|---|---|---|
| Assistant message layout | Complete | Assistant text now renders as lightweight transcript content. |
| Thinking/running group labels | Complete | Execution labels distinguish `Thinking...`, `Running...`, `Ran...`, and stopped states. |
| Execution group layout | Complete | Group chrome is now compact transcript rows. |
| Completed workflow collapse | Complete | Completed groups are forced closed when the workflow is complete. |
| Shell output panel | Complete | Expanded command details use a compact shell panel. |
| Approval card simplification | Complete | Pending and legacy approval cards use compact inline decision UI. |
| Approval feedback input | Complete | Denied approvals can send optional feedback as the next instruction. |
| Approval evidence folding | Superseded | `Review scope` was removed from the compact approval card to avoid duplicate evidence copy. |
| Duplicate working indicators | Complete | Composer-level busy and approval notices are hidden; the middle transcript owns the active status. |
| Streaming cursor/dots cleanup | Complete | Streamdown caret and assistant typing dots were removed from streamed transcript output. |
| Suggested action noise | Complete | Inline suggested-reply parts and quoted action suggestions like `> Run unit tests...` are omitted from the transcript. |
| Metadata suggestion rendering | Complete | Plain `result.suggestions` are no longer rendered as `› ...` transcript lines; only real PR insight source metadata remains visible. |
| Approval command preview | Complete | Approval cards now show the concrete command such as `git add -A` or `git add -- <paths>` instead of a raw tool id in the header. |
| Completed group manual expansion | Complete | Completed groups still auto-collapse once, but manual command detail expansion no longer re-collapses the whole group. |
| Top-level execution collapse | Complete | Completed `Ran ...` rows stay folded under the top-level `Worked N commands` header until the user expands it. |
| Turn activity feedback | Complete | A local optimistic activity marker appears immediately after send, then the daemon `turn.started` event takes ownership so the user sees work begin before repo context/model output returns. |
| Command group collection | Complete | Execution timeline now presents a command-group collection header, plan summary, MCP-ready connector framing, grouped command evidence, per-group summaries, and a short reflection before the final assistant conclusion. |
| Truthful expand affordance | Complete | `Thinking/Worked for ...` shows a disclosure arrow only when activity details exist; otherwise it is plain status text. |
| Copy response affordance | Complete | Assistant copy is icon-only and switches to a check icon after successful copy while preserving tooltip and aria labels. |
| Turn render ordering | Complete | A user turn now renders execution records before assistant summaries and pending approvals, regardless of streaming/tool event arrival order. |
| Review-only planner scope | Complete | `review my changes` is treated as a read-only review intent and cannot produce `git_add`, `git_commit`, or `git_push` approvals unless the current user message asks for them. |
| Commit-message draft chips | Complete | `Draft commit message` follow-ups now route through a read-only `draft_commit_message` workflow action instead of filling the composer with a prompt. |
| Change-scope chips | Complete | `Explain change scope` commit follow-ups now route through a read-only `explain_change_scope` workflow action and summarize affected areas without approval. |
| Detailed-diff chips | Complete | Commit preflight `Check detailed diff` now reuses the structured `inspect_changes` workflow action instead of filling the composer. |
| Remote-target chips | Complete | Push-stage `Show remote target` now routes through a read-only `inspect_remote_target` workflow action and reports upstream/ahead/behind context without approval. |
| Post-push summary chips | Complete | `Summarize push` and `Review commit` now route through a read-only `inspect_latest_commit` workflow action with HEAD commit and remote status evidence. |
| CI failure analysis chips | Complete | `Analyze failure` now routes through a read-only `inspect_validation_failure` workflow action; `Analyze pipeline` reuses structured `inspect_pipeline`. |
| PR validation recovery chips | Complete | PR readiness `Validation recovery` now routes through a read-only `inspect_ci_recovery_context` workflow action over saved validation and pipeline failure artifacts. |
| Source context chips | Complete | Source follow-ups now route through a read-only `inspect_source_context` workflow action over saved file and URL references instead of replaying a prompt. |
| Architecture context chips | Complete | Architecture command chips and follow-ups now route through a read-only `inspect_architecture_context` workflow action over repository context signals instead of replaying a prompt. |
| Azure DevOps auth chips | Complete | Auth follow-ups now route through a read-only `inspect_ado_auth_context` workflow action over OAuth/PAT and Project Link mapping state instead of replaying a prompt. |
| Welcome suggestions | Complete | Empty-state welcome suggestions now route safe single-step items through structured workflow actions instead of queueing prompt text. |
| PR plan context | Complete | PR planning welcome suggestions now route through a read-only `inspect_pr_plan_context` workflow action over branch, working-tree, push, and Project Link PR readiness evidence. |
| PR plan follow-ups | Complete | PR plan summaries now derive workflow-aware next actions such as review/commit, pull/rebase, push/publish, ADO context, and create PR. |
| Tests | Complete | Desktop typecheck, build, and focused execution/approval/runtime tests pass. |
| Manual browser review | Partial | Empty Project Link onboarding and active Project Link long-workflow transcript layout pass completed; broader live-agent scenarios remain. |

## Implementation Checklist

| Step | Status | Files | Acceptance |
|---|---|---|---|
| 1. Lighten assistant message rendering | Complete | `ChatMessageList.tsx` | Assistant text reads as transcript content, not a large card. |
| 2. Add state-aware execution labels | Complete | `executionTimelineModel.ts`, `ExecutionTimeline.tsx`, `ExecutionCommandRow.tsx` | Pending/pre-tool state says `Thinking...`; active tools say `Running...`; completed tools say `Ran...`. |
| 3. Redesign execution group chrome | Complete | `ExecutionTimeline.tsx`, `ExecutionCommandRow.tsx` | Running/error/approval groups expand; completed groups collapse. |
| 4. Simplify command row details | Complete | `ExecutionCommandRow.tsx` | Shell details are available only after expanding a row/group. |
| 5. Simplify pending approval UI | Complete | `PendingActionCard.tsx`, `ConfirmCard.tsx` | Approval card is compact and action-oriented. |
| 6. Add approval feedback path | Complete | `PendingActionCard.tsx`, `ApprovalCards.tsx`, `useChatRuntime.ts` | Empty denial sends `no`; non-empty denial sends user feedback. |
| 7. Remove detailed approval evidence from compact card | Complete | `PendingActionCard.tsx` | The card asks only whether to run the action and keeps optional denial feedback. |
| 8. Update focused tests | Complete | Existing focused tests | Typecheck and focused desktop tests pass. |
| 9. Manual UI review | Partial | Browser | Empty onboarding is visually clean; active Project Link long workflow transcript no longer overlaps the pinned summary. |
| 10. Remove duplicate busy/suggestion noise | Complete | `ChatMessageList.tsx`, `ComposerShell.tsx`, `ConversationPartRenderer.tsx`, `MarkdownContent.tsx` | No duplicate busy notice, no streaming caret/dots, and no inline suggested action quote lines. |
| 11. Make approval commands explicit | Complete | `ApprovalEvidenceModel.ts`, `PendingActionCard.tsx` | Approval cards show concrete command previews and avoid raw tool-id placement. |
| 12. Preserve manual execution expansion | Complete | `ExecutionTimeline.tsx`, `ExecutionCommandRow.tsx` | Clicking command details no longer causes completed execution groups to collapse again. |
| 13. Stabilize per-turn render order | Complete | `chatRenderItems.ts` | Tool records render before assistant summaries and pending approvals inside each user turn. |
| 14. Fold completed execution into top-level header | Complete | `ExecutionTimeline.tsx` | Completed transcripts initially show only `Worked N commands`; `Ran ...` rows are hidden until expansion. |
| 14a. Add immediate turn activity and truthful disclosure | Complete | `chatTurnActivity.ts`, `chatStreamDispatcher.ts`, `chatUiChunkDispatcher.ts`, `useChatRuntime.ts`, `ChatMessageList.tsx` | The UI inserts an optimistic activity row within the send action, merges it with server turn events, records progress/workflow details, and only shows the disclosure chevron when there are details. |
| 14b. Promote execution transcript to command-group collection | Complete | `ExecutionTimeline.tsx`, `executionTimelineModel.ts`, `ExecutionTimeline.test.tsx` | The execution area has a collection header, plan summary, MCP-ready connector framing, grouped command sets, per-group summaries/reflections, and completed auto-collapse before final answer reading. |
| 14c. Simplify assistant response copy control | Complete | `ChatMessageList.tsx` | Copy uses an icon-only button and changes to a check icon after success. |
| 15. Remove plain metadata suggestion lines | Complete | `ChatAssistantMetaPanel.tsx` | Assistant metadata no longer renders plain suggestions as `›` rows. |
| 16. Guard review-only planner intent | Complete | `chatPlannerPrompt.ts`, `chatPlannerGuards.ts`, `chatPlanner.ts` | Review-only prompts summarize changes without proposing stage/commit/push approvals. |
| 17. Route commit-message drafts through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `workspaceWorkflow.ts` | `Draft commit message` is read-only, returns a suggested message, and does not create approval. |
| 18. Route change-scope explanations through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `workspaceWorkflow.ts` | `Explain change scope` is read-only, groups changed files by product area, and does not create approval. |
| 19. Route detailed-diff commit follow-ups through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts` | Commit preflight `Check detailed diff` calls `inspect_changes` directly. |
| 20. Route remote-target push follow-ups through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `gitProbes.ts`, `workspaceWorkflow.ts` | `Show remote target` reports the upstream and divergence state without creating approval. |
| 21. Route post-push summary follow-ups through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `gitProbes.ts`, `workspaceWorkflow.ts` | `Summarize push` and `Review commit` inspect HEAD commit, stat, and remote status without creating approval. |
| 22. Route CI failure analysis follow-ups through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `workspaceWorkflowRunner.ts` | `Analyze failure` inspects validation failure artifacts; `Analyze pipeline` reuses pipeline inspection. |
| 23. Route PR validation recovery through workflow actions | Complete | `suggestionReplyWorkflowSuggestions.ts`, `workspaceWorkflowRunner.ts` | `Validation recovery` inspects local validation and remote pipeline failure artifacts without replaying a natural-language prompt. |
| 24. Route source follow-ups through workflow actions | Complete | `suggestionReplyDerivation.ts`, `workspaceWorkflowRunner.ts` | `List key files`, `Trace source flow`, and `Summarize sources` inspect saved source references without replaying a natural-language prompt. |
| 25. Route architecture follow-ups through workflow actions | Complete | `suggestionReplyDerivation.ts`, `workspaceWorkflowRunner.ts` | `Explain architecture`, `Trace request flow`, `List entry points`, `Explain data model`, `Check architecture gaps`, and `Find test surface` inspect repository context without replaying a natural-language prompt. |
| 26. Route auth follow-ups through workflow actions | Complete | `suggestionReplyDerivation.ts`, `workspaceWorkflowRunner.ts` | `Check auth` and `Explain auth` inspect Azure DevOps OAuth/PAT and Project Link mapping state without replaying a natural-language prompt. |
| 27. Route welcome suggestions through workflow actions | Complete | `workspaceActionSuggestions.ts`, `ChatEmptyState.tsx` | Empty-state suggestions such as `Understand this project`, `Review my changes`, `What's on this branch?`, PR insight, pipeline, validation, and stage/commit dispatch structured actions when possible. |
| 28. Route PR planning through workflow actions | Complete | `workspaceActionSuggestions.ts`, `gitProbes.ts`, `workspaceWorkflowRunner.ts` | `Prepare a PR plan` and `Push and create PR` inspect PR readiness without creating push or PR approvals. |
| 29. Derive PR planning next-step controls | Complete | `suggestionReplyWorkflowSuggestions.ts`, `workflowTaskDerivation.ts` | PR plan context produces deterministic suggestion chips and right-panel progress steps for dirty, behind/diverged, no-upstream, missing-ADO, push, and create-PR states. |

## Decisions

- `Ran ...` means completed execution only.
- `Thinking...` means the agent is preparing or waiting before a concrete tool command appears.
- `Running ...` means at least one concrete tool command is currently executing.
- Replace `Skip` with `No, don't run it` because the current behavior is approval denial, not workflow skipping.
- Add feedback textarea so denial can become a useful revised instruction.
- Keep command execution evidence available through expanded shell panels.
- Keep approval cards compact; avoid repeating the assistant's formatted explanation inside the card.
- Approval cards should show the actual command being approved, not just the internal tool id.
- Assistant conclusions should not include a second permission question when an approval card is present.
- Turn-level status is not the command-group collection. The turn status shows elapsed activity and optional progress details; command groups own tool/MCP execution evidence.
- Do not show a disclosure arrow unless a control actually expands useful details.
- Command groups are the future extension point for Git, Azure DevOps, tests, and other MCP/tool connectors; each group should carry a plan summary, command evidence, and a short post-step reflection.
- Once command execution is complete, collapse the command-group collection and let the final assistant conclusion become the primary readable output.
- Copy controls should stay icon-only in transcript chrome; state feedback should change icon/tone instead of adding button text.
- Per-turn rendering should not depend on whether assistant streaming or tool events arrived first.
- Plain metadata suggestions are not transcript content; they should not render as `›` action lines.
- The current user message controls write scope. A review-only prompt should not inherit older stage/commit/push intent from conversation history.
- Commit-message drafting is an inspection workflow, not a write workflow; it should never stage or commit by itself.
- Change-scope explanations are inspection workflows; they should help the user understand staging/commit boundaries without proposing writes.
- Detailed-diff follow-ups should reuse existing read-only inspection workflows before asking the model another free-form question.
- Remote-target checks are read-only workflow actions; users should see exact upstream/ahead/behind context before push approvals.
- Post-push summary/review should be evidence-backed from Git probes, not a free-form prompt replay.
- CI failure analysis should inspect saved local or remote failure evidence before recommending reruns or code changes.
- PR readiness recovery should gather existing validation and pipeline evidence before suggesting policy, work-item, rerun, or code-change paths.
- Source follow-ups should inspect saved file and URL references before asking the model another free-form question.
- Architecture follow-ups should inspect repository context through structured read-only workflow actions before asking the model another free-form question.
- Auth follow-ups should inspect OAuth/PAT and Project Link mapping state through structured read-only workflow actions before asking the model another free-form question.
- Welcome suggestions should dispatch structured single-step workflow actions when a clear mapping exists; multi-step plans can remain conversational until a dedicated workflow exists.
- PR planning should inspect readiness first and keep push/PR creation behind explicit approval cards.
- PR planning follow-ups should be derived from inspected state, not generic PR readiness wording.
- Do not modify Git or Azure DevOps execution behavior in this phase.

## Recent Verification

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatTurnActivity.test.ts src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/chatUiChunkDispatcher.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/layout/ChatMessageList.test.tsx src/components/conversation/ExecutionTimeline.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
```
