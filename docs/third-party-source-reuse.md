# Third-Party Source Reuse Registry

## Purpose

This file tracks every upstream project that is evaluated, copied, vendored,
forked, ported, or added as a dependency.

The project strategy is source-first reuse, but reuse must remain auditable.
Every direct source copy must preserve license obligations and identify the
exact upstream commit.

## Reuse Status Legend

- `Evaluated`: inspected for fit, not used yet.
- `Dependency candidate`: likely usable as a package, not installed yet.
- `Dependency`: installed as a package.
- `External process candidate`: likely usable as a separate process.
- `External process`: integrated as a separately launched process.
- `Copied`: source files copied into this repository.
- `Ported`: behavior ported from another language/runtime.
- `Fork candidate`: may need a maintained fork.
- `Reference only`: useful for design, but no source reuse planned.

## Current Registry

| Upstream | License | Status | Reuse Mode | Local Destination | Notes |
| --- | --- | --- | --- | --- | --- |
| `MaxGfeller/open-harness` / `@openharness/core` | MIT | Copied and ported selected logic | Vendored source plus selected TypeScript port | `third_party/open-harness` | Upstream commit `c45c9343962a3832bf3eb3456170a59414bf18d9`. `@openharness/core@0.6.2` exposes TypeScript agent primitives, typed events, tools, providers, MCP dependencies, and uses `zod@4`. Direct dependency should wait for a compatibility wrapper or zod boundary decision. The approval-before-execute pattern has been ported into `ToolExecutor` and wired into daemon planner execution. |
| `microsoft/azure-devops-mcp` / `@azure-devops/mcp` | MIT | Copied; optional external process bridge started | Vendored source, MCP external process first | `third_party/azure-devops-mcp` | Upstream commit `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1`. Package version `2.7.0`; uses `@modelcontextprotocol/sdk@1.29.0`, `azure-devops-node-api@15.1.2`, and `zod@3.25.63`. Strong Phase 4 source for repositories, PRs, pipelines, work items, auth, and MCP tool registration. Local stdio MCP bridge can discover and wrap these tools behind `CICD_AGENT_ADO_MCP_ENABLED`. |
| `The-PR-Agent/pr-agent` | Apache-2.0 | Fork candidate | Fork, vendor selected modules, or port selected logic | None yet | Candidate for PR compression, review prompts, and Review Queue policy logic. |
| `Aider-AI/aider` | Apache-2.0 | Port candidate | Port selected behavior to TypeScript | None yet | Candidate for repo map and Git checkpoint discipline. |
| `aaif-goose/goose` | Apache-2.0 | Reference only for now | Selective source study or port | None yet | Useful for desktop/CLI/API runtime architecture. |
| `anomalyco/opencode` | MIT | Reference only for now | Selective source study or port | None yet | Useful for coding agent session and UX patterns. |
| `lastmile-ai/mcp-agent` | Apache-2.0 | Reference only for now | Port concepts | None yet | Useful for MCP-first orchestration and persistent state concepts. |
| `OpenHands/OpenHands` | MIT core with additional boundaries | Reference only | Reference only unless isolated module is chosen | None yet | Too heavy to embed directly; useful for sandbox and evaluation concepts. |

## Direct Source Copies

When source files are copied, add a row here:

| Date | Upstream | Commit SHA | License | Upstream Paths | Local Paths | Modified? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-09 | `MaxGfeller/open-harness` | `c45c9343962a3832bf3eb3456170a59414bf18d9` | MIT | `LICENSE`, `README.md`, `package.json`, `packages/core/**` | `third_party/open-harness/**` | No direct upstream edits; selected behavior ported separately | Source-first intake for typed events, middleware, MCP, and approval-before-execute patterns. |
| 2026-06-09 | `microsoft/azure-devops-mcp` | `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1` | MIT | `LICENSE.md`, `README.md`, `package.json`, `package-lock.json`, root project config, `src/**`, `docs/**`, `test/**`, `mcp.json`, `server.json` | `third_party/azure-devops-mcp/**` | No direct upstream edits | Source-first intake for Azure DevOps MCP tools covering repositories, pull requests, pipelines, work items, auth, and MCP registration. |

## Dependency Additions

No new upstream dependencies have been added for the roadmap work yet.

When a dependency is added, add a row here:

| Date | Package | Version | License | Added To | Reason | Compatibility Notes |
| --- | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - | - |

## Evaluation Notes

### 2026-06-09: `microsoft/azure-devops-mcp`

