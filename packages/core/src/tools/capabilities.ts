import type { Tool } from "./executor.js";

export interface ToolCapability {
  name: string;
  category: "git" | "ado" | "test" | "build" | "other";
  description: string;
  riskLevel: "low" | "medium" | "high";
  readOnly: boolean;
  requiresApproval: boolean;
  required: string[];
}

const READ_ONLY_TOOLS = new Set([
  "git_status",
  "git_log",
  "git_diff",
  "git_branch_list",
  "git_remote",
  "git_current_branch",
  "git_show",
  "git_fetch",
  "git_merge_base",
  "git_intent_translator",
]);

const HIGH_RISK_TOOLS = new Set([
  "git_push",
  "git_rebase",
  "ado_create_pr",
  "ado_trigger_pipeline",
]);

export function toolCapabilities(tools: Iterable<Tool>): ToolCapability[] {
  const list = [...tools];
  const approvals = approvalToolNames(list);
  return list.map((tool) => ({
    name: tool.name,
    category: classifyToolCategory(tool.name),
    description: tool.description,
    riskLevel: classifyToolRisk(tool.name),
    readOnly: READ_ONLY_TOOLS.has(tool.name),
    requiresApproval: approvals.has(tool.name),
    required: requiredParams(tool),
  }));
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
  if (name.includes("test") || name === "pytest") return "test";
  if (name.includes("build") || name.startsWith("npm_") || name.startsWith("dotnet_")) return "build";
  return "other";
}

function classifyToolRisk(name: string): ToolCapability["riskLevel"] {
  if (HIGH_RISK_TOOLS.has(name)) return "high";
  if (READ_ONLY_TOOLS.has(name)) return "low";
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
