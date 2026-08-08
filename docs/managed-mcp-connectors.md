# Managed Azure DevOps MCP connector

> **Transitional developer/acceptance runbook.** This file documents the
> connector path that exists in the current implementation; it is not the
> target product UX. The canonical plan in
> [`docs/product/README.md`](product/README.md) makes Azure DevOps an app-owned
> built-in capability configured through Settings with identity, scope, and
> health only. Cycle 00 removes Project Link MCP opt-in and all user-facing
> install/register/catalog concepts. The `npx`, command, and domain examples
> below remain useful only for development and compatibility validation until
> the packaged capability runtime replaces them.

MergePilot treats an MCP server as executable code. In the transitional path, a
Project Link may choose to use the Azure DevOps connector, but it cannot provide
the executable, arguments, or a PAT. This prevents a synced Project Link from
turning into an arbitrary local-process launch or secret-forwarding mechanism.

MergePilot's current client is the official TypeScript MCP SDK v1.x using a
stdio transport. The local connector starts the server from user-owned
configuration only; a Project Link can opt in to it, but cannot supply an
executable, arguments, or credentials.

## Current developer-only acceptance configuration: interactive sign-in

Configure the local daemon only in `%USERPROFILE%\\.mergepilot\\config.toml`
(for this Windows installation, `C:\\Users\\15492\\.mergepilot\\config.toml`):

```toml
[connectors.azure_devops_mcp]
enabled = true
command = "npx"
args_json = "[\"--yes\",\"@azure-devops/mcp\",\"<your-organization>\",\"--authentication\",\"interactive\",\"-d\",\"core\",\"repositories\",\"pipelines\",\"work\",\"work-items\"]"
credential_env = ""
```

This is equivalent to the local startup command:

```powershell
npx --yes @azure-devops/mcp <your-organization> --authentication interactive -d core repositories pipelines work work-items
```

Use an `npx` backed by Node `22.12+` (or Node 24). The current upstream
package's CLI help was verified with the repository's local Node 24 runtime;
Node 22.11 starts it but emits an upstream engine warning. If the desktop
process resolves an older system `npx`, install or select a current Node
runtime before enabling the connector.

The first Azure DevOps operation opens the MCP server's own Microsoft sign-in
flow. It is intentionally separate from MergePilot's basic Microsoft identity
cache. No credential environment variable is needed for this workstation mode.

## Non-interactive alternatives

For a bearer token supplied by a local identity tool, change the arguments to
`["--yes","@azure-devops/mcp","<your-organization>","--authentication","envvar", ...]`
and set `credential_env = "ADO_MCP_AUTH_TOKEN"`. For a PAT, use
`--authentication pat` and `credential_env = "PERSONAL_ACCESS_TOKEN"`; the
upstream server expects that value to be base64-encoded `<non-empty-email>:<PAT>`.
The value belongs only in `%USERPROFILE%\\.mergepilot\\.env` or the process
environment. It is never stored in `config.toml`, a Project Link, session
history, or this repository. The MCP child inherits only bootstrap environment
variables plus the specifically selected credential; it never receives model
API keys.

For the smallest read-only capability set, enable only the domains actually
needed and give the Azure DevOps identity/PAT only these matching permissions:

- `repositories`: **Code — Read** (plus project read access);
- `pipelines`: **Build — Read**;
- `work-items`: **Work Items — Read**.

Leave a domain and its corresponding permission out when it is not needed.
MergePilot independently filters exposed tools to the Project Link's selected
domains and keeps write-like tools behind approval.

On the current transitional Project Link, enable the Azure DevOps MCP option and limit its domains,
for example `repositories,pipelines,work-items`. The daemon filters the
registered MCP tool surface to those domains before the model can see it.
Read operations remain automatic only when classified as low risk; write-like
operations still use the normal approval flow.

## Web research

Web research is global to the local desktop instance, rather than a Project
Link. Configure a reviewed read-only MCP implementation locally:

```toml
[connectors.web_research_mcp]
enabled = true
command = "npx"
args_json = "[\"--yes\",\"<your-reviewed-web-research-mcp-package>\"]"
credential_env = "BRAVE_SEARCH_API_KEY"
```

Supported optional key variable names are `BRAVE_SEARCH_API_KEY`,
`TAVILY_API_KEY`, and `SERPER_API_KEY`; each belongs only in local `.env` or
the operating-system environment. MergePilot exposes only MCP tools whose
names indicate search, query, browse, fetch, read, open, find, or get. Their
activity groups are labelled `Web Research`; raw page payload remains out of
the persisted public transcript.
