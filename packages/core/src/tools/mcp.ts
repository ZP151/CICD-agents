/**
 * SDK-backed MCP connection manager (MP-015).
 *
 * Replaces the hand-written JSON-RPC frame/parser with the official MCP
 * TypeScript SDK v1.x: lifecycle, protocol/capability negotiation, newline-
 * framed stdio transport, tool-list pagination, `tools/list_changed`
 * notifications and standard cancellation all come from the SDK. Product
 * code only sees the narrow local interface below.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  LATEST_PROTOCOL_VERSION,
  ToolListChangedNotificationSchema,
  type Tool as McpSdkTool,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolError, type Tool } from "./executor.js";
import { ConnectorFailure } from "../failures.js";

export { ConnectorFailure } from "../failures.js";

export interface McpStdioServerConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  /** Explicit credential values selected by the managed connector. */
  env?: Record<string, string>;
  /**
   * Kept for an explicit compatibility opt-in only. A managed connector must
   * not inherit the daemon environment, which contains model credentials.
   */
  inheritProcessEnv?: boolean;
  timeoutMs?: number;
  /**
   * Fired when the server announces `notifications/tools/list_changed`.
   * The client invalidates its own cache first; the owner decides whether to
   * rebuild the tool surface (next turn) or refresh immediately.
   */
  onToolsListChanged?: () => void;
  /** Test seam: inject a transport (e.g. InMemoryTransport) instead of stdio. */
  createTransport?: () => Promise<Transport>;
}

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Server-provided annotations. Advisory only: never a trust signal. */
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpCallToolResult {
  content?: unknown[];
  isError?: boolean;
  structuredContent?: unknown;
  [key: string]: unknown;
}

export class McpConnectionManager {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private cachedTools: McpToolDefinition[] | null = null;
  private protocolVersion: string | undefined;
  private serverCapabilities: Record<string, unknown> | undefined;
  private serverInfo: { name?: string; version?: string } | undefined;
  private closed = false;

  constructor(private readonly config: McpStdioServerConfig) {}

  get isConnected(): boolean {
    return this.client !== null && !this.closed;
  }

  /** Protocol version negotiated during initialize (RA-075). */
  get negotiatedProtocolVersion(): string | undefined {
    return this.protocolVersion;
  }

  get serverCapabilitySet(): Record<string, unknown> | undefined {
    return this.serverCapabilities;
  }

  get serverIdentity(): { name?: string; version?: string } | undefined {
    return this.serverInfo;
  }

  async start(): Promise<void> {
    if (this.isConnected) return;
    this.closed = false;
    const transport = this.config.createTransport
      ? await this.config.createTransport()
      : new StdioClientTransport({
          command: this.config.command,
          args: this.config.args ?? [],
          cwd: this.config.cwd,
          env: mcpChildEnvironment(this.config),
          stderr: "pipe",
        });
    const client = new Client(
      { name: "mergepilot", version: "0.5.32" },
      { capabilities: {} },
    );
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      this.cachedTools = null;
      this.config.onToolsListChanged?.();
    });
    try {
      await client.connect(transport);
    } catch (err) {
      await transport.close().catch(() => undefined);
      throw mcpConnectFailure(this.config.name, err);
    }
    this.client = client;
    this.transport = transport;
    const serverVersion = client.getServerVersion();
    // The negotiated protocol version is internal to the SDK; the transport
    // records it where supported, otherwise a successful connect means the
    // latest supported version was accepted.
    const negotiated = (transport as { _protocolVersion?: string })._protocolVersion;
    this.protocolVersion = negotiated ?? LATEST_PROTOCOL_VERSION;
    this.serverInfo = {
      name: serverVersion?.name,
      version: serverVersion?.version,
    };
    this.serverCapabilities = client.getServerCapabilities() as Record<string, unknown> | undefined;
  }

  async initialize(): Promise<void> {
    await this.start();
  }

  /** Paginated, session-bound tool discovery (RA-075). */
  async listTools(): Promise<McpToolDefinition[]> {
    if (this.cachedTools) return this.cachedTools;
    await this.start();
    const client = this.client!;
    const tools: McpSdkTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, this.requestOptions());
      tools.push(...(page.tools ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    this.cachedTools = tools.map(mcpToolDefinition);
    return this.cachedTools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { signal?: AbortSignal } = {},
  ): Promise<McpCallToolResult> {
    await this.start();
    const result = await this.client!.callTool({ name, arguments: args }, undefined, {
      ...this.requestOptions(),
      signal: opts.signal,
    });
    return mcpCallToolResult(result);
  }

  async close(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.cachedTools = null;
    this.closed = true;
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
  }

  private requestOptions(): RequestOptions {
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    return { timeout: timeoutMs };
  }
}

