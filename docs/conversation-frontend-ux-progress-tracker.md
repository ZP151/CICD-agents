# Conversation Frontend UX Progress Tracker

## Purpose

This tracker is the durable execution plan for upgrading the Dev Agent
Conversation frontend into a real agent workbench.

It should be updated after every meaningful frontend development session.

Use this document to answer:

- Which Conversation frontend phase is active?
- Which long-running implementation batch is active?
- What has already been completed?
- Which UX capabilities are still missing?
- Which local Codex skills should guide implementation?
- What is the next concrete development target?
- Which verification commands prove the phase is usable?

## Status Legend

| Status | Meaning |
| --- | --- |
| `Not started` | No implementation work has begun. |
| `Researching` | Current code, dependencies, and design constraints are being inspected. |
| `In progress` | Implementation has started. |
| `Partial` | Useful code exists, but acceptance criteria are not fully met. |
| `Blocked` | Cannot continue without a decision, dependency, credential, or external setup. |
| `Complete` | Acceptance criteria are met and verified. |

## Design Read

Reading this as: a local developer-agent workbench for technical users, with a
quiet, high-trust, information-dense product UI language, leaning toward
`redesign-existing-projects` plus `minimalist-ui`, with selective
`high-end-visual-design` micro-interactions.

This is not a landing page or marketing surface. The Conversation page should
feel operational, precise, and useful under repeated daily use.

## Skill Stack

| Skill | Local Path | Role | Usage Rule |
| --- | --- | --- | --- |
| `redesign-existing-projects` | `C:\Users\15492\.codex\skills\redesign-skill\SKILL.md` | Main implementation guide for existing app upgrades. | Use for audits, missing states, UI cleanup, and targeted improvements without rewriting the app. |
| `minimalist-ui` | `C:\Users\15492\.codex\skills\minimalist-skill\SKILL.md` | Main visual language for the Conversation workbench. | Use for restrained typography, compact surfaces, readable hierarchy, and low-noise workspace UI. |
| `high-end-visual-design` | `C:\Users\15492\.codex\skills\soft-skill\SKILL.md` | Micro-interaction and premium polish reference. | Use sparingly for hover, active, reveal, and timeline motion. Avoid decorative excess. |
| `design-taste-frontend` | `C:\Users\15492\.codex\skills\taste-skill\SKILL.md` | Secondary anti-generic design reference. | Borrow audit discipline only; this skill is not the primary guide because the app is a product UI, not a landing page. |
| `impeccable` | `C:\Users\15492\.codex\skills\impeccable\SKILL.md` | Production-grade UI audit, polish, accessibility, responsive behavior, motion, copy, and design-system hardening. | Active for Phase 7-9 frontend work. `PRODUCT.md` captures the product register, target users, purpose, personality, anti-references, design principles, and accessibility constraints; detector output should feed the visual/motion backlog. |
| `gpt-taste` | `C:\Users\15492\.codex\skills\gpt-tasteskill\SKILL.md` | Optional advanced motion reference. | Use only for isolated empty states, onboarding, or visual summaries. Do not apply heavy GSAP to the core chat flow. |
| `playwright` | `C:\Users\15492\.codex\skills\playwright\SKILL.md` | Real browser automation and visual/manual-flow verification. | Use through the repository-local toolchain or the skill wrapper for Conversation QA, screenshots, snapshots, and regression checks. |

## Frontend Skill Optimization Plan

This section converts the available local frontend skills into an executable
Conversation UX plan. It should guide the next implementation batches after
source grounding is stable.

| Optimization Area | Primary Skill | Current Problem | Target Product Behavior | First Implementation Target |
| --- | --- | --- | --- | --- |
| User-friendly response reading | `redesign-existing-projects` | Bot responses still feel like plain text plus tool cards. | Assistant output is split into readable blocks: text, markdown, code, references, tool evidence, approvals, artifacts, and suggestions. | Finish the `ConversationPartRenderer` registry and keep `Chat.tsx` from owning low-level response rendering. |
| Markdown, code, and technical blocks | `redesign-existing-projects` | Code and markdown can become hard to scan in long answers. | Markdown supports GFM, tables, safe links, sanitized HTML, syntax-highlighted code, copy actions, partial streamed fences, and long-block collapse. | Browser QA for long streaming answers, then decide whether local helpers are enough or Streamdown-style behavior should be copied further. |
| Internal code references | `redesign-existing-projects` | Repo claims can still look generic when they do not visibly cite files. | Project-specific answers cite files, line numbers, diff hunks, snippets, and repository context in grouped reference blocks. | Finish live QA for architecture and change-review prompts; add inline citation markers only if grouped references are not enough. |
| External/web references | `redesign-existing-projects` | External source metadata is planned but not yet fully wired from real search/tool results. | Web/doc answers show title, domain, URL, snippet, and clear distinction from local file references. | Add a normalized `source_url` ingestion path for future web/search/doc tools. |
| Observable execution | `redesign-existing-projects` | Git and ADO workflows can look like static templates. | The UI shows observable process: inspected files, diff summary, command args, selected paths, tool output, errors, and approvals. | Start Phase 4 with an `ExecutionTimeline` component based on structured `tool_call` parts. |
| Scope control | `redesign-existing-projects` | Workflow can continue beyond the user's requested scope, such as creating PRs after push. | Planner and UI stop at the explicit requested boundary unless the user confirms the next scope. | Add workflow-scope metadata and tests for `stage/commit/push` stopping after push. |
| Suggested quick replies | `redesign-existing-projects` | Follow-up actions are mostly manual and inconsistent. | Context-aware quick replies appear above the input for useful next actions, then disappear while typing. | Add `SuggestionReplyBar` driven by current message/workflow metadata. |
| Composer command surface | `minimalist-ui` | Input area has basic controls but does not yet feel like an efficient agent command surface. | Composer stays compact but exposes model choice, project context, command chips, and future `@` or `/` affordances. | Add command chips for review, architecture, tests, and PR insight without crowding the input. |
| Visual consistency | `minimalist-ui` | Conversation surfaces have improved, but bubbles, references, approvals, and tool cards are not yet one coherent system. | Workbench uses restrained typography, tight radii, light borders, muted semantic colors, and no decorative clutter. | Refine chat bubbles, reference groups, timeline rows, approvals, and composer using one token set. |
| Motion and feedback | `minimalist-ui` plus `high-end-visual-design` | State changes can feel abrupt or invisible. | Hover, active, focus, loading, streaming, and expand/collapse states use quiet transform/opacity transitions. | Add CSS-only micro-interactions before introducing an animation library. |
| Empty, error, and loading states | `redesign-existing-projects` | Some states still expose raw backend behavior or leave the user unsure what to do. | Errors explain recovery; loading shows what is being inspected; empty states lead to project linking or useful first actions. | Audit Conversation, Project Link, and Settings state surfaces after Phase 4. |
| Rich artifacts | `redesign-existing-projects` | Large reports and architecture diagrams do not have a dedicated home. | Mermaid diagrams, PR insight reports, and long review summaries open in a side workspace instead of bloating the chat. | Keep `artifact` part in the model and implement the result workspace after timeline/suggestions. |

### Skill-Driven Design Rules

These rules are binding for future Conversation frontend work:

- Treat Conversation as a developer workbench, not a marketing page.
- Prefer typed structured parts over ad hoc string parsing in React views.
- Keep cards shallow; do not place card-looking blocks inside multiple nested
  card surfaces.
- Use muted semantic color only where it helps the user understand state.
- Do not show hidden chain-of-thought. Show observable process and evidence:
  files inspected, commands planned, args used, tool results, failures, and
  next choices.
- Prefer CSS `transform` and `opacity` transitions before adding motion
  dependencies.
- Keep references and citations visible enough to build trust, but compact
  enough for daily use.
- Any Git or ADO action that changes remote or local state must show scope,
  exact target, and approval context before execution.

### `impeccable` Usage Check

Last checked: `2026-06-13`

Decision: `impeccable` is usable and valuable for this project. Use it as the
front-end product-quality guardrail for Conversation polish, especially where
the app needs to feel like a precise Dev Agent workbench rather than a generic
chat UI.

Highest-value commands for the next front-end batches:

| Command | Use For | Expected Gain |
| --- | --- | --- |
| `$impeccable document` | Create or refresh a durable `DESIGN.md` from the existing app surfaces. | Prevents future UI work from drifting into one-off styles. |
| `$impeccable critique apps/desktop/src/pages/Chat.tsx` | Review the Chat workbench, approval cards, timeline, composer, and right context panel. | Produces a prioritized product-UI backlog instead of subjective visual feedback. |
| `$impeccable polish apps/desktop/src/pages/Chat.tsx` | Apply the highest-confidence refinements after the streaming and workflow logic are stable. | Improves trust, scanability, keyboard/focus behavior, and responsive layout without changing product intent. |
| `$impeccable animate apps/desktop/src/pages/Chat.tsx` | Replace dated or expensive motion with state-driven micro-interactions. | Makes streaming, approvals, expand/collapse, and panel changes feel deliberate while respecting reduced motion. |
| `$impeccable harden apps/desktop/src/pages/Chat.tsx` | Check error, empty, loading, disabled, keyboard, and reduced-motion states. | Turns the UI from demo-ready into daily-use-ready. |

Current detector findings:

| Finding | Location | Required Follow-Up |
| --- | --- | --- |
| `animate-bounce` thinking dots | `apps/desktop/src/pages/Chat.tsx` around `ThinkingDots` | Replace with a calmer state-driven typing indicator using opacity/scale keyframes and `prefers-reduced-motion`. |
| `transition: width` on top bar panel zones | `apps/desktop/src/pages/Chat.tsx` in `ConversationTopBar` | Avoid width animation where possible, or keep layout changes instant and animate only icon/state opacity. |
| `transition: width` on side panels | `apps/desktop/src/index.css` for `.history-panel` and `.right-panel` | Rework panel transitions to avoid layout-thrashing width animation, or constrain it with reduced-motion support. |

Usage boundary:

- Use `impeccable` for UI quality, not backend agent reasoning.
- Do not expose hidden chain-of-thought. Convert reasoning into observable
  evidence: inspected files, diff summaries, exact command arguments, tool
  results, risk, and next choices.
- Keep the product register in `PRODUCT.md` as the source of truth: precise,
  calm, accountable, evidence-rich, and local-first.
- Prefer restrained product UI improvements over decorative redesign.

### Detailed UX Backlog

| Priority | Item | Status | Acceptance Criteria |
| --- | --- | --- | --- |
| P0 | Live source-grounding QA | Not started | `Explain this project architecture` and `Review my changes` show concrete file references in the running app. |
| P0 | Diff-aware review answer | Partial | Review answers cite changed files and diff hunks, explain risk, and give a conclusion beyond file discovery. |
| P0 | Workflow scope guard | Partial | `stage, commit and push` stops after push and does not suggest PR creation unless the user asks. |
| P0 | Git command argument visibility | Partial | Approval cards and completed timeline rows now show command preview, flags, selected paths, branch, remote, and commit message evidence for protected operations. |
| P1 | Execution timeline grouping | Partial | Related tool events render as one grouped timeline with active/error states expanded. |
| P1 | Reference block polish | Partial | Local references and external references have separate visual treatments and grouped source summaries. |
| P1 | Suggestion reply bar | Partial | Contextual suggestions appear above the composer for architecture, review, auth, PR insight, and index states. |
| P1 | Composer command chips | Not started | Common commands are discoverable without adding visual clutter. |
| P2 | Artifact workspace | Not started | Mermaid diagrams and PR/review reports open in a side workspace and remain linked from chat history. |
| P2 | Streaming scroll hardening | Partial | Long streamed answers do not duplicate, jump scroll unexpectedly, or break partial markdown. |
| P2 | Visual system pass | Partial | Bubbles, timelines, approvals, references, and composer share one restrained workbench language; remaining work should use `impeccable` critique/polish/harden passes. |
| P2 | Browser/manual regression board | Not started | Manual scenarios are documented as pass/fail after each major phase. |

