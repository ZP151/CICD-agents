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
    expect(toolCapability(readTool).requiresApproval).toBe(false);
    expect(toolCapability(writeTool).riskLevel).toBe("high");
    expect(toolCapability(writeTool).requiresApproval).toBe(true);
    expect(toolCapability(pipelineTool).riskLevel).toBe("high");
    expect(toolCapability(pipelineTool).requiresApproval).toBe(true);
  });
});

function writeFakeMcpServer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-mcp-"));
  const scriptPath = path.join(dir, "fake-mcp-server.mjs");
  fs.writeFileSync(
    scriptPath,
    `
let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const parsed = readFrame(buffer);
    if (!parsed) return;
    buffer = parsed.rest;
    handle(parsed.message);
  }
});

function handle(message) {
  if (!message.id) return;
  if (message.method === "initialize") {
    send(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "fake", version: "1.0.0" }
    });
    return;
  }
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
}

function send(id, result) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result }), "utf8");
  process.stdout.write(Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"), body]));
}

function readFrame(input) {
  const headerEnd = input.indexOf("\\r\\n\\r\\n");
  if (headerEnd < 0) return null;
  const header = input.subarray(0, headerEnd).toString("ascii");
  const match = header.match(/content-length:\\s*(\\d+)/i);
  if (!match) throw new Error("missing content-length");
  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (input.length < bodyEnd) return null;
  return {
    message: JSON.parse(input.subarray(bodyStart, bodyEnd).toString("utf8")),
    rest: input.subarray(bodyEnd)
  };
}
`,
    "utf8",
  );
  return scriptPath;
}
