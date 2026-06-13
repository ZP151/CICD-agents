# Product

## Register

product

## Users

CI/CD Dev Agent is used by developers, tech leads, and DevOps-oriented engineers who are already inside a repository workflow. They are usually reviewing local changes, preparing commits, inspecting pull requests, checking Azure DevOps context, or deciding whether an automated action is safe to run.

Users need the interface to feel like an operational workbench: compact, evidence-rich, fast to scan, and trustworthy during repeated daily use.

## Product Purpose

The product is a local-first developer agent for repository, pull request, and Azure DevOps workflows. It connects a local repository to DevOps context through Project Links, then helps the user understand code changes, reason about PR risk, execute Git and Azure DevOps actions, and review AI insight with clear evidence and controlled approval boundaries.

Success means the user can ask for a development workflow, see what the agent inspected, understand why a risky action is proposed, approve only the intended scope, and continue without context drift.

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

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. Interactive approval, composer, timeline, and artifact controls must be keyboard reachable with visible focus states. Motion should be brief, state-driven, and compatible with reduced-motion preferences. Semantic color must not be the only way to distinguish status or risk.
