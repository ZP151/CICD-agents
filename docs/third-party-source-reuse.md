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
| `microsoft/azure-devops-mcp` / `@azure-devops/mcp` | MIT | Copied; selected behavior now being ported internally; optional external bridge kept as fallback | Vendored source plus internal TypeScript ports | `third_party/azure-devops-mcp` | Upstream commit `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1`. Package version `2.7.0`; uses `@modelcontextprotocol/sdk@1.29.0`, `azure-devops-node-api@15.1.2`, and `zod@3.25.63`. Strong Phase 4 source for repositories, PRs, pipelines, work items, auth, and MCP tool registration. Product code should prefer internal ports; local stdio MCP bridge remains compatibility/fallback infrastructure only. |
| `qodo-ai/pr-agent` / `The-PR-Agent/pr-agent` | Apache-2.0 | Copied; selected behavior now being ported internally | Vendored source plus selected TypeScript ports | `third_party/pr-agent` | Upstream commit `31d7dd027968e5fad1f9cbb074be047c4869058e`. Candidate source for PR diff compression, review prompts, finding categories, readiness/risk signals, and Review Queue policy logic. Current product code ports selected insight/readiness behavior into the local daemon rather than invoking PR-Agent as an external service. |
| `Aider-AI/aider` | Apache-2.0 | Port candidate | Port selected behavior to TypeScript | None yet | Candidate for repo map and Git checkpoint discipline. |
| `assistant-ui/assistant-ui` / `@assistant-ui/react` | MIT | Dependency | React message/runtime primitives behind a local adapter | `apps/desktop/src/pages/chat/assistantUi` | Pinned to `0.15.1`. Reuses the upstream `ThreadMessageLike` protocol first; the existing daemon SSE contract and approved-action gate remain canonical. |
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
| 2026-06-11 | `qodo-ai/pr-agent` | `31d7dd027968e5fad1f9cbb074be047c4869058e` | Apache-2.0 | `LICENSE`, `README.md`, `.pr_agent.toml`, `pyproject.toml`, `requirements.txt`, `pr_agent/**`, `tests/**` | `third_party/pr-agent/**` | No direct upstream edits; nested `.git` removed after recording commit | Source-first intake for PR review prompts, diff compression, provider mappings, finding categories, and review-readiness heuristics. |

## Dependency Additions

| Date | Package | Version | License | Added To | Reason | Compatibility Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-31 | `@assistant-ui/react` | `0.15.1` | MIT | `apps/desktop` | Progressive reuse of desktop-agent Thread, Composer, tool-call, and approval primitives. | Wrapped through `assistantUi/mergepilotThreadMessages.ts`; MergePilot's current SSE events, tool policy, and approval gate are unchanged. |
| 2026-08-03 | `@modelcontextprotocol/sdk` | `^1.30.0` | MIT | `packages/core` | MP-015: replace hand-written stdio frame/parser with the official SDK-backed `McpConnectionManager` (lifecycle, capability negotiation, pagination, `tools/list_changed`, standard cancellation, structured results). | Node >=18 (repo runtime 22 ✓); zod `^3.25 \|\| ^4` resolves nested under the SDK while repo keeps `zod@^3.23` at its own boundary; v2 remains pre-release and is NOT a baseline. Wrapped behind local `McpConnectionManager`/`StdioMcpClient` interface; upstream types never reach UI/domain. |
| 2026-08-03 | `@radix-ui/react-popover` | `^1.1.23` | MIT | `apps/desktop` | MP-012: base for the accessible searchable Project Link Combobox (trigger, portal content, focus, Escape). | React 18 peer ✓; sibling of existing Radix dropdown/dialog/tabs/tooltip deps. Only the local `ProjectLinkCombobox` consumes it; no upstream types leak into domain code. |

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
- Do not install or import the upstream package directly in production code yet.
- Superseded direction as of 2026-06-10: port selected Azure DevOps MCP
  behavior into local core modules as the primary product path.
