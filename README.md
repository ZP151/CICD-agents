# CI/CD Dev Agent Architecture

> Status: `v0.5.3` in active development.

CI/CD Dev Agent is a local-first developer agent for repository, pull request,
and Azure DevOps workflows. The current product is built around a desktop chat
client, a local daemon, shared agent/tooling packages, and source-first reuse of
mature upstream agent infrastructure.

The older Python proof of concept under `runtime/`, `cli/`, and `tests/` is
frozen. Current development lives in `packages/`, `apps/desktop/`, `docs/`, and
`third_party/`.

## System View

```text
+------------------------+
| Tauri Desktop App      |
| apps/desktop           |
|                        |
| - Chat workspace       |
| - Project Links        |
| - PR / Review views    |
+-----------+------------+
            |
            | HTTP + SSE
            v
+------------------------+
| Local Daemon           |
| packages/daemon        |
|                        |
| - Chat sessions        |
| - Approval state       |
| - Profile persistence  |
| - Workflow events      |
+-----------+------------+
            |
            | ToolContext
            v
+------------------------+        +-------------------------+
| Core Agent Runtime     |        | Review Agent            |
| packages/core          |        | packages/review-agent   |
|                        |        |                         |
| - Chat planner         |        | - PR review planning    |
| - Tool executor        |        | - Review findings       |
| - Risk policy          |        | - ADO review context    |
| - Git/build/test tools |        +-------------------------+
| - ADO + MCP bridge     |
+-----------+------------+
            |
            +--------------------+
            |                    |
            v                    v
+------------------------+   +-----------------------------+
| Local Repository       |   | Azure DevOps / MCP Servers  |
|                        |   |                             |
| - Git state            |   | - ADO REST tools            |
| - Branches             |   | - Azure DevOps MCP bridge   |
| - Build/test commands  |   | - PRs / pipelines / work    |
+------------------------+   +-----------------------------+
```

## Main Components

| Component | Path | Responsibility |
| --- | --- | --- |
| Desktop app | `apps/desktop/` | Tauri shell, chat UI, Project Link setup, PR workspace, review queue, settings. |
| Daemon | `packages/daemon/` | Local HTTP/SSE API, chat session lifecycle, approval cards, event compatibility, profile and cloud store routing. |
| Core | `packages/core/` | Planner, tool executor, tool risk policy, Git/build/test tools, Azure DevOps tools, MCP stdio bridge, Project Link model. |
| Review Agent | `packages/review-agent/` | PR review context, finding generation, decision routing for review queue and auto-approval. |
| CLI | `packages/cli/` | Thin command-line entry points for daemon and developer workflows. |
| Upstream source | `third_party/` | Vendored OpenHarness and Azure DevOps MCP sources used for source-first reuse. |
| Docs | `docs/` | Roadmap, progress tracker, architecture notes, ADRs, and source reuse registry. |

## Project Link Model

`Project Link` is the user-facing name for the workspace mapping object. It
connects a local repository to its DevOps context:

- local repository path
- default branch
- PR target branch
- Azure DevOps organization, project, and repository
- optional pipeline ID/name
- optional PAT
- optional Azure DevOps MCP bridge settings

The internal TypeScript/API name `WorkspaceProfile` is still kept for
compatibility with existing routes and storage.

## Safety And Approval Flow

```text
User request
    |
    v
Chat planner proposes tool calls
    |
    v
Tool capability policy classifies risk
    |
    +--> low risk: execute directly
    |
    +--> medium/high risk: emit approval proposal
                              |
                              v
                         User confirms
                              |
                              v
                    Confirmed-action executor runs
```

Important boundaries:

- Risk is classified centrally in `packages/core/src/tools/capabilities.ts`.
- Enforcement happens in `ToolExecutor`, not only in prompts.
- Planner execution and confirmed-action execution use separate executor
  instances.
- Azure DevOps MCP tools are mapped into the same local policy layer.

## Event Protocol

The daemon emits legacy chat events and canonical aliases for newer clients.
The compatibility layer lives in `packages/daemon/src/chatEvents.ts`.

Examples:

| Legacy | Canonical |
| --- | --- |
| `assistant_delta` | `text.delta` |
| `tool_start` | `tool.started` |
| `tool_end` | `tool.completed` |
| `workflow_state` | `workflow.updated` |
| `approval_required` | `approval.required` |
| `approval_resolved` | `approval.resolved` |
| `done` | `final` |

## Source Reuse Architecture

The project currently reuses mature upstream projects by vendoring source and
bridging behavior behind local contracts:

| Upstream | Local Boundary | Current Use |
| --- | --- | --- |
| `MaxGfeller/open-harness` | `packages/core/src/tools/executor.ts` and daemon executors | Approval-before-execute pattern adapted to local tools. |
| `microsoft/azure-devops-mcp` | `packages/core/src/tools/mcp.ts` and Project Link MCP settings | Optional Azure DevOps MCP server bridge for repositories, pipelines, and work items. |

Reuse tracking is maintained in `docs/third-party-source-reuse.md`.

## Persistence Boundaries

```text
Desktop localStorage
    |
    | inline settings/profile data for current chat
    v
Daemon profile store
    |
    +--> local JSON store under daemon data dir
    |
    +--> optional Azure Table Storage
             |
             +--> optional Key Vault PAT storage

Chat session store
    |
    +--> local JSON history
    |
    +--> optional Cosmos DB session store
```

## Release Boundary

GitHub Actions workflows live in `.github/workflows/`.

- `ci.yml` validates Node packages and desktop installer builds.
- `release.yml` is triggered by semantic version tags such as `v0.5.3` and
  creates GitHub Releases with installer assets.

## Local Toolchain

Use the repository-local Node.js and pnpm when running tests, typechecks, and
builds. On Windows, prefer the wrapper script:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```

The wrapper prepends `.tools\node-v22.11.0-win-x64` and `.tools` to `PATH`, then
executes `.tools\pnpm.exe`. This keeps local runs from accidentally using a
Codex, system, nvm, or globally installed Node.js runtime.

For Codex runs, do not request elevated sandbox permission for normal pnpm test,
typecheck, or build commands unless the normal project-local command fails with
a clear sandbox permission error. The sandbox is a permission boundary; it is
not the Node.js runtime.

## Further Architecture Documents

- `docs/architecture.md`
- `docs/dev-agent-product-roadmap-and-reuse-plan.md`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`
- `docs/adr/`