## Current Dependency Baseline

Current `@cicd-agent/desktop` frontend stack:

- React 18
- React Router
- TanStack Query
- Radix Dialog and Tabs
- Tailwind CSS
- `react-markdown`
- `remark-gfm`
- `rehype-sanitize`
- `shiki`
- `mermaid` through dynamic import for artifact diagrams
- No dedicated animation library yet
- Playwright 1.60.0 is available in the root dev dependencies.

Candidate additions for bot response rendering:

| Package | Purpose | Priority |
| --- | --- | --- |
| `react-markdown` | Markdown rendering for assistant responses. | High |
| `remark-gfm` | Tables, task lists, strikethrough, GitHub-flavored markdown. | High |
| `rehype-sanitize` | Safe HTML handling. | High |
| `shiki` | High-quality syntax highlighting for code blocks. | Medium |
| `mermaid` | Safe first-pass diagram rendering for architecture and PR insight artifacts. | Adopted |
| `framer-motion` | Optional polished state transitions. | Medium |
| `@assistant-ui/react-markdown` | Reference implementation for streaming markdown/code rendering patterns. Evaluate before installing. | Medium |
| `streamdown` | Streaming-first Markdown renderer used by Vercel AI Elements. Evaluate after basic renderer is stable. | Medium |

Default motion should first use CSS `transform`, `opacity`, and scoped
transitions. Add an animation library only when the built-in CSS path becomes
awkward or fragile.

## Browser QA Tool Access

Last checked: `2026-06-13`

| Capability | Status | Evidence | Usage Rule |
| --- | --- | --- | --- |
| Local `playwright` skill | Available | `C:\Users\15492\.codex\skills\playwright\SKILL.md` was readable. | Use for CLI-first browser automation, snapshots, screenshots, and UI-flow debugging. |
| Playwright skill wrapper | Available | `C:\Users\15492\.codex\skills\playwright\scripts\playwright_cli.sh` exists. | Use when ad hoc browser automation is better than committing a test. Keep generated screenshots/traces under `output/playwright/`. |
| Local `playwright-cli` skill folder | Available | `C:\Users\15492\.codex\skills\playwright-cli` exists. | Prefer the documented `playwright` skill unless a future task specifically needs the alternate folder. |
| Project Playwright dependency | Available | `.\scripts\windows\pnpm-project.ps1 exec playwright --version` returned `Version 1.60.0`. | Run through the repository-local toolchain, not global Node. |
| `npx` for skill wrapper | Available | `npx --version` returned `10.9.0`; `Get-Command npx` resolves under `.tools\node-v22.11.0-win-x64`. | The wrapper script can use project-local Node/npm. |
| Local `impeccable` frontend skill | Available and active | `C:\Users\15492\.codex\skills\impeccable\SKILL.md` was readable; `PRODUCT.md` exists for the product register and design constraints; detector found remaining motion debt in `animate-bounce` and width transitions. | Use for Phase 7/8/9 visual-system, streaming interaction, accessibility, responsive, copy, and motion hardening. Keep implementation grounded in this product's developer workbench purpose. |
| In-app Browser plugin tool | Available for read-only page checks | The Browser skill and runtime documentation were loaded; `http://127.0.0.1:1420/#/chat` opened successfully in the in-app Browser. | Use for live page inspection and visual checks. For seeded approval/workflow states, prefer project Playwright tests because the Browser evaluate runtime restricts direct `sessionStorage` seeding. |

