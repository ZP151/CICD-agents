import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "../src/tools/executor.js";
import {
  StdioMcpClient,
  createMcpToolWrappers,
  mcpLocalToolName,
  type McpCallToolResult,
} from "../src/tools/mcp.js";
import { toolCapability } from "../src/tools/capabilities.js";

describe("MCP tool bridge", () => {
  let client: StdioMcpClient | null = null;

  afterEach(async () => {
    await client?.close();
    client = null;
  });

  it("lists and calls tools over stdio JSON-RPC frames", async () => {
    const serverPath = writeFakeMcpServer();
    client = new StdioMcpClient({
      name: "ado",
      command: process.execPath,
      args: [serverPath],
      timeoutMs: 5_000,
    });

    const tools = await client.listTools();
    expect(tools).toEqual([
      {
        name: "repo_list_repos_by_project",
        description: "List repositories by project.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string" },
          },
          required: ["project"],
        },
      },
    ]);

    const result = await client.callTool("repo_list_repos_by_project", { project: "Demo" });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "repos for Demo" }]);
  });

  it("does not leak daemon model credentials to an MCP child by default", async () => {
    const serverPath = writeEnvironmentMcpServer();
    const previous = process.env.AZURE_OPENAI_API_KEY;
    try {
      process.env.AZURE_OPENAI_API_KEY = "model-key-must-not-reach-mcp";
      client = new StdioMcpClient({ name: "ado", command: process.execPath, args: [serverPath] });
      const result = await client.callTool("environment", {});
      expect(JSON.stringify(result)).not.toContain("model-key-must-not-reach-mcp");
    } finally {
      if (previous === undefined) delete process.env.AZURE_OPENAI_API_KEY;
      else process.env.AZURE_OPENAI_API_KEY = previous;
    }
  });

  it("wraps MCP tool definitions as local ToolExecutor tools", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const [tool] = createMcpToolWrappers(
      "ado",
      [
        {
          name: "repo_create_pull_request",
          description: "Create a pull request.",
          inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
        },
      ],
      async (name, args): Promise<McpCallToolResult> => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "created PR" }], isError: false };
      },
    );

    expect(tool?.name).toBe("mcp_ado_repo_create_pull_request");
    expect(tool?.parameters["required"]).toEqual(["title"]);
    const result = await tool!.handler({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} }, { title: "Ship it" });
    expect(calls).toEqual([{ name: "repo_create_pull_request", args: { title: "Ship it" } }]);
    expect(result["text"]).toBe("created PR");
    expect(result["mcp_tool"]).toBe("repo_create_pull_request");
  });

  it("surfaces MCP tool errors as ToolError", async () => {
    const [tool] = createMcpToolWrappers(
      "ado",
      [{ name: "repo_update_pull_request" }],
      async () => ({ content: [{ type: "text", text: "not allowed" }], isError: true }),
    );

    await expect(tool!.handler({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} }, {})).rejects.toBeInstanceOf(ToolError);
  });

  it("classifies Azure DevOps MCP tools by local approval policy", () => {
    const readTool = {
      name: mcpLocalToolName("ado", "repo_list_pull_requests_by_repo_or_project"),
      description: "List PRs.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({}),
    };
    const writeTool = {
      name: mcpLocalToolName("ado", "repo_create_pull_request"),
      description: "Create PR.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({}),
    };
    const pipelineTool = {
      name: mcpLocalToolName("ado", "pipelines_run_pipeline"),
      description: "Run pipeline.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({}),
    };

    expect(toolCapability(readTool).category).toBe("ado");
    expect(toolCapability(readTool).riskLevel).toBe("low");
    expect(toolCapability(readTool).readOnly).toBe(true);
    expect(toolCapability(readTool).requiresApproval).toBe(false);
    expect(toolCapability(writeTool).riskLevel).toBe("high");
    expect(toolCapability(writeTool).requiresApproval).toBe(true);
    expect(toolCapability(pipelineTool).riskLevel).toBe("high");
    expect(toolCapability(pipelineTool).requiresApproval).toBe(true);
  });

  it("keeps low-risk Web Research reads available in an explicit read-only turn", () => {
    const tool = {
      name: mcpLocalToolName("web_research", "search_official_documentation"),
      description: "Search official documentation.",
      parameters: { type: "object", properties: {} },
      handler: async () => ({}),
      connector: { kind: "mcp" as const, id: "web-research", label: "Web Research" },
    };

    expect(toolCapability(tool)).toMatchObject({
      riskLevel: "low",
      readOnly: true,
      requiresApproval: false,
      connector: { kind: "mcp", id: "web-research", label: "Web Research" },
    });
  });
});

/**
 * Fixture servers speak the official newline-delimited stdio framing and a
 * complete initialize result (protocolVersion + serverInfo), matching the
 * 2025-06-18 specification baseline enforced by the SDK-backed client.
 */
function newlineFixtureServer(scriptBody: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-mcp-"));
  const scriptPath = path.join(dir, "fake-mcp-server.mjs");
  fs.writeFileSync(
    scriptPath,
    `
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  handle(JSON.parse(line));
});
function handle(message) {
  if (message.id === undefined || message.id === null) return;
  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "fake", version: "1.0.0" }
    });
    return;
  }
  ${scriptBody}
}
function send(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`,
    "utf8",
  );
  return scriptPath;
}

function writeFakeMcpServer(): string {
  return newlineFixtureServer(`
  if (message.method === "tools/list") {
    send(message.id, {
      tools: [{
        name: "repo_list_repos_by_project",
        description: "List repositories by project.",
        inputSchema: {
          type: "object",
          properties: { project: { type: "string" } },
          required: ["project"]
        }
      }]
    });
    return;
  }
  if (message.method === "tools/call") {
    send(message.id, {
      content: [{ type: "text", text: "repos for " + message.params.arguments.project }],
      isError: false
    });
    return;
  }
  send(message.id, null);
`);
}

function writeEnvironmentMcpServer(): string {
  return newlineFixtureServer(`
  if (message.method === "tools/call") return send(message.id, { content: [{ type: "text", text: process.env.AZURE_OPENAI_API_KEY || "absent" }] });
  send(message.id, { tools: [] });
`);
}
