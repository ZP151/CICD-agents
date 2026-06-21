# Chat Attachments And Source Workspace Progress

## Goal

Make the Chat composer and right-side source workspace practical for development workflows: image-aware prompts for GPT-4o, compact attachment controls, safe upload limits, full-file code previews with line numbers, broad syntax highlighting, and concise empty/error states.

## Current Status

| Area | Status | Notes |
|---|---|---|
| Image attachment composer UI | Complete | The `+` menu supports image selection, paste, and drag/drop with compact thumbnail chips. |
| Image attachment state module | Complete | Image selection, slot limits, FileReader preparation, pending state, and menu close behavior live in `useComposerImageAttachments`. |
| Image-only send behavior | Complete | Images can unlock an otherwise empty message, but disabled/busy/approval states remain authoritative. |
| Image read readiness | Complete | The composer blocks sending while selected images are still being converted into request-ready data URLs. |
| Current-turn image thumbnails | Complete | Sent image attachments render as compact thumbnails in the user bubble while preserving lightweight history text. |
| Frontend image validation | Complete | The composer limits image count and size before sending. |
| Backend image validation | Complete | `/chat` validates image data URLs, MIME consistency, count, and 4 MB per-image size. |
| Image-only daemon route | Complete | `/chat` accepts valid image-only turns and stores only image-name placeholders in session history. |
| Multimodal planner request | Complete | Image attachments are passed to the planner as OpenAI-compatible `image_url` message parts. |
| Daemon image handoff contract | Complete | A daemon persistence test verifies image attachments are forwarded to the planner without persisting base64 image data. |
| Chat history storage | Complete | Stored user messages include image names only, not base64 payloads. |
| Source workspace tabs | Complete | Referenced files open as closable tabs with compact language badges and a fixed `Clear` action only after an explicit source click. |
| Source tab lifecycle | Complete | Open source tabs are pruned and refreshed against the active conversation sources. |
| Full-file preview loading | Complete | The right panel fetches repository-relative file content through `/workspace/file`. |
| Code preview editor | Complete | CodeMirror renders read-only previews with line numbers, folding, and fixed metadata. |
| Source line targeting | Complete | Clicking a line-specific reference keeps the target line visible in the preview header, scrolls the editor toward it, and highlights the target line. |
| Source title normalization | Complete | Source titles with single-line or ranged suffixes are normalized consistently across metadata merging, line extraction, inline links, source chips, source tabs, and file previews. |
| Preview copy actions | Complete | File previews expose compact copy actions for repository-relative path and visible content, including compact failure feedback. |
| Syntax language coverage | Complete | Common languages plus .NET/MSBuild files (`.csproj`, `.sln`, `.cshtml`, `.razor`, `.props`, `.targets`, `.config`, `.resx`) have useful preview mappings and badges. |
| Large/binary preview errors | Complete | Large and binary files now produce concise preview errors instead of raw HTTP text. |
| Right panel empty state | Complete | The code panel uses a short unframed `No file open` state when no source or artifact is selected. |
| Summary toggle placement | Complete | The pinned-summary toggle is anchored next to the right-panel boundary instead of floating from the full shell edge. |
| Summary/source panel coexistence | Complete | Floating pinned summary hides while the code preview panel is open, so it does not block transcript references. |
| Attachment menu polish | Complete | The `+` menu is compact, exposes only image attachment, stays mutually exclusive with the model menu, and disables image selection when all slots are used. |
| Top-bar split alignment | Complete | The summary toggle stays next to the right-panel split, and the single right-panel resize handle now starts at the shell top edge above the transcript body. |
| Composer image e2e | Complete | Playwright covers the compact `+` -> `Image` file-picker path, thumbnail rendering, and the `/chat` `imageAttachments` request payload. |
| Composer drag/drop image e2e | Complete | Playwright covers dropping an image directly onto the composer and sending it through the same multimodal payload path. |
| Composer paste image e2e | Complete | Playwright covers pasting an image into the composer and sending it through the same multimodal payload path. |
| Source workspace operation e2e | Complete | Playwright covers explicit source opening, concise empty state, summary/split alignment, source preview path/content copy, per-tab close, and close-all cleanup. |
| Manual browser review | Partial | Empty Project Link onboarding and active Project Link long-workflow summary layout pass completed; image selection/paste/drag-drop and source workspace operations have Playwright coverage, while broader live-agent visual review remains. |