Recommended Playwright usage for this repo:

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright --version
.\scripts\windows\pnpm-project.ps1 exec playwright install chromium
.\scripts\windows\pnpm-project.ps1 exec playwright open http://127.0.0.1:1420/#/chat
```

For repeatable QA, prefer adding focused Playwright scripts or tests under the
existing project structure instead of ad hoc screenshots only. Store temporary
artifacts under `output/playwright/` if screenshots or traces are needed.

## Product Objective

The target product is not a generic chatbot. It is a local Dev Agent workbench
that can inspect a linked repository, understand code changes, reason about
Azure DevOps context, and help the user complete development workflows with
clear evidence and controlled actions.

The Conversation page must eventually support:

- Streaming assistant responses that feel alive and stable.
- Markdown, code, tables, references, tool output, approvals, and artifacts as
  separate structured response parts.
- Internal references to repository files, symbols, diffs, commands, branches,
  commits, PRs, pipeline runs, and ADO work items.
- External references from web search or documentation results when web
  grounding is used.
- Contextual suggested replies above the input when they reduce user effort.
- Observable process UI that shows what the agent inspected or executed,
  without exposing hidden chain-of-thought.
- A compact workbench design language that stays useful during long technical
  sessions.

## Current Product Gaps

These gaps are the reason this tracker exists.

| Gap | User Impact | Required Fix |
| --- | --- | --- |
| Assistant responses still behave too much like plain text. | Markdown, code, references, and tool evidence are hard to scan. | Finish the typed `ConversationPart` renderer and migrate all response surfaces to it. |
| `Review my changes` can report changed file names without understanding diffs. | The user cannot trust the review as an AI insight workflow. | Add diff-aware analysis, local file references, risk summaries, and command evidence. |
| Git workflows can look template-driven. | The user cannot see why a staged path, commit message, or next step was chosen. | Show exact command args, selected paths, inspected files, and stop at the user's requested scope. |
| Tool and approval cards are not yet a coherent timeline. | Multi-step actions feel fragmented and opaque. | Build grouped observable execution timelines inspired by assistant-ui ToolGroup. |
| Repository architecture answers may not cite source files. | Answers can look generic even when repository context exists. | Require local `source_document` references for repo-specific claims. |
| Streaming Markdown is only partially hardened. | Unterminated code fences and long streamed output can be unstable. | Stabilize partial fences and compare against Streamdown for future streaming rendering. |
| Quick replies are not systematic. | The user must type obvious next actions manually. | Add context-aware suggested replies bound to current workflow state. |
| Rich reports have nowhere to live. | PR insights, architecture diagrams, and review reports can become too long for chat bubbles. | Add artifact parts and later a result workspace side panel. |

## Reuse Strategy

The project should reuse mature upstream logic by copying and adapting small,
compatible pieces into this repository, rather than calling those projects as
external services.

| Upstream Source | Mature Logic To Reuse | Local Destination | Reuse Rule |
| --- | --- | --- | --- |
| Vercel AI SDK / AI Elements | `UIMessage.parts` mental model, source/document parts, tool lifecycle states, streaming message state. | `apps/desktop/src/chatBubbles.ts`, Conversation stream handlers, renderer registry. | Copy architecture shape and compatible utility logic. Do not import the Next.js app shell. |
| Streamdown | Streaming Markdown behavior, unterminated Markdown repair, Shiki-first code rendering, sticky code actions. | `ConversationPartRenderer`, possible future `StreamingMarkdownBlock`. | First copy the behavior into local helpers; only add package if local renderer becomes too fragile. |
| assistant-ui | ToolGroup grouping, approval UI patterns, composer affordances, markdown/code rendering conventions. | `ExecutionTimeline`, `ToolCallGroup`, input suggestion bar. | Copy/adapt small React component patterns after checking fit with current Tailwind/Radix stack. |
| Open WebUI | Citations, RAG/source display, artifacts, message queue, model/provider selection behavior. | `ReferenceBlock`, artifact plan, model selector, queued follow-up UX. | Reuse product behavior and data model ideas; direct Svelte code reuse is unlikely. |
| LibreChat | Artifacts, web search result rendering, agent/provider routing ideas, multi-response patterns. | Artifact workspace and future provider routing. | Reuse data flow ideas and UI behavior, not the full app framework. |

## Progress Tracking Rules

After every meaningful frontend session, update the following sections:

- `Overall Frontend UX Status`
- `Phase Summary`
- `Long-Running Execution Dashboard`
- the active phase section
- `Latest verification`
- `Next Concrete Target`

Use these completion rules:

- `0%`: design only, no working code.
- `25%`: skeleton exists and compiles.
- `50%`: useful behavior exists behind the intended UI path.
- `75%`: main behavior works and has focused automated tests.
- `90%`: browser/manual QA has passed and edge cases are handled.
- `100%`: acceptance criteria are met, verified, and documented.

Do not mark a phase complete if:

- it only works through a mocked path,
- it lacks focused tests for risky logic,
- it cannot be manually exercised from the Conversation page,
- it violates the product objective by behaving like a static template.

## Long-Running Execution Dashboard

This section is the main checkpoint for future development sessions. Every new
implementation batch should start by reading this table, then update it before
ending.

Current operating mode:

- Active track: `Conversation agent workbench UX`
- Active phase: `Phase 8: Streaming UX Hardening`
- Current batch: `F8.1 Streaming stability pass`
- Current product risk: the UI can still look template-driven when the agent is
  actually doing tool work.
- Current architectural risk: composer flow, result workspace basics, streaming
  cancellation, and interrupted-stream draft restore are now verified, but
  live-agent long-answer browser scenarios still need coverage.
- Current QA blocker: seeded approval UI is best verified through Playwright
  tests because the in-app Browser evaluate runtime restricts direct
  `sessionStorage` seeding, but the Browser plugin itself is available for
  real-page read-only checks.

| Batch | Status | Completion | Scope | Target Files | Verification |
| --- | --- | ---: | --- | --- | --- |
| F5.1 Structured quick-reply context | Complete | 100% | Replace mostly text-matched suggestions with workflow metadata, assistant metadata, source metadata, and pending approval state. | `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`, `apps/desktop/src/pages/Chat.tsx`, `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx` | Focused desktop tests plus typecheck passed. |
| F5.2 Action-bound suggestions | Complete | 100% | Let safe suggestions either fill the composer or trigger a structured local action when the action is unambiguous and non-destructive. | `Chat.tsx`, suggestion/action mapping helpers, related tests. | Tests for fill-only versus structured-action suggestions passed. |
| F5.3 Queued follow-up while streaming | Complete | 100% | Allow a selected suggestion to queue behind an active response instead of being lost or disabled. | Chat stream state, composer state, suggestion tests. | Focused queue/visibility tests plus typecheck passed. |
| F6.1 Command chips | Complete | 100% | Add compact command chips for review, architecture, tests, PR insight, and ADO insight without crowding the input. | Composer area in `Chat.tsx`, possible component extraction. | Component tests and typecheck passed. |
| F6.2 Composer state polish | Complete | 100% | Improve disabled/loading/keyboard states around composer, command chips, model selector, and queued follow-up. | Composer area in `Chat.tsx`, conversation input components. | Component tests and typecheck passed. |
| F6.3 Composer Playwright QA | Complete | 100% | Verify command chips, queued notice, pending approval notice, model selector, and send/stop controls in the running app. | Playwright scripts or manual QA notes. | Playwright chat layout/composer scenarios passed. |
| F10.1 Artifact part renderer | Complete | 100% | Render artifact conversation parts as compact chat-linked result cards before building the full side workspace. | `ConversationPartRenderer`, artifact tests, tracker. | Artifact parts render as result cards with type labels, streaming/ready/error states, future workspace context, focused tests, and typecheck passed. |
| F10.2 Artifact workspace shell | Complete | 100% | Add the non-invasive side workspace shell and selection state for artifact cards without yet implementing full artifact content rendering. | `ConversationPartRenderer`, `Chat.tsx`, Playwright chat layout test. | Artifact cards can select a result, auto-open the right panel, and reveal a scoped Result workspace shell; focused tests, typecheck, and Playwright passed. |
| F10.3 Artifact content rendering | Complete | 100% | Render first-class Mermaid, markdown/report, and text artifact content inside the workspace shell. | Artifact workspace component, renderer helpers, tests. | Selected Mermaid, markdown/report, and text artifacts render useful content in the workspace; preview types show a clear unavailable-preview state; typecheck and Playwright passed. |
| F10.4 Persisted PR insight artifact loading | Complete | 100% | Connect saved PR insight artifact records to the Conversation artifact workspace without making the chat bubble carry the full report every time. | PR insight artifact APIs, Chat artifact lookup, workspace shell. | Saved PR insight sources can open in the workspace, load persisted records, show loading/error states, and avoid lookups for ordinary inline artifacts; focused tests, typecheck, and Playwright passed. |
| F10.5 Mermaid rendering and artifact actions | Complete | 100% | Add a safe first-pass Mermaid rendering path plus copy/export actions for artifact content. | Artifact workspace component, Mermaid dynamic renderer, clipboard/export tests. | Mermaid diagrams render through a safe dynamic import, parse errors keep source visible, and copy plus browser download/export actions are Playwright-tested. |
| F7.1 Approval decision panel polish | Complete | 100% | Replace the old fixed blue approval card with an evidence-first decision panel that shows risk, tool scope, command preview, next boundary, and compact confirm/skip controls. | `apps/desktop/src/pages/Chat.tsx`, `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`, `PRODUCT.md` | Approval evidence tests, timeline tests, desktop typecheck, and Chat Playwright QA passed. |
| F7.2 Result workspace visual system polish | Complete | 100% | Bring the Result workspace, artifact states, Mermaid preview, saved-source fallback, and artifact actions into the same restrained workbench language as approvals. | `apps/desktop/src/pages/Chat.tsx` | Desktop typecheck and Chat Playwright QA passed, including Mermaid, copy, download, persisted PR insight, error, and overflow scenarios. |
| F7.3 Response block visual system polish | Complete | 100% | Align markdown-adjacent response blocks, grouped references, inline tool calls, inline approvals, artifact cards, code controls, and source cards with the same restrained evidence-block language. | `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx` | Conversation renderer tests, focused conversation tests, desktop typecheck, and Chat Playwright QA passed. |
| F7.4 Timeline and composer visual system polish | Complete | 100% | Make timeline rows, suggestion chips, command chips, composer notice, and input controls match the same workbench language. | `ExecutionTimeline`, `SuggestionReplyBar`, composer area in `Chat.tsx`, `index.css` | Timeline rows, suggestion chips, command chips, composer notice, approval evidence, composer input, model menu, branch menu, commit menu, and input-panel popover behavior now share the restrained workbench language; focused component tests, typecheck, Playwright Chat QA, and desktop build passed. |
| F8.1 Streaming stability pass | Partial | 95% | Harden long streamed answers, scroll behavior, reference streaming, tool lifecycle streaming, cancellation, errors, resume/restore, and finalization. | `packages/core/src/chatPlanner.ts`, `packages/core/src/chatUiStream.ts`, `packages/daemon/src/chatSession.ts`, `apps/desktop/src/api.ts`, `apps/desktop/src/api.test.ts`, `apps/desktop/src/chatBubbles.ts`, `apps/desktop/src/chatBubbles.test.ts`, `apps/desktop/src/chatScroll.ts`, `apps/desktop/src/chatScroll.test.ts`, `apps/desktop/src/pages/Chat.tsx`, `tests/e2e/chat-layout.spec.ts` | Parts-only streamed assistant finalization now avoids duplicate final bubbles, final sources still attach after UI `text-end`, UI `metadata-available` chunks merge reference/action/risk metadata into the active answer, final `done` can merge back into the matching assistant even after tool bubbles follow it, streamed tool lifecycle events carry stable `toolCallId`, incoming stream/tool content respects scroll intent, delayed responses do not yank the user away from manually scrolled history, Stop clears active streaming state while ignoring late responses from aborted requests, UI-stream-only `finish` releases the composer without a legacy `done`, interrupted streaming drafts restore as stable completed text, legacy plus UI-stream error events dedupe while restoring the composer, text deltas continue appending to the active assistant answer even when tool-output cards arrive between text chunks, and live real-daemon/model long-answer QA completed without current-answer errors. Focused tests, desktop typecheck, Playwright Chat QA, and live local app QA passed. Live real-backend interrupted-stream resume QA remains. |

### Phase Gate Checklist

Use this gate list to decide whether the project is actually moving toward the
ideal product, not merely adding UI.

| Gate | Required Product Behavior | Current State | Exit Signal |
| --- | --- | --- | --- |
| G1 Response blocks | Bot responses support text, markdown, code, references, tool evidence, approvals, and artifacts as typed parts. | Partial | `Chat.tsx` delegates most rendering to typed part components. |
| G2 Source-grounded intelligence | Architecture and review answers cite actual repo files, diff hunks, and external sources when used. | Partial | Manual prompts no longer produce generic "provide more info" answers. |
| G3 Observable process | The UI shows inspected files, commands, arguments, outputs, errors, and approval scope without hidden chain-of-thought. | Partial | `Review my changes` and `stage/commit/push` show evidence before action. |
| G4 Scope control | The agent stops at the user-requested workflow boundary. | Partial | `stage, commit and push` never creates PRs or links work items unless asked. |
| G5 Efficient continuation | The composer suggests useful next steps based on structured state, not static templates. | Partial | Suggestions change with workflow phase and disappear when irrelevant. |
| G6 Rich results | Long architecture, PR insight, and review outputs can open as artifacts outside the chat bubble. | Partial | Mermaid/report/text artifacts and persisted PR insight reports render in a result workspace. |
| G7 Production QA | The above behavior is covered by focused tests and browser/manual scenarios. | Partial | Desktop test/typecheck/build plus documented Playwright/manual QA pass. |

## Execution Board

This board is the short-term operating view. Update it before or after each
implementation batch.

| Order | Work Package | Status | Completion | Reuse Target | Exit Criteria |
| --- | --- | --- | ---: | --- | --- |
| 1 | Stabilize streaming Markdown and partial code fences. | Complete | 100% | Streamdown behavior, `react-markdown`, Shiki. | Unterminated fences render as code while streaming; no duplicate final content; tests pass. |
| 2 | Add source/reference blocks for repo and web evidence. | In progress | 75% | AI SDK source parts, Open WebUI citations, assistant-ui source-url parts. | Repo-specific answers show local file refs; web answers show URL/domain/snippet cards. |
| 3 | Build execution timeline grouping. | In progress | 74% | assistant-ui ToolGroup. | Tool start/output/end/approval render as one grouped observable process. |
| 4 | Make Git review and Git actions evidence-aware. | Partial | 60% | Existing Git tools plus AI SDK tool lifecycle pattern. | Review uses diff details; stage/commit/push shows exact args and stops at requested scope. |
| 5 | Add contextual quick replies above input. | Partial | 85% | assistant-ui composer, Open WebUI follow-up behavior. | Suggestions appear for architecture, review, auth, PR insight, index states, workflow phases, and source metadata; safe suggestions can trigger typed workspace actions; busy-time selections are queued. |
| 6 | Polish Conversation visual system. | Partial | 68% | Local `impeccable`, `minimalist-ui`, and `redesign-existing-projects` skills. | Bubbles, timeline, approvals, input, and references share one compact workbench style. |
| 7 | Add artifact/result workspace. | Partial | 60% | Open WebUI artifacts, LibreChat artifacts, AI Elements generative UI. | Mermaid/report artifacts and persisted PR insight records can open outside the normal message bubble. |
| 8 | Full browser QA and regression suite. | Not started | 0% | Local app QA, Playwright, and focused tests. | Manual and Playwright scenarios pass; desktop test/typecheck/build pass. |

## Detailed Execution Plan

### Stage A: Response Foundation

Goal:

Make the bot response capable of rendering real developer content.

Tasks:

- Keep `ConversationPart` as the stable boundary for UI rendering.
- Finish Markdown and code rendering.
- Stabilize partial streamed code fences.
- Keep code block copy, language label, Shiki highlighting, and long-code
  collapse behavior.
- Keep unsafe HTML sanitized.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

### Stage B: Grounded Answers

Goal:

Make repository and web claims visibly grounded.

Tasks:

- Add `ReferenceBlock` for local files.
- Add `WebResultBlock` for external sources.
- Add source summary strips below relevant answers.
- Make architecture answers cite project files.
- Make change reviews cite modified files and diff hunks.
- Add tests for source rendering.

Verification:

- Ask `Explain this project architecture`.
- Ask `Review my changes`.
- Confirm answers cite local files or web results when making specific claims.

### Stage C: Observable Execution

Goal:

Replace template-like process cards with evidence-first workflow UI.

Tasks:

- Build grouped `ExecutionTimeline`.
- Show tool name, state, args, output summary, errors, approvals, and recovery.
- Show exact Git command options and selected paths before approvals.
- Keep completed low-value details collapsed.
- Auto-expand active or failed steps.
- Stop workflow planning at the user's requested scope.

Verification:

- `Review my changes` shows diff-aware analysis.
- `stage changes, commit and push` stops after push unless PR creation is
  explicitly requested.
- No workflow step is suggested solely because it exists in a template.

### Stage D: Composer And Suggestions

Goal:

Make the user efficient without adding clutter.

Tasks:

- Add suggestion bar above the input.
- Add context-aware suggested replies for architecture, review, auth failure,
  PR insight, and index refresh.
- Hide suggestions while typing.
- Add compact command chips for common workflows.
- Preserve model selector behavior for built-in and user-added APIs.

Verification:

- Suggestions are useful and context-specific.
- Keyboard-only usage still works.
- The input does not visually crowd the Conversation page.

### Stage E: Artifacts And Rich Results

Goal:

Move long structured outputs into a result workspace.

Tasks:

- Add artifact part rendering.
- Add side panel or split workspace for Mermaid, markdown reports, PR insight
  tables, and generated review summaries.
- Link artifacts from chat messages.
- Keep artifacts scoped to project link and conversation.

Verification:

- Architecture answer can open a Mermaid diagram artifact.
- PR insight can open a structured report artifact.
- Chat history keeps artifact references.

### Stage F: Final UX Hardening

Goal:

Make the Conversation page feel finished and reliable.

Tasks:

- Align typography, spacing, borders, and muted semantic colors.
- Add hover, active, focus, loading, empty, and error states.
- Preserve scroll position during streaming.
- Run browser QA at common desktop widths.
- Run full desktop test/typecheck/build.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

## Open-Source Chatbot Architecture Benchmark

Benchmark date: `2026-06-13`

This benchmark exists to keep the Conversation workbench aligned with the
strongest current open-source agent UI patterns, while still fitting this
project's React/Vite/Tauri desktop architecture.

| Project / Ecosystem | Source | Architecture Pattern | What To Apply Locally | Reuse Mode |
| --- | --- | --- | --- | --- |
| Vercel AI SDK, Vercel Chatbot, AI Elements | `https://ai-sdk.dev`, `https://github.com/vercel/chatbot`, `https://elements.ai-sdk.dev` | `UIMessage.parts`, provider-agnostic streaming, tool-call parts, source-document/file parts, composable AI UI primitives. | Use a typed conversation part model, streaming-aware part updates, tool-call states, and source/reference parts. | Copy/adapt architecture and selected component logic, not the Next.js app shell. |
| assistant-ui | `https://github.com/assistant-ui/assistant-ui`, `https://www.assistant-ui.com` | Production React chat runtime, markdown renderer, tool groups, approval states, chain-of-thought/process accordion, rich composer patterns. | Reuse grouped tool timeline, approval block states, markdown/code rendering conventions, and composer affordances. | Copy/adapt small component patterns after checking license and fit. |
| AG-UI / CopilotKit | `https://docs.ag-ui.com`, `https://www.copilotkit.ai` | Event-based agent/user protocol for streamed agent events, tool calls, state, and human-in-the-loop interaction. | Treat tool execution, approvals, frontend state, retries, and user steering as first-class UI events instead of plain assistant text. | Copy/adapt event semantics and state-machine ideas, not as an external protocol dependency yet. |
| Open WebUI | `https://github.com/open-webui/open-webui`, `https://docs.openwebui.com/features/` | Multi-model chat, files, web search with citations, RAG citations, knowledge collections, artifacts, message queue. | Add first-class citations, repository index status, knowledge/source blocks, queued message behavior, and future artifact workspace. | Reuse product behavior and data model ideas; direct frontend code reuse is less likely because stack differs. |
| LibreChat | `https://github.com/danny-avila/librechat`, `https://www.librechat.ai/docs/features/artifacts` | Agent-oriented chat with artifacts, web search, rerankers, code artifacts, multi-response streaming, provider routing. | Add artifact/result workspace planning, web-search result cards, and multi-result streaming as later phases. | Reuse architecture ideas and selected logic where compatible. |

