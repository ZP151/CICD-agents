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

/**
 * Fixture servers speak the official newline-delimited stdio framing with a
 * complete initialize result, matching the SDK-backed client baseline.
 */
function newlineFixtureServer(scriptBody: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-mcp-"));
  const scriptPath = path.join(dir, "server.mjs");
  fs.writeFileSync(scriptPath, `
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
`, "utf8");
  return scriptPath;
}

function writeFakeAdoMcpServer(): string {
  return newlineFixtureServer(`
  if (message.method === "tools/list") send(message.id, { tools: [
    { name: "repos_list", description: "List repositories", inputSchema: { type: "object", properties: {} } },
    { name: "pipelines_run", description: "Run pipeline", inputSchema: { type: "object", properties: {} } }
  ] });
  else send(message.id, { content: [] });
`);
}

function writeFakeWebMcpServer(): string {
  return newlineFixtureServer(`
  if (message.method === "tools/list") send(message.id, { tools: [
    { name: "search_current_docs", inputSchema: { type: "object", properties: {} } },
    { name: "read_url", inputSchema: { type: "object", properties: {} } },
    { name: "publish_report", inputSchema: { type: "object", properties: {} } }
  ] });
  else send(message.id, { content: [] });
`);
}