- Keep external MCP process integration only as compatibility/fallback
  infrastructure and as a reference harness while internal coverage grows.

Local integration:

- `packages/core/src/tools/mcp.ts` adds a minimal stdio MCP client that supports
  `initialize`, `tools/list`, and `tools/call`.
- `packages/core/src/tools/mcp.ts` maps MCP tool definitions into local
  `ToolExecutor` tools.
- `packages/core/src/tools/capabilities.ts` classifies `mcp_ado_*` tools so
  read-only MCP tools can run directly and mutating MCP tools require approval.
- `packages/daemon/src/chatSession.ts` optionally discovers Azure DevOps MCP
  tools when the Project Link or global compatibility fallback enables the
  bridge.

Runtime switch:

```powershell
$env:MERGEPILOT_ADO_MCP_ENABLED = "1"
$env:MERGEPILOT_ADO_MCP_COMMAND = "mcp-server-azuredevops"
$env:MERGEPILOT_ADO_MCP_DOMAINS = "repositories,pipelines,work-items"
```

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/mcpTools.test.ts test/toolCapabilities.test.ts test/toolExecutor.test.ts test/chatPlannerApproval.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/chatEvents.test.ts test/chatSessionWorkflow.test.ts
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
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/toolExecutor.test.ts test/chatPlannerApproval.test.ts test/toolCapabilities.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core typecheck
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/chatEvents.test.ts test/chatSessionWorkflow.test.ts
```

### 2026-06-09: Project Link-backed Azure DevOps MCP enablement

Upstream reference:

- `third_party/azure-devops-mcp`
- Upstream package command: `mcp-server-azuredevops`

Local implementation:

- `packages/core/src/tools/mcp.ts`
- `packages/core/src/profiles.ts`
- `packages/core/src/store/tableProjectLinkStore.ts`
- `packages/daemon/src/chatSession.ts`
- `packages/daemon/src/server.ts`
- `apps/desktop/src/pages/ProjectLinks.tsx`
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
  - `MERGEPILOT_ADO_MCP_ENABLED`
  - `MERGEPILOT_ADO_MCP_COMMAND`
  - `MERGEPILOT_ADO_MCP_AUTHENTICATION`
  - `MERGEPILOT_ADO_MCP_DOMAINS`
  - `MERGEPILOT_ADO_MCP_TIMEOUT_MS`
  - legacy `CICD_AGENT_ADO_MCP_*` names are compatibility fallbacks only

Decision:

- Keep the upstream source vendored and port selected capabilities internally.
- Treat Project Link-level external MCP enablement as a fallback path, not as
  the final product integration model.
- Do not remove local ADO tools yet; run both tool surfaces behind the existing
  approval and risk policy layer until MCP coverage is proven in integration
  tests.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/review-agent build
.\.tools\pnpm.exe --filter @mergepilot/core typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

### 2026-06-10: Daemon coverage for Project Link-enabled MCP registration

Local implementation:

- `packages/daemon/src/chatSession.ts`
- `packages/daemon/test/chatSessionMcp.test.ts`

What changed:

- The daemon chat tool executor factory is now exported as an internal testable
  boundary.
- `adoMcpCommand` can include additional command arguments, which allows both
  real deployments and tests to launch a specific MCP server command line.
- A fake stdio MCP server now verifies that a Project Link-enabled tool context
  registers and calls an `mcp_ado_*` tool through the local chat runtime.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/chatSessionMcp.test.ts
.\.tools\pnpm.exe --filter @mergepilot/daemon test
```

Result:

- Focused MCP registration test passed.
- Daemon full tests passed: 4 files, 23 tests.

### 2026-06-10: MCP-backed Project Link discovery

Upstream reference:

- `third_party/azure-devops-mcp/docs/TOOLSET.md`
- Upstream MCP tools:
  - `mcp_ado_core_list_projects`
  - `mcp_ado_repo_list_repos_by_project`
  - `mcp_ado_pipelines_get_build_definitions`