Benchmark-driven decisions:

- Conversation output should move toward typed `message.parts`, not one
  assistant text string plus scattered metadata.
- The renderer should become a registry of part renderers, so adding code,
  references, tool approvals, artifacts, or suggestions does not keep making
  `Chat.tsx` more complex.
- Tool execution should render as grouped observable evidence, similar to
  assistant-ui `ToolGroup`: tool input, running state, result, error, and
  approval are one coherent group.
- "Thinking" UI must not expose hidden chain-of-thought. It should show
  observable process: files inspected, commands planned, command arguments,
  tool output summaries, risk, and next action.
- Citations are mandatory for repository analysis and web/search answers:
  local file references, source snippets, URLs, domains, and result summaries
  should be rendered as structured parts.
- Artifacts should be planned as a later side-panel/workspace capability for
  Mermaid diagrams, generated review reports, PR insight summaries, and code
  or HTML results.
- The current app should selectively copy/adapt mature logic instead of
  adopting a full external chat framework as a runtime dependency.
- Quick replies and composer actions should be metadata-driven. Current
  mainstream agent UI libraries separate message text from tool state, sources,
  approval state, and user interaction controls; local suggestions should follow
  that same separation.

Refresh log:

| Date | Finding | Local Decision |
| --- | --- | --- |
| 2026-06-13 | Vercel AI SDK still treats `UIMessage` as the UI state source for message history, metadata, data parts, and contextual information. AI SDK 6 also emphasizes agents, tool approval, MCP, DevTools, reranking, and richer tool improvements. | Keep `ConversationPart` as the frontend state boundary and leave room for approvals, source parts, and tool-call state transitions. |
| 2026-06-13 | assistant-ui has moved source examples toward `source-url` parts and recommends grouped reasoning/tool-call UI with `MessagePrimitive.GroupedParts`; legacy ChainOfThought is no longer the preferred new API. | Build local grouped observable-process UI rather than exposing hidden reasoning; model local/web references as source parts. |
| 2026-06-13 | LibreChat and Open WebUI continue to converge on artifacts, web search, citations/RAG, files, agents, and MCP. | Keep artifacts as Phase 10, but define the `artifact` part now so the data model will not need another rewrite. |
| 2026-06-13 | AI SDK tool calling documentation treats approval as a first-class tool execution control, and Open WebUI emphasizes message queue, citations, RAG, artifacts, and isolated iframe rendering for rich content. | Tool and approval events now need structured parts before visual grouping is refined. Artifact rendering must later include sandboxing rules. |
| 2026-06-13 | assistant-ui `ToolGroup` recommends grouping tool-call parts with `MessagePrimitive.GroupedParts`, auto-expanding while active, and rendering fallback tool details with args, result, error, and approval controls. | Added local consecutive tool-call grouping helpers and moved `ExecutionLog` toward reading structured `tool_call` parts first. |
| 2026-06-13 | Vercel introduced Streamdown as a streaming-first Markdown renderer powering AI Elements Response, while assistant-ui Markdown continues to use `@assistant-ui/react-markdown`, `remark-gfm`, code headers, and copy affordances. | Implemented the planned low-risk `react-markdown` stack now; keep Streamdown as a future Phase 8 streaming/performance upgrade candidate. |
| 2026-06-13 | Streamdown's current docs emphasize AI streaming markdown, `parseIncompleteMarkdown` repair for incomplete markdown, and Shiki/copy behavior for code blocks. | Copied the most urgent behavior locally by stabilizing unclosed backtick and tilde code fences during render without mutating the streamed source text. |
| 2026-06-13 | AI SDK documents `source-url` and `source-document` as message parts, assistant-ui exposes a Sources component for URL source parts, and Open WebUI/LibreChat emphasize citations for RAG, web search, and file search. | Added typed `sources` metadata and source part normalization so final assistant responses and restored history can render repository and web references as first-class blocks. |
| 2026-06-13 | AI SDK stream protocols and streaming custom data docs reinforce that source references should travel as structured message parts, while Open WebUI/LibreChat emphasize citations for transparent document/file grounding. | Added `chatContextSources` so repository context now emits structured `source_document` metadata, then merged those sources into final assistant metadata in the daemon session flow. |
| 2026-06-13 | MUI X Chat also treats sources/citations as typed message parts for URL references and document excerpts, while LibreChat exposes citation limits such as max total citations and max citations per file. | Added diff hunk source extraction, per-file source limits, and grouped reference rendering so changed-code evidence appears as compact document excerpt citations. |
| 2026-06-13 | assistant-ui ToolGroup and ToolFallback emphasize grouped tool calls, auto-expanded approval states, visible args/results, and approval controls attached to the tool state. CopilotKit/AG-UI treats tools, human confirmation, and frontend state as first-class streamed UI events. | Added local `ApprovalEvidence` rendering for pending approvals so write actions expose command preview, args, workflow boundary, readiness, and preflight evidence before confirmation. |
| 2026-06-13 | AI SDK tool usage docs continue to emphasize typed tool parts and state-specific rendering, while AG-UI frames backend tool outputs, approvals, retries, and steering as first-class frontend events. | Reused the local command-preview logic in `ExecutionTimeline` so completed tool rows now expose command/scope evidence, not only pending approvals. |
| 2026-06-13 | Current AI SDK docs describe assistant messages with typed tool parts and state-specific rendering. assistant-ui documents ToolGroup/ToolFallback as first-class UI for grouped tool calls, running states, cancelled states, and approval states. AG-UI describes an event-based protocol between agents and user-facing apps, with tools covering information requests, external actions, and human confirmation. | Next implementation batch will upgrade quick replies from text-matching to structured workflow/source/tool metadata so the composer follows the same agent UI architecture direction. |
| 2026-06-13 | assistant-ui and AG-UI both reinforce that user steering should be connected to the current tool/workflow state rather than inferred only from assistant prose. | Implemented structured quick-reply derivation from workflow kind/phase, actions taken, source types, and pending approval state; retained text matching only as fallback. |
| 2026-06-13 | AI SDK describes automatically executed client tools separately from client tools that require user interaction; assistant-ui changelog now surfaces AI SDK v6 tool approvals as first-class tool component state; AG-UI best practices keep sensitive actions under frontend/application control. | Added typed suggestion actions: `fill_composer`, safe `workspace_action`, and `requires_approval`. Only read-like suggestions route to workspace actions; write or remote-changing suggestions remain approval-gated or composer-fill. |
| 2026-06-13 | Open WebUI-style message queue behavior remains useful for active assistant runs, while agent UI protocols keep sensitive actions under explicit frontend control. | Added queued follow-up handling for busy/streaming states: suggestions stay visible while busy, selected suggestions show a queue notice, safe workspace actions run only after idle, and protected suggestions still only fill the composer. |
| 2026-06-13 | assistant-ui composer patterns and current agent UI examples favor lightweight command affordances that reuse the same tool/action state boundary as the rest of the chat UI. | Added compact command chips above the composer using the same typed action model as suggestions, with safe workspace routing and approval-safe disabled behavior. |

## Overall Frontend UX Status

| Area | Status | Completion | Notes |
| --- | --- | ---: | --- |
| Conversation UX plan | Complete | 100% | This tracker defines the execution phases and acceptance criteria. |
| Open-source chatbot benchmark | Complete | 100% | Benchmarked Vercel AI SDK/Chatbot/AI Elements, assistant-ui, Open WebUI, and LibreChat. |
| Bot response block architecture | Partial | 68% | `ConversationPart` model, legacy adapter, streaming text merge, renderer boundary, tool-call parts, approval parts, grouped tool helpers, part-aware `ExecutionLog`, compact artifact cards, and focused tests now exist. Full artifact workspace behavior is still pending. |
| Markdown and code rendering | Partial | 90% | `react-markdown`, `remark-gfm`, `rehype-sanitize`, and `shiki` are installed. Markdown, GFM tables/lists/links, inline code, code fences, copy support, async highlighting, long-code collapse, and partial fence stabilization render in `ConversationPartRenderer`. Browser QA and optional Streamdown comparison remain. |
| References and source grounding | Partial | 78% | `source_document` and `source_url` parts now have typed metadata flow, final-response normalization, history restoration, repository-context source generation, project-structure source signals, daemon source merging, diff hunk source extraction, `repo_refresh_index` contextSources, grouped reference rendering, and focused tests. Browser QA and real web/search source ingestion remain. |
| Execution timeline | Partial | 84% | Added `ExecutionTimeline`, `ApprovalEvidence`, and row-level pending approval attachment for the exact matching tool action. Tool status, command previews, input evidence, output summaries, live output, workflow boundary, readiness, preflight evidence, approval/tool grouping, and restrained workbench visual surfaces now have focused tests and Playwright smoke coverage. Richer Git diff evidence still needs work. |
| Quick reply suggestions | Partial | 85% | Added `SuggestionReplyBar` above the composer with context-derived suggestions for review, architecture, auth recovery, PR, index, source, and workflow phase contexts. Suggestions carry typed action intent, safe read actions can route to workspace actions, and busy-time selections queue visibly until idle. |
| Input command surface | Partial | 91% | Model selector, project link selector, compact command chips, queued notice, and composer state notice exist; composer/model menus now use the same workbench control language and the input panel no longer clips composer popovers. Playwright composer QA covers chip density, composer-fill routing, approval notice, restored running workflows, queued follow-up cancellation, and overflow checks. |
| Visual system refinement | Partial | 68% | `impeccable` is now usable with `PRODUCT.md`; pending approval cards, the Result workspace, response blocks, grouped references, inline tool calls, inline approvals, artifact cards, timeline rows, suggestion chips, command chips, approval evidence, and composer/menu controls now use evidence-first restrained workbench surfaces. Broader live visual screenshots and light/dark manual review still need coverage. |
| Streaming UX | Partial | 95% | Typed UI chunks exist; streaming markdown keeps partial code fences renderable, parts-only streamed assistant finalization avoids duplicate final bubbles, UI `metadata-available` chunks merge sources before final `done`, final metadata/sources attach after UI text-end even when tool bubbles arrive before `done`, streamed tool lifecycle chunks carry stable `toolCallId`, tool-output cards can appear between text deltas without splitting the assistant answer, UI-stream-only `finish` releases the composer without legacy `done`, Stop clears active stream state and ignores late responses, legacy plus UI-stream errors dedupe and release the composer, delayed responses no longer yank the user from historical scroll positions in Playwright browser QA, and live real-daemon/model long-answer QA restores the composer with no current-answer error. Live real-backend interrupted-stream resume browser QA still needs hardening. |
| Artifacts and result workspace | Partial | 78% | Compact artifact cards render in chat, selecting an artifact opens the right panel, the Result workspace renders Mermaid diagrams, Mermaid source, markdown reports, text artifacts, persisted PR insight records, and copy/download actions. Richer preview sandboxing is still pending. |
| Test coverage | Partial | 96% | Existing tests now cover finalization, text-to-part conversion, streaming merge, metadata source normalization, final metadata/source attachment after UI text-end, final metadata/source attachment when a tool bubble follows the streamed answer, repository-context source generation, project-structure source signals, diff hunk source extraction, `repo_refresh_index` contextSources, grouped reference rendering, daemon workflow regression, tool-call upsert, streamed tool output, stable UI-stream tool call ids, streaming SSE parsing before response close, approval normalization, grouping helpers, command preview evidence, exact row-level approval-to-tool render attachment, structured suggestion derivation, typed suggestion action safety, queued suggestion visibility, command-chip derivation/rendering, composer state notice priority, restored workflow busy state, suggestion/action-kind rendering hooks, renderer branches, GFM markdown, code fences, unsafe HTML sanitization, long-code controls, unterminated streaming fences, artifact result cards across ready/streaming/error states, selectable artifact cards, Result workspace shell browser behavior, rendered Mermaid diagrams, Mermaid render errors with source fallback, Mermaid/markdown/text artifact workspace content, persisted PR insight artifact loading/error/ordinary-artifact bypass behavior, artifact copy and browser download behavior, and Playwright Chat layout/composer coverage for command chips, composer-fill routing, approval notice, restored running workflow lockout, queued follow-up cancellation, UI-chunk-only tool lifecycle streaming, long markdown plus source/tool-output streaming, UI-stream-only finish cleanup, Stop/late-response cancellation, restored interrupted streaming drafts, legacy plus UI-stream error dedupe, right-panel/model-menu, and narrow-screen overflow. Broader live-agent browser scenarios are still missing. |

