import {
  StdioMcpClient,
  createMcpToolsFromClient,
  type Tool,
  type ToolContext,
} from "@mergepilot/core";
import {
  readMergePilotUserConfig,
  type AzureDevOpsMcpUserConfig,
  type WebResearchMcpUserConfig,
} from "./daemonEnv.js";

export interface ChatMcpConnectorRuntime {
  tools: Tool[];
  close: () => Promise<void>;
}

/**
 * Project Links only opt in to a connector. The executable and the optional
 * credential variable are deliberately owned by the user's local config.toml,
 * so a synced Project Link can never inject a command line or PAT into the
 * daemon process.
 */
export async function createAzureDevOpsMcpConnector(
  ctx: ToolContext,
  configured: AzureDevOpsMcpUserConfig | undefined = readMergePilotUserConfig().azureDevOpsMcp,
): Promise<ChatMcpConnectorRuntime | null> {
  if (ctx.extra["ado_mcp_enabled"] !== true) return null;
  if (!configured?.enabled || !configured.command.trim()) return null;

  const env = connectorCredentialEnvironment(configured);
  const client = new StdioMcpClient({
    name: "azure-devops",
    command: configured.command,
    args: configured.args,
    cwd: ctx.repoPath,
    env,
    timeoutMs: Math.max(1_000, ctx.timeoutSec * 1_000),
  });
  try {
    const tools = filterAzureDevOpsDomains(
      await createMcpToolsFromClient("azure-devops", client),
      parseDomains(ctx.extra["ado_mcp_domains"]),
    );
    return {
      tools,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}

function connectorCredentialEnvironment(config: { credentialEnv: string }): Record<string, string> | undefined {
  const name = config.credentialEnv;
  const value = name ? process.env[name] : undefined;
  return name && value ? { [name]: value } : undefined;
}

/**
 * Web research is an application-level, local connector. Only discovery and
 * reading tools are exposed: an arbitrary MCP server cannot turn a research
 * configuration into a mutation surface for the agent.
 */
export async function createWebResearchMcpConnector(
  ctx: ToolContext,
  configured: WebResearchMcpUserConfig | undefined = readMergePilotUserConfig().webResearchMcp,
): Promise<ChatMcpConnectorRuntime | null> {
  if (!configured?.enabled || !configured.command.trim()) return null;
  const client = new StdioMcpClient({
    name: "web-research",
    command: configured.command,
    args: configured.args,
    cwd: ctx.repoPath,
    env: connectorCredentialEnvironment(configured),
    timeoutMs: Math.max(1_000, ctx.timeoutSec * 1_000),
  });
  try {
    return {
      tools: filterWebResearchTools(await createMcpToolsFromClient("web-research", client)),
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export function filterWebResearchTools(tools: Tool[]): Tool[] {
  return tools.filter((tool) => {
    // Do not match the `web_research` connector prefix itself: otherwise a
    // write tool such as `publish_report` would be admitted simply because
    // its generated local name contains `research`.
    const actionParts = tool.name.replace(/^mcp_web_research_/, "").split("_");
    return actionParts.some((part) => ["search", "query", "browse", "fetch", "read", "open", "find", "get"].includes(part));
  });
}

function parseDomains(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Domain filtering is an allow-list at registration time, not a prompt
 * suggestion. It prevents a repositories-only Project Link from exposing an
 * unrelated tool surface to the model.
 */
export function filterAzureDevOpsDomains(tools: Tool[], domains: string[]): Tool[] {
  if (domains.length === 0) return tools;
  return tools.filter((tool) => domains.some((domain) => toolMatchesDomain(tool.name, domain)));
}

function toolMatchesDomain(toolName: string, domain: string): boolean {
  const name = toolName.toLowerCase();
  switch (domain) {
    case "repositories":
    case "repository":
    case "repos":
      return /(?:repo|repository)/.test(name);
    case "pipelines":
    case "pipeline":
    case "builds":
      return /(?:pipeline|build)/.test(name);
    case "work-items":
    case "work_items":
    case "workitems":
      return /(?:work_?item|wi_)/.test(name);
    case "pull-requests":
    case "pull_requests":
    case "prs":
      return /(?:pull_?request|pr_)/.test(name);
    default:
      // Unknown allow-list entries must not widen the connector surface.
      return false;
  }
}
