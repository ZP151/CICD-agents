import { runCommand, type ToolContext } from "./executor.js";

export const ALLOWED_GIT_COMMANDS = ["git"] as const;

export async function runGit(
  ctx: ToolContext,
  args: string[],
  timeoutSec?: number,
  inputText?: string,
): Promise<Record<string, unknown>> {
  const res = await runCommand(["git", ...args], {
    cwd: ctx.repoPath,
    timeoutSec: timeoutSec ?? ctx.timeoutSec,
    allowed: ALLOWED_GIT_COMMANDS,
    inputText,
    env: ctx.env,
    onOutput: ctx.emitToolEvent
      ? (chunk) => ctx.emitToolEvent?.({ type: "output", ...chunk })
      : undefined,
  });
  return {
    returncode: res.returncode,
    stdout: res.stdout,
    stderr: res.stderr,
    duration_ms: res.durationMs,
  };
}

export async function runGitReadOnly(
  ctx: ToolContext,
  args: string[],
  timeoutSec?: number,
): Promise<Record<string, unknown>> {
  const res = await runCommand(["git", ...args], {
    cwd: ctx.repoPath,
    timeoutSec: timeoutSec ?? ctx.timeoutSec,
    allowed: ALLOWED_GIT_COMMANDS,
    env: { ...ctx.env, GIT_OPTIONAL_LOCKS: "0" },
    onOutput: ctx.emitToolEvent
      ? (chunk) => ctx.emitToolEvent?.({ type: "output", ...chunk })
      : undefined,
  });
  return {
    returncode: res.returncode,
    stdout: res.stdout,
    stderr: res.stderr,
    duration_ms: res.durationMs,
  };
}

export async function gitText(ctx: ToolContext, args: string[]): Promise<string> {
  const res = await runGit(ctx, args);
  return String(res["stdout"] ?? "").trim();
}

export async function gitStdout(ctx: ToolContext, args: string[]): Promise<string> {
  const res = await runGit(ctx, args);
  return String(res["stdout"] ?? "");
}

export async function gitReadOnlyText(ctx: ToolContext, args: string[]): Promise<string> {
  const res = await runGitReadOnly(ctx, args);
  return String(res["stdout"] ?? "").trim();
}