## Phase Summary

| Phase | Name | Status | Completion | Primary Goal |
| --- | --- | --- | ---: | --- |
| 0 | Frontend Audit, Skill Selection, And Benchmarking | Complete | 100% | Identify the right local skills, frontend upgrade direction, and upstream chatbot architecture references. |
| 1 | Conversation Part Architecture | Partial | 68% | Create a typed `message.parts`-style model and renderer boundary. |
| 2 | Markdown And Code Rendering | Partial | 90% | Render markdown, GFM, and code blocks safely and beautifully. |
| 3 | References And Source Grounding | Partial | 78% | Support internal code refs and external search/web/result refs. |
| 4 | Execution Timeline And Evidence UI | Partial | 70% | Replace template-like process cards with a clear observable timeline. |
| 5 | Contextual Quick Replies | Partial | 85% | Add useful suggested replies above the input when context calls for them. |
| 6 | Conversation Input Upgrade | Partial | 88% | Turn the input into a compact agent command surface. |
| 7 | Visual System Refinement | Partial | 68% | Apply restrained premium workbench styling across Conversation. |
| 8 | Streaming UX Hardening | Partial | 95% | Make streaming markdown/code/tool/reference/error output stable and non-duplicative. |
| 9 | Tests And Browser QA | Partial | 20% | Add focused tests plus Playwright/manual browser verification for the full Conversation flow. |
| 10 | Artifacts And Result Workspace | Partial | 72% | Add a side-panel/workspace for diagrams, reports, PR insights, and rich generated outputs. |

## Phase 0: Frontend Audit, Skill Selection, And Benchmarking

Status: `Complete`

Completion: `100%`

Goal:

Choose the correct local Codex skills and define the product direction for
Conversation frontend work.

Completed:

- Scanned local skills under `C:\Users\15492\.codex\skills`.
- Selected `redesign-existing-projects` and `minimalist-ui` as the primary
  implementation guides.
- Selected `high-end-visual-design` for restrained micro-interaction polish.
- Confirmed `gpt-taste` is not appropriate for the core workbench flow except
  isolated motion-heavy moments.
- Checked current `@cicd-agent/desktop` dependencies.
- Benchmarked current leading open-source chatbot/agent UI projects:
  Vercel AI SDK/Chatbot/AI Elements, assistant-ui, Open WebUI, and LibreChat.
- Converted benchmark findings into local phases and reuse targets.

Acceptance criteria:

- Local skills are documented.
- Recommended skill combination is documented.
- Current frontend dependency baseline is documented.
- Open-source chatbot architecture benchmark is documented.
- Execution phases are documented.

Verification:

- Manual inspection of `C:\Users\15492\.codex\skills`.
- Manual inspection of `apps/desktop/package.json`.

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-12 | Created this tracker and selected the frontend UX skill stack. |
| 2026-06-12 | Added upstream chatbot architecture benchmark and updated phases toward typed conversation parts, citations, tool groups, and artifacts. |

## Phase 1: Conversation Part Architecture

Status: `Partial`

Completion: `82%`

Goal:

Introduce a structured part model for assistant responses so Conversation can
render text, markdown, code, references, web results, tool calls, tool
approvals, files, artifacts, process evidence, and suggestions without treating
every answer as one plain text bubble.

This should follow the same architectural direction as Vercel AI SDK
`UIMessage.parts` and assistant-ui message/tool components, adapted to this
project's existing bubble and stream event model.

Target files:

- `apps/desktop/src/chatBubbles.ts`
- `apps/desktop/src/pages/Chat.tsx`
- New component candidates:
  - `apps/desktop/src/components/conversation/BotResponseRenderer.tsx`
  - `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`
  - `apps/desktop/src/components/conversation/blocks/*`

Proposed part model:

```ts
export type ConversationPart =
  | { type: "text"; text: string }
  | { type: "markdown"; markdown: string }
  | { type: "code"; language?: string; code: string; title?: string; fileName?: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      state: "input-streaming" | "input-available" | "running" | "result" | "error";
      input?: unknown;
      output?: unknown;
      summary?: string;
    }
  | {
      type: "tool_approval";
      approvalId: string;
      toolName: string;
      description: string;
      args: Record<string, unknown>;
      riskLevel: "low" | "medium" | "high";
    }
  | { type: "source_document"; sourceId: string; title: string; file?: string; line?: number; snippet?: string }
  | { type: "source_url"; sourceId: string; title: string; url: string; domain?: string; snippet?: string }
  | { type: "file"; fileName: string; mediaType?: string; url?: string; localPath?: string }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
      status: "streaming" | "ready" | "error";
    }
  | { type: "process_step"; status: "running" | "done" | "error"; label: string; detail?: string }
  | { type: "suggested_reply"; id: string; label: string; message: string }
  | { type: "metadata"; riskLevel?: string; actionsTaken?: string[]; suggestions?: string[] };
```

Work items:

- Define `ConversationPart` and renderer props. `Done`
- Add adapter from current bubble model to block model. `Done`
- Add a part renderer registry:
  - `text`
  - `markdown`
  - `code`
  - `tool_call`
  - `tool_approval`
  - `source_document`
  - `source_url`
  - `artifact`
  - `process_step`
  - `suggested_reply`
- Preserve backward compatibility with existing text bubbles. `Done`
- Ensure streamed assistant deltas append to the active markdown block. `Done`
- Keep metadata and approval proposal rendering separate from message content.
- Keep current names as temporary aliases if that reduces migration risk. `Done`

Implemented:

- Added `ConversationPart` to `apps/desktop/src/chatBubbles.ts`.
- Added `conversationPartsFromAssistantBubble` for legacy assistant bubbles.
- Added `appendTextDeltaToConversationParts` so streaming text updates one
  active markdown part.
- Added `ConversationPartRenderer` in
  `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`.
- Routed existing assistant bubbles through `ConversationPartRenderer`.
- Kept current `MetaPanel`, approval cards, and tool cards intact to avoid a
  risky all-at-once rewrite.
- Added model helpers for `tool_call` parts:
  `toolCallPartFromSnapshot`, `upsertToolCallPart`, and
  `appendToolOutputDeltaToConversationParts`.
- Added model helper for `tool_approval` parts:
  `toolApprovalPartFromSnapshot`.
- Routed legacy `tool_start`, `tool_output_delta`, `tool_end`, and
  `approval_required` events into structured parts while preserving existing
  `ExecutionLog` and pending approval cards.
- Preserved tool parts during direct workflow action rendering and historical
  session loading.
- Added `toolCallPartsFromConversationParts`, `primaryToolCallPart`, and
  `groupConsecutiveToolCallParts`.
- Updated `ExecutionLog` to prefer `tool_call` parts for state, name, summary,
  output, and running/error detection while preserving legacy fallbacks.
- Added renderer static tests for markdown, tool call, approval, source,
  artifact, and hidden metadata behavior.

Acceptance criteria:

- Existing chat messages still render.
- New renderer can display markdown-like plain text through a part boundary.
- Streaming text updates one active response without duplicating final content.
- Unit tests cover block conversion and finalization.

Remaining:

- Move the visible timeline design from legacy bubble grouping to explicit
  grouped part rendering.
- Keep markdown/code rendering hardened through browser QA.
- Add source/citation parts from backend metadata in Phase 3.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts` | Passed, 7 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts` | Passed, 10 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx` | Passed, 14 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |

## Phase 2: Markdown And Code Rendering

Status: `Partial`

Completion: `95%`

Goal:

Assistant responses should support useful developer-facing formatting:
markdown, tables, lists, inline code, fenced code blocks, and copyable code.

Work items:

- Add markdown renderer dependencies. `Done`
- Add safe markdown renderer component. `Done`
- Add fenced code block rendering. `Done`
- Add copy button and language label. `Done`
- Add expand/collapse for long code blocks. `Done`
- Handle partial streaming code fences gracefully. `Done`
- Prevent long code lines from breaking layout. `Done`
- Evaluate assistant-ui markdown rendering conventions before implementing the
  final local renderer. `Done`
- Keep markdown rendering memoized enough for long streaming responses.

Implemented:

- Added `react-markdown`, `remark-gfm`, and `rehype-sanitize` to
  `@cicd-agent/desktop`.
- Replaced temporary `markdown` paragraph rendering with a `MarkdownContent`
  component in `ConversationPartRenderer`.
- Added GFM support for tables, lists, links, inline code, and fenced code.
- Added `CodeBlock` with language labels, bounded scrolling, and a copy
  button.
- Added static renderer tests for headings, lists, tables, links, inline code,
  code fences, and unsafe HTML sanitization.
- Added `shiki` dependency and async syntax highlighting for code blocks.
- Kept code blocks plain-text-first so streamed output is visible before
  highlighting finishes.
- Added long-code collapse/expand controls while keeping copy bound to the
  full original code block.
- Added tests for long-code collapsed rendering and short-code rendering.
- Added render-time streaming Markdown stabilization for unterminated backtick
  and tilde code fences, modeled after Streamdown's streaming-first behavior
  but implemented locally.
- Added tests proving unclosed code fences render as code while streaming and
  do not duplicate content after the final closing fence arrives.

Remaining:

- Browser QA for long streamed Markdown/code answers.
- Evaluate Streamdown only if the local renderer becomes fragile under real
  long-answer streaming.

Acceptance criteria:

- Markdown headings, lists, tables, links, inline code, and code fences render.
- Code blocks have copy support.
- Unsafe HTML is sanitized or ignored.
- Streaming partial markdown does not crash or duplicate content.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 16 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 18 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 21 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
```

Manual scenarios:

- Ask the bot for a markdown table.
- Ask the bot for TypeScript code.
- Ask the bot for a mixed explanation with bullets and code.

## Phase 3: References And Source Grounding

Status: `Partial`

Completion: `78%`

Goal:

Make code and web/source references first-class UI blocks.

Reference types:

- Internal local file references.
- Internal code snippets and line numbers.
- Tool result references.
- External web/search result references.
- Repository index or knowledge-base references.
- RAG/source citations for architecture, PR, and code review answers.

Work items:

- Add `ReferenceBlock`. `Partial`
- Add `WebResultBlock`. `Partial`
- Add grouped references section below assistant answers. `Done`
- Add compact "Referenced files" strip for code analysis responses.
- Ensure local paths are readable and clickable where supported by the app.
- Ensure external links are visually distinct and safe. `Done`
- Add a citation data shape compatible with `source_document` and `source_url`
  conversation parts. `Done`
- For repo answers, require at least one local file/source reference whenever
  the answer claims project-specific facts. `Partial`
- For web/search answers, show URL, domain, title, and snippet.

Implemented:

- Added `AssistantBubbleSource` and `sources` metadata to assistant bubble
  metadata.
- Added source normalization in `conversationPartsFromAssistantBubble` so
  `source_document` and `source_url` metadata becomes first-class
  `ConversationPart` output.
- Fixed final streamed responses so final metadata sources merge into existing
  streamed parts instead of being dropped.