Local implementation:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ProjectLinks.tsx`
- `apps/desktop/src/pages/Chat.tsx`

Reuse boundary:

- The local daemon owns the `/profiles/discover` product API, request
  validation, and response normalization.
- This bridge-backed implementation was superseded later on 2026-06-10 by the
  internal source-port implementation. Keep this entry as historical context
  for how the tool contract was validated.
- The desktop receives a stable option shape instead of binding directly to the
  upstream response format:
  - `id`
  - `name`
  - `description`
  - `url`

Decision:

- Superseded decision: bridge-backed discovery proved the product flow, but the
  final product path is internal source-porting rather than permanent external
  MCP execution.
- Keep the normalizer local so the UI can remain stable if upstream MCP output
  changes slightly.
- Reuse the same discovery API in both the management page and in-chat
  onboarding so the no-Project-Link workflow does not fork into a weaker path.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Focused daemon server tests passed.
- Daemon full tests passed: 4 files, 24 tests.
- Desktop typecheck passed.
- Desktop production build passed.

### 2026-06-10: Project Link MCP bridge health check

Upstream reference:

- `third_party/azure-devops-mcp`
- MCP `tools/list` discovery behavior exposed through the local stdio bridge.

Local implementation:

- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ProjectLinks.tsx`
- `apps/desktop/src/pages/Chat.tsx`

Reuse boundary:

- This bridge-backed health check was superseded later on 2026-06-10 by the
  internal ADO tool health implementation.
- The daemon first exposed a product-level endpoint, `/profiles/check-mcp`,
  rather than exposing raw MCP protocol details to the desktop. The internal
  implementation now uses `/profiles/check-ado-tools`, with `/profiles/check-mcp`
  kept as a compatibility alias.
- The desktop receives a stable status result with:
  - `ok`
  - `toolCount`
  - `tools`

Decision:

- Superseded decision: keep the health-check product API, but validate the
  internal ADO tool path first; external MCP process checks are fallback-only.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Focused daemon server tests passed: 8 tests.
- Daemon full tests passed: 4 files, 25 tests.
- Desktop typecheck passed.
- Desktop production build passed.

### 2026-06-10: First internal Azure DevOps MCP capability ports

Upstream reference:

- `third_party/azure-devops-mcp/src/tools/core.ts`
- `third_party/azure-devops-mcp/src/tools/repositories.ts`
- `third_party/azure-devops-mcp/src/tools/pipelines.ts`

