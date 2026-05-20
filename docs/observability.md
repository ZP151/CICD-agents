# Observability

The v2 stack uses two channels:

1. **Structured logs (pino)**: written to stdout locally and to the
   Container Apps log stream in the cloud. Sensitive fields
   (`authorization`, `apiKey`, `pat`, `password`) are redacted by the
   logger and again by the tool executor before subprocess output is
   persisted.

2. **Application Insights (opt-in)**: per-task and per-PR-review metrics.
   Off by default. Enable locally with `dev-agent settings --telemetry on`
   and set `APPLICATIONINSIGHTS_CONNECTION_STRING` + `TELEMETRY_ENABLED=1`
   in your environment.

## Metrics emitted

### Local Dev Agent (pipeline tasks)

| Event / metric        | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `TaskCompleted`       | one event per task with `kind`, `status`, `durationMs` |
| `task.tokens_in`      | prompt tokens consumed                               |
| `task.tokens_out`     | completion tokens consumed                           |
| `task.embed_tokens`   | embedding tokens consumed                            |
| `task.duration_ms`    | wall-clock duration                                  |
| `task.tool_calls`     | count of executed tool invocations                   |

### Cloud Review Agent (PR webhooks)

| Event / metric        | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `PrReviewed`          | one event per PR review with `prId`, `repository`    |
| `review.tokens_in`    | prompt tokens consumed by the review                 |
| `review.tokens_out`   | completion tokens consumed                           |
| `review.findings`     | number of findings posted                            |
| `review.duration_ms`  | end-to-end handler duration                          |

## Cost guardrails

The Phase 3 exit gate requires:

- average `review.tokens_in` per PR <= 12_000
- precision >= 0.7 (see `packages/review-agent/eval/README.md`)

App Insights dashboards (one per environment) chart the metrics above.
Configuration of those dashboards is owner-driven; the templates live in
`docs/dashboards/` (TODO).

## Privacy

The local CLI defaults to telemetry off (`TELEMETRY_ENABLED=0`). Even
when enabled, no source code, diff content, secrets, PAT, or PR body is
transmitted - only IDs, counts, and durations.
