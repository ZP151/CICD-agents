# ADR-0006: Dashboard / GUI is deferred to Phase 4

- Status: Accepted
- Date: 2026-05-18

## Context

Multiple stakeholders have asked for a "dashboard" since v0. We considered
shipping a Phase-2 web dashboard alongside the CLI but doing so before the
streaming API, AI assist, and Review Agent stabilise risks rework.

## Decision

The GUI is intentionally deferred to Phase 4 of the v2 roadmap and will be
a Tauri desktop app (see ADR-0007). Phases 1-3 deliver a usable product
through the CLI + TUI only.

The Phase 4 GUI talks to the *existing* local Dev Agent daemon over HTTP +
SSE - no new business logic in the desktop app.

## Consequences

- Positive: Phases 1-3 ship faster; the GUI inherits all features
  automatically because it reuses the daemon API.
- Negative: power users live in the CLI for ~3 months before the GUI lands;
  acceptable given the audience.

## Alternatives considered

- Ship a tiny single-page web dashboard served by the daemon in Phase 2:
  rejected because we have not finalised the SSE shape yet and partial
  dashboards tend to harden into permanent UX debt.
- Ship a VS Code extension in Phase 2: deferred until we know what the
  GUI's data model looks like; the extension can be added in a future
  phase reusing the same SSE stream.
