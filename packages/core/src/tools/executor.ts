import { spawn } from "node:child_process";
import { logger } from "../logger.js";

const SECRET_PATTERNS: Array<RegExp> = [
  /(?<lead>authorization\s*:\s*basic\s+)[A-Za-z0-9+/=]+/gi,
  /(?<lead>authorization\s*:\s*bearer\s+)\S+/gi,
  /(?<lead>api[_-]?key\s*[:=]\s*)['"]?[A-Za-z0-9_\-]{8,}['"]?/gi,
  /(?<lead>pat\s*[:=]\s*)['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
  /(?<lead>password\s*[:=]\s*)['"]?[^\s'"\n]{4,}['"]?/gi,
];

export function redact(text: string): string {
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, (_m, ..._args) => {
      const groups = _args[_args.length - 1] as { lead?: string };
      return `${groups?.lead ?? ""}***REDACTED***`;
    });
  }
  return out;
}

export class ToolError extends Error {}

export interface CommandResult {
  cmd: string[];
  returncode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface RunOptions {
  cwd: string;
  timeoutSec?: number;
  env?: Record<string, string>;
  allowed?: readonly string[];
  inputText?: string;
}

export function runCommand(cmd: string[], options: RunOptions): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (cmd.length === 0) {
      reject(new ToolError("empty command"));
      return;
    }
    const head = cmd[0]!;
    if (options.allowed && !options.allowed.includes(head)) {
      reject(
        new ToolError(
          `command '${head}' is not in the allowlist for this tool: ${JSON.stringify(options.allowed)}`,
        ),
      );
      return;
    }
    const start = Date.now();
    const child = spawn(head, cmd.slice(1), {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
    const timeoutMs = (options.timeoutSec ?? 600) * 1000;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ToolError(`command timed out after ${options.timeoutSec ?? 600}s: ${cmd.join(" ")}`));
    }, timeoutMs);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => stdoutChunks.push(b));
    child.stderr.on("data", (b: Buffer) => stderrChunks.push(b));
    if (options.inputText !== undefined) {
      child.stdin.write(options.inputText);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new ToolError(`failed to spawn ${head}: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = redact(Buffer.concat(stdoutChunks).toString("utf8"));
      const stderr = redact(Buffer.concat(stderrChunks).toString("utf8"));
      const durationMs = Date.now() - start;
      logger().debug({ cmd, code, durationMs }, "exec finished");
      resolve({ cmd, returncode: code ?? 0, stdout, stderr, durationMs });
    });
  });
}

export function splitCommand(command: string): string[] {
  return command.trim().length === 0 ? [] : command.trim().split(/\s+/);
}

export interface ToolContext {
  repoPath: string;
  env: Record<string, string>;
  timeoutSec: number;
  extra: Record<string, unknown>;
}

export type ToolHandler = (ctx: ToolContext, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: ToolHandler;
  allowedCommands?: readonly string[];
}

export function toolSchema(tool: Tool): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export class ToolExecutor {
  private readonly tools = new Map<string, Tool>();

  constructor(public readonly context: ToolContext) {}

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: Iterable<Tool>): void {
    for (const t of tools) this.register(t);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  schemas(): ReturnType<typeof toolSchema>[] {
    return this.list().map(toolSchema);
  }

  async call(name: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolError(`unknown tool: ${name}`);
    const result = await tool.handler(this.context, payload);
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      throw new ToolError(`tool '${name}' did not return an object`);
    }
    return result;
  }
}
