# Cycle 00 — Product Reset And Runtime Foundation

Expected window: 3 weeks
Primary objective: **Make one safe, observable execution path authoritative.**

## Why This Cycle Exists

The current product has useful foundations, but important state is distributed
across legacy bubbles, transcript adapters, PR insight artifacts, Review Queue,
Activity records, workflow state, and page-local fetch models. Adding Boards or
CD to this structure would multiply inconsistency and unsafe writes.

This cycle does not attempt to deliver broad new ADO value. It makes the path
that later cycles depend on coherent and removes product directions that are no
longer part of the strategy.

## Outcome Gate

A user can submit one read/write workflow, immediately see one Turn, inspect
actual evidence and tools, approve the exact proposed action, and see the
remote result verified. No second UI or store claims a conflicting outcome.

## Baseline To Capture

- Time from send to local Working visibility.
- Client overhead versus daemon, model, and tool latency.
- Number of render/store paths touched by a PR action.
- Number of Project Link selectors in the desktop.
- Current approval and action-completion semantics.
- Current duplicate insight/Review Queue/Activity records for one PR workflow.

## Scope

### 1. Canonical Turn event path

Primary code areas:

- `packages/core/src/turnTimeline.ts` or a new `packages/core/src/turn/` module.
- `packages/daemon/src/chat*` event writer and persistence.
- `apps/desktop/src/pages/chat/` reducer and transcript components.

Work:

- Finalize one `turnId + sequence + emittedAt` protocol.
- Keep narrative, tool group, tool, approval, artifact link, final, and terminal
  events in one ordered stream.
- Use a single daemon writer for SSE and persistence.
- Make the desktop read only the canonical reducer.
- Retain legacy adapters for history replay only during migration.
- Remove direct rendering from `Bubble`, sibling `ExecutionLog`, progress
  markers, and legacy `ui.chunk` after parity tests.
- Enforce final ordering: execution sealed → Working auto-collapse → final
  stream → footer → `turn.finished`.

### 2. Proposed action and verification skeleton

Primary code areas:

- New `packages/core/src/delivery/actions/`.
- Existing `packages/core/src/tools/capabilities.ts` and executor.
- Daemon action persistence and approval routes.

Work:

- Add persisted `ProposedAction` with exact target, source revisions, payload,
  risk, expected result, idempotency key, expiry, and status.
- Ensure approval executes the stored action without model regeneration.
- Add a generic verifier interface and implement one low-risk fixture writer or
  existing ADO action end-to-end.
- Distinguish `executed`, `verifying`, `verified`, `stale`, and `failed`.
- Resume verification after restart without replaying the write.

### 3. Product simplification shell

Primary code area: `apps/desktop/src/app/AppShell.tsx`.

Work:

- Introduce target navigation labels: Agent, Work, Changes, Delivery, Settings.
- Keep Work disabled/preview until Cycle 04; do not ship a fake page.
- Map current Pull Requests to Changes and Pipelines to Delivery as temporary
  compatibility routes.
- Remove Review Queue and Activity from primary navigation.
- Add redirects for saved links; do not duplicate live state.

### 4. Context and Project Link ownership

Primary code areas:

- `apps/desktop/src/components/workbench/ProjectLinkCombobox.tsx`
- chat layout/context components
- `apps/desktop/src/pages/ProjectLinks.tsx`
- daemon Project Link schema/store

Work:

- Make Context the sole runtime Project Link selector.
- Remove selectors from composer, Pull Requests, Pipelines, and Review Queue.
- Remove changes/ahead/behind from Context.
- Open create/edit Project Link as a Context-managed sheet.
- Define Project Link V2 stable fields: name, local path, ADO organization,
  project ID/name, repository ID/name.
- Read legacy branch/pipeline/MCP fields for migration but stop writing them.

### 5. Built-in capabilities language and boundary

Primary code areas:

- Settings components.
- `packages/core/src/tools/mcp*`
- `packages/daemon/src/chatMcpConnectors.ts`
- `docs/managed-mcp-connectors.md`

Work:

- Rename user-facing Connector/MCP management to Built-in capabilities.
- Show Azure DevOps identity, scopes, health, and reauthentication.
- Remove install/register/catalog language and Project Link enablement.
- Keep `ConnectorRegistry`/MCP terminology only as internal implementation.
- Add global read-only kill switch for all remote writes.

### 6. Latency and completion instrumentation

Record:

- `client_send`
- `local_visible`
- `request_received`
- `sse_flushed`
- `first_public_narrative`
- `model_request_started`
- `first_model_token`
- `tool_started/completed`
- `write_started`
- `remote_visible`
- `verified`
- `turn_finished`

Report P50/P95 by component. Azure/model TTFT below 500 ms is an optimization
target, not an exit gate. Product-added local-visible latency must be ≤100 ms in
the supported desktop fixture.

## Required Deletions

- Review Queue primary navigation.
- Activity primary navigation.
- Page/composer Project Link selectors.
- Fixed startup-stage transcript messages.
- Copy/timestamp before Turn completion.
- Empty disclosure chevrons.
- Any new code path that completes an action at HTTP success without
  verification.

## Tests

### Contract and reducer

- Sequence dedupe, reordering, reconnect, cross-Turn isolation, and terminal
  idempotence.
- Optimistic Turn adoption does not reset its clock.
- Working/final separation and footer timing.
- No child content means no disclosure semantics.

### Action runtime

- Approval uses exact persisted action.
- Changed target revision yields `stale` and prevents execution.
- Reconnect resumes verification only.
- Duplicate execution request does not duplicate the remote mutation.

### Desktop

- One Project Link selector exists in runtime UI.
- Legacy routes redirect without rendering duplicate pages.
- Keyboard and screen-reader behavior for Turn, tool, approval, and Context.

## Demo Scenario

Prompt against an isolated Project Link:

> Inspect the linked repository and Azure DevOps project, then propose one
> harmless metadata update to a fixture artifact. Show the evidence, wait for
> approval, execute it once, and verify the remote value.

The exact fixture mutation may be a test-only Work Item comment or other
reversible action. It must use the real action runtime.

## Non-goals

- Full Work page.
- New PR analysis behavior.
- CI root-cause model.
- Environments or deployments.
- Visual theme redesign.
- Broad route cleanup unrelated to the authoritative path.

## Exit Evidence

- Recorded desktop E2E video/log of the demo scenario.
- Event replay proves the same Turn after restart.
- ADO re-read proves the mutation exactly once.
- P50/P95 latency breakdown.
- Search confirms removed runtime selectors and Review Queue/Activity nav.
- All relevant core, daemon, desktop, and E2E tests pass through the local
  toolchain.