Local implementation:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/pages/ProjectLinks.tsx`
- `apps/desktop/src/pages/Chat.tsx`

What was ported:

- ADO project discovery:
  - upstream reference: `core_list_projects`
  - local implementation: `listAzureProjects`
- ADO repository discovery:
  - upstream reference: `repo_list_repos_by_project`
  - local implementation: `listAzureRepositories`
- ADO build definition discovery:
  - upstream reference: `pipelines_get_build_definitions`
  - local implementation: `listAzureBuildDefinitions`
- ADO tool health manifest:
  - local implementation: `checkAzureDevOpsTools`

Reuse boundary:

- The upstream MCP source defines the target capability shape and behavior.
- Local code uses this repository's existing Azure DevOps auth and REST helper
  layer, avoiding a permanent dependency on an external MCP process.
- The product API now returns `source: "internal"` for discovery and tool health
  checks. The preferred health route is `/profiles/check-ado-tools`; the older
  `/profiles/check-mcp` route remains as a compatibility alias.
- External MCP settings remain in the UI only as fallback compatibility while
  more upstream capabilities are internalized.

Decision:

- Continue with internal source-porting for read-only Azure DevOps MCP tools
  before mutating operations.
- Keep low-level MCP bridge tests because they still protect fallback
  compatibility, but product-level tests should assert internal behavior.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core typecheck
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Core typecheck and build passed.
- Core full tests passed: 14 files, 46 tests.
- Daemon typecheck passed.
- Focused daemon server tests passed: 8 tests.
- Daemon full tests passed: 4 files, 25 tests.
- Desktop typecheck passed.
- Desktop production build passed.

### 2026-06-10: Internal PR and pipeline read-only Azure DevOps MCP ports

Upstream reference:

- `third_party/azure-devops-mcp/src/tools/repositories.ts`
- `third_party/azure-devops-mcp/src/tools/pipelines.ts`

Local implementation:

- `packages/core/src/tools/azureDevOps.ts`
- `packages/core/test/azureDevOpsInternal.test.ts`
- `packages/daemon/src/server.ts`
- `packages/daemon/test/server.test.ts`
- `apps/desktop/src/api.ts`

What was ported:

- PR detail:
  - upstream reference: `repo_get_pull_request_by_id`
  - local implementation: `getAzurePullRequestById`
- PR threads:
  - upstream reference: `repo_list_pull_request_threads`
  - local implementation: `listAzurePullRequestThreads`
- Build list:
  - upstream reference: `pipelines_get_builds`
  - local implementation: `listAzureBuilds`
- Pipeline run detail:
  - upstream reference: `pipelines_get_run`
  - local implementation: `getAzurePipelineRun`

Reuse boundary:

- The implementation ports the behavior and output trimming strategy into this
  repository's existing REST/auth helper layer.
- It does not start or call the upstream MCP server.
- Product endpoint `GET /profiles/:id/pull-requests/:pullRequestId/context`
  composes these internal helpers into Project Link-level PR context.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core typecheck
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Focused Azure DevOps internal-port tests passed: 4 tests.
- Core full tests passed: 15 files, 50 tests.
- Focused daemon server tests passed: 9 tests.
- Daemon full tests passed: 4 files, 26 tests.
- Desktop production build passed.

### 2026-06-10: Project Link ADO field inference from local git remotes

Source basis:

- Local git remote metadata:
  - `git remote -v`
- Existing internal Azure DevOps REST/discovery path:
  - `listAzureProjects`
  - `listAzureRepositories`
  - `listAzureBuildDefinitions`

Why this matters:

- Project Link setup should not make users retype fields that already exist in
  their repository configuration.
- The Azure DevOps MCP source-porting direction remains internal:
  - ADO project/repository/pipeline data is fetched by local TypeScript REST
    helpers.
  - The external MCP bridge remains optional fallback infrastructure.
- Local git remote inference reduces setup friction before the app has enough
  auth context to call Azure DevOps discovery APIs.

What was added:

- Daemon endpoint:
  - `GET /git/azure-devops-remote`
- Supported remote formats:
  - `https://dev.azure.com/{org}/{project}/_git/{repo}`
  - `https://{org}.visualstudio.com/{project}/_git/{repo}`
  - `git@ssh.dev.azure.com:v3/{org}/{project}/{repo}`
  - `ssh.dev.azure.com/v3/{org}/{project}/{repo}`
- Desktop API/helper:
  - `fetchAzureDevOpsRemoteSuggestionFromDaemon`
  - `fetchAzureDevOpsRemoteSuggestion`
- UI integrations:
  - Project Links management form
  - in-chat Project Link creation card

Reuse boundary:

- This is not an external service integration.
- The app reads local git metadata and maps it into the existing Project Link
  model.
