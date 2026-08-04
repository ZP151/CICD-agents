# MergePilot Product Strategy

Status: Canonical
Horizon: 2026 pilot and product validation

## 1. Vision

Enable Azure DevOps teams to move from intent to verified delivery with less
coordination work, less context reconstruction, and fewer unsafe or stale
decisions.

MergePilot should feel like a precise delivery workbench: it understands the
local repository, connects that evidence to Azure DevOps artifacts, proposes
the smallest useful next action, and proves the result after the user approves
it.

Values:

- **Accuracy before apparent autonomy.** An explicit insufficient-evidence
  result is better than a confident guess.
- **ADO remains authoritative.** MergePilot never becomes a competing project
  database.
- **Visible work.** Users see public action narratives, tools, evidence,
  approvals, and outcomes without private reasoning or raw payload noise.
- **Human accountability.** The product accelerates decisions; it does not hide
  ownership of review, release, or prioritization.
- **Local advantage.** Local code and developer context are used where they
  materially improve remote ADO decisions.

## 2. Market Segments

### First segment: ADO developers and tech leads

Jobs to be done:

- Understand a work item and relevant repository context quickly.
- Prepare a complete, reviewable pull request.
- Review a change with enough evidence to make a defensible decision.
- Diagnose a failed CI run without manually correlating logs, diffs, tests, and
  prior successful runs.
- Keep the work item and PR synchronized with actual progress.

Why first:

- They use both the local repository and ADO every day.
- MergePilot already has meaningful PR, pipeline, Git, context, and approval
  foundations for this workflow.
- Value can be measured through review time, failure triage time, write-back
  completion, and correction rates.

### Second segment: DevOps and release owners

Jobs to be done:

- Determine whether a release is safe to approve.
- Explain failing gates, approvals, tests, and environment state.
- Identify the last good deployment and likely rollback path.
- Execute controlled retry, approval, redeploy, or follow-up actions and verify
  their outcomes.

Entry condition: the CI evidence model and verified action runtime must already
be reliable.

### Third segment: engineering managers and delivery leads

Jobs to be done:

- Understand which work is truly blocked and why.
- Detect work items whose ADO state no longer matches delivery reality.
- Review sprint and delivery risk using traceable facts rather than a generic
  health score.

Entry condition: the delivery graph has enough historical coverage to avoid
misleading management summaries.

## 3. Relative Cost Position

MergePilot should compete on specialized value, not lowest inference cost.
However, it must be cheaper in attention and operational risk than combining a
generic coding agent, Azure DevOps portal, separate AI reviewer, and manual
pipeline investigation.

Cost controls:

- Use deterministic queries before model inference.
- Load only task-relevant ADO domains and repository context.
- Use incremental PR and pipeline analysis rather than full recomputation.
- Cache immutable artifact revisions.
- Separate fast narration from deeper agent work without exposing the narrator
  as a user-selectable model.
- Record token, tool, and latency cost per verified loop.

## 4. Value Propositions

### Developer / PR author

Before: reconstructs work item intent, checks branches, writes PR fields,
collects tests, responds to feedback, and updates ADO manually.

How: MergePilot joins local code with work item, policy, review, and build
evidence; prepares editable actions and performs approved write-back.

After: PRs are easier to review, feedback rounds are shorter, and remote state
matches actual progress.

Alternatives: Azure DevOps portal, IDE Git tools, GitHub Copilot, generic coding
agents, manual templates.

### Reviewer / tech lead

Before: repeatedly rebuilds intent and change context, navigates comments and
policies, and re-reads the whole PR after every update.

How: one versioned Review Brief, evidence-bound findings, and incremental
re-review linked to the exact source commit and PR iteration.

After: human review effort is concentrated on architecture and risk, with fewer
low-value or stale comments.

Alternatives: Azure DevOps PR UI, GitHub Copilot code review, CodeRabbit,
Graphite, GitLab Duo, Rovo Dev.

### DevOps / release owner

Before: correlates logs, test results, commits, work items, environments, and
approvals across multiple ADO pages.

How: an evidence-driven Delivery Inbox and readiness brief propose the smallest
safe next action, then verify the remote result.

After: failure recovery and release decisions are faster and more auditable.

Alternatives: Azure Pipelines UI, scripts, dashboards, incident tools, Harness.

