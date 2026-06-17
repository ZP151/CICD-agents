import { afterEach, describe, expect, it } from "vitest";
import { createChatToolExecutors } from "../src/chatSession.js";

describe("chat session Azure DevOps MCP bridge fallback", () => {
  let runtime: Awaited<ReturnType<typeof createChatToolExecutors>> | null = null;

  afterEach(async () => {
    await runtime?.close();
    runtime = null;
  });

  it("does not register external ADO MCP tools from Project Link fallback settings", async () => {
    runtime = await createChatToolExecutors({
      repoPath: ".",
      env: {},
      timeoutSec: 5,
      extra: {
        ado_org: "https://dev.azure.com/demo-org",
        ado_project: "DemoProject",
        ado_repository: "demo-repo",
        ado_pat: "legacy-pat",
        ado_mcp_enabled: true,
        ado_mcp_command: "fake-ado-mcp-server",
        ado_mcp_authentication: "pat",
        ado_mcp_domains: "repositories",
      },
    });

    const names = runtime.actionExecutor.list().map((tool) => tool.name);
    expect(names.some((name) => name.startsWith("mcp_ado_"))).toBe(false);
    expect(names).toContain("git_status");
  });
});