- Auto-fill only populates empty fields and does not override user edits.
- Pipeline selection still uses internal ADO discovery because pipeline identity
  is not reliably encoded in git remotes.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @mergepilot/desktop build
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
```

Result:

- Daemon typecheck passed.
- Desktop typecheck passed.
- Focused daemon server tests passed: 10 tests.
- Focused Azure DevOps internal-port tests passed: 5 tests.
- Desktop production build passed.
- Core full tests passed: 15 files, 51 tests.
- Daemon full tests passed: 4 files, 27 tests.

### 2026-06-11: ADO auth-mode diagnostics and PR AI insight display

Source basis:

- Internal Azure DevOps REST/auth helper:
  - `getAzureDevOpsAuth`
  - `checkAzureDevOpsTools`
- Existing Review Agent code path:
  - `POST /profiles/:id/review-run`
  - `runReviewPlanner`
  - `decideReviewOutcome`

Why this matters:

- The product's Azure DevOps connection exists primarily to power AI insight
  over PRs, not to expose every ADO operation.
- The existing Review Agent already contains useful PR analysis logic, so this
  step reuses that source path directly instead of creating a parallel PR
  insight service.
- Project Link auth UX must make it clear that Microsoft sign-in / ADO OAuth is
  the primary path and PAT is fallback only.

What changed:

- Internal ADO tool health now returns `authMode`:
  - `oauth`
  - `pat`
- Project Link UI reports whether ADO tools are ready through OAuth or PAT
  fallback.
- Pull Requests workspace action text now reflects AI insight:
  - `Run AI Insight`
  - `Analyzing...`
- Review Agent output is rendered inline on PR cards:
  - summary
  - token usage
  - first five structured findings

Reuse boundary:

- No external ADO MCP process is called.
- No duplicate PR insight service was created.
- The desktop app calls the existing daemon Review Agent route, and the route
  continues to use internal ADO auth plus local/cloud Review Agent logic.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
```

Result:

- Focused Azure DevOps internal-port tests passed: 6 tests.
- Core build passed.
- Focused daemon server tests passed: 10 tests.
- Desktop typecheck passed.
- Desktop production build passed.
- Core full tests passed: 15 files, 52 tests.
- Daemon full tests passed: 4 files, 27 tests.
- Daemon typecheck passed.

### 2026-06-11: Non-mutating PR insight preview

Source basis:

- Internal Azure DevOps PR context helpers:
  - `getAzurePullRequestById`
  - `listAzurePullRequestThreads`
  - `listAzurePullRequestChanges`
  - `listAzureBuilds`
- Existing LLM client:
  - `LLMClient`
- Existing Review Agent direction:
  - full review remains `POST /profiles/:id/review-run`

Why this matters:

- Users need fast PR insight before deciding whether to run a full review or
  allow any write-capable workflow.
- A preview endpoint lets the app summarize PR readiness without writing review
  history, posting comments, voting, or approving.
- It keeps the product direction centered on AI insight over ADO PR context.

What changed:

- Added daemon route:
  - `POST /profiles/:id/pull-requests/:pullRequestId/insight-preview`
- The route returns:
  - `source: "llm"` when an LLM summary was produced
  - `source: "heuristic"` when LLM is not configured
  - summary text
  - risk signals
  - file/thread/build/work-item counts
  - token usage
- Added desktop API:
  - `fetchProjectLinkPullRequestInsightPreview`
- Added Pull Requests workspace UI:
  - `Preview Insight`
  - inline preview summary and risk chips

Reuse boundary:

- This is a local product endpoint, not an external MCP call.
- It reuses internally ported ADO MCP-style context helpers.
- It deliberately does not duplicate the full Review Agent path.
- It is non-mutating; full review and persistence remain owned by
  `/project-links/:id/review-run`, with `/profiles/:id/review-run` kept as a
  compatibility alias.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/core test