/**
 * Compatibility surface for existing daemon callers. Same SDK-backed
 * implementation; the class name keeps the connector wiring stable.
 */
export class StdioMcpClient extends McpConnectionManager {
  constructor(config: McpStdioServerConfig) {
    super(config);
  }
}

function mcpToolDefinition(tool: McpSdkTool): McpToolDefinition {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
    annotations: tool.annotations
      ? {
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
          idempotentHint: tool.annotations.idempotentHint,
          openWorldHint: tool.annotations.openWorldHint,
        }
      : undefined,
  };
}

function mcpCallToolResult(result: unknown): McpCallToolResult {
  const record = (typeof result === "object" && result !== null ? result : {}) as Record<string, unknown>;
  const content = record["content"];
  return {
    content: Array.isArray(content) ? (content as unknown[]) : [],
    isError: record["isError"] === true,
    ...(record["structuredContent"] !== undefined ? { structuredContent: record["structuredContent"] } : {}),
  };
}

/**
 * A failed initialize can be a version/capability mismatch or an
 * availability problem. Classify it typed instead of a bare ToolError.
 */
function mcpConnectFailure(serverName: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/protocol|version|incompatible|unsupported/i.test(message)) {
    return new ConnectorFailure({
      kind: "protocol_incompatible",
      connectorId: serverName,
      source: "stdio",
      message: `MCP server '${serverName}' protocol negotiation failed: ${message}`,
      retryable: false,
    });
  }
  return new ConnectorFailure({
    kind: "connector_unavailable",
    connectorId: serverName,
    source: "stdio",
    message: `MCP server '${serverName}' could not be started: ${message}`,
    retryable: true,
  });
}

export function createMcpToolWrappers(
  serverName: string,
  definitions: McpToolDefinition[],
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<McpCallToolResult>,
): Tool[] {
  return definitions.map((definition) => {
    const localName = mcpLocalToolName(serverName, definition.name);
    return {
      name: localName,
      description: definition.description ?? `Call MCP tool ${definition.name} on ${serverName}.`,
      parameters: normalizeInputSchema(definition.inputSchema),
      connector: {
        kind: "mcp",
        id: serverName,
        label: connectorLabel(serverName),
      },
      originalName: definition.name,
      handler: async (_ctx, payload) => {
        const result = await callTool(definition.name, payload);
        if (result.isError) {
          throw new ToolError(`MCP tool '${definition.name}' returned an error: ${mcpContentText(result.content)}`);
        }
        return {
          mcp_server: serverName,
          mcp_tool: definition.name,
          text: mcpContentText(result.content),
          result,
        };
      },
    };
  });
}

/**
 * MCP servers are executable code. Do not hand them the daemon's complete
 * environment by default: it may contain the model API key or cloud tokens.
 * Keep only process bootstrap variables and credentials intentionally passed
 * by a managed connector.
 */
function mcpChildEnvironment(config: McpStdioServerConfig): Record<string, string> {
  if (config.inheritProcessEnv) return { ...(process.env as Record<string, string>), ...(config.env ?? {}) };
  const inherited = ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "COMSPEC", "ComSpec", "TEMP", "TMP", "USERPROFILE", "HOME"];
  const base: Record<string, string> = {};
  for (const key of inherited) {
    const value = process.env[key];
    if (value) base[key] = value;
  }
  return { ...base, ...(config.env ?? {}) };
}

function connectorLabel(serverName: string): string {
  const label = serverName
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return label.replace(/\bDevops\b/g, "DevOps");
}

export async function createMcpToolsFromClient(serverName: string, client: McpConnectionManager): Promise<Tool[]> {
  const definitions = await client.listTools();
  return createMcpToolWrappers(serverName, definitions, (toolName, args) => client.callTool(toolName, args));
}

export function mcpLocalToolName(serverName: string, toolName: string): string {
  return `mcp_${sanitizeToolNamePart(serverName)}_${sanitizeToolNamePart(toolName)}`;
}

export function sanitizeToolNamePart(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return sanitized || "server";
}

function normalizeInputSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema) return { type: "object", properties: {} };
  return {
    type: "object",
    properties: {},
    ...schema,
  };
}

function mcpContentText(content: unknown[] | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        if (typeof record["text"] === "string") return record["text"];
        if (record["type"] === "image") return "[image attachment]";
      }
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join("\n");
}
