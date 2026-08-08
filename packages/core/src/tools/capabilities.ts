import type { Tool } from "./executor.js";

export interface ToolCapability {
  name: string;
  category: "git" | "ado" | "mcp" | "test" | "build" | "other";
  description: string;
  riskLevel: "low" | "medium" | "high";
  readOnly: boolean;
  requiresApproval: boolean;
  required: string[];
  /** Present only for externally provided tools, so the transcript can label them. */
  connector?: { kind: "mcp"; id: string; label: string };
}

const READ_ONLY_TOOLS = new Set([
  "git_checkpoint",
  "git_checkpoint_show",
  "git_status",
  "git_log",
  "git_diff",
  "git_branch_list",
  "git_remote",
  "git_current_branch",
  "git_show",
  "git_merge_base",
  "repo_refresh_index",
  "read_text_file",
]);

const HIGH_RISK_TOOLS = new Set([
  "git_push",
  "git_push_tag",
  "git_rebase",
  "git_cherry_pick",
  "git_revert",
  "git_tag",
  "ado_create_pr",
  "ado_trigger_pipeline",
]);

export function toolCapabilities(tools: Iterable<Tool>): ToolCapability[] {
  const list = [...tools];
  const approvals = approvalToolNames(list);
  return list.map((tool) => capabilityForTool(tool, approvals.has(tool.name)));
}

export function toolCapability(tool: Tool): ToolCapability {
  return capabilityForTool(tool, classifyToolRisk(tool.name) !== "low");
}

function capabilityForTool(tool: Tool, requiresApproval: boolean): ToolCapability {
  const riskLevel = classifyToolRisk(tool.name);
  return {
    name: tool.name,
    category: classifyToolCategory(tool.name),
    description: tool.description,
    riskLevel,
    // MCP wrappers have no static allowlist entry. Their local policy already
    // derives a low risk level from get/list/search/read/query actions, so use
    // the same policy for the read-only boundary. Otherwise an explicit
    // "do not modify" request strips safe Azure DevOps or Web Research reads
    // from the Planner before it can make a grounded decision.
    readOnly: riskLevel === "low",
    requiresApproval,
    required: requiredParams(tool),
    connector: tool.connector ?? toolConnector(tool.name),
  };
}

/**
 * MCP tools are registered as mcp_<server>_<tool>. Keep this attribution
 * alongside the capability rather than guessing from UI labels downstream.
 */
function toolConnector(name: string): ToolCapability["connector"] | undefined {
  if (!name.startsWith("mcp_")) return undefined;
  const server = name.slice("mcp_".length).split("_")[0]?.trim();
  if (!server) return undefined;
  return {
    kind: "mcp",
    id: server,
    label: server.replace(/[-_]+/g, " "),
  };
}

export function toolRequiresApproval(tool: Tool): boolean {
  return toolCapability(tool).requiresApproval;
}

export function toolCapabilityPrompt(tools: Iterable<Tool>): string {
  const capabilities = toolCapabilities(tools);
  if (capabilities.length === 0) return "";
  const lines = capabilities.map((cap) => {
    const required = cap.required.length > 0 ? ` required: ${cap.required.join(",")}` : " required: none";
    const mode = cap.readOnly ? "read-only" : cap.requiresApproval ? "approval-required" : "write";
    return `- ${cap.name} [${cap.category}; ${cap.riskLevel}; ${mode};${required}] ${cap.description}`;
  });
  return [
    "## Available tool capabilities",
    "Use this registry as the source of truth for available operations. Prefer these tools over hard-coded workflow assumptions.",
    "Low-risk read-only tools may run when useful. Write tools should only be executed directly when the user has clearly requested that exact action; otherwise propose the exact tool and args in approval_proposal.",
    "For approval_proposal.tool, use any registered write tool from this capability list. Do not limit approval proposals to a fixed Git-to-PR sequence.",
    ...lines,
  ].join("\n");
}

function classifyToolCategory(name: string): ToolCapability["category"] {
  if (name.startsWith("git_")) return "git";
  if (name.startsWith("ado_")) return "ado";
  if (name.startsWith("mcp_ado_") || name.startsWith("mcp_azure_devops_")) return "ado";
  if (name.startsWith("mcp_")) return "mcp";
  if (name.includes("test") || name === "pytest") return "test";
  if (name.includes("build") || name.startsWith("npm_") || name.startsWith("dotnet_")) return "build";
  return "other";
}

function classifyToolRisk(name: string): ToolCapability["riskLevel"] {
  if (HIGH_RISK_TOOLS.has(name)) return "high";
  if (READ_ONLY_TOOLS.has(name)) return "low";
  if (name.startsWith("mcp_")) return classifyMcpToolRisk(name);
  return "medium";
}

function classifyMcpToolRisk(name: string): ToolCapability["riskLevel"] {
  const action = name.toLowerCase();
  if (
    /\b(create|update|delete|remove|trigger|run|queue|approve|abandon|complete|merge|link|add|vote|reply)\b/.test(action) ||
    /_(create|update|delete|remove|trigger|run|queue|approve|abandon|complete|merge|link|add|vote|reply)_?/.test(action)
  ) {
    return action.includes("pull_request") || action.includes("pipeline") || action.includes("repo_")
      ? "high"
      : "medium";
  }
  if (/\b(list|get|search|show|read|find|query|download)\b/.test(action)) return "low";
  if (/_(list|get|search|show|read|find|query|download)_?/.test(action)) return "low";
  return "medium";
}

function requiredParams(tool: Tool): string[] {
  const required = tool.parameters["required"];
  return Array.isArray(required) ? required.map(String) : [];
}

function approvalToolNames(tools: Tool[]): Set<string> {
  return new Set(
    tools
      .filter((tool) => classifyToolRisk(tool.name) !== "low")
      .map((tool) => tool.name),
  );
}
