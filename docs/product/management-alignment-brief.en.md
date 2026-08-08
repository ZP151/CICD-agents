# MergePilot Product Direction Alignment And Next-Step Proposal

Status: Management decision brief
Date: 2026-08-05
Purpose: Clarify earlier product and development deviations, align the next
investment boundary, and request management guidance.

## 1. Management Conclusion

MergePilot remains worth developing, but it should no longer be positioned as
a generic coding agent, an AI Git client, an Azure DevOps desktop clone, or a
standalone PR review product.

Recommended positioning:

> **MergePilot is a local-first Azure DevOps delivery copilot. It connects
> local code with Azure DevOps work, review, CI, test, and deployment evidence;
> proposes governed actions; and re-reads Azure DevOps to verify the result.**

The immediate commitment should be limited to product simplification and one
real end-to-end delivery loop. Later expansion must be justified by pilot
evidence.

## 2. Earlier Product And Development Deviations

The previous direction organized the product around Azure DevOps resources and
added more tools to chat. This created several structural problems:

- Pull Requests, Review Queue, Pipelines, Activity, and Chat exposed duplicate
  entry points and state.
- `Generate insight` and `Run automated review` represented the same user goal.
- Project Link accumulated branch, pipeline, MCP, and runtime status concerns.
- PR and pipeline interactions pushed preloaded reports into Chat, mixing
  structured workflows with conversation state.
- MCP was presented as something users install and manage instead of an
  internal capability transport.
- Progress was measured by pages and features rather than verified Azure
  DevOps outcomes.

These were not isolated UI defects. They resulted from inconsistent product
objects, information architecture, and success criteria.

## 3. Market And Competitive Reality

Most standalone capabilities are already becoming commodities:

- Microsoft Azure DevOps MCP and GitHub Copilot cover work items,
  repositories, pull requests, pipelines, test plans, and AI review.
- CodeRabbit and Qodo cover Azure DevOps PR review, risk detection, suggested
  fixes, and work-item compliance.
- Harness AI covers CI/CD, failure analysis, testing, release, and governance,
  but generally requires broader platform adoption.
- The existing combination of Azure DevOps Portal, IDE, Git tools, and scripts
  remains the primary substitute.

ADO chat, generic PR summaries, Git wrappers, and MCP tool breadth are not
durable advantages. The remaining opportunity is the combination of **local
repository evidence, an ADO delivery graph, governed actions, post-write
verification, and recovery**.

## 4. Authoritative Product Scope

### Keep And Build

- Outcome-oriented surfaces: `Agent / Work / Changes / Delivery / Settings`.
- Context as the only Project Link selector; Project Link stores stable
  identity mapping only.
- A delivery graph connecting Work Item → branch/commit → PR → build/test →
  deployment.
- One `Proposal → Approval → Execution → Re-read → Verification` path.
- A public, recoverable Turn timeline and local Git-to-ADO evidence.
- One versioned Review Brief instead of multiple insight types.

### Remove Or Merge

- Standalone Review Queue; preserve a `Your turn` projection in Changes.
- Activity as primary navigation; move audit records into searchable history.
- Duplicate PR insights and pipeline click-to-chat reports.
- Composer and page-level Project Link selectors.
- Branch, pipeline, MCP, and Git status fields in Project Link.
- User-facing MCP installation, registration, catalogs, and marketplaces.

### Defer

- A generic coding-agent platform and external-agent selector.
- Full Azure Boards, Pipelines, Test Plans, or Deployment portal clones.
- External AI reviewer integrations, management health dashboards, and
  multi-platform expansion.

## 5. Recommended Next Stage

### Cycle 00 — Reset And Safe Foundation

- Establish one authoritative Turn, Artifact, and Action path.
- Complete approval, idempotency, cancellation, recovery, and verification.
- Delete duplicate navigation, insights, and legacy rendering paths.
- Separate client overhead, model TTFT, tool time, and ADO request latency.

### Cycle 01 — Prove One Golden Path

Complete this flow against an isolated, real Azure DevOps fixture:

```text
Work Item
→ local branch and change evidence
→ PR preparation and creation
→ CI tracking and failure response
→ Azure DevOps relationship/state write-back
→ authoritative re-read and verification
```

Only after Cycle 01 succeeds should the project invest in broader Changes,
CI/Test, Work Intelligence, and Deployment Readiness outcomes.

## 6. Decisions Requested From Management

1. Approve the narrowed ADO-first, local-first delivery-copilot positioning.
2. Allow removal of previously built surfaces and data paths that conflict
   with the new direction.
3. Approve investment only through Cycles 00–01 before committing to the full
   roadmap.
4. Nominate three to five real Azure DevOps teams or representative users for
   pilot validation.
5. Use outcome evidence rather than feature-completion percentage for
   continue, change, or stop decisions.

## 7. Evidence Required For Continued Investment

The next stage should prove at least three of the following:

- Materially faster preparation from Work Item to reviewable PR.
- Materially faster movement from CI failure to a trusted next action.
- Fewer incorrect, duplicate, or stale Azure DevOps writes than generic-agent
  workflows.
- Users understand the evidence for an action and can confirm that the remote
  state changed as intended.
- Pilot teams repeat complete loops over four weeks instead of trying a single
  AI output once.

If MergePilot cannot show a measurable advantage over `Azure DevOps Portal +
Copilot/MCP + IDE`, or teams do not want an additional desktop work layer, the
project should stop expanding and reassess its necessity.

## References

- [MergePilot product strategy](strategy.md)
- [Competitive landscape and market outlook](competitive-landscape.md)
- [Product scope and information architecture](scope-and-information-architecture.md)
- [Delivery graph and verified action runtime](delivery-graph-and-action-runtime.md)
- [Outcome roadmap](outcome-roadmap-2026.md)
- [Microsoft Azure DevOps Remote MCP](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops)
- [GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review)
- [CodeRabbit documentation](https://docs.coderabbit.ai/)
- [Harness AI overview](https://developer.harness.io/docs/platform/harness-ai/overview/)