## 5. Strategic Trade-offs

MergePilot will not:

- Rebuild complete Kanban, Backlog, Sprint, Analytics, Test Plans, Wiki,
  Artifacts, or organization administration experiences.
- Market generic natural-language access to ADO as the primary advantage.
- Expose MCP installation, server selection, or tool catalogs to normal users.
- Auto-approve pull requests, production deployments, or priority changes.
- Maintain a second copy of work item, PR, build, or deployment truth.
- Produce an opaque project health score.
- Add a page because an ADO resource has an API.
- Optimize for every DevOps platform before the ADO vertical proves value.

These exclusions protect focus and leave room for the differentiating delivery
graph, evidence model, local context, action governance, and verification loop.

## 6. Key Metrics

North Star:

**Verified Delivery Loops per active project per week**

A loop counts only when:

1. The input goal or blocker is explicit.
2. The evidence revision is recorded.
3. The user approves any mutation.
4. The action completes.
5. MergePilot re-reads ADO and verifies the intended result.

Current-quarter OMTM:

**Median time from opening a supported blocker to a verified next action.**

Guardrails:

- Incorrect or duplicate write-back rate.
- User correction/reversal rate.
- Stale-result action prevention rate.
- Finding accept, edit, and dismiss rates.
- Insufficient-evidence rate.
- PR first-review and re-review time.
- CI failure-to-classification and failure-to-recovery time.
- Delivery graph traceability coverage.
- P50/P95 client overhead separated from provider/model latency.

## 7. Growth Strategy

Initial motion: product-led pilot with ADO-centric engineering teams.

Acquisition wedges:

- A locally installed PR preparation and CI triage workflow that does not
  require replacing ADO.
- A demo fixture that proves one Work Item → PR → CI loop in under 15 minutes.
- Evidence-rich write-back that enterprise teams can audit.
- Reuse of existing Microsoft Entra identity and ADO permissions.

Expansion path:

1. Individual developer uses Create PR and failure triage.
2. Team adopts shared review and action policies.
3. Release owners add environment readiness.
4. Managers consume verified delivery risk projections.

Commercial hypotheses to validate before pricing:

- Teams will pay for reduced review/triage time even when ADO MCP access is
  available at no additional product cost.
- Governance, local repository context, and verified write-back are valuable
  enough to distinguish MergePilot from Copilot plus ADO MCP.
- Per-active-developer pricing may be inferior to per-project or verified-loop
  pricing for occasional reviewers and release owners.

## 8. Required Capabilities

Build and own:

- Canonical delivery artifact model and graph.
- Evidence and freshness semantics.
- Action policy, approval, idempotency, verification, and audit.
- Local repository retrieval and code-to-ADO correlation.
- Turn timeline and user-facing operational UX.
- Evaluation fixtures and domain-specific quality metrics.

Reuse or adapt:

- Azure DevOps MCP/REST for transport and breadth.
- assistant-ui primitives behind the MergePilot event adapter.
- OpenCode-style part/event projection.
- Existing ADO clients and vendored Azure DevOps MCP behavior where it is
  already verified.
- Azure Service Hooks for freshness events.

Partner / defer:

- Full analytics visualization to ADO Analytics or Power BI.
- Full work planning to Azure Boards.
- Full package management to Azure Artifacts.
- Full manual testing to Azure Test Plans.

## 9. Defensibility

No single model prompt is defensible. The defensible system is the accumulated
combination of:

- Local repository and remote delivery context in one evidence graph.
- Versioned, replayable artifact snapshots and verified action outcomes.
- Team-specific accepted/dismissed finding feedback.
- Configurable action and release policies.
- A growing evaluation set of real ADO workflows and failure classes.
- Low switching risk because ADO remains the system of record, combined with
  high workflow value because MergePilot remembers how the team safely ships.

## Critical Hypotheses

1. Cross-artifact context materially improves recommendations over ADO MCP plus
   a generic chat client.
2. Users trust recommendations more when facts, inference, freshness, and
   verification are explicit.
3. The first vertical slice reduces time without increasing correction or
   unsafe action rates.
4. Teams prefer an action-focused projection over another dashboard.
5. The local runtime provides enough privacy and repository-context advantage
   to justify desktop installation.

Every cycle must test at least one hypothesis. A feature that cannot state the
hypothesis it tests should not enter implementation.