- Added `sources` to the core `ChatPlannerResult` and the internal
  `agent_final` tool schema.
- Updated the core chat system prompt so project-specific answers should emit
  `source_document` entries and external-documentation answers should emit
  `source_url` entries.
- Persisted assistant `sources` through daemon chat session history.
- Restored sources in the desktop history loader so refreshed sessions keep
  their citations.
- Added focused tests for metadata-to-source-part conversion, streamed-part
  source merging, and `agent_final` source parsing.
- Added `chatContextSources` in `packages/core/src/chatContext.ts` so
  repository context can emit structured `source_document` metadata from
  changed files and relevant code/doc chunks.
- Merged context-generated sources into final assistant metadata in the daemon
  session flow, covering normal turns and continuation turns after approvals.
- Added focused tests for repository-context source generation and daemon chat
  workflow regression.
- Added diff hunk parsing in `chatContextSources` so change-review context can
  emit source references with path, starting line, and hunk snippet.
- Added per-file source limits inspired by LibreChat citation controls.
- Added project-structure source signals to `chatContextSources` so
  architecture/project-understanding answers can cite app/package/source/test
  files even when there is no diff.
- Added `contextSources` to the `repo_refresh_index` tool result and instructed
  the planner to copy relevant entries into final sources after refreshing the
  index.
- Updated `ConversationPartRenderer` to group consecutive
  `source_document`/`source_url` parts into one compact References section.
- Added renderer tests for grouped source display.

Remaining:

- Run browser QA for architecture and change-review prompts to verify source
  cards appear in the live Conversation page.
- Wire real web/search result ingestion into `source_url` parts once web search
  result metadata is available from tools.
- Add manual browser QA for architecture and change-review prompts.

Acceptance criteria:

- Assistant responses can show local files, line numbers, snippets, and URLs.
- Internal references do not look like external web citations.
- External references include title, domain/source, URL, and snippet where
  available.

Verification:

- Manual local code analysis prompt.
- Manual web/search result rendering once backend support exists.
- Unit tests for reference block rendering.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx` | Passed, 23 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatPlannerApproval.test.ts` | Passed, 17 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build` | Passed; refreshed core declarations used by daemon. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatContext.test.ts` | Passed, 5 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts` | Passed, 19 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatContext.test.ts test/chatPlannerApproval.test.ts` | Passed, 22 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx` | Passed, 23 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build` | Passed; refreshed core declarations used by daemon. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts` | Passed, 17 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test -- test/chatContext.test.ts` | Passed, 5 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 24 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build` | Passed; refreshed core declarations used by daemon. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck` | Passed. |

## Phase 4: Execution Timeline And Evidence UI

Status: `Partial`

Completion: `65%`

Goal:

Replace template-like process cards with a clearer, observable execution
timeline that shows what the agent actually inspected and executed.

Work items:

- Build `ExecutionTimeline`. `Partial`
- Group progress, tool start, output, tool end, approval, and final state.
- Show compact tool arguments. `Partial`
- Show expandable tool output.
- Show approval evidence before protected write actions. `Partial`
- Show evidence summaries for Git:
  - files inspected
  - diff summary
  - staged paths
  - branch/remote
- Show error states with recovery hints.
- Avoid fake internal reasoning. Show observable process and evidence only.
- Adapt assistant-ui `ToolGroup` behavior:
  - group consecutive related tool calls
  - auto-expand currently running tool groups
  - collapse completed low-value detail by default
  - keep approvals visually attached to the tool they approve
- Show exact command arguments and selected file paths before protected Git
  operations.

Implemented:

- Added `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`.
- Replaced the old inline execution log body in `Chat.tsx` with the new
  timeline component while preserving the existing grouped tool-bubble call
  site.
- Added visible tool state labels for preparing, ready, running, done, and
  error states.
- Added compact input evidence summaries for common Git/action args:
  `paths`, `branch`, `message`, `flags`, and `options`.
- Added expandable input, live output, and final output detail panels.
- Kept existing Git-specific output renderers by passing a render callback from
  `Chat.tsx`, avoiding a large renderer rewrite in this batch.
- Added focused tests for command input evidence, output summaries, live
  output, and error state rendering.
- Added a structured done result for confirmed `git_push` actions in commit
  workflows, so a requested `stage, commit, and push` flow stops after push
  instead of returning to LLM planning for PR/work-item/pipeline suggestions.
- Added a daemon workflow regression test for the push completion boundary.
- Added `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`.
- Pending approval cards now show:
  - command preview
  - selected paths
  - branch, target, remote, title, and commit message evidence
  - boolean flags such as `dryRun`, `setUpstream`, or `noVerify`
  - commit or PR workflow boundary text
  - push readiness summaries
  - branch/PR preflight summaries
- Added focused tests for Git add, Git push, and ADO PR approval evidence.
- Reused the `ApprovalEvidence` command preview helper inside
  `ExecutionTimeline`, so completed tool rows now show exact command previews
  when structured args or direct workflow commands are available.
- Added focused tests for completed timeline command previews from both
  structured Git args and raw direct-workflow command strings.
- Added `apps/desktop/src/chatRenderItems.ts` so rendering groups consecutive
  tools and attaches a following `pending_confirm` approval to that tool group.
- Updated Conversation rendering so pending approvals appear structurally below
  the related execution timeline, with a lightweight connector, instead of as
  fully standalone cards.
- Added focused tests for approval-to-tool-group render grouping.
- Added row-level pending approval support in `ExecutionTimeline`.
- Updated `Chat.tsx` so a pending approval is matched to the exact tool row by
  `pendingTool`; if no exact match exists, it falls back to the last tool in the
  group.
- Added Playwright smoke coverage proving a `git_add` approval appears on the
  `git_add` execution row inside the running Chat UI.

Remaining:

- Expand workflow-scope metadata beyond the push completion boundary so future
  timeline rows can show the requested endpoint directly.
- Show richer Git evidence:
  - staged versus unstaged split
  - branch and upstream
  - commit message source
- Add tests that prevent PR creation or work-item linking after a push unless
  the user explicitly requested that scope.
- Browser QA once a browser control tool is available.

Acceptance criteria:

- `Review my changes` shows status, diff inspection, and conclusion evidence.
- `stage/commit/push` shows inspected files and exact paths before approval.
- Tool rows can expand for details.
- Errors are visible and actionable.

Verification:

