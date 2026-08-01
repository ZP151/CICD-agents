# Managed Azure DevOps MCP connector

MergePilot treats an MCP server as executable code. A Project Link may choose
to use the Azure DevOps connector, but it cannot provide the executable,
arguments, or a PAT. This prevents a synced Project Link from turning into an
arbitrary local-process launch or secret-forwarding mechanism.

Configure the local daemon only in `~/.mergepilot/config.toml`:

```toml
[connectors.azure_devops_mcp]
enabled = true
command = "npx"
args_json = "[\"--yes\",\"<your-reviewed-ado-mcp-package>\"]"
credential_env = "AZURE_DEVOPS_EXT_PAT"
```

The optional credential value belongs only in `~/.mergepilot/.env` (or the
process environment), for example `AZURE_DEVOPS_EXT_PAT=...`. It is not stored
in `config.toml`, a Project Link, session history, or the repository. The MCP
child inherits only bootstrap environment variables plus that specifically
selected credential; it does not receive model API keys.

On the Project Link, enable the Azure DevOps MCP option and limit its domains,
for example `repositories,pipelines,work-items`. The daemon filters the
registered MCP tool surface to those domains before the model can see it.
Read operations remain automatic only when classified as low risk; write-like
operations still use the normal approval flow.
