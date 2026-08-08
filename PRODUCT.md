# MergePilot Product Definition

Status: Canonical summary. Detailed strategy and implementation planning live in
[`docs/product/`](docs/product/README.md).

## Users

MergePilot serves Azure DevOps developers, tech leads/reviewers, and
DevOps/release owners who repeatedly cross local code, Azure Boards, Repos,
Pipelines, Tests, and Environments to complete delivery work.

Users need the interface to feel like an operational workbench: compact,
evidence-rich, fast to scan, and trustworthy during repeated daily use.

## Product Purpose

MergePilot is a local-first Azure DevOps delivery copilot. It connects local
repository evidence to versioned ADO work items, pull requests, builds, tests,
and deployments; proposes the smallest useful next action; executes mutations
only after policy and user approval; then re-reads Azure DevOps to verify the
intended result.

Azure DevOps remains the system of record. MergePilot is the reasoning,
governance, orchestration, and verified-action layer. It is not a replacement
for the ADO portal, a generic chatbot, an MCP manager, or an autonomous release
authority.

Success means a user can move from a delivery goal or blocker to a verified ADO
outcome with less repeated investigation, less manual synchronization, and no
loss of accountability.

## North Star

**Verified Delivery Loops per active project.**

A loop counts only when evidence and revisions are recorded, the user approves
any mutation, the action executes, and the resulting ADO state is re-read and
verified.

## Product Surfaces

- **Agent** — cross-domain requests and governed execution.
- **Work** — action-focused Boards projections and verified work-item updates.
- **Changes** — PR creation, author/reviewer lifecycle, and `Your turn`.
- **Delivery** — CI failure, test quality, environment readiness, and recovery.
- **Settings** — account, models, policy, privacy, diagnostics, and built-in
  capabilities.

Project Link selection appears only in Context. Context shows mapping, sources,
and capability health; it does not show changes or ahead/behind. MCP remains an
internal capability transport and has no install/register/catalog product UI.

## Brand Personality

Precise, calm, and accountable.

The product should feel like a serious developer tool rather than a generic chatbot. It should project expert confidence through clear state, exact command context, compact evidence, and restrained interaction design.

## Anti-references

- Generic chatbot bubbles that hide tool work behind vague assistant text.
- Template-like approval cards that ask for confirmation without showing scope, command arguments, readiness, or consequences.
- Decorative SaaS gradients, oversized cards, glassmorphism, and marketing-style hero composition.
- Wizard-like fixed flows that continue beyond the user's requested boundary.
- Dense terminal dumps without summary, grouping, or recovery guidance.

## Design Principles

1. Show observable work, not hidden reasoning.
2. Make risky actions explicit before execution.
3. Keep workflow scope under the user's control.
4. Use compact, structured evidence instead of long static templates.
5. Prefer familiar developer-tool affordances over decorative novelty.
6. Keep Azure DevOps authoritative; never create a second project-state owner.
7. Prefer one cross-artifact delivery loop over several disconnected insights.
8. Verify every remote mutation before presenting it as complete.

## Explicit Non-goals

- Full Azure Boards, Dashboard, Test Plans, Wiki, Artifacts, or admin clones.
- A standalone Review Queue or duplicate PR insight products.
- Automatic PR votes, merges, production approvals, priority changes, or
  rollbacks.
- User-managed MCP catalogs or connector installation.
- Opaque project health scores without actionable evidence.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. Interactive approval, composer, timeline, and artifact controls must be keyboard reachable with visible focus states. Motion should be brief, state-driven, and compatible with reduced-motion preferences. Semantic color must not be the only way to distinguish status or risk.
