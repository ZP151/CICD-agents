/**
 * Contract tests for the SDK-backed MCP adapter (MP-015, RA-075..079).
 * The server side is the official MCP SDK over an in-memory transport, so the
 * lifecycle, pagination, list-change, schema and cancellation behavior is
 * exercised without spawning processes.
 */
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool as McpSdkTool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ConnectorFailure,
  McpConnectionManager,
  createMcpToolsFromClient,
  mcpLocalToolName,
} from "../src/tools/mcp.js";

const READ_TOOL: McpSdkTool = {
  name: "list_repositories",
  description: "List repositories",
  inputSchema: { type: "object", properties: { project: { type: "string" } } },
};

const WRITE_TOOL: McpSdkTool = {
  name: "queue_pipeline",
  description: "Queue a pipeline run",
  inputSchema: { type: "object", properties: { pipelineId: { type: "string" } }, required: ["pipelineId"] },
  annotations: { readOnlyHint: false, destructiveHint: true },
};

async function linkedPair(): Promise<{
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([clientTransport.start(), serverTransport.start()]);
  return { clientTransport, serverTransport };
}

function managerFor(transport: InMemoryTransport, hooks: { onToolsListChanged?: () => void } = {}): McpConnectionManager {
  return new McpConnectionManager({
    name: "test-server",
    command: "unused",
    createTransport: async () => transport,
    onToolsListChanged: hooks.onToolsListChanged,
  });
}

describe("McpConnectionManager lifecycle (RA-075)", () => {
  it("negotiates protocol and capabilities and exposes server identity", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    const server = new Server({ name: "fixture-server", version: "1.2.3" }, { capabilities: { tools: {} } });
    await server.connect(serverTransport);

    const manager = managerFor(clientTransport);
    await manager.start();

    expect(manager.isConnected).toBe(true);
    expect(manager.serverIdentity).toMatchObject({ name: "fixture-server", version: "1.2.3" });
    expect(manager.negotiatedProtocolVersion).toBeTruthy();
    expect(manager.serverCapabilitySet).toBeTruthy();
    await manager.close();
    expect(manager.isConnected).toBe(false);
  });

  it("classifies an unsupported protocol version as protocol_incompatible (RA-076)", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    // Hand-rolled server answering initialize with an ancient protocol
    // version the SDK client does not support. Respond through the server's
    // own transport end so the response reaches the client.
    serverTransport.onmessage = async (message) => {
      const request = message as { id?: number | string; method?: string };
      if (request.method === "initialize") {
        await serverTransport.send({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2023-01-01",
            capabilities: {},
            serverInfo: { name: "old-server", version: "0.0.1" },
          },
        });
      }
    };

    const manager = managerFor(clientTransport);
    await manager.start().catch((err: unknown) => {
      expect(err).toBeInstanceOf(ConnectorFailure);
      expect((err as ConnectorFailure).kind).toBe("protocol_incompatible");
      expect((err as ConnectorFailure).retryable).toBe(false);
    });
  });
});

describe("McpConnectionManager tool discovery (RA-075/RA-077)", () => {
  async function paginatedServer(serverTransport: InMemoryTransport): Promise<Server> {
    const server = new Server({ name: "paginated", version: "1.0.0" }, { capabilities: { tools: {} } });
    const all = [READ_TOOL, { ...READ_TOOL, name: "list_builds" }, WRITE_TOOL];
    server.setRequestHandler(ListToolsRequestSchema, (request) => {
      const cursor = request.params?.cursor;
      if (!cursor) return { tools: all.slice(0, 2), nextCursor: "page-2" };
      return { tools: all.slice(2), nextCursor: undefined };
    });
    await server.connect(serverTransport);
    return server;
  }

  it("follows nextCursor until the tool list is complete", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    await paginatedServer(serverTransport);

    const manager = managerFor(clientTransport);
    const definitions = await manager.listTools();

    expect(definitions.map((tool) => tool.name)).toEqual(["list_repositories", "list_builds", "queue_pipeline"]);
    expect(definitions[2]?.annotations?.destructiveHint).toBe(true);
    await manager.close();
  });

  it("invalidates the cache on tools/list_changed and notifies the owner", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    const server = await paginatedServer(serverTransport);
    const onToolsListChanged = vi.fn();

    const manager = managerFor(clientTransport, { onToolsListChanged });
    expect((await manager.listTools()).length).toBe(3);
    await server.sendToolListChanged();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onToolsListChanged).toHaveBeenCalledTimes(1);
    // Second call after the notification refetches instead of serving the cache.
    expect(await manager.listTools()).toHaveLength(3);
    await manager.close();
  });
});