- Manual `Review my changes`.
- Manual `stage changes, commit and push`.
- Unit tests for timeline grouping.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 26 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test -- test/chatSessionWorkflow.test.ts` | Passed, 18 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 29 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 30 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 32 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx src/chatRenderItems.test.ts` | Passed, 6 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts` | Passed, 4 tests. |

## Phase 5: Contextual Quick Replies

Status: `Partial`

Completion: `65%`

Goal:

Show context-specific quick replies above the input box when they help the user
continue efficiently.

Example suggestions:

| Context | Suggested Replies |
| --- | --- |
| Architecture answer | `Show key files`, `Explain request flow`, `Find entry points` |
| Review changes | `Show detailed diff`, `Stage selected files`, `Generate commit message` |
| Auth failure | `Open Settings`, `Retry`, `Use PAT fallback` |
| PR insight | `Summarize risks`, `Create review comment`, `Open PR` |
| Index refreshed | `Explain architecture`, `Show indexed files`, `Refresh again` |

Work items:

- Add `SuggestionReplyBar`. `Partial`
- Derive suggestions from assistant metadata and current workflow state. `Partial`
- Hide suggestions when the user starts typing. `Done`
- Clicking suggestion should either send a message or trigger a structured
  workflow action. `Partial`
- Avoid generic static suggestions.
- Borrow composer behavior from assistant-ui and Open WebUI:
  - quick actions above input
  - command-like prompts for common workflows
  - queued follow-up while a long answer is streaming

Structured context plan:

| Step | Status | Input Signal | Output Behavior | Notes |
| --- | --- | --- | --- | --- |
| F5.1.1 | Done | `workflowKind`, `workflowPhase`, `pendingTool`, approval metadata. | Suggestions reflect the current workflow stage instead of scanning only the latest assistant text. | After push completion, suggestions stay inside push/commit review scope instead of drifting into PR/work-item/pipeline continuation. |
| F5.1.2 | Done | `actionsTaken`, `sources`, `source_document`, `source_url`. | Suggestions react to repository index, local file references, and external web/doc references. | After index refresh, suggestions include `Explain architecture` and `Show indexed files`; source metadata can suggest source-focused follow-ups. |
| F5.1.3 | Done | Auth and ADO credential metadata. | Suggestions show `Retry auth`, `Explain auth`, or `Use PAT fallback` only when relevant. | This avoids generic settings prompts. |
| F5.1.4 | Done | User command intent and current input state. | Hide suggestions when typing; keep them compact above the composer; support keyboard-friendly selection later. | This preserves the minimal workbench layout. |
| F5.2.1 | Done | Suggestion action type. | Some suggestions fill the composer; safe local actions can trigger structured workflows. | Destructive/write actions still require approval. |
| F5.3.1 | Done | Streaming/busy state. | User can queue a follow-up while the current answer streams. | Suggestions remain visible while busy; queued follow-ups show a compact notice and can be cancelled. |

Implemented:

- Added `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`.
- Added `deriveSuggestionReplies` for conservative context-based suggestion
  generation.
- Suggestions now appear above the composer when the input is empty and the
  app is not busy.
- Suggestions are hidden while typing, while busy, or while a protected action
  approval is pending.
- Added initial suggestion contexts:
  - architecture/project understanding
  - diff/change review
  - Azure DevOps auth recovery
  - PR insight/policy/work-item follow-up
  - repository index refresh
- Clicking a suggestion loads it into the composer for user review before send.
- Added focused tests for suggestion derivation and rendering.
- Extended `SuggestionReplyContext` with structured workflow, action, source,
  and pending approval fields.
- `Chat.tsx` now passes workflow kind, workflow phase, actions taken, source
  types, and approval metadata into suggestion derivation.
- Structured workflow/source/auth signals now take priority over text fallback.
- Added a regression test preventing PR, work-item, or pipeline continuation
  suggestions after the user only requested `stage, commit, and push`.
- Extended `SuggestionReply` with typed action intent:
  - `fill_composer`
  - safe `workspace_action`
  - `requires_approval`
- Routed safe read-like suggestions such as diff inspection, branch status, PR
  policy, PR work items, and PR insight to existing workspace actions.
- Kept protected write or remote-changing suggestions such as stage and push
  approval-gated instead of allowing direct execution from quick replies.
- Added queued follow-up state for suggestions selected while the assistant or
  workspace action is busy.
- Added a compact queued-follow-up notice above the composer with cancel
  support.
- Safe workspace-action suggestions run only after the active work becomes
  idle.
- Fill-composer and protected suggestions are loaded into the composer after
  idle instead of being auto-submitted.

Remaining:

- Add visual QA for suggestion density at narrow desktop widths.
- Add Playwright/manual QA for suggestion density, queued notice placement, and
  input crowding at narrow desktop widths.
- Browser/manual QA for suggestion placement and input crowding.

Acceptance criteria:

- Suggestions appear only when useful.
- Suggestions are relevant to current context.
- Suggestions do not cover or crowd the input.
- Suggestions disappear once the user begins typing.

Verification:

- Manual Conversation scenarios for architecture, Git review, auth failure,
  and PR insight.
- Component tests for suggestion visibility and click behavior.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 37 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 41 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 43 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 46 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |

## Phase 6: Conversation Input Upgrade

Status: `Partial`

Completion: `88%`

Goal:

Turn the input into a compact agent command surface without making it busy.

Work items:

- Improve multiline behavior.
- Keep model selector visible but compact.
- Add command chips for common actions:
  - `Review changes` `Done`
  - `Explain architecture` `Done`
  - `Run tests` `Done`
  - `PR insight` `Done`
  - `ADO policy` `Done`
- Show current project link and branch compactly.
- Improve disabled/loading states.
- Add attachment or context affordance if needed.
- Add future-friendly slots for:
  - `@` mentions for files, project links, PRs, or work items
  - `/` commands for common workflows
  - file attachment or repository context attachment
  - model/provider selection when user-added APIs exist

Implemented:

- Added `CommandChipBar` using the same typed action intent model as
  contextual suggestions.
- Added `deriveCommandChips` for compact composer commands.
- Added default chips:
  - `Review changes`
  - `Explain architecture`
  - `Run tests`
- Added ADO-aware chips when an Azure DevOps mapping exists:
  - `PR insight`
  - `ADO policy`
- Routed safe read-like chips to existing workspace actions.
- Kept commands that need planning as composer-fill actions.
- Disabled chips while an approval is pending so command chips cannot bypass
  protected operations.
- Hid command chips while the user is typing to keep the input compact.
- Added `deriveComposerStateNotice` to centralize pending approval, queued
  follow-up, and busy-state notice rules.
- Added an approval/busy/queued notice above the composer.
- Added `deriveComposerInputState` to centralize textarea, Send, attachment,
  and model-selector disabled states.
- Locked the composer while an approval is pending so typed drafts cannot start
  a second request before the user approves or cancels the current protected
  action.
- Composer disabled/working state now also respects restored
  `workflowState.status` values of `planning` and `running`, not only the local
  React `busy` flag.
- Queued follow-up behavior is now browser-tested from a restored running
  workflow: suggestions remain usable, selected suggestions show the queued
  notice, and cancellation clears the queue.
- Disabled attachment/context and model selector controls while busy or while
  approval is pending.
- Added focus-visible rings and disabled hover guards for command chips and
  suggestion buttons.
- Closed the model menu automatically when busy or approval-pending state
  begins.
- Added Playwright coverage for command chips, composer-fill routing, approval
  notice, disabled composer controls, and no visible horizontal overflow across
  normal and narrow desktop widths.

Remaining:

- Add keyboard navigation expectations for command chips.
- Decide whether `Run tests` should eventually become a structured workflow
  action or remain agent-planned text.

Acceptance criteria:

- The input remains easy to use with keyboard only.
- Common commands are discoverable.
- The user can see which project/model context is active.
- Disabled and loading states are clear.

Verification:

- Manual keyboard test.
- Manual project/model switching test.
- Desktop typecheck/build.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 51 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 55 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 4 Playwright tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/components/conversation/ConversationPartRenderer.test.tsx src/chatBubbles.test.ts` | Passed, 58 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx` | Passed, 26 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts` | Passed, 4 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx` | Passed, 28 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\.tools\pnpm.exe exec playwright test tests/e2e/chat-layout.spec.ts` | Passed, 5 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 62 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 65 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 6 Playwright tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after artifact content rendering. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 6 Playwright tests covering Mermaid, markdown, and text artifact workspace content. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after persisted PR insight artifact workspace loading. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 10 Playwright tests covering artifact content, persisted PR insight loading, lookup errors, and ordinary artifact bypass behavior. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 65 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after Mermaid artifact rendering. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright tests including Mermaid SVG rendering, Mermaid error fallback, and copy-content action. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 65 tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx` | Passed, 7 approval/timeline tests after approval decision panel polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after `impeccable`-guided approval card polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright tests including approval composer lockout and no-overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after Result workspace visual-system polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright tests including artifact workspace, Mermaid render/error states, copy/download actions, persisted PR insight, and no-overflow checks. |

## Phase 7: Visual System Refinement

Status: `Partial`

Completion: `68%`

Goal:

Apply a coherent workbench visual system across Conversation without turning it
into a decorative landing page.

Design constraints:

- Prefer restrained surfaces.
- Avoid nested cards inside cards.
- Keep border radii tight.
- Keep status colors semantic and muted.
- Use motion only to clarify state changes.
- Avoid heavy gradients, glassmorphism, and noisy animations.

Work items:

- Keep `PRODUCT.md` as the source of truth for `impeccable` audits and visual
  decisions.
- Refine chat bubble spacing and typography.
- Refine tool/timeline rows.
- Continue refining approval/action cards after the first approval decision
  panel pass.
- Refine input and quick reply chips.
- Add hover, active, focus, and loading states.
- Use CSS variables already present in `index.css`.
- Use `redesign-existing-projects` for targeted existing-app fixes,
  `minimalist-ui` for the workbench visual language, and `impeccable` for
  accessibility, responsive, motion, copy, and design-system hardening.

Acceptance criteria:

- Conversation feels consistent in light and dark themes.
- Timeline, response blocks, suggestions, and input share one visual language.
- Text never overlaps or overflows on common desktop widths.
- Motion is subtle and GPU-friendly.

Verification:

- Playwright screenshot/snapshot review at common desktop widths.
- Manual browser review at common desktop widths.
- Light and dark theme review.
- Desktop build.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx` | Passed, 7 focused approval/timeline tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after approval decision panel polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios including approval composer lockout and overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after Result workspace visual-system polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios including artifact workspace, Mermaid render/error states, copy/download actions, persisted PR insight, and overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx` | Passed, 14 renderer tests after response block visual polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after response block visual polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 65 focused conversation tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios including reference rendering, artifact workspace, approval composer lockout, and overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/SuggestionReplyBar.test.tsx src/components/conversation/ExecutionTimeline.test.tsx` | Passed, 32 timeline/suggestion tests after F7.4 polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after F7.4 timeline/composer polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 65 focused conversation tests after F7.4 polish. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios including command chips, queued follow-up, approval composer lockout, artifact workspace, references, and overflow checks. |

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-13 | Added `PRODUCT.md` so `impeccable` can be used with project-specific product context. |
| 2026-06-13 | Redesigned pending approval UI from a static blue card into a scoped decision panel with risk, tool, command-preview evidence, next-boundary text, and responsive decision controls. |
| 2026-06-13 | Polished the Result workspace surface, artifact empty/loading/error states, action buttons, Mermaid preview, and saved-source fallback into the same restrained workbench system. |
| 2026-06-13 | Polished response blocks in `ConversationPartRenderer`: grouped references, inline tool calls, inline approvals, source cards, artifact cards, and code actions now share the same evidence-block system. |
| 2026-06-13 | Polished F7.4 timeline and composer surfaces: timeline rows/details, suggestion chips, command chips, composer notice, and queued/approval/busy states now share the same restrained workbench controls. |

## Phase 8: Streaming UX Hardening

Status: `Partial`

Completion: `90%`

Goal:

Make streaming output stable, readable, and non-duplicative.

Work items:

- Keep active streaming response in one bubble.
- Stream markdown incrementally.
- Keep partial code fences readable.
- Add typing cursor only while active.
- Preserve scroll position:
  - auto-scroll only when near bottom
  - do not yank the user while reading history
- Merge final metadata into the active response.
- Avoid duplicate final assistant bubbles.
- Restore interrupted streaming drafts as stable completed text after page
  reloads or navigation resumes.
- Verify the frontend stream parser emits chunks incrementally as SSE response
  bytes arrive instead of waiting for response close.

Acceptance criteria:

- Long answers stream smoothly.
- Tool events appear in order while text continues.
- Finalization does not duplicate text.
- User scroll position is respected.
- A restored interrupted stream does not show a ghost typing state or disabled
  composer when no real stream is active.
- `chatStream` dispatches the first visible delta before the final `done`
  event or stream close.

Verification:

- Manual long answer prompt.
- Manual tool-heavy prompt.
- Unit tests for bubble finalization.

Latest verification:

| Date | Command | Result |
| --- | --- | --- |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts` | Passed, 17 streaming/finalization and conversation-part tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after parts-only streaming finalization hardening. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/chatRenderItems.test.ts src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx src/chatBubbles.test.ts` | Passed, 69 focused conversation tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatScroll.test.ts src/chatBubbles.test.ts src/chatRenderItems.test.ts src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx` | Passed, 74 focused conversation and scroll tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after scroll-intent hardening. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 11 Playwright Chat layout scenarios after scroll-intent hardening. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts` | Passed, 22 streaming/finalization/source metadata tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatScroll.test.ts src/chatBubbles.test.ts src/chatRenderItems.test.ts src/components/conversation/ConversationPartRenderer.test.tsx src/components/conversation/SuggestionReplyBar.test.tsx src/components/conversation/ApprovalEvidence.test.tsx src/components/conversation/ExecutionTimeline.test.tsx` | Passed, 78 focused conversation, reference metadata, and scroll tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after `metadata-available` source merge hardening. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts -g "renders tool lifecycle from UI stream chunks without legacy tool events"` | Passed after adding metadata-chunk source de-duplication coverage. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 13 Playwright Chat scenarios including UI-stream-only tool lifecycle rendering, metadata-source de-duplication, and Stop ignoring late responses. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after interrupted-stream draft restore hardening. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm playwright test tests/e2e/chat-layout.spec.ts -g "restores interrupted streaming drafts"` | Passed, focused Playwright coverage for restored streaming drafts. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 15 Playwright Chat scenarios including UI-stream-only tool lifecycle rendering, source metadata, Stop ignoring late responses, interrupted-stream draft restore, artifacts, and overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/api.test.ts` | Passed, `chatStream` emits `ui.chunk` text deltas as response chunks arrive before stream close. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/chatBubbles.test.ts src/components/conversation/ConversationPartRenderer.test.tsx src/chatScroll.test.ts` | Passed, 40 focused streaming/rendering/scroll tests. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after API streaming parser regression coverage. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 17 Playwright Chat scenarios including long streamed markdown with source/tool-output rendering, UI-stream-only finish release, Stop/late-response cancellation, interrupted-stream draft restore, artifacts, and overflow checks. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/api.test.ts` | Passed, 2 API streaming parser tests including arbitrary split SSE line buffering. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after split-chunk SSE parser coverage. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm playwright test tests/e2e/chat-layout.spec.ts -g "preserves manual history scroll"` | Passed, browser-level delayed-response scroll preservation coverage. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck` | Passed after adding the message-panel test id and scroll-preservation scenario. |
| 2026-06-13 | `.\scripts\windows\pnpm-project.ps1 exec pnpm e2e:chat` | Passed, 18 Playwright Chat scenarios including delayed-response scroll preservation. |
| 2026-06-13 | Live local app QA via repo-local Playwright script against `http://127.0.0.1:1420/#/chat?new=1` and real `http://127.0.0.1:8787/chat` | Passed for real-daemon/model long-answer path: `/chat` returned 200, first current-panel answer text appeared after about 5.6s, final answer was about 1.7k chars, Stop hid, composer re-enabled, and no current-answer error appeared. |

Progress log:

| Date | Update |
| --- | --- |
| 2026-06-13 | Added `conversationTextFromParts` and taught finalization/stop-streaming to use typed response parts as the fallback source of visible streamed text. |
| 2026-06-13 | Added regression coverage for parts-only streamed assistant bubbles, CRLF/LF finalization comparison, and visible text extraction from markdown/text parts. |
| 2026-06-13 | Added `chatScroll` helpers and regression tests so incoming assistant deltas, tool output deltas, approval cards, and system/error bubbles only auto-follow when the user is already near the bottom; user-sent messages and loaded sessions still intentionally force bottom alignment. |
| 2026-06-13 | Ran `impeccable` context and detector checks. The skill is usable for this project and surfaced follow-up motion debt: `animate-bounce` and width-based panel transitions should be replaced or constrained in a later motion/performance polish pass. |
| 2026-06-13 | Added assistant metadata normalization and merge helpers so UI `metadata-available` chunks can attach `source_document`, `source_url`, actions, suggestions, and risk metadata to the latest assistant bubble before final `done`, without duplicating sources when finalization arrives. |
| 2026-06-13 | Fixed finalization to merge final metadata into the matching assistant bubble even when a tool bubble followed the streamed text. This prevents duplicate assistant answers in tool-heavy UI-stream turns. |
| 2026-06-13 | Hardened Stop handling so cancelling an in-flight stream clears the active streaming bubble state, resets UI stream mode, and ignores late SSE responses from the aborted request; covered by Playwright. |
| 2026-06-13 | Re-ran the local `impeccable` setup and product-register reference. The skill is usable for subsequent Conversation polish because `PRODUCT.md` now defines the developer-workbench purpose, anti-references, state/evidence principles, and accessibility constraints. |
| 2026-06-13 | Sanitized restored chat drafts so interrupted assistant streams are finalized into visible stable text and do not leave a ghost typing state or stale `Thinking` status after reload. |
| 2026-06-13 | Added `chatStream` API-level regression coverage proving SSE text deltas are dispatched while the HTTP response body is still open, strengthening confidence that UI streaming is truly incremental rather than a buffered final render. |
| 2026-06-13 | Added split-chunk SSE parser coverage so line buffering remains safe when `event:` and `data:` lines are divided across arbitrary response chunks. |
| 2026-06-13 | Added Playwright browser coverage proving delayed responses do not force the message panel back to the bottom after the user manually scrolls up to read historical context. |
| 2026-06-13 | Ran live real-daemon/model long-answer Conversation QA with a seeded Project Link. The response completed successfully through the running app; it cited concrete paths in prose, but did not render a separate `References` block, so structured source-card extraction remains a Phase 3/source-grounding follow-up rather than an F8 streaming blocker. |

