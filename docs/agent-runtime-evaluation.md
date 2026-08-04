# Agent runtime evaluation

## Decision

MergePilot will use an OpenCode-inspired message-part event model in the
existing daemon. It will not embed Cline Core as the primary runtime in this
iteration.

## Evidence collected 2026-08-01

| Candidate | Version / license | What was evaluated | Decision |
| --- | --- | --- | --- |
| `@cline/sdk` / `@cline/core` | `0.0.68`, Apache-2.0 | Public package surface, runtime types, provider/session/tool ownership and event API | Do not embed |
| OpenCode | `dev`, MIT | Message parts, typed event bus, SSE replay model | Adopt the model, not a runtime dependency |
| `@assistant-ui/react` | already installed, MIT | Custom runtime, streaming and accessibility primitives | Reuse at the desktop seam |

`@cline/core` is a capable agent platform, but its local runtime owns provider
configuration, SQLite/file session storage, default tools, MCP lifecycle and a
Hub transport. Mapping it into the current daemon would require replacing the
Project Link runtime, approval policy and persisted chat format before a single
Turn can run. That fails this project's no-regression gate for a fast adapter.

The adopted seam is deliberately smaller: a `TurnRuntime` owns one ordered
public event journal, while the existing Project Link tools remain the tool
adapter. The desktop reads only the event-derived transcript. This follows
OpenCode's durable message-part/update model without importing its full agent
runtime.

## Latency deployment seam

The public action narrative is genuine streamed model text, never a fixed
progress phrase. It can use an optional low-latency deployment while planning,
tools, approvals and final answers remain on the primary model. Configure one
of the following only when that deployment has been provisioned in the same
provider account:

```toml
[azure_openai]
narrative_deployment = "your-low-latency-deployment"
```

or `AZURE_OPENAI_NARRATIVE_DEPLOYMENT` / `OPENAI_NARRATIVE_MODEL`. Empty values
fall back to the normal chat deployment. This makes the 500 ms first-public-
token target a deployment/runtime optimization objective rather than a UI
template or release gate.

## Re-evaluation gate

Reconsider Cline Core only if an adapter proves all of the following against a
separate Project Link fixture: Azure/OpenAI configuration, project-root
selection, existing read/write approval policy, output redaction, cancellation
and resume, history migration, and a first-token latency analysis against the
current P50/P95 baseline. A 500 ms P95 remains a stretch optimization target,
not an adoption gate for the current runtime.

## Attribution

- OpenCode message/event model: https://github.com/anomalyco/opencode
- Cline SDK events and runtime: https://docs.cline.bot/sdk/events
- Cline SDK license: Apache-2.0
- OpenCode license: MIT
