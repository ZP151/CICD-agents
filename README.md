# MergePilot

Local-first AI workspace for pull requests, repository context, Azure DevOps, and delivery workflows.

MergePilot is a desktop developer assistant that connects a local repository to its Azure DevOps project. It helps inspect code changes, explain project context, review pull requests, analyze pipeline evidence, and run approval-gated workflow actions without moving source code into a hosted service.

## What It Does

- Understands a local repository through source indexing and chat context.
- Reviews pull requests with file, thread, pipeline, and policy evidence.
- Discovers Azure DevOps projects, repositories, pull requests, and pipelines.
- Runs Git and delivery workflow actions behind an approval boundary.
- Keeps Project Links as the mapping between a local repo and its DevOps context.
- Stores data locally by default, with optional Azure-backed persistence.

## Architecture

```text
Tauri Desktop
  -> Local Daemon HTTP/SSE API
  -> Core planner, tools, repository index, Azure DevOps clients
  -> Optional review-agent service for PR review decisions
  -> Local repo + Azure DevOps
```

| Area | Path |
| --- | --- |
| Desktop app | `apps/desktop` |
| Local daemon | `packages/daemon` |
| Core planner and tools | `packages/core` |
| Review service | `packages/review-agent` |
| CLI | `packages/cli` |
| Release workflows | `.github/workflows` |

## Key Concepts

**Project Link**

A Project Link maps one local repository to its Azure DevOps organization, project, repository, default branch, and PR target branch.

**Approval boundary**

Read-only inspection can run directly. Mutating actions such as staging files, committing, pushing, creating pull requests, or triggering pipelines require an explicit approval step.

**Local-first runtime**

The desktop app talks to a local daemon. Repository context, chat history, checkpoints, and workflow state are handled locally unless Azure-backed persistence is explicitly configured.

## Development

Use the repository-local toolchain.

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```

Run targeted tests:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/route-cache.spec.ts --project=chromium
```

## Release

Releases are created by pushing a semantic version tag.

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
git tag "v$version"
git push origin "v$version"
```

The release workflow builds Windows and macOS installers and publishes them to GitHub Releases.

## Documentation

- Canonical product and delivery plan: `docs/product/README.md`
- `PRODUCT.md`
- `docs/architecture.md`
- `docs/dev-agent-product-roadmap-and-reuse-plan.md`
- `docs/dev-agent-progress-tracker.md`
- `docs/third-party-source-reuse.md`
