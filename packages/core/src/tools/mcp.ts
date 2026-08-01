import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Buffer } from "node:buffer";
import { ToolError, type Tool } from "./executor.js";

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
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCallToolResult {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

export class StdioMcpClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private stderrTail = "";
  private initialized = false;

  constructor(private readonly config: McpStdioServerConfig) {}

  async start(): Promise<void> {
    if (this.child) return;
    this.child = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.config.cwd,
      env: mcpChildEnvironment(this.config),
      shell: false,
      windowsHide: true,
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-4000);
    });
    this.child.on("error", (err) => this.rejectAll(err));
    this.child.on("exit", (code, signal) => {
      this.rejectAll(new ToolError(`MCP server '${this.config.name}' exited with code ${code ?? "null"} signal ${signal ?? "null"}. ${this.stderrTail}`));
      this.child = null;
      this.initialized = false;
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.start();
    await this.request("initialize", {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "mergepilot",
        version: "0.5.0",
      },
    });
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.initialize();
    const result = await this.request("tools/list", {});
    if (!isRecord(result)) return [];
    const tools = result["tools"];
    if (!Array.isArray(tools)) return [];
    return tools
      .filter(isRecord)
      .map((tool) => ({
        name: String(tool["name"] ?? ""),
        description: typeof tool["description"] === "string" ? tool["description"] : undefined,
        inputSchema: isRecord(tool["inputSchema"]) ? tool["inputSchema"] : undefined,
      }))
      .filter((tool) => tool.name.length > 0);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
    await this.initialize();
    const result = await this.request("tools/call", { name, arguments: args });
    return isRecord(result) ? result : { content: [{ type: "text", text: String(result ?? "") }] };
  }

  async close(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.initialized = false;
    child.kill();
    this.rejectAll(new ToolError(`MCP server '${this.config.name}' was closed.`));
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ToolError(`MCP request '${method}' to '${this.config.name}' timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.writeJson({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.writeJson({ jsonrpc: "2.0", method, params });
  }

  private writeJson(message: Record<string, unknown>): void {
    if (!this.child) throw new ToolError(`MCP server '${this.config.name}' is not running.`);
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
    this.child.stdin.write(Buffer.concat([header, body]));
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      const parsed = readFramedJson(this.stdoutBuffer);
      if (!parsed) return;
      this.stdoutBuffer = parsed.rest;
      this.onMessage(parsed.message);
    }
  }

  private onMessage(message: unknown): void {
    if (!isRecord(message)) return;
    const response = message as JsonRpcResponse;
    if (response.id === undefined || response.id === null) return;
    const id = Number(response.id);
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (response.error) {
      pending.reject(new ToolError(`MCP request failed: ${response.error.message ?? "unknown error"}`));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAll(err: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }
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
function mcpChildEnvironment(config: McpStdioServerConfig): NodeJS.ProcessEnv {
  if (config.inheritProcessEnv) return { ...process.env, ...(config.env ?? {}) };
  const inherited = ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "COMSPEC", "ComSpec", "TEMP", "TMP", "USERPROFILE", "HOME"];
  const base: NodeJS.ProcessEnv = {};
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

export async function createMcpToolsFromClient(serverName: string, client: StdioMcpClient): Promise<Tool[]> {
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
      if (isRecord(item) && typeof item["text"] === "string") return item["text"];
      return JSON.stringify(item);
    })
    .filter(Boolean)
    .join("\n");
}

function readFramedJson(buffer: Buffer<ArrayBufferLike>): { message: unknown; rest: Buffer<ArrayBufferLike> } | null {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");
  const useCrlf = crlfIndex >= 0 && (lfIndex < 0 || crlfIndex <= lfIndex);
  const headerEnd = useCrlf ? crlfIndex : lfIndex;
  if (headerEnd < 0) return null;
  const delimiterLength = useCrlf ? 4 : 2;
  const header = buffer.subarray(0, headerEnd).toString("ascii");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) {
    throw new ToolError("MCP frame missing Content-Length header.");
  }
  const length = Number(match[1]);
  const bodyStart = headerEnd + delimiterLength;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;
  const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
  return {
    message: JSON.parse(body) as unknown,
    rest: buffer.subarray(bodyEnd),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