## Implementation Checklist

| Step | Status | Files | Acceptance |
|---|---|---|---|
| 1. Add image attachment payload model | Complete | `chatAttachments.ts`, `api/chat.ts` | Chat requests can include image metadata and data URLs. |
| 1a. Extract image attachment state | Complete | `useComposerImageAttachments.ts`, `ComposerShell.tsx` | Composer UI consumes a focused hook instead of owning FileReader and slot-limit logic inline. |
| 2. Wire image attachments through runtime | Complete | `useChatRuntime.ts`, `useChatTurnRuntime.ts` | Composer sends images through the existing streaming chat flow. |
| 3. Add multimodal planner support | Complete | `chatPlannerRequest.ts`, daemon chat session files | Planner receives text plus `image_url` content blocks. |
| 4. Harden send-state rules | Complete | `chatComposerSendState.ts` | Images unlock empty prompts only when controls are otherwise enabled. |
| 4a. Block premature image sends | Complete | `ComposerShell.tsx`, `chatComposerSendState.ts` | Send remains disabled while image files are still being prepared. |
| 4b. Render sent image thumbnails safely | Complete | `ChatMessageList.tsx`, `chatDraftPersistence.ts`, `useChatRuntime.ts` | Current-session user bubbles show thumbnails, while draft/history persistence strips base64 payloads and keeps `[image: name]` placeholders only. |
| 5. Validate image payloads server-side | Complete | `chat.routes.ts`, `server.ts` | Invalid MIME, malformed data URLs, oversized images, and too many images are rejected. |
| 5a. Cover image-only chat entry | Complete | `server.test.ts` | Empty text plus a valid image returns a successful chat stream and persists only `[image: name]`. |
| 6. Add full-file source preview route | Complete | `workspace.routes.ts`, `api/workspace.ts` | Repository-relative files are read safely and returned with size/line count. |
| 7. Integrate CodeMirror preview | Complete | `SourceWorkspace.tsx` | File previews show line numbers and syntax highlighting. |
| 8. Expand language support | Complete | `sourcePreviewLanguage.ts`, `SourceWorkspace.tsx` | PowerShell, shell, Dockerfile, diff, Go, Rust, Ruby, Lua, Perl, Swift, TOML, common web languages, and .NET/MSBuild files are mapped. |
| 9. Add focused tests | Complete | Desktop/core/daemon tests | Attachment payloads, send rules, multimodal planner requests, preview errors, and language mapping are tested. |
| 9a. Lock daemon image handoff | Complete | `chatPlannerPersistenceImageAttachments.test.ts` | Planner receives the transient image payload while persisted messages and bubbles never include raw base64 image data. |
| 10. Add preview copy actions | Complete | `SourceWorkspace.tsx`, `sourcePreviewCopyState.ts` | Users can copy the file path or preview content from the right-side preview header, with `Copied` or `Failed` feedback. |
| 11. Tighten source workspace chrome | Complete | `SourceWorkspace.tsx`, `ConversationTopBar.tsx`, `ChatWorkspaceLayout.tsx`, `ComposerShell.tsx` | The `No file open` empty state, pinned summary toggle area, aligned split handles, source tab controls, source-panel coexistence, mutually exclusive image/model menus, and full-slot image menu disabling read as compact developer tools. |
| 12. Prune stale source tabs | Complete | `useArtifactWorkspace.ts` | The file workspace no longer keeps source tabs that are absent from the active conversation. |
| 13. Add composer image e2e | Complete | `tests/e2e/chat-layout.spec.ts` | A real file chooser upload shows a thumbnail chip and sends image metadata/data URL to `/chat`. |
| 13a. Add composer paste/drop e2e | Complete | `tests/e2e/chat-layout.spec.ts` | Pasted and dropped images show thumbnail chips and send image metadata/data URLs to `/chat`. |
| 14. Add source tab e2e | Complete | `tests/e2e/chat-layout.spec.ts` | Inline source references open only the clicked file in the right panel; unclicked sources do not become tabs. |
| 15. Preserve source reference lines | Complete | `SourceWorkspace.tsx`, `ArtifactWorkspace.test.tsx`, `tests/e2e/chat-layout.spec.ts` | Line-specific source references show the line target, scroll the full-file preview toward that line, and highlight it in CodeMirror. |
| 15a. Normalize source title ranges | Complete | `sourceTitleUtils.ts`, `chatBubbleMeta.ts`, `conversationArtifacts.ts`, `ReferenceParts.tsx`, `markdownSourceLinks.ts`, `conversationParts.ts`, `SourceWorkspace.tsx` | `File.cs:12`, `File.cs:12-18`, `File.cs:line 12`, and `File.cs:line 12-18` resolve to the same clean source title and source tab identity while preserving the first target line. |
| 16. Manual UI pass | Partial | Browser | Empty onboarding no longer shows the pinned Environment summary; active Project Link long workflow no longer overlaps the pinned summary; source copy/cleanup and image selection/paste/drag-drop are browser-covered. Remaining pass should cover broader live-agent scenarios. |

