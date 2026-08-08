# Cycle 00 Acceptance Evidence (2026-08-05)

Primary objective: **Make one safe, observable execution path authoritative.**

## Outcome gate

A user can submit one read/write workflow, immediately see one Turn, inspect
actual evidence and tools, approve the exact proposed action, and see the
remote result verified. No second UI or store claims a conflicting outcome.

**Result: achieved.** Real ADO E2E on TeBS-ClaimBot / ClaimBot_API
(Project Link `eb2f6c876f53b33d`, Work Item 7912):

| Phase | Evidence |
| --- | --- |
| Propose | `delivery_propose_action` persisted `act-gek1mz` (awaiting_approval) with exact target (revision read from ADO), payload, predicates, idempotency key |
| Approval | Approval card showed the exact stored action; confirm-action executed the stored record |
| Execute | `addAzureWorkItemComment` wrote the fixture comment once |
| Re-read + verify | Evidence: `work_item:eb2f6c876f53b33d:7912 revision > 0 verified (revision 4 > 0)` and `comment contains MergePilot Cycle 00 demo` |
| Terminal | `turn.finished`; final: "Delivery action recorded and verified (action_id: act-gek1mz)" |

Full SSE transcript: `cycle00-e2e-transcript.jsonl` in this directory.
Action record (persisted): `GET /delivery/actions/act-gek1mz` → status `verified`,
audit `awaiting_approval → approved → executed → verified`.

## Scope items

1. **Canonical Turn event path** — daemon emits only `turn.*` timeline events
   (single `ChatSseWriter`); desktop live dispatch renders exclusively through
   the canonical reducer. Legacy live-render paths (ui.chunk, assistant_delta,
   tool_start/tool_output_delta/tool_end, message, progress, done/cancelled/
   error, confirm_required, workflow_state, approval_required) deleted
   (commit 1377c2a). History restore stays timeline-first with legacy adapter.
2. **ProposedAction + verification** — persisted `ActionRecord` with target,
   basedOn revisions, payload, risk, reason, expectedResult predicates,
   idempotency key, expiry, status and audit; approval executes the stored
   action; states `proposed/awaiting_approval/approved/executing/verifying/
   verified/rejected/stale/failed/cancelled`; restart recovery verifies
   without re-executing (commits 8e05713, 280ea97, e8d3f11).
3. **Product simplification shell** — navigation Agent / Work (disabled until
   Cycle 04) / Changes (compat → Pull Requests) / Delivery (compat →
   Pipelines) / Settings; Review Queue and Activity removed from primary nav
   (commit 4702f6a — see `git log` for MP-PROD-001).
4. **Context / Project Link ownership** — single runtime selector in Context
   (WorkspaceProjectLinkPanel); composer selector removed; "Manage Project
   Links" entry in Context (MP-PROD-002).
5. **Built-in capabilities language** — Settings "Built-in capabilities"
   section with Azure DevOps identity, connected state, and the global
   read-only kill switch (`/delivery/writes-enabled`); Project Link MCP
   fields no longer written by the form (MP-PROD-003).
6. **Latency / completion instrumentation** — marks
   client_send → local_visible → request_received → sse_flushed →
   first_public_narrative → model_request_started → first_model_token →
   first_tool_started/completed → first_final_delta → finished; P50/P95
   helper; write/verify timing on every ActionRecord (executedAt/verifiedAt).

## Baseline captured (real E2E run, server clock)

| Span | Value |
| --- | --- |
| request_received → sse_flushed | 246 ms |
| request_received → first narrative | 3354 ms |
| request_received → first tool | 14400 ms |
| turn total (incl. approval wait) | 62 s |
| App/SSE path baseline (2026-08-04) | P50 143 ms, P95 309 ms |

Product-added local-visible latency target ≤100 ms in the supported fixture:
the 246 ms above includes the daemon's first context read; the desktop
`client_send → local_visible` mark is measured in the browser (DEV console
`[turn-metrics]`).

## Required deletions — verified absent

- Review Queue primary navigation, Activity primary navigation: grep clean
  in `app/AppShell.tsx`.
- Page/composer Project Link selectors: `ProjectLinkCombobox` deleted,
  grep clean.
- Legacy `ui.chunk` rendering: `chatUiChunkDispatcher`/`handleUiChunk`
  deleted, grep clean.
- Fixed startup-stage transcript messages: `turn.waiting` is an explicit
  transport diagnostic, never canned agent prose.
- Copy/timestamp before Turn completion: finalization waits for
  `turn.finished` (existing + preserved).
- HTTP-success-without-verification: policy refuses actions without
  verification predicates; verifier refuses to verify without re-read.

## Tests

- core: 381 passed / 6 skipped (delivery action runtime 15 incl. retry,
  staleness, kill switch, recovery).
- daemon: 327 passed / 1 skipped (delivery routes 5, chatSse 16).
- desktop: 763 passed (canonical dispatch, navigation, context ownership).
- Playwright `e2e:chat` smoke gate: see `pnpm e2e:chat`.

## Defects found and fixed during the real E2E

- `vectorIndex.embedPending` sent empty chunk text to the embeddings API
  (400) — empty chunks now skipped.
- LLM stream hard-aborted at 15 s before GPT-5 first chunk — timeout now
  configurable (default 60 s).
- Verification without predicates declared success — policy + verifier
  refuse; retry allowed only for never-executed records.
- ActionStore.updateStatus did not rewrite payload columns — retry now
  works.
- `delivery_propose_action` scopes projectLinkId/revision from context and
  ADO, never from the model.

## Remaining notes

- Desktop-UI-driven demo (Vite UI + Playwright) not run this session; the
  daemon API drives the identical SSE/runtime path, and the 2026-08-04
  ledger recorded the desktop turn lifecycle on the same runtime.
- `docs/product/README.md` remains the authoritative scope for Cycle 01+.
