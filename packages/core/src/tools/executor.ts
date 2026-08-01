import { spawn } from "node:child_process";
import { logger } from "../logger.js";

const SECRET_PATTERNS: Array<RegExp> = [
  /(?<lead>authorization\s*:\s*basic\s+)[A-Za-z0-9+/=]+/gi,
  /(?<lead>authorization\s*:\s*bearer\s+)\S+/gi,
  /(?<lead>\bbearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /(?<lead>api[_-]?key\s*[:=]\s*)['"]?[A-Za-z0-9_\-]{8,}['"]?/gi,
  /(?<lead>pat\s*[:=]\s*)['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
  /(?<lead>(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|token)\s*[:=]\s*)['"]?[A-Za-z0-9._~+/=-]{8,}['"]?/gi,
  /(?<lead>password\s*[:=]\s*)['"]?[^\s'"\n]{4,}['"]?/gi,
  /(?<lead>https?:\/\/)[^@\s/]+:[^@\s/]+@/gi,
];

export function redact(text: string): string {
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, (_m, ..._args) => {
      const groups = _args[_args.length - 1] as { lead?: string };
      const lead = groups?.lead ?? "";
      return lead.startsWith("http") ? `${lead}***REDACTED***@` : `${lead}***REDACTED***`;
    });
  }
  return out;
}

export class ToolError extends Error {}

export interface ToolCallInfo {
  toolName: string;
  payload: Record<string, unknown>;
  tool: Tool;
}

/**
 * Ported from OpenHarness' approve-before-execute pattern.
 * Return true to allow tool execution, false to deny it.
 */
export type ToolApproveFn = (toolCall: ToolCallInfo) => boolean | Promise<boolean>;
export type ToolBeforeExecuteFn = (
  toolCall: ToolCallInfo,
) => void | Record<string, unknown> | Promise<void | Record<string, unknown>>;

export class ToolDeniedError extends Error {
  constructor(toolName: string) {
    super(`Tool call to "${toolName}" was denied.`);
    this.name = "ToolDeniedError";
  }
}

export interface CommandResult {
  cmd: string[];
  returncode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type CommandOutputStream = "stdout" | "stderr";

export interface CommandOutputChunk {
  stream: CommandOutputStream;
  text: string;
}

export interface RunOptions {
  cwd: string;
  timeoutSec?: number;
  env?: Record<string, string>;
  allowed?: readonly string[];
  inputText?: string;
  onOutput?: (chunk: CommandOutputChunk) => void;
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
      // Do NOT use shell:true on Windows — cmd.exe splits space-containing
      // arguments (e.g. git commit messages) into separate tokens, turning
      // "commit -m My message" into pathspec errors. The daemon's injectGitPath()
      // already injects git into process.env.PATH, so shell:false finds git fine.
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
    child.stdout.on("data", (b: Buffer) => {
      stdoutChunks.push(b);
      options.onOutput?.({ stream: "stdout", text: redact(b.toString("utf8")) });
    });
    child.stderr.on("data", (b: Buffer) => {
      stderrChunks.push(b);
      options.onOutput?.({ stream: "stderr", text: redact(b.toString("utf8")) });
    });
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
  emitToolEvent?: (event: ToolRuntimeEvent) => void;
}

export type ToolHandler = (ctx: ToolContext, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type ToolRuntimeEvent =
  | { type: "output"; stream: CommandOutputStream; text: string };

export type ToolCallStreamEvent =
  | ToolRuntimeEvent
  | { type: "result"; result: Record<string, unknown> };

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

  constructor(
    public readonly context: ToolContext,
    private readonly approve?: ToolApproveFn,
    private readonly beforeExecute?: ToolBeforeExecuteFn,
  ) {}

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
    return this.execute(name, payload);
  }

  async *callStream(name: string, payload: Record<string, unknown>): AsyncGenerator<ToolCallStreamEvent> {
    const queue: ToolCallStreamEvent[] = [];
    let done = false;
    let failure: unknown;
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };
    const wait = () => new Promise<void>((resolve) => {
      wake = resolve;
    });
    const push = (event: ToolCallStreamEvent) => {
      queue.push(event);
      notify();
    };

    void this.execute(name, payload, (event) => push(event))
      .then((result) => push({ type: "result", result }))
      .catch((err: unknown) => {
        failure = err;
      })
      .finally(() => {
        done = true;
        notify();
      });

    while (!done || queue.length > 0) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (!done) await wait();
    }

    if (failure) throw failure;
  }

  private async execute(
    name: string,
    payload: Record<string, unknown>,
    emitToolEvent?: (event: ToolRuntimeEvent) => void,
  ): Promise<Record<string, unknown>> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolError(`unknown tool: ${name}`);
    if (this.approve) {
      const allowed = await this.approve({ toolName: name, payload, tool });
      if (!allowed) throw new ToolDeniedError(name);
    }
    const beforeExecuteMetadata = this.beforeExecute
      ? await this.beforeExecute({ toolName: name, payload, tool })
      : undefined;
    const context = emitToolEvent ? { ...this.context, emitToolEvent } : this.context;
    const result = await tool.handler(context, payload);
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      throw new ToolError(`tool '${name}' did not return an object`);
    }
    if (beforeExecuteMetadata && typeof beforeExecuteMetadata === "object" && !Array.isArray(beforeExecuteMetadata)) {
      return {
        ...result,
        execution_metadata: {
          beforeExecute: beforeExecuteMetadata,
        },
      };
    }
    return result;
  }
}
