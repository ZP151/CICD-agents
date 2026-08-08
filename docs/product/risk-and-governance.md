# Product Risk, AI Governance, And Operational Safety

Status: Canonical

## Risk Posture

MergePilot is an assisted delivery system, not an autonomous authority. It may
collect evidence and prepare actions without approval, but it must not publish,
vote, prioritize, merge, deploy, or mutate project state unless policy permits
the action and the user confirms the exact stored proposal.

## Risk Classes

| Class | Examples | Default behavior |
| --- | --- | --- |
| Low | Read work item, PR, build, test, environment; local text search | Execute and disclose evidence source |
| Medium | Local validation, Git fetch, create draft text, queue read-only analysis | Execute if policy allows; preserve audit |
| High | Update work item/PR, publish comment, add reviewer, trigger pipeline, resolve thread | Exact preview and explicit approval |
| Critical | Cast PR vote, complete PR, approve production deployment, rollback, destructive Git/ADO action | Strong confirmation, fresh re-read, elevated policy, verification |

## Mandatory Controls

### Least privilege

- Request read-only ADO scopes by default.
- Enable write scopes only when a supported workflow requires them.
- Use the authenticated user's permissions; no hidden shared superuser.
- Keep built-in capability scopes visible in Settings.

### Freshness

- Bind proposals to exact artifact revisions.
- Re-read before approval when the snapshot exceeds its freshness budget.
- Reject execution if target revision, PR source commit, policy, build, or
  deployment state changed.

### Idempotency and concurrency

- Every action has a deterministic idempotency key.
- Work-item updates use revision/ETag semantics where supported.
- Retry never regenerates payload implicitly.
- Service Hook duplicates do not create repeated actions.

### Verification

- Define expected remote predicates before execution.
- Re-read until predicates pass, contradict, or time out.
- Show `executed but unverified` as a failure state requiring attention.
- Never treat a successful HTTP response as product completion.

### Evidence

- Facts include source, revision, and timestamp.
- Inferences include confidence and coverage.
- Recommendations list decisive evidence and missing evidence.
- Raw model payload, private reasoning, secrets, and unredacted logs are not
  stored in user-facing transcripts.

## Human Decision Boundaries

Always human-confirmed in the initial product:

- PR vote, completion, or merge.
- Production environment approval.
- Work-item priority or business-value changes.
- Deletion or destructive state transitions.
- Branch rewrite, force push, or rollback.
- Publishing AI-authored comments as the user.

The product may later support policy-based automation only after separate
evidence, governance review, and an explicit product decision. Legacy
auto-approval concepts do not authorize current implementation.

## Model Quality Governance

Evaluation dimensions:

- Evidence correctness.
- Finding usefulness.
- Missed critical issue rate.
- False-positive/nit rate.
- Action payload correctness.
- Language and intent preservation.
- Stability under new artifact revisions.

Model changes require evaluation against the domain suite. Narrator and main
agent deployments are tested separately because they have different budgets
and latency goals.

GPT-5 reasoning deployments use `max_completion_tokens`, not legacy
`max_tokens`. Narration uses minimal reasoning and a sufficient visible-output
budget; a one-token health probe cannot be treated as deployment failure.

## Data And Privacy

- Repository source stays local unless required model calls are configured and
  disclosed.
- Credentials remain in local environment/credential storage or approved Key
  Vault references, never repository configuration.
- Persist only the evidence required for replay and audit.
- Apply retention limits to logs, model inputs, tool outputs, and cached ADO
  content.
- Redact secrets, tokens, connection strings, emails where not necessary, and
  sensitive pipeline variables.
- Diagnostics export defaults to metadata and hashes, with explicit opt-in for
  content.

## Threat Scenarios

| Threat | Required mitigation |
| --- | --- |
| Prompt injection in repository or ADO content | Treat content as evidence, not instruction; tool policy remains out-of-model |
| Model calls wrong ADO tool | Typed action boundary and capability allowlist |
| Stale PR vote after new push | Bind to source commit; invalidate and re-read |
| Duplicate Work Item or PR creation | Idempotency key plus remote lookup verification |
| Secret appears in build log | Redaction before model, persistence, and UI |
| OAuth callback fails or wrong identity used | Correlated callback state, token-cache audit, visible account identity |
| MCP transport changes | Adapter boundary and REST fallback |
| Service Hook replay/spoofing | Signature/secret validation, dedupe, re-read authoritative state |

## Operational Readiness

Required before pilot:

- Structured audit event for every read, proposal, approval, action, and
  verification.
- User-visible correlation ID for failed workflows.
- Cancel and recovery behavior for every running action.
- Crash/restart recovery without repeated mutation.
- Ability to disable all writes globally.
- Capability health that tests identity and permission without destructive
  probes.
- Support runbook for auth, ADO throttling, model failure, stale actions,
  verification timeout, and connector degradation.

## Governance Review Cadence

- Per cycle: new actions, scopes, and data retention.
- Per model change: evaluation and latency/cost comparison.
- Monthly during pilot: correction, reversal, incident, and insufficient-
  evidence review.
- Before broader beta: independent threat-model and permission review.