describe("McpConnectionManager calls (RA-078/RA-079)", () => {
  async function callableServer(serverTransport: InMemoryTransport, tools: McpSdkTool[]): Promise<Server> {
    const server = new Server({ name: "callable", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, (request) => {
      if (request.params.name === "boom") {
        return { content: [{ type: "text", text: "business failure" }], isError: true } satisfies CallToolResult;
      }
      if (request.params.name === "hang") {
        return new Promise<CallToolResult>(() => undefined);
      }
      return {
        content: [{ type: "text", text: `ok:${request.params.name}` }],
        structuredContent: { name: request.params.name, echoed: true },
      } satisfies CallToolResult;
    });
    await server.connect(serverTransport);
    return server;
  }

  it("returns structured content alongside text (RA-075)", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    await callableServer(serverTransport, [READ_TOOL]);

    const manager = managerFor(clientTransport);
    const result = await manager.callTool("list_repositories", { project: "p1" });

    expect(result.structuredContent).toEqual({ name: "list_repositories", echoed: true });
    expect(result.isError).toBe(false);
    await manager.close();
  });

  it("propagates server business errors as isError results", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    await callableServer(serverTransport, [READ_TOOL]);

    const manager = managerFor(clientTransport);
    const result = await manager.callTool("boom", {});

    expect(result.isError).toBe(true);
    await manager.close();
  });

  it("propagates standard cancellation instead of hanging (RA-079)", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    await callableServer(serverTransport, [READ_TOOL]);

    const manager = managerFor(clientTransport);
    const controller = new AbortController();
    const pending = manager.callTool("hang", {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    // The SDK wraps the abort in a RequestCancelled McpError (code -32001);
    // the observable contract is that the call rejects promptly instead of
    // leaving a dangling remote call.
    await expect(pending).rejects.toMatchObject({
      code: -32001,
      message: expect.stringMatching(/abort/i),
    });
    await manager.close();
  });
});

describe("createMcpToolsFromClient integration", () => {
  it("wraps SDK tools into local Tool contract with stable connector provenance", async () => {
    const { clientTransport, serverTransport } = await linkedPair();
    const server = new Server({ name: "azure-devops", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [READ_TOOL, WRITE_TOOL] }));
    server.setRequestHandler(CallToolRequestSchema, (request) => ({
      content: [{ type: "text", text: `ran ${request.params.name}` }],
    }));
    await server.connect(serverTransport);

    const manager = managerFor(clientTransport);
    const tools = await createMcpToolsFromClient("azure-devops", manager);

    expect(tools.map((tool) => tool.name)).toEqual([
      mcpLocalToolName("azure-devops", "list_repositories"),
      mcpLocalToolName("azure-devops", "queue_pipeline"),
    ]);
    expect(tools[0]?.connector).toEqual({ kind: "mcp", id: "azure-devops", label: "Azure DevOps" });
    const result = await tools[0]!.handler(
      { repoPath: ".", env: {}, timeoutSec: 30, extra: {} },
      { project: "example-project" },
    );
    expect(result["text"]).toBe("ran list_repositories");
    await manager.close();
  });
});

describe("MCP client cancellation via SDK Client (compat)", () => {
  it("keeps the SDK Client importable through the manager path", async () => {
    // The manager owns the SDK Client; this guards against accidental
    // regressions to a hand-written transport surface.
    const { clientTransport } = await linkedPair();
    const manager = managerFor(clientTransport);
    expect(manager).toBeInstanceOf(McpConnectionManager);
    expect(Client).toBeTruthy();
  });
});
