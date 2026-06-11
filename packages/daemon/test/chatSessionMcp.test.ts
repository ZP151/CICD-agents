import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChatToolExecutors } from "../src/chatSession.js";

describe("chat session Azure DevOps MCP registration", () => {
  let runtime: Awaited<ReturnType<typeof createChatToolExecutors>> | null = null;

  afterEach(async () => {
    await runtime?.close();
    runtime = null;
  });

  it("registers Project Link-enabled Azure DevOps MCP tools in the chat runtime", async () => {
    const serverPath = writeFakeAdoMcpServer();
    runtime = await createChatToolExecutors({
      repoPath: ".",
      env: {},
      timeoutSec: 5,
      extra: {
        ado_org: "https://dev.azure.com/demo-org",
        ado_project: "DemoProject",
        ado_repository: "demo-repo",
        ado_pat: "test-pat",
        ado_mcp_enabled: true,
        ado_mcp_command: `${process.execPath} ${serverPath}`,
        ado_mcp_authentication: "pat",
        ado_mcp_domains: "repositories",
      },
    });

    const names = runtime.actionExecutor.list().map((tool) => tool.name);
    expect(names).toContain("mcp_ado_repo_list_repos_by_project");

    const result = await runtime.actionExecutor.call("mcp_ado_repo_list_repos_by_project", {
      project: "DemoProject",
    });
    expect(result["mcp_server"]).toBe("ado");
    expect(result["mcp_tool"]).toBe("repo_list_repos_by_project");
    expect(result["text"]).toBe("repos for DemoProject");
  });
});

function writeFakeAdoMcpServer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-agent-daemon-mcp-"));
  const scriptPath = path.join(dir, "fake-ado-mcp-server.mjs");
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
      serverInfo: { name: "fake-ado", version: "1.0.0" }
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
