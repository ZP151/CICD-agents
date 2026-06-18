# Streaming Event Source Reuse Intake

## Purpose

This file captures the concrete upstream code patterns selected for the Dev
Agent streaming-output rewrite. The goal is to reuse source and logic first,
then migrate adapted methods into this project in small, verified slices.

## Upstream

Project: `MaxGfeller/open-harness`

Local source: `third_party/open-harness`

Commit: `c45c9343962a3832bf3eb3456170a59414bf18d9`

License: MIT

## Selected Source Blocks

### Typed Agent Events

Source: `third_party/open-harness/packages/core/src/agent.ts`

Relevant block:

```ts
export type AgentEvent =
  | { type: "text.delta"; text: string }
  | { type: "text.done"; text: string }
  | { type: "reasoning.delta"; text: string }
  | { type: "reasoning.done"; text: string }
  | { type: "tool.start"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool.done"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool.error"; toolCallId: string; toolName: string; error: string }
  | { type: "step.start"; stepNumber: number }
  | { type: "step.done"; stepNumber: number; usage: TokenUsage; finishReason: string }
  | { type: "error"; error: Error }
  | { type: "done"; result: "complete" | "stopped" | "max_steps" | "error"; messages: ModelMessage[]; totalUsage: TokenUsage };
```

Reuse decision:

- Keep this as the target event vocabulary.
- Map the current legacy `ChatEvent` types into canonical UI lifecycle chunks.
- Do not expose `reasoning.delta` to users as model chain-of-thought. Use only
  safe progress/tool/status events for visible process feedback.

### Model Stream Loop

Source: `third_party/open-harness/packages/core/src/agent.ts`

Relevant logic:

```ts
for await (const part of stream.fullStream) {
  switch (part.type) {
    case "start-step":
      yield { type: "step.start", stepNumber };
      break;
    case "text-delta":
      yield { type: "text.delta", text: part.text };
      break;
    case "text-end":
      yield { type: "text.done", text: stepText };
      break;
    case "tool-call":
      yield { type: "tool.start", toolCallId: part.toolCallId, toolName: part.toolName, input: part.input };
      break;
    case "tool-result":
      yield { type: "tool.done", toolCallId: part.toolCallId, toolName: part.toolName, output: part.output };
      break;
    case "finish-step":
      yield { type: "step.done", stepNumber, usage: toTokenUsage(part.usage), finishReason: part.finishReason };
      break;
    case "finish":
      yield { type: "done", result, messages, totalUsage: toTokenUsage(part.totalUsage) };
      break;
  }
}
```

Reuse decision:

- Preserve the idea that the runtime emits lifecycle events as soon as stream
  parts arrive.
- Our current `LLMClient.chatStream` already emits deltas and tool calls, so the
  first migration can happen without changing providers.
- Later migration should eliminate `__CONTROL_JSON__` by making approval/final
  metadata a runtime event instead of model text.

### UI Stream Lifecycle

Source: `third_party/open-harness/packages/core/src/ui-stream.ts`

Relevant logic:

```ts
let textPartId: string | null = null;
const endTextPart = () => {
  if (textPartId) {
    enqueue({ type: "text-end", id: textPartId });
    textPartId = null;
  }
};

case "text.delta": {
  if (!textPartId) {
    textPartId = nextId();
    enqueue({ type: "text-start", id: textPartId });
  }
  enqueue({ type: "text-delta", id: textPartId, delta: event.text });
  break;
}

case "tool.start": {
  endTextPart();
  enqueue({ type: "tool-input-start", toolCallId: event.toolCallId, toolName: event.toolName });
  enqueue({ type: "tool-input-available", toolCallId: event.toolCallId, toolName: event.toolName, input: event.input });
  break;
}
```

Reuse decision:

- This is the highest-value logic to port first.
- It fixes the product problem where assistant text, thinking state, tool
  cards, and final metadata fight for the same UI space.
- First local migration: `packages/core/src/chatUiStream.ts`.

### Stream Transforms

Source: `third_party/open-harness/packages/core/src/stream.ts`

Relevant logic:

```ts
export function tap(fn: (event: AgentEvent) => void): StreamTransform {
  return async function* (source) {
    for await (const event of source) {
      fn(event);
      yield event;
    }
  };
}
```

Reuse decision:

- Keep this pattern for future instrumentation and UI adapters.
- Candidate local follow-up: `tapChatEvents`, `mapChatEvents`,
  `takeChatEventsUntil`.

## Local Migration Slices

