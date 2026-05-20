# ADR-0001: Long-term runtime stack is Node.js + TypeScript

- Status: Accepted
- Date: 2026-05-18

## Context

The v1 POC was built on Python (FastAPI + Typer) to validate the workflow
fast. We now need to commit to a long-term stack that:

- runs cleanly on Windows developer machines (most of our users),
- ships as a single self-contained installable artifact,
- shares code between the local Dev Agent and a cloud-hosted Review Agent,
- can later be embedded into a desktop GUI (Tauri webview),
- has first-class libraries for Tree-sitter, sqlite, OpenAI/Azure OpenAI,
  Server-Sent Events, and Azure DevOps REST.

## Decision

The v2 runtime is Node.js (current LTS) with TypeScript and Fastify.

- Single language across daemon, CLI, TUI, review agent, and the Phase 4
  desktop frontend.
- `pnpm` workspaces in a monorepo at `packages/*` and `apps/*`.
- TypeScript `strict` everywhere; ESM modules.
- HTTP layer: Fastify (smaller surface than Express, schema validation
  built in via TypeBox/Zod).
- Async work: native asyncio-equivalents via `Promise` + a single-worker
  task queue persisted in SQLite.

## Consequences

- Positive: single dependency tree for installer, smaller container images
  for the cloud review agent, shared planner/tooling/types across all
  surfaces.
- Negative: rewriting the working Python MVP; one-off port effort.
- Follow-up: ADR-0007 fixes the package layout; ADR-0004 fixes storage.

## Alternatives considered

- Stay on Python and add a Node-based UI shell: rejected because keeping
  two languages doubles maintenance and complicates the desktop story.
- Go: rejected because the OpenAI SDK and Tree-sitter ecosystem are less
  mature than Node, and our team has more TS than Go experience.
- C# (.NET): would integrate well with Azure DevOps but ties us to a
  heavier runtime on developer machines and a smaller Tree-sitter
  ecosystem.