```

Result:

- Daemon typecheck passed.
- Focused daemon server tests passed: 11 tests.
- Desktop typecheck passed.
- Desktop production build passed.
- Daemon full tests passed: 4 files, 28 tests.
- Core full tests passed: 15 files, 52 tests.

### 2026-06-11: Structured ADO auth diagnostics

Source basis:

- Internal Azure DevOps auth helper:
  - `getAzureDevOpsAuth`
  - `adoFetch`
  - `checkAzureDevOpsTools`

Why this matters:

- Project Link setup and PR insight need actionable auth feedback.
- Users should know whether a failure is caused by missing OAuth, missing org
  access, or invalid PAT fallback scopes.

What changed:

- Added ADO diagnostic statuses:
  - `ok`
  - `oauth_unavailable`
  - `oauth_no_org_access`
  - `pat_invalid_or_missing_scope`
  - `unknown_error`
- Internal ADO tool health now returns:
  - `authMode`
  - `authStatus`
  - `authMessage`
- Daemon `/profiles/check-ado-tools` returns structured diagnostic JSON on
  failure.
- Desktop API parses diagnostic failures instead of converting every non-2xx
  response into an opaque exception.
- Project Link management and in-chat setup show the diagnostic message inline.

Reuse boundary:

- This is a local internalization enhancement.
- No external MCP auth service is introduced.
- The same diagnostics can now be reused by PR context, preview insight, and
  full Review Agent execution.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Focused Azure DevOps internal-port tests passed: 7 tests.
- Core build passed.
- Desktop typecheck passed.
- Focused daemon server tests passed: 12 tests.
- Core full tests passed: 15 files, 53 tests.
- Daemon full tests passed: 4 files, 29 tests.
- Desktop production build passed.

### 2026-06-11: Project Link pipeline recommendation

Source basis:

- Internal ADO build definition discovery:
  - `listAzureBuildDefinitions`
- Existing Project Link setup flows:
  - management page
  - in-chat creation

Why this matters:

- Project Link setup should keep reducing manual fields after org/project/repo
  have been inferred or discovered.
- Pipeline identity is not available from git remotes, so the next best step is
  a deterministic recommendation over discovered ADO build definitions.

What changed:

- Added shared desktop helper:
  - `pickRecommendedPipeline`
- Added desktop unit tests for the recommendation heuristic.
- Recommendation signals:
  - repository name
  - project name
  - CI/build/PR/validation names
  - Azure Pipelines YAML naming
  - negative weight for release/deploy/prod names
- The Project Links page and in-chat setup card auto-select the recommended
  pipeline only when no pipeline is already selected.

Reuse boundary:

- The helper works on ADO discovery results already returned by internal
  source-ported REST helpers.
- It does not call an external MCP server.
- It does not override user choice.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop build
.\.tools\pnpm.exe install --lockfile-only
.\.tools\pnpm.exe --filter @mergepilot/desktop test
```

Result:

- Desktop typecheck passed.
- Desktop production build passed.
- Lockfile-only install completed.
- Desktop tests passed: 1 file, 2 tests.

### 2026-06-11: Enriched ADO pipeline discovery metadata

Source basis:

- Internal ADO build definition discovery:
  - `listAzureBuildDefinitions`

Why this matters:

- Pipeline recommendation is only as good as the metadata it receives.
- Azure DevOps build definitions can expose repository and YAML file details,
  which help select the right CI/validation pipeline for a Project Link.

What changed:

- Build definition discovery now includes metadata in the option description:
  - definition path
  - repository name
  - repository type
  - YAML filename
- The public discovery result shape stays unchanged.
- Existing desktop recommendation logic automatically benefits from the richer
  description text.
- Daemon discovery now has route-level coverage proving a Project Link
  repository name can be resolved to the ADO repository id before build
  definitions are listed for pipeline recommendation.

Reuse boundary:

- This remains an internal REST/source-port implementation.
- No external MCP server is called.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/core test -- test/azureDevOpsInternal.test.ts
.\.tools\pnpm.exe --filter @mergepilot/core build
.\.tools\pnpm.exe --filter @mergepilot/desktop test
.\.tools\pnpm.exe --filter @mergepilot/daemon test
```

Result:

- Focused Azure DevOps internal-port tests passed: 8 tests.
- Core build passed.
- Desktop tests passed: 1 file, 2 tests.
- Daemon tests passed: 4 files, 30 tests.

### 2026-06-11: ADO diagnostics reused across PR insight surfaces

Source basis:

- Structured ADO auth diagnostics added to internal Azure DevOps helper.
- Existing daemon PR routes:
  - PR context
  - insight preview
  - full Review Agent `review-run`

Why this matters:

- All ADO-backed PR insight flows should report the same remediation guidance.
- A user should not see good diagnostics on Project Link setup but raw JSON or
  opaque errors when loading PR details or running insight.

What changed:

- Added daemon helper for ADO diagnostic responses.
- Applied diagnostics to:
  - PR context endpoint
  - PR insight preview endpoint
  - full review-run iteration/context failures
- Desktop API parses `authMessage` for these surfaces.

Reuse boundary:

- This reuses internal ADO auth diagnostic logic.
- No new service or external dependency is introduced.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/daemon test -- test/server.test.ts
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Daemon typecheck passed.
- Desktop typecheck passed.
- Focused daemon server tests passed: 12 tests.
- Desktop production build passed.

### 2026-06-11: PR-Agent source intake and preview readiness port

Source copied with:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/qodo-ai/pr-agent.git third_party/pr-agent
git -C third_party/pr-agent sparse-checkout set --skip-checks LICENSE README.md pyproject.toml requirements.txt .pr_agent.toml pr_agent tests
git -C third_party/pr-agent rev-parse HEAD
```

Copied commit:

- `31d7dd027968e5fad1f9cbb074be047c4869058e`

High-value source modules:

- `pr_agent/tools/pr_reviewer.py`
- `pr_agent/algo/pr_processing.py`
- `pr_agent/algo/git_patch_processing.py`
- `pr_agent/algo/token_handler.py`
- `pr_agent/git_providers/azuredevops_provider.py`

Why this matters:

- The product goal is ADO-powered AI insight, not a generic ADO MCP clone.
- PR-Agent provides mature review concepts around diff preparation, finding
  categories, review prompts, and readiness/risk classification.

What changed locally:

- Vendored PR-Agent source under `third_party/pr-agent`.
- Removed the nested `.git` directory after recording the upstream commit so the
  source is treated as normal vendored project code.
- Ported a first small readiness/risk categorization slice into the daemon PR
  insight preview:
  - `ready`
  - `needs_attention`
  - `blocked`
  - blocking/warning/info categories
- Full AI Insight responses now expose the same readiness vocabulary and
  finding-derived blocking/warning/info categories.
- Desktop preview and full insight cards now display the readiness result and
  category-colored chips.
- The full AI insight model contract now also ports PR-Agent-style review
  metadata:
  - estimated review effort
  - tests required
  - security concern
  - can be split
  - key issues to review
- Full AI insight prompt construction now ports PR-Agent-style compression
  behavior:
  - complete file blocks are preserved when they fit
  - omitted added/modified/deleted files are listed explicitly
  - naive mid-prompt slicing has been removed from the review planner
- Compression now also ports PR-Agent-style file prioritization ideas:
  - security/auth-sensitive paths are scored ahead of low-signal large files
  - infrastructure, migrations, schemas, and pipeline files are elevated
  - source-code extensions, tests, and change type contribute to priority
  - very large generated-looking content is penalized when budget is tight
- Full AI insight now returns a lightweight compression summary so users can
  see whether the review context was complete or budget-limited without
  exposing the full prompt text.
- Review Agent tests now cover the LLM review path returning the compression
  summary and explicitly verify that the full prompt text is not exposed.
- Full AI insight prompts now include ADO PR readiness signals in the same
  local Review Agent path:
  - PR title, description, draft/status, source and target branch
  - work items, reviewer count, vote summary
  - active review threads and failed/latest build state
- Full AI insight now post-processes model findings before exposing them to the
  Pull Requests UI:
  - normalizes model paths against the changed-file list
  - rejects unknown files and invalid line anchors
  - rejects findings outside changed hunks when ADO hunk metadata exists
  - rejects empty messages
  - deduplicates repeated comments
  - returns a `discardedFindings` audit trail for filtered model output