Source copied with:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/microsoft/azure-devops-mcp.git third_party/azure-devops-mcp
git sparse-checkout set --skip-checks LICENSE.md README.md package.json package-lock.json tsconfig.json src docs test mcp.json server.json
```

Findings:

- Package: `@azure-devops/mcp`
- Version: `2.7.0`
- License: `MIT`
- Commit: `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1`
- Runtime dependencies include:
  - `@modelcontextprotocol/sdk@1.29.0`
  - `azure-devops-node-api@15.1.2`
  - `zod@3.25.63`
- High-value source modules:
  - `src/tools/repositories.ts`
  - `src/tools/pipelines.ts`
  - `src/tools/work-items.ts`
  - `src/tools.ts`
  - `src/auth.ts`
  - `src/index.ts`

Decision:

- Keep source vendored now.
- Do not install or import the upstream package in production code yet.
- Use external MCP process integration first, because that reuses the maintained
  server directly and avoids prematurely duplicating a large ADO tool surface.
- If process integration is too heavy for desktop packaging, port selected
  adapter code from the vendored files into local tools.

Local integration:

- `packages/core/src/tools/mcp.ts` adds a minimal stdio MCP client that supports
  `initialize`, `tools/list`, and `tools/call`.
- `packages/core/src/tools/mcp.ts` maps MCP tool definitions into local
  `ToolExecutor` tools.
- `packages/core/src/tools/capabilities.ts` classifies `mcp_ado_*` tools so
  read-only MCP tools can run directly and mutating MCP tools require approval.
- `packages/daemon/src/chatSession.ts` optionally discovers Azure DevOps MCP
  tools when `CICD_AGENT_ADO_MCP_ENABLED=1`.

Runtime switch:

```powershell
$env:CICD_AGENT_ADO_MCP_ENABLED = "1"
$env:CICD_AGENT_ADO_MCP_COMMAND = "mcp-server-azuredevops"
$env:CICD_AGENT_ADO_MCP_DOMAINS = "repositories,pipelines,work-items"
```

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/mcpTools.test.ts test/toolCapabilities.test.ts test/toolExecutor.test.ts test/chatPlannerApproval.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatEvents.test.ts test/chatSessionWorkflow.test.ts
```

### 2026-06-09: `@openharness/core`

Package metadata checked with:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe view @openharness/core version license repository description dist-tags --json
.\.tools\pnpm.exe view @openharness/core dependencies peerDependencies exports --json
```

Findings:

- Version: `0.6.2`
- License: `MIT`
- Repository: `https://github.com/MaxGfeller/open-harness.git`, directory
  `packages/core`
- Exports:
  - `.`
  - `./providers`
- Dependencies:
  - `@ai-sdk/mcp`
  - `ai`
  - `zod@4`
- Peer dependency:
  - `zod@4`

Decision:

- Do not install as a package yet.
- Keep vendored source under `third_party/open-harness` for selective porting.
- Next step is to design a wrapper boundary so this project can map
  OpenHarness-style typed events and approvals into the existing daemon protocol
  without forcing an immediate project-wide `zod@3` to `zod@4` migration.

### 2026-06-09: Ported OpenHarness approval-before-execute pattern

Upstream reference:

- `third_party/open-harness/packages/core/src/agent.ts`
- Upstream types:
  - `ToolCallInfo`
  - `ApproveFn`
  - `ToolDeniedError`
  - `wrapToolsWithApproval`

Local implementation:

- `packages/core/src/tools/executor.ts`
- `packages/daemon/src/chatSession.ts`
- Local types:
  - `ToolCallInfo`
  - `ToolApproveFn`
  - `ToolDeniedError`
- Daemon runtime usage:
  - planner executor uses the approval hook as a defense-in-depth gate
  - confirmed-action executor is separate, so stored user-approved actions can
    run without a second denial pass

Rationale:

The local `Tool` type differs from the Vercel AI SDK `ToolSet` shape used by
OpenHarness, so the behavior was ported instead of copied verbatim.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core test -- test/toolExecutor.test.ts test/chatPlannerApproval.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon test -- test/chatEvents.test.ts test/chatSessionWorkflow.test.ts
```

### 2026-06-09: Project Link-backed Azure DevOps MCP enablement

Upstream reference:

- `third_party/azure-devops-mcp`
- Upstream package command: `mcp-server-azuredevops`

Local implementation:

- `packages/core/src/tools/mcp.ts`
- `packages/core/src/profiles.ts`
- `packages/core/src/store/tableProfileStore.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/pages/Profiles.tsx`
- `apps/desktop/src/pages/Chat.tsx`

Reuse boundary:

- The local daemon still owns the MCP stdio bridge and policy mapping.
- The upstream Azure DevOps MCP server remains the preferred tool source when a
  Project Link enables the bridge.
- Project Link fields now carry the runtime MCP configuration:
  - `adoMcpEnabled`
  - `adoMcpCommand`
  - `adoMcpAuthentication`
  - `adoMcpDomains`
- Environment variables remain a global fallback:
  - `CICD_AGENT_ADO_MCP_ENABLED`
  - `CICD_AGENT_ADO_MCP_COMMAND`
  - `CICD_AGENT_ADO_MCP_AUTHENTICATION`
  - `CICD_AGENT_ADO_MCP_DOMAINS`
  - `CICD_AGENT_ADO_MCP_TIMEOUT_MS`

Decision:

- Keep the upstream source vendored and launch it as an external MCP server.
- Prefer Project Link-level enablement over process-wide environment-only
  enablement so different repositories can opt into MCP reuse independently.
- Do not remove local ADO tools yet; run both tool surfaces behind the existing
  approval and risk policy layer until MCP coverage is proven in integration
  tests.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @cicd-agent/core build
.\.tools\pnpm.exe --filter @cicd-agent/review-agent build
.\.tools\pnpm.exe --filter @cicd-agent/core typecheck
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
.\.tools\pnpm.exe --filter @cicd-agent/desktop typecheck
.\.tools\pnpm.exe --filter @cicd-agent/core test
.\.tools\pnpm.exe --filter @cicd-agent/daemon test
.\.tools\pnpm.exe --filter @cicd-agent/desktop build
```
