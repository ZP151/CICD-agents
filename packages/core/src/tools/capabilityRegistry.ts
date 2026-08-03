/**
 * CapabilityRegistry (MP-015).
 *
 * Normalizes discovered tools (native and MCP) into one record per local
 * capability: source, original server/tool name, connector identity, domain,
 * schema, read/write, risk, idempotency and auth state. UI, planner and
 * persistence read this registry instead of each deriving tool state from
 * names or descriptions.
 */
import type { Tool } from "./executor.js";
import { toolCapability, type ToolCapability } from "./capabilities.js";

export type CapabilitySource = "native" | "mcp";
export type CapabilityAuthState = "not_required" | "unknown" | "authorized" | "unauthorized";

export interface CapabilityAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface CapabilityRecord extends ToolCapability {
  source: CapabilitySource;
  /** Original server tool name for MCP tools. */
  serverToolName?: string;
  connectorId?: string;
  connectorLabel?: string;
  /** ADO-style domain: repositories | pipelines | work-items | pull-requests. */
  domain?: string;
  /** Local policy judgement, independent of server annotations. */
  readOnly: boolean;
  /** Server-provided hints. Advisory only: never elevate trust. */
  annotations?: CapabilityAnnotations;
  /** Whether a repeated call with identical args is safe to dedupe/retry. */
  idempotent: boolean | undefined;
  authState: CapabilityAuthState;
  toolVersion?: string;
}

export class CapabilityRegistry {
  private readonly records = new Map<string, CapabilityRecord>();

  register(capability: CapabilityRecord): void {
    this.records.set(capability.name, capability);
  }

  registerTools(tools: Iterable<Tool>, authState: CapabilityAuthState = "unknown"): void {
    for (const tool of tools) {
      this.register(capabilityForTool(tool, authState));
    }
  }

  get(name: string): CapabilityRecord | undefined {
    return this.records.get(name);
  }

  has(name: string): boolean {
    return this.records.has(name);
  }

  list(): CapabilityRecord[] {
    return [...this.records.values()];
  }

  filterByDomain(domain: string): CapabilityRecord[] {
    return this.list().filter((record) => record.domain === domain);
  }

  get size(): number {
    return this.records.size;
  }
}

export function capabilityRegistryFromTools(
  tools: Iterable<Tool>,
  authState: CapabilityAuthState = "unknown",
): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.registerTools(tools, authState);
  return registry;
}

function capabilityForTool(tool: Tool, authState: CapabilityAuthState): CapabilityRecord {
  const base = toolCapability(tool);
  const isMcp = tool.connector?.kind === "mcp";
  return {
    ...base,
    source: isMcp ? "mcp" : "native",
    serverToolName: isMcp ? tool.originalName : undefined,
    connectorId: isMcp ? tool.connector?.id : undefined,
    connectorLabel: isMcp ? tool.connector?.label : undefined,
    domain: isMcp ? mcpDomainForTool(tool.name) : undefined,
    idempotent: undefined,
    authState,
  };
}

/**
 * ADO domain for a local MCP tool name. Single source for domain filtering;
 * callers must not re-implement this string matching.
 */
export function mcpDomainForTool(localName: string): string | undefined {
  const name = localName.toLowerCase();
  if (/(?:repo|repository)/.test(name)) return "repositories";
  if (/(?:pipeline|build)/.test(name)) return "pipelines";
  if (/(?:work_?item|wi_)/.test(name)) return "work-items";
  if (/(?:pull_?request|pr_)/.test(name)) return "pull-requests";
  return undefined;
}