- The local Review Agent now ports the Azure DevOps MCP `get_pull_request_changes`
  filediffs idea into TypeScript:
  - calls internal ADO filediffs REST from `AdoClient`
  - stores changed hunk ranges and line content in `CloudChangedFile`
  - renders changed hunks in review prompts when available
  - prioritizes changed-hunk files during prompt compression
  - reports hunk coverage as review context quality metadata
  - keeps the implementation internal rather than invoking the MCP server
- Review Queue now ports the next PR-Agent-style triage idea into local
  TypeScript policy:
  - persists discarded finding counts as model-output confidence signals
  - persists hunk coverage and whole-file fallback counts as context-quality
    signals
  - sorts Review Queue items by attention priority before recency
  - exposes reason-code explanations for queue priority
  - feeds context confidence into auto-approval gating so weak AI evidence
    routes to human review instead of approval
  - persists policy reason codes and context confidence with Review History
    for audit and queue display
  - adds manual disposition fields and queue actions as the local audit surface
    for reviewer triage
  - stores manual disposition history as append-only audit events
  - adds an internal daemon disposition endpoint that can write selected review
    queue decisions back to Azure DevOps PR threads
  - persists ADO write-back success/failure status for reviewer-visible audit
  - persists successful ADO write-back thread ids/links so audit records can
    jump back to the exact PR discussion
  - stores every ADO write-back attempt as an append-only audit event so
    retries are visible instead of overwriting prior outcomes
  - exposes retry for failed or pending ADO write-back without duplicating the
    saved disposition event history
  - keeps the sorted queue explainable and auditable for future auto-approval
    policy work
- This keeps PR-Agent-inspired review quality work inside the product instead
  of turning PR-Agent or ADO MCP into a separate runtime dependency.

Reuse boundary:

- PR-Agent is not invoked as a Python runtime or external service.
- Current production code only ports selected behavior into local TypeScript.

Verification:

```powershell
$env:PATH = "C:\Users\15492\Develop\Agents\CICD-agents\.tools\node-v22.11.0-win-x64;C:\Users\15492\Develop\Agents\CICD-agents\.tools;" + $env:PATH
.\.tools\pnpm.exe --filter @mergepilot/daemon test
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
.\.tools\pnpm.exe --filter @mergepilot/review-agent test
.\.tools\pnpm.exe --filter @mergepilot/review-agent typecheck
.\.tools\pnpm.exe --filter @mergepilot/review-agent build
.\.tools\pnpm.exe --filter @mergepilot/desktop typecheck
.\.tools\pnpm.exe --filter @mergepilot/desktop test
.\.tools\pnpm.exe --filter @mergepilot/desktop build
```

Result:

- Daemon tests passed: 4 files, 30 tests.
- Daemon typecheck passed.
- Review Agent tests passed: 6 files, 20 tests.
- Review Agent tests later passed: 6 files, 21 tests after adding
  priority-aware compression coverage.
- Review Agent tests later passed: 6 files, 22 tests after adding compression
  summary contract coverage.
- Review Agent tests later passed: 6 files, 23 tests after adding ADO PR signal
  prompt coverage.
- Review Agent tests later passed: 6 files, 24 tests after adding finding
  post-processing coverage.
- Review Agent tests later passed: 7 files, 27 tests after adding ADO filediffs,
  changed-hunk prompt rendering, and hunk-aware finding filtering coverage.
- Review Agent tests later passed: 7 files, 28 tests after adding hunk-aware
  compression priority coverage.
- Review Agent tests later passed: 7 files, 29 tests after adding hunk coverage
  summary coverage.
- Review Agent typecheck passed.
- Review Agent build passed.
- Desktop typecheck passed.
- Desktop tests passed: 1 file, 2 tests.
- Desktop production build passed.
