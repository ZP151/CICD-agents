# MergePilot Product And Delivery Plan

Status: **Canonical**
Effective date: **2026-08-05**
Owners: Product, Engineering, Design
Review cadence: At the end of every development cycle

## Purpose

This directory is the authoritative product and implementation plan for
MergePilot. It replaces the earlier feature-by-feature roadmap with an
outcome-led plan centered on verified Azure DevOps delivery loops.

MergePilot is not an Azure DevOps desktop clone. It is a local-first reasoning,
governance, and verified-action layer over Azure DevOps. Azure DevOps remains
the system of record for work items, pull requests, builds, tests, deployments,
and project history.

## Product North Star

**Verified Delivery Loops per active project**

A verified delivery loop starts with a user goal or detected blocker, produces
an evidence-backed recommendation, performs a user-approved action in Azure
DevOps, re-reads the authoritative artifact, and proves the intended state was
reached.

## Canonical Documents

| Document | Decision it owns |
| --- | --- |
| [Product strategy](strategy.md) | Vision, target segments, value, trade-offs, growth, and defensibility |
| [Competitive landscape](competitive-landscape.md) | Market direction, substitutes, competitors, and positioning |
| [Scope and information architecture](scope-and-information-architecture.md) | What remains, what is rebuilt, what is removed, and target navigation |
| [Delivery graph and action runtime](delivery-graph-and-action-runtime.md) | Domain model, event ingestion, AI boundary, approvals, write-back, and verification |
| [Outcome roadmap](outcome-roadmap-2026.md) | Ordered product outcomes, metrics, dependencies, and release windows |
| [Implementation backlog](implementation-backlog.md) | Engineering epics, interfaces, migrations, test obligations, and issue slices |
| [Measurement, research, and go-to-market](measurement-research-and-gtm.md) | Product evidence, discovery, telemetry, adoption, packaging, and launch criteria |
| [Risk and governance](risk-and-governance.md) | AI quality, security, permissions, audit, privacy, and operational safeguards |
| [Completion audit](completion-audit.md) | Requirement-to-document evidence and remaining product-research gaps |
| [Next iteration known gaps](next-iteration-known-gaps.md) | Current verified implementation drift, open gates, and mandatory handoff for the next Goal |
| [v1 productization iteration](v1-productization-iteration.md) | Execution details, checkpoints, verification contract, and final Definition of Done for the next macro Goal |

## Management Communication

| Document | Purpose |
| --- | --- |
| [Management alignment brief](management-alignment-brief.md) | Concise product-direction correction, market rationale, investment boundary, and decisions requested from management |
| [Management alignment brief — English](management-alignment-brief.en.md) | English version for management review and stakeholder alignment |

This brief summarizes the canonical documents for reporting. It does not replace
their authority or create a separate roadmap.

## Development Cycles

Each cycle has exactly one primary objective. Scope that does not directly
advance that objective is deferred, even if it is useful.

| Cycle | Primary objective | Expected window |
| --- | --- | --- |
| [Cycle 00](cycles/cycle-00-reset-and-foundation.md) | Make one safe, observable execution path authoritative | 3 weeks |
| [Cycle 01](cycles/cycle-01-workitem-pr-ci-slice.md) | Prove one Work Item → PR → CI → verified write-back loop | 3 weeks |
| [Cycle 02](cycles/cycle-02-changes-lifecycle.md) | Reduce PR preparation and review decision time | 3 weeks |
| [Cycle 03](cycles/cycle-03-delivery-ci-test.md) | Reduce CI failure investigation and recovery time | 3 weeks |
| [Cycle 04](cycles/cycle-04-work-intelligence.md) | Keep work items aligned with actual delivery state | 3 weeks |
| [Cycle 05](cycles/cycle-05-deployment-readiness.md) | Make deployment approval evidence complete and current | 4 weeks |
| [Cycle 06](cycles/cycle-06-product-hardening.md) | Prove repeatable value, safety, and operability for pilot teams | 3 weeks |

Cycle length is a planning constraint, not a promise. A cycle closes only when
its outcome gate is proven in a real Project Link fixture. Unfinished scope does
not silently roll into the next cycle; it is re-prioritized against the next
cycle's primary objective.

## Product Simplicity Rules

1. Azure DevOps is the only remote source of truth.
2. One artifact has one canonical local snapshot and one writer.
3. One user intent produces one workspace outcome, not multiple insight types.
4. Every mutating action is previewed, approved, executed, re-read, and verified.
5. Deterministic facts and model inferences are visibly different.
6. Navigation is organized by user outcomes: New chat, Work, Changes, Delivery,
   Settings.
7. Project Link selection appears only in Context.
8. Context never becomes a Git status dashboard; it does not show changes,
   ahead, or behind.
9. MCP is an internal capability transport. The product does not expose an MCP
   installer, registry, catalog, or marketplace.
10. If Azure DevOps already provides a strong editor or visualization,
    MergePilot links to it instead of cloning it.

## Authority And Historical Documents

The following documents remain useful implementation history but are no longer
the source of product scope:

- `docs/dev-agent-product-roadmap-and-reuse-plan.md`
- `docs/dev-agent-progress-tracker.md`
- conversation-specific progress trackers
- manual-test iteration plans

Their implementation evidence can be reused. Their old phase order, Review
Queue direction, and auto-approval assumptions must not override this plan.

## Operating Rhythm

At cycle start:

- Confirm the primary outcome and baseline metric.
- Select only backlog items needed to prove that outcome.
- Record the Project Link fixture and ADO permissions used for validation.
- Confirm explicit non-goals.

During the cycle:

- Demonstrate a walking skeleton by the end of the first week.
- Keep all writes behind the action policy and verification path.
- Measure user-visible and service latency separately.
- Update the cycle evidence ledger, not a subjective completion percentage.

At cycle end:

- Run the documented real-world scenario against an isolated ADO project.
- Review telemetry, failed assumptions, and user observations.
- Decide continue, change, or stop based on evidence.
- Update this index if product scope or document authority changes.
