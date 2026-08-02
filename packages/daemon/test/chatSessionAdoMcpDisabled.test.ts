import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChatToolExecutors } from "../src/chatSession.js";
import { createAzureDevOpsMcpConnector, createWebResearchMcpConnector } from "../src/chatMcpConnectors.js";
import { writeMergePilotUserConfig } from "../src/daemonEnv.js";

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

  it("registers only a locally managed connector selected by a Project Link", async () => {
    const serverPath = writeFakeAdoMcpServer();
    const connector = await createAzureDevOpsMcpConnector({
      repoPath: ".",
      env: {},
      timeoutSec: 5,
      extra: {
        ado_mcp_enabled: true,
        ado_mcp_domains: "repositories",
        // These legacy Project Link fields must not affect executable launch
        // or credential selection.
        ado_mcp_command: "untrusted-command",
        ado_mcp_authentication: "pat",
      },
    }, {
      enabled: true,
      command: process.execPath,
      args: [serverPath],
      credentialEnv: "",
    });

    expect(connector?.tools.map((tool) => tool.name)).toEqual([
      "mcp_azure_devops_repos_list",
    ]);
    expect(connector?.tools[0]?.connector).toEqual({
      kind: "mcp",
      id: "azure-devops",
      label: "Azure DevOps",
    });
    await connector?.close();
  });

  it("uses the managed local config when constructing the real chat runtime", async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-ado-mcp-config-"));
    const configFile = path.join(configDir, "config.toml");
    const previousConfig = process.env.MERGEPILOT_USER_CONFIG_FILE;
    const serverPath = writeFakeAdoMcpServer();
    writeMergePilotUserConfig({
      azureDevOpsMcp: {
        enabled: true,
        command: process.execPath,
        args: [serverPath],
        credentialEnv: "",
      },
    }, configFile);
    process.env.MERGEPILOT_USER_CONFIG_FILE = configFile;
    try {
      runtime = await createChatToolExecutors({
        repoPath: ".",
        env: {},
        timeoutSec: 5,
        extra: { ado_mcp_enabled: true, ado_mcp_domains: "repositories" },
      });
      const tool = runtime.actionExecutor.list().find((candidate) => candidate.name === "mcp_azure_devops_repos_list");
      expect(tool?.connector).toEqual({ kind: "mcp", id: "azure-devops", label: "Azure DevOps" });
      expect(runtime.actionExecutor.list().some((candidate) => candidate.name.includes("pipelines_run"))).toBe(false);
    } finally {
      if (previousConfig === undefined) delete process.env.MERGEPILOT_USER_CONFIG_FILE;
      else process.env.MERGEPILOT_USER_CONFIG_FILE = previousConfig;
      fs.rmSync(configDir, { recursive: true, force: true });
    }
  });

  it("exposes only read-oriented tools from a managed Web Research connector", async () => {
    const connector = await createWebResearchMcpConnector({
      repoPath: ".",
      env: {},
      timeoutSec: 5,
      extra: {},
    }, {
      enabled: true,
      command: process.execPath,
      args: [writeFakeWebMcpServer()],
      credentialEnv: "",
    });

    expect(connector?.tools.map((tool) => tool.name)).toEqual([
      "mcp_web_research_search_current_docs",
      "mcp_web_research_read_url",
    ]);
    expect(connector?.tools[0]?.connector).toEqual({
      kind: "mcp",
      id: "web-research",
      label: "Web Research",
    });
    await connector?.close();
  });
});

function writeFakeAdoMcpServer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-ado-mcp-"));
  const scriptPath = path.join(dir, "server.mjs");
  fs.writeFileSync(scriptPath, `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const parsed = read(buffer);
    if (!parsed) return;
    buffer = parsed.rest;
    if (!parsed.message.id) continue;
    if (parsed.message.method === "initialize") send(parsed.message.id, { capabilities: {} });
    else if (parsed.message.method === "tools/list") send(parsed.message.id, { tools: [
      { name: "repos_list", description: "List repositories", inputSchema: { type: "object", properties: {} } },
      { name: "pipelines_run", description: "Run pipeline", inputSchema: { type: "object", properties: {} } }
    ] });
    else send(parsed.message.id, { content: [] });
  }
});
function send(id, result) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result }));
  process.stdout.write(Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"), body]));
}

function read(input) {
  const end = input.indexOf("\\r\\n\\r\\n"); if (end < 0) return null;
  const length = Number(/content-length:\\s*(\\d+)/i.exec(input.subarray(0, end).toString("ascii"))?.[1]);
  const start = end + 4; if (input.length < start + length) return null;
  return { message: JSON.parse(input.subarray(start, start + length)), rest: input.subarray(start + length) };
}
`, "utf8");
  return scriptPath;
}

function writeFakeWebMcpServer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-web-mcp-"));
  const scriptPath = path.join(dir, "server.mjs");
  fs.writeFileSync(scriptPath, `
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const parsed = read(buffer); if (!parsed) return; buffer = parsed.rest;
    if (!parsed.message.id) continue;
    if (parsed.message.method === "initialize") send(parsed.message.id, { capabilities: {} });
    else if (parsed.message.method === "tools/list") send(parsed.message.id, { tools: [
      { name: "search_current_docs", inputSchema: { type: "object", properties: {} } },
      { name: "read_url", inputSchema: { type: "object", properties: {} } },
      { name: "publish_report", inputSchema: { type: "object", properties: {} } }
    ] });
    else send(parsed.message.id, { content: [] });
  }
});
function send(id, result) { const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result })); process.stdout.write(Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"), body])); }
function read(input) { const end = input.indexOf("\\r\\n\\r\\n"); if (end < 0) return null; const length = Number(/content-length:\\s*(\\d+)/i.exec(input.subarray(0, end).toString("ascii"))?.[1]); const start = end + 4; if (input.length < start + length) return null; return { message: JSON.parse(input.subarray(start, start + length)), rest: input.subarray(start + length) }; }
`, "utf8");
  return scriptPath;
}