| Slice | Status | Local Target | Notes |
| --- | --- | --- | --- |
| UI lifecycle chunks | Complete | `packages/core/src/chatUiStream.ts` | Adapted OpenHarness UI stream lifecycle to current `ChatEvent`, including deterministic fallback `message` events. |
| Frontend chunk renderer | Partial | `apps/desktop/src/pages/Chat.tsx` | Text/progress chunks are rendered through `ui.chunk`; legacy tool and approval cards remain active for compatibility. |
| Tool output deltas | Complete | `packages/core/src/tools/executor.ts` and `apps/desktop/src/pages/Chat.tsx` | Command stdout/stderr now flows through `ToolExecutor.callStream`, `tool_output_delta`, `ui.chunk`, and live tool-card output. |
| Control-event split | Complete | `packages/core/src/chatPlanner.ts` and `packages/daemon/src/chatEvents.ts` | Runtime now emits `assistant_control`, canonical `assistant.control`, and UI `metadata-available`; legacy `__CONTROL_JSON__` remains only as compatibility fallback input. |
| Structured finalization tool | In progress | `packages/core/src/chatPlanner.ts` | Added and hardened internal `agent_final` handling so the model can return final response metadata and approval proposals through typed tool arguments instead of prose-embedded JSON. |
| Abort/drain behavior | Not started | daemon SSE + desktop cancel handling | Mirror OpenHarness abort chunk behavior. |

## Local Integration Completed

The first migration is now source-first, not service-first:

- The OpenHarness lifecycle shape was copied into local design notes and
  reimplemented as `ChatUiChunkAdapter`.
- The daemon emits local `ui.chunk` SSE events from `/chat` and
  `/chat/:sessionId/confirm-action` while preserving legacy event names.
- The desktop API client parses `ui.chunk` in both chat entry points.
- The Chat page prefers `ui.chunk` text/progress rendering when available and
  uses legacy text events only as a fallback for older daemons.
- Assistant finalization now de-duplicates already streamed text and attaches
  final metadata to the existing streamed bubble.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```

## Control Event Split Started

The third migration slice reduces the largest remaining architecture deviation:
control metadata embedded in model text.

- `ChatPlanner` now emits an `assistant_control` event before `done` whenever
  final response metadata is parsed.
- The daemon maps this to canonical `assistant.control` SSE.
- `ChatUiChunkAdapter` maps it to a `metadata-available` UI chunk.
- Existing `done` and workflow-state behavior remain for compatibility.

This does not fully remove `__CONTROL_JSON__` yet. It creates the runtime event
surface needed to replace that legacy marker with structured model output or a
dedicated finalization tool in a later step.

## Structured Finalization Tool Started

The fourth migration slice starts replacing the legacy model-output marker with
an internal synthetic tool:

- `ChatPlanner` appends an `agent_final` tool schema to the model tool list.
- `agent_final` is intentionally not registered with `ToolExecutor`, so it is
  never executed as an external command.
- When the model calls `agent_final`, the runtime converts its typed arguments
  into `assistant_control` and then the normal `done` result.
- Approval proposals are preserved in the same structured `PendingToolAction`
  shape used by the current approval workflow.
- If `agent_final` appears in the same streamed batch as executable tool calls,
  the runtime continues executing real tools first and asks the model to
  finalize again afterward.
- Retry nudges now ask the model to call `agent_final`; the legacy marker is
  mentioned only as a fallback when tool calling is unavailable.
- The resolved finalization path is carried as `finalizationMode` from the core
  result through daemon assistant-bubble persistence and desktop Chat metadata,
  so live model runs can be verified from restored conversation history.
- `__CONTROL_JSON__` remains only as a compatibility fallback for model/provider
  paths that cannot call tools.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerApproval.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
```

## Tool Output Delta Migration Completed

The second migration slice adds command-output streaming without replacing the
existing tool result contract:

- `runCommand` now accepts an `onOutput` callback and emits redacted stdout and
  stderr chunks as soon as the child process produces them.
- `ToolExecutor.call()` remains unchanged for existing callers.
- `ToolExecutor.callStream()` exposes runtime output events before yielding the
  final structured result.
- Git, NPM, DotNet, and Pytest tools forward command output through
  `ToolContext.emitToolEvent`.
- `ChatPlanner` and confirmed-action execution paths emit
  `tool_output_delta` chat events.
- `chatEventsToUiChunks` maps these events into `tool-output-delta` UI chunks.
- The desktop Chat page appends live output to the currently running tool card
  while preserving the final structured renderer when the tool completes.

Verification:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/toolExecutor.test.ts test/chatUiStream.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatEvents.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```
