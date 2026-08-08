# Measurement, Product Research, And Go-To-Market

Status: Canonical

## Evidence Standard

MergePilot must not use implementation completion, generated text volume, tool
call count, or demo success as proof of customer value.

Evidence hierarchy:

1. Verified remote outcome and user-observed time saved.
2. Repeated use on real workflows with low correction rates.
3. User decision or behavior change supported by traceable product telemetry.
4. Controlled fixture/evaluation results.
5. Interview statements and preference tests.
6. Internal opinion or competitor feature parity.

Higher-level product claims require higher-level evidence.

## North Star Definition

`Verified Delivery Loops per active project per week`

Required loop fields:

```ts
interface VerifiedLoopMetric {
  loopId: string;
  projectLinkId: string;
  userRole: "developer" | "reviewer" | "devops" | "lead";
  goalKind: string;
  startedAt: number;
  proposedActionAt?: number;
  approvedAt?: number;
  executedAt?: number;
  verifiedAt?: number;
  terminalStatus: "verified" | "rejected" | "stale" | "failed" | "abandoned";
  userCorrection?: boolean;
  artifactKinds: string[];
  clientOverheadMs: number;
  providerLatencyMs?: number;
  toolLatencyMs: number;
}
```

A chat answer without a verified action is useful engagement but not a verified
loop.

## Product Metric Tree

### Efficiency

- Time to first visible Working state.
- Time to first public narrative token.
- Time to evidence-complete recommendation.
- Time to approved and verified action.
- Manual page/context switches avoided, measured in usability sessions.

### Accuracy

- Finding accept/edit/dismiss.
- CI classification agreement with final human resolution.
- Suggested work-item field edit rate.
- Verification contradiction rate.
- Stale-action prevention count.

### Effectiveness

- PR prepared with all team-required fields.
- Review completed without reopening for missing context.
- Failure followed by a verified recovery or tracked follow-up.
- Work Item linked through PR and build.
- Deployment decision made with complete checks and traceability.

### Safety

- Mutation without approval: target zero.
- Duplicate mutation: target zero.
- Wrong-target or wrong-revision mutation.
- User reversal/correction.
- Sensitive output redaction failures.

### Adoption

- Active Project Links.
- Weekly active projects and roles.
- Repeat use of the same supported loop.
- Four-week retained projects.
- Usage by outcome rather than page views.

## Baseline Protocol

Before each cycle implementation:

1. Select at least five representative tasks or incidents from an isolated ADO
   project or consented pilot project.
2. Measure current manual duration, page switches, outcome, and errors.
3. Record artifact IDs and revisions.
4. Run the same task with the new workflow.
5. Compare time and correctness; do not compare only subjective satisfaction.

For latency, record separately:

- `client_send → local_visible`
- `request_received → sse_flushed`
- `model_request → first_model_token`
- `tool_start → tool_complete`
- `write_start → remote_visible`
- `remote_visible → verified`

Azure/model TTFT under 500 ms is an optimization target, not a product release
gate. Product-added latency must have its own P50/P95 budget.

## Product Discovery

### Interview sample

- 5–8 ADO developers/PR authors.
- 5–8 regular reviewers or tech leads.
- 3–5 DevOps/release owners.
- 2–3 ADO/project administrators for permissions and adoption constraints.

### Interview focus

- Last real PR, CI failure, and release decision, not hypothetical preferences.
- Artifacts opened and information reconstructed.
- Repeated updates or copy/paste into ADO.
- Decisions delayed by missing context.
- Incorrect or risky automation experiences.
- Existing use of Copilot, ADO MCP, code review tools, scripts, and dashboards.

### Research repository

Store anonymized findings under `docs/product/research/` using one evidence row
per observed problem:

```md
Problem:
Role:
Workflow stage:
Observed behavior:
Cost/time:
Current workaround:
Evidence strength:
Product implication:
```

Do not store credentials, private source, customer identities, or raw sensitive
logs in the repository.

## Go-To-Market Hypotheses

### Initial wedge

“Turn an Azure DevOps work item into a reviewable PR and resolve its first CI
failure without losing context or manually synchronizing ADO.”

Why:

- Demonstrates local repo advantage.
- Crosses Boards, Repos, and Pipelines.
- Contains both read and approved-write operations.
- Produces measurable time and correctness outcomes.

### Pilot package

- Windows desktop installer.
- Microsoft sign-in and one Project Link.
- One isolated ADO project setup guide.
- Read-only discovery first; explicit write scope when needed.
- Three scripted workflows: Prepare PR, Review change, Diagnose pipeline.
- Local diagnostics export with secrets removed.

### Adoption motion

1. Developer proves personal value with PR preparation or CI triage.
2. Tech lead configures team review/action policy.
3. Team enables shared ADO event integration and outcomes.
4. Release owner evaluates deployment readiness.

### Packaging questions to validate

- Per user versus per active project.
- Included model usage versus bring-your-own Azure deployment.
- Local-only versus optional managed event/telemetry service.
- Enterprise controls required before broader rollout.

No pricing recommendation is final until pilot usage reveals buyer, active user,
and cost per verified loop.

## Launch Gates

Pilot-ready:

- Cycle 01 verified loop passes on an isolated ADO project.
- No approval bypass in adversarial tests.
- Auth recovery and diagnostics are usable.
- Product-added latency baseline exists.
- Privacy and data retention are documented.

Broader beta:

- At least two supported loop types show repeat value.
- Correction and duplicate-write rates remain within agreed guardrails.
- Four-week retained pilot use exists.
- Support runbook and rollback are tested.
- Scope remains understandable without product-team explanation.
