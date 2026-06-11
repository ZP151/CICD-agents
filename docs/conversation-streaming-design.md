# Conversation Streaming Design

## Current State

The chat transport already uses server-sent events from the daemon to the
desktop app. Tool lifecycle, workflow state, approvals, and errors are delivered
incrementally.

The lower-level `LLMClient` supports token streaming, and the frontend already
knows how to append `assistant_delta` events to the active assistant bubble.
However, the main `ChatPlanner` currently consumes LLM deltas internally because
it asks the model to produce a final structured JSON object. In practice, the
current product has streaming workflow events, but most assistant prose appears
as a final parsed response rather than true token-by-token prose.

The current planner asks the model for a final structured result after tool use.
That result contains fields such as `response`, `riskLevel`,
`actionsTaken`, `suggestions`, and `approval_proposal`. This is useful for
workflow control, but it creates two UX problems:

- the user-facing answer and machine-control JSON are coupled
- raw tool JSON can leak into the conversation UI when rendered as debug output

Raw JSON is not useful in normal conversation and should stay out of the chat
surface. Structured data should be rendered as source cards, execution summaries,
approval cards, or details panels.

As of Session Update 96, the desktop no longer renders raw tool JSON in normal
Chat tool details.

As of Session Update 97, the planner streams visible text by extracting only the
`response` string from the structured JSON stream. This keeps the existing JSON
control contract while allowing assistant prose to appear incrementally. JSON
syntax, risk metadata, suggestions, and approval payloads are not streamed into
assistant bubbles.

As of Session Update 98, the planner prefers an explicit visible/control marker
protocol. The model streams normal user-facing prose first, then emits a final
control line prefixed with `__CONTROL_JSON__`. The desktop receives only the
visible prose as `assistant_delta`; the marker payload is parsed as internal
control state. The legacy JSON-response extraction path remains as a fallback
while older prompts/tests are phased out.

## Target UX

Conversation should feel like a normal streaming assistant:

- assistant prose streams into one bubble
- tool execution appears as compact, human-readable progress
- approvals appear as explicit action cards
- source/context metadata appears below the assistant answer
- raw protocol payloads stay hidden from end users

## Event Design

Keep the existing SSE transport, but separate user-facing text from control
state more strictly.

User-facing events:

- `assistant_delta`: append visible assistant prose
- `progress`: short status text for long-running context/index/tool work
- `tool_start`: compact execution row starts
- `tool_end`: compact execution row completes with renderer-specific summary
- `done`: final metadata only, not raw text replacement unless no deltas were
  emitted

Control events:

- `workflow_state`: update pending/running/done state
- `approval_required`: render an approval card
- `approval_resolved`: update an approval card
- `error`: render a user-friendly error bubble

## Planner Direction

The planner should eventually emit two channels:

- a streaming answer channel for user-facing text
- a structured control channel for risk, actions, approvals, and suggestions

The current marker protocol is an intermediate step toward that architecture.
It removes JSON from the visible text stream without requiring a transport-level
protocol migration yet. Until the structured control channel becomes fully
independent, the desktop should treat raw JSON as an internal implementation
detail and render only typed summaries.

## Migration Plan

1. Keep the existing structured final JSON contract as a compatibility
   fallback.
2. Prefer visible prose followed by `__CONTROL_JSON__{...}` for new planner
   responses.
3. Stream only prose before the marker as `assistant_delta`.
4. Suppress partial marker prefixes so fragments such as `__CON` never appear
   in assistant bubbles.
5. Do not stream JSON syntax or control fields into assistant bubbles.
6. Treat `done.result.response` as final reconciliation metadata:
   - if prose deltas were streamed, only attach metadata and stop the spinner
   - if no prose deltas were streamed, render `done.result.response` as the
     assistant bubble
7. Add tests proving that structured planner JSON is never shown verbatim in the
   conversation UI.
8. Later, replace the marker line with a truly separate structured control
   channel so the model no longer has to encode control state inside the text
   stream.