## Decisions

- Image attachment payloads are transient request data; history stores only `[image: name]` references.
- Current-session chat bubbles may hold transient image data for thumbnail rendering, but draft persistence strips those payloads before writing to `sessionStorage`.
- Image attachment state belongs outside the shell component so future `+` menu entries can be added without expanding the main composer.
- The frontend and backend both enforce image size limits because users can bypass the UI.
- The composer should never send a selected image until its data URL is ready.
- The composer should not display long instructional copy for attachment features.
- Code preview tabs should use concise file-type badges instead of repeated large filenames.
- Source preview tabs should support both per-file close and a fixed `Clear` action for cleaning the workspace quickly.
- Source tabs belong to the active conversation context; stale tabs from previous conversations or old source lists should be removed automatically.
- Copy actions should stay in the preview header and use short labels (`Path`, `Copy`, `Copied`, `Failed`) rather than explanatory text.
- Large and binary files should fail gracefully with short preview messages.
- The source preview route must only allow repository-relative paths inside the selected repository.
- The right code panel empty state should be brief; users already understand file previews from references and tabs.
- The pinned-summary toggle should align to the actual chat/code split, including narrow layouts where the middle panel holds its minimum width.
- The floating pinned summary should not coexist with the open code preview panel because it can cover transcript references and interrupt source navigation.
- Source tabs should be user-opened, not eagerly opened from every available source metadata item.
- Source references should open the full file while preserving the original line target from the assistant citation; the target line should be visually marked inside the code preview.
- The composer `+` menu should stay a compact tool menu. Image support is handled through the GPT-4o-compatible multimodal request path, not through explanatory UI copy; defer text/path/log helpers until they have concrete behavior.

## Verification

Latest focused checks:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/artifacts/useArtifactWorkspace.test.ts src/pages/chat/artifacts/ArtifactWorkspace.test.tsx src/pages/chat/artifacts/sourcePreviewCopyState.test.ts src/pages/chat/artifacts/sourcePreviewLanguage.test.ts src/api/workspace.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/sourceTitleUtils.test.ts src/components/conversation/ReferenceParts.test.tsx
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/chatBubbleMetadata.test.ts src/pages/chat/artifacts/useArtifactWorkspace.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/layout/composerMenuState.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/useComposerImageAttachments.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/artifacts/sourcePreviewLanguage.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/layout/ChatMessageList.test.tsx src/pages/chat/chatDraftPersistence.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatPlannerPersistenceImageAttachments.test.ts
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "keeps pinned summary branch and commit dropdowns mutually exclusive"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "keeps the pinned summary hidden during empty Project Link onboarding"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "keeps active Project Link long workflow transcript clear of the pinned summary"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "sends image attachments from the compact composer add menu"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "accepts dropped image attachments in the composer"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "accepts pasted image attachments in the composer"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "supports source preview copy actions and tab cleanup"
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "renders project-context source references"
```