## Phase 9: Tests And Browser QA

Status: `Partial`

Completion: `20%`

Goal:

Prove the upgraded Conversation frontend works across common agent workflows.

Automated test targets:

- Block conversion.
- Markdown rendering.
- Code block rendering.
- Reference rendering.
- Timeline grouping.
- Suggested replies.
- Streaming finalization.
- No duplicate final bubbles.
- Playwright-driven Conversation smoke scenarios once the app is running.

Manual QA scenarios:

| Scenario | Expected Result |
| --- | --- |
| `Explain this project architecture` | Architecture answer with project context and no request for user-provided overview. |
| `Review my changes` | Detailed diff-aware conclusion, not only changed file names. |
| `stage changes, commit and push` | Evidence before approval; exact paths/args; stops after push. |
| Auth failure | Clear recovery actions and no raw confusing backend error. |
| Index refresh | Shows current index status and uses repository context. |
| Long code answer | Markdown/code blocks render safely with copy support. |
| Web/search result response | External references appear as source cards. |

Required verification commands:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
.\scripts\windows\pnpm-project.ps1 exec playwright --version
```

Playwright QA scenarios should be added or run for:

- using the local `playwright` skill or repository `e2e:chat` script as the
  default browser QA path,
- opening the running Conversation page,
- verifying the project-linked Chat shell, right Environment panel, model menu,
  and narrow-screen onboarding layout stay inside the viewport,
- submitting `Explain this project architecture`,
- submitting `Review my changes`,
- checking suggestion buttons above the composer,
- checking approval cards stay attached to execution timelines,
- capturing screenshots for narrow and normal desktop widths.

Completed:

- Installed Playwright and Chromium into the repository-local toolchain.
- Added root `playwright.config.ts` and `e2e:chat` script.
- Added `tests/e2e/chat-layout.spec.ts` to mock daemon responses, seed a
  Project Link, open Chat, expand the right Environment panel, open the model
  menu, and assert no visible horizontal overflow at normal and narrow widths.
- Fixed the right Environment panel so status text, branch/commit rows, and ADO
  follow-up buttons remain constrained inside the panel instead of spilling
  beyond the viewport.

## Phase 10: Artifacts And Result Workspace

Status: `Partial`

Completion: `72%`

Goal:

Add a rich result workspace for outputs that are too structured or too large
for a normal chat bubble.

This phase is inspired by LibreChat artifacts, Open WebUI artifacts, and AI SDK
generative UI patterns. It should come after the typed conversation part model
is stable.

Artifact types:

- Architecture diagrams, especially Mermaid.
- PR insight reports.
- Review summaries with risk tables.
- Test run summaries.
- Generated markdown reports.
- HTML or React previews if future workflows need them.

Work items:

- Define `artifact` conversation parts in Phase 1. `Done`
- Render artifact parts as compact result cards in chat. `Done`
- Add a lightweight side panel or split-view result area. `Done`
- Allow a chat message to select or open an artifact. `Done`
- Render Mermaid, markdown, and text artifact content first. `Done`
- Load saved PR insight artifact records into the workspace. `Done`
- Render Mermaid diagrams with source/error fallback. `Done`
- Copy artifact content from the workspace. `Done`
- Keep artifacts tied to the current project link and conversation.
- Add export support later.

Acceptance criteria:

- A generated architecture diagram can open outside the main bubble.
- A PR insight summary can be reviewed without scrolling through a long chat
  answer.
- Chat history keeps a clear reference to created artifacts.

Verification:

- Focused renderer tests for ready, streaming, and error artifact cards.
- Playwright artifact workspace content coverage for Mermaid source,
  markdown report content, text artifacts, persisted PR insight loading, lookup
  errors, ordinary artifact bypass behavior, rendered Mermaid SVG, Mermaid
  parse errors, and copy actions.
- Manual architecture answer with Mermaid artifact.
- Manual PR insight/report artifact.
- Desktop typecheck/build.

## Execution Order

The implementation order should be:

1. Phase 1: Conversation part model.
2. Phase 2: Markdown and code rendering.
3. Phase 3: References and source grounding.
4. Phase 4: Execution timeline.
5. Phase 5: Contextual quick replies.
6. Phase 6: Conversation input upgrade.
7. Phase 10: Artifacts and result workspace.
8. Phase 7: Visual system refinement.
9. Phase 8: Streaming UX hardening.
10. Phase 9: Tests and browser QA.

Reason:

Response structure and grounding must come before visual polish. Otherwise the
UI may look better while still behaving like a plain text template.

## Next Concrete Target

Continue the partially completed `F8.1 Streaming stability pass`. Parts-only
streamed assistant finalization is protected against duplicate final bubbles,
typed streamed content is no longer discarded when `text` is empty, incoming
stream/tool/approval updates preserve the user's historical scroll position
unless they are already near the bottom, UI chunk tool lifecycles can create and
update tool cards without legacy tool events, and final `done` metadata/sources
can attach to the matching streamed assistant even after tool bubbles arrive.
Stop/late-response cancellation, delayed-response scroll preservation, and
duplicate legacy plus UI-stream errors are covered by Playwright; those paths
restore the composer and preserve the user's reading position. Long streamed
markdown stays as one assistant answer when tool-output cards arrive between
text chunks. Live real-daemon/model long-answer QA passed through the running
app. Live real-backend interrupted-stream resume QA still needs work.

Immediate development batch:

1. Run live interrupted-stream resume QA against the running app and real
   daemon/model path.
2. Add Playwright coverage for resume finalization if it can be
   represented without a live LLM dependency.
3. Keep the typed response-part model intact while hardening stream updates.
4. Run desktop tests, desktop typecheck, and Playwright Chat QA through
   `.\scripts\windows\pnpm-project.ps1`, then update this dashboard.

Carry-over tasks after F5.1:

1. Run live Conversation QA for `Explain this project architecture` and
   `Review my changes` to confirm answers show concrete referenced files.
2. If live QA still shows generic answers, trace the path from repository
   context generation to planner finalization to assistant bubble metadata.
3. Wire real web/search result metadata into `source_url` parts when external
   search or documentation tools are available.
4. Attach pending approvals to the exact timeline row/action when the approval
   tool matches a tool already shown in the group.
5. Allow safe suggestions to trigger structured workspace actions instead of
   only filling the composer.
6. Add queued follow-up behavior for long streaming answers.

Current browser QA note:

- `2026-06-13`: In-app Browser control is available and successfully opened
  `http://127.0.0.1:1420/#/chat`. Use it for live read-only page checks.
  Continue using project Playwright tests for seeded approval/workflow states
  because Browser's evaluate runtime restricts direct `sessionStorage` seeding.
- `2026-06-13`: Runtime health is OK, Azure deployment `gpt-4o` is available,
  and the frontend is reachable on `127.0.0.1:1420`. Repo index is in
  quick-scan mode with embeddings pending, so live source grounding can cite
  paths in prose without necessarily rendering structured reference cards.

Expected first implementation files:

- `apps/desktop/src/chatBubbles.ts`
- `apps/desktop/src/chatBubbles.test.ts`
- `apps/desktop/src/chatRenderItems.ts`
- `apps/desktop/src/chatRenderItems.test.ts`
- `apps/desktop/src/pages/Chat.tsx`
- `apps/desktop/src/components/conversation/ConversationPartRenderer.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.tsx`
- `apps/desktop/src/components/conversation/ApprovalEvidence.test.tsx`
- `apps/desktop/src/components/conversation/ExecutionTimeline.tsx`
- `apps/desktop/src/components/conversation/ExecutionTimeline.test.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.tsx`
- `apps/desktop/src/components/conversation/SuggestionReplyBar.test.tsx`
- `packages/core/src/chatContext.ts`
- `packages/core/src/chatUseCases.ts`
- `packages/daemon/src/chatSession.ts`

Definition of done for the next batch:

- Mermaid artifacts render visually or degrade to source plus a clear error.
- Artifact content has copy actions that do not break tests or browser QA.
- Approval decision panels show risk, exact tool scope, command preview,
  workflow boundary, and responsive confirm/skip controls.
- Result workspace states use the same restrained workbench surface language as
  approval decision panels.
- Source fallback stays visible for trust and debugging.
- Focused component tests and desktop typecheck pass.
- `Long-Running Execution Dashboard`, the active phase section, and `Latest
  verification` are updated after implementation.

## Source Links

Use these links when implementing or reviewing this plan:

- Vercel AI SDK `UIMessage`: `https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message`
- Vercel AI SDK `useChat`: `https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat`
- Vercel AI SDK tool usage: `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage`
- Vercel AI SDK chatbot sources: `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot`
- Vercel AI SDK streaming custom data: `https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data`
- Vercel Chatbot: `https://github.com/vercel/chatbot`
- AI Elements: `https://elements.ai-sdk.dev/`
- Vercel Academy AI Elements overview: `https://vercel.com/academy/ai-sdk/ai-elements`
- Streamdown: `https://github.com/vercel/streamdown`
- assistant-ui: `https://github.com/assistant-ui/assistant-ui`
- assistant-ui Sources: `https://www.assistant-ui.com/docs/ui/sources`
- assistant-ui ToolGroup: `https://www.assistant-ui.com/docs/ui/tool-group`
- assistant-ui ToolFallback: `https://www.assistant-ui.com/docs/ui/tool-fallback`
- assistant-ui AI SDK v6 runtime guide: `https://www.assistant-ui.com/docs/runtimes/ai-sdk/v6`
- assistant-ui Quote/composer reference: `https://www.assistant-ui.com/docs/ui/quote`
- assistant-ui Chain Of Thought guide: `https://www.assistant-ui.com/docs/guides/chain-of-thought`
- assistant-ui Markdown: `https://www.assistant-ui.com/docs/ui/markdown`
- CopilotKit / AG-UI: `https://www.copilotkit.ai/`
- AG-UI introduction: `https://docs.ag-ui.com/introduction`
- AG-UI tools concept: `https://docs.ag-ui.com/concepts/tools`
- MUI X Chat sources and citations: `https://mui.com/x/react-chat/display/message-parts/sources-and-citations/`
- Open WebUI features: `https://docs.openwebui.com/features/`
- Open WebUI RAG citations: `https://docs.openwebui.com/features/chat-conversations/rag/`
- Open WebUI artifacts: `https://docs.openwebui.com/features/chat-conversations/chat-features/code-execution/artifacts/`
- LibreChat: `https://github.com/danny-avila/librechat`
- LibreChat citation limits: `https://www.librechat.ai/changelog/config_v1.2.9`
- LibreChat artifacts: `https://www.librechat.ai/docs/features/artifacts`
- LibreChat 2025 roadmap: `https://www.librechat.ai/blog/2025-02-20_2025_roadmap`
