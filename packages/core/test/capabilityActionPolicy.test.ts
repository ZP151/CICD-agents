import { describe, expect, it } from "vitest";
import {
  ActionPolicy,
  actionVerdictForTool,
} from "../src/tools/actionPolicy.js";
import {
  CapabilityRegistry,
  capabilityRegistryFromTools,
  mcpDomainForTool,
} from "../src/tools/capabilityRegistry.js";
import type { Tool } from "../src/tools/executor.js";

function tool(name: string, overrides: Partial<Tool> = {}): Tool {
  return {
    name,
    description: `tool ${name}`,
    parameters: { type: "object", properties: {} },
    handler: async () => ({}),
    ...overrides,
  };
}

const readTool = tool("git_status");
const writeTool = tool("mcp_azure_devops_queue_pipeline", {
  connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" },
  originalName: "queue_pipeline",
});
const ambiguousTool = tool("mcp_azure_devops_export_repositories", {
  connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" },
  originalName: "export_repositories",
});

describe("CapabilityRegistry (MP-015)", () => {
  it("normalizes native and MCP tools into one record per local name", () => {
    const registry = capabilityRegistryFromTools([readTool, writeTool, ambiguousTool], "authorized");

    const status = registry.get("git_status");
    expect(status).toMatchObject({ source: "native", readOnly: true, riskLevel: "low" });

    const pipeline = registry.get("mcp_azure_devops_queue_pipeline");
    expect(pipeline).toMatchObject({
      source: "mcp",
      connectorId: "azure-devops",
      connectorLabel: "Azure DevOps",
      serverToolName: "queue_pipeline",
      domain: "pipelines",
      requiresApproval: true,
      authState: "authorized",
    });
    expect(registry.size).toBe(3);
  });

  it("derives domains without per-page string matching", () => {
    expect(mcpDomainForTool("mcp_azure_devops_repositories_list")).toBe("repositories");
    expect(mcpDomainForTool("mcp_azure_devops_builds_get")).toBe("pipelines");
    expect(mcpDomainForTool("mcp_azure_devops_work_items_get")).toBe("work-items");
    expect(mcpDomainForTool("mcp_azure_devops_pull_requests_list")).toBe("pull-requests");
    expect(mcpDomainForTool("mcp_web_research_search")).toBeUndefined();
  });

  it("filters capabilities by domain allow-list", () => {
    const registry = capabilityRegistryFromTools([readTool, writeTool, ambiguousTool]);

    expect(registry.filterByDomain("pipelines").map((cap) => cap.name)).toEqual([
      "mcp_azure_devops_queue_pipeline",
    ]);
  });

  it("registers explicitly without re-deriving from tool names", () => {
    const registry = new CapabilityRegistry();
    registry.register({
      name: "custom_read",
      category: "other",
      description: "custom",
      riskLevel: "low",
      readOnly: true,
      requiresApproval: false,
      required: [],
      source: "native",
      idempotent: true,
      authState: "not_required",
    });

    expect(registry.get("custom_read")?.idempotent).toBe(true);
  });
});

describe("ActionPolicy (MP-015)", () => {
  const policy = new ActionPolicy();
  const registry = capabilityRegistryFromTools([readTool, writeTool, ambiguousTool]);

  it("allows read-only low-risk capabilities", () => {
    const verdict = actionVerdictForTool(policy, registry.get("git_status"), "implicit");

    expect(verdict).toEqual({ decision: "allow", reason: "read-only low-risk capability" });
  });

  it("denies write capabilities without explicit user intent", () => {
    const verdict = actionVerdictForTool(policy, registry.get("mcp_azure_devops_queue_pipeline"), "implicit");

    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toContain("without explicit user intent");
  });

  it("never lets server annotations elevate a write capability", () => {
    const capability = registry.get("mcp_azure_devops_queue_pipeline")!;
    const verdict = policy.evaluate({
      capability,
      userIntent: "implicit",
      annotations: { readOnlyHint: true, idempotentHint: true },
    });

    // Annotations are advisory; the local registry still says write.
    expect(verdict.decision).toBe("deny");
  });

  it("routes explicit-intent writes through approval instead of executing", () => {
    const verdict = actionVerdictForTool(policy, registry.get("mcp_azure_devops_queue_pipeline"), "explicit");

    expect(verdict.decision).toBe("approve");
    expect(verdict.reason).toContain("route through approval");
  });

  it("refuses unknown tools that are not registered", () => {
    const verdict = actionVerdictForTool(policy, undefined, "implicit");

    expect(verdict).toEqual({ decision: "deny", reason: "capability not registered; refusing unknown tool" });
  });

  it("treats ambiguous medium-risk MCP actions as approval-required", () => {
    const verdict = actionVerdictForTool(policy, registry.get("mcp_azure_devops_export_repositories"), "implicit");

    expect(verdict.decision).toBe("deny");
  });
});
