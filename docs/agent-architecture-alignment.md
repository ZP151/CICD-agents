# Agent Architecture Alignment

Date: 2026-06-12

## Reference Architectures Checked

Primary references:

- OpenAI Agents SDK: agents combine instructions, tools, runtime behavior,
  handoffs, guardrails, structured outputs, orchestration, approvals, and state.
  Source: https://openai.github.io/openai-agents-python/agents/
- OpenAI Agents guide: use an agent runtime when the application owns
  orchestration, tool execution, approvals, and state.
  Source: https://developers.openai.com/api/docs/guides/agents
- LangGraph: durable execution, streaming, persistence, and human-in-the-loop
  are core orchestration capabilities.
  Source: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph persistence: checkpoints can be written at execution boundaries for
  durable workflows.
  Source: https://docs.langchain.com/oss/python/langgraph/persistence
- Vercel AI SDK stream protocol: text streams are not enough for rich agent UIs;
  data streams should carry tool calls and typed UI data.
  Source: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- Vercel AI SDK tool calling: tool-call identifiers can be forwarded into tool
  execution and stream data.
  Source: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AutoGen Core: event-driven agent systems use asynchronous messages and an
  agent runtime model.
  Source: https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/index.html

## Current Alignment

| Pattern | Current State | Alignment |
| --- | --- | --- |
| Application-owned runtime | Daemon owns chat sessions, tools, approvals, ADO context, and local state. | Good |
| Tool calling | Core exposes typed local tools and Azure DevOps tools. | Good |
| Human approval | Write/high-risk actions are converted into pending approvals before execution. | Good |
| Streaming text | Assistant text is streamed through SSE and `ui.chunk`. | Good |
| Streaming tool output | Command stdout/stderr now flows through `ToolExecutor.callStream`, `tool_output_delta`, and tool-card live output. | Good |
| Typed UI stream | `ChatUiChunkAdapter` emits text, progress, tool, approval, metadata, and finish chunks. | Good |
| Durable state | Chat sessions, bubbles, workflow state, checkpoints, review history, and PR insight artifacts are persisted. | Good, but graph-style resume is still partial |
| Checkpoint safety | Git checkpoints exist around write operations. | Good |
| ADO integration | ADO REST logic is internalized rather than only using an external MCP bridge. | Good |
| Observability | Tests and progress logs exist; runtime tracing is still lightweight. | Partial |
| Multi-agent handoff | Product is currently single-agent with specialized tools. | Acceptable for this product stage |
| Structured final metadata | Runtime now emits `assistant_control` / `assistant.control` / `metadata-available`, and supports an internal `agent_final` tool for typed final response metadata. `__CONTROL_JSON__` remains only as a compatibility fallback. | Good, still transitional |

## Main Deviation

The largest architecture deviation is the legacy control protocol:

```text
assistant prose + __CONTROL_JSON__{...}
```

Popular runtimes avoid mixing control metadata into user-visible model text.
They generally prefer structured outputs, typed runtime events, typed UI
message parts, or graph state transitions.

This session reduced that deviation by adding a typed runtime event layer and
starting a structured finalization tool:

- `assistant_control` in core chat events
- `assistant.control` as the canonical SSE alias
- `metadata-available` in the UI chunk stream
- `agent_final` as an internal synthetic tool for final response metadata and
  approval proposals

The legacy marker remains only as a compatibility input format. Future work can
make `agent_final` the default path in live model traffic, then remove
`__CONTROL_JSON__` from prompts and parsers.

## Recommended Next Corrections

1. Validate `agent_final` with the selected live model/provider path and make
   it the default finalization path.
2. Persist explicit turn event logs, not just final bubbles and workflow state.
3. Add trace spans for model calls, tool calls, approvals, ADO API calls, and
   Git checkpoints.
4. Give each tool call a stable runtime id across planner, daemon SSE, UI chunk,
   persisted bubble, and checkpoint metadata.
5. Convert the workflow state into an explicit graph or state-machine model if
   branching resume and replay become product requirements.
