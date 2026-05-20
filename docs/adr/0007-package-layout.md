# ADR-0007: Package and repository layout

- Status: Accepted
- Date: 2026-05-18

## Context

The v2 codebase contains multiple deliverables that share a code core:
local daemon, CLI/TUI, cloud Review Agent, and (later) a desktop GUI. We
need a layout that supports a single TypeScript core with multiple thin
entry points and avoids version drift between them.

## Decision

A pnpm-workspaces monorepo:

```
cicd-agent/
  package.json           # workspace root, scripts only
  pnpm-workspace.yaml
  tsconfig.base.json
  packages/
    core/                # shared library: indexer, planner, context,
                         # executor, llm, memory, db, types
    daemon/              # Fastify HTTP API + SSE + task queue
    cli/                 # commander entrypoint + ink TUI shell
    review-agent/        # Fastify webhook receiver for ADO PR events
  apps/
    desktop/             # Tauri shell + React/shadcn frontend (Phase 4)
  docs/
    adr/                 # this directory
  python-poc/            # v1 Python POC (frozen after Phase 1)
  .github/workflows/     # CI matrix
```

Rules:

- `packages/core` has zero dependencies on `daemon`, `cli`, or `review-agent`.
- `daemon`, `cli`, and `review-agent` depend on `core` and only `core`.
- `apps/desktop` is a separate workspace; it talks to the daemon over HTTP.
- All packages share `tsconfig.base.json` and ESLint config.
- Each package exports its public API via a single `src/index.ts`.

## Consequences

- Positive: one TS toolchain, type sharing for free, dependency graph stays
  acyclic; a single `pnpm install` brings up everything.
- Negative: pnpm is required (not npm or yarn) on developer machines; we
  document this in the README.

## Alternatives considered

- npm workspaces: rejected because pnpm's content-addressed store is
  significantly faster and the hoisting model is stricter (helps catch
  accidental implicit deps).
- Nx / Turborepo: deferred; we may add Turborepo for caching once CI
  starts feeling slow.
- One mono-package: rejected because the cloud review agent and the
  desktop app should ship without the entire codebase.
