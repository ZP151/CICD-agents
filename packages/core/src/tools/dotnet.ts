import { runCommand, type Tool, type ToolContext } from "./executor.js";

const ALLOWED = ["dotnet"] as const;

async function dotnetRun(ctx: ToolContext, args: string[]): Promise<Record<string, unknown>> {
  const res = await runCommand(["dotnet", ...args], {
    cwd: ctx.repoPath,
    timeoutSec: ctx.timeoutSec,
    allowed: ALLOWED,
  });
  return {
    returncode: res.returncode,
    stdout: res.stdout.slice(-12000),
    stderr: res.stderr.slice(-4000),
    duration_ms: res.durationMs,
  };
}

export function dotnetTools(): Tool[] {
  return [
    {
      name: "dotnet_build",
      description: "Run `dotnet build --nologo` in the repo.",
      parameters: {
        type: "object",
        properties: { args: { type: "array", items: { type: "string" } } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) =>
        dotnetRun(ctx, ["build", "--nologo", ...((payload["args"] as string[]) ?? [])]),
    },
    {
      name: "dotnet_test",
      description: "Run `dotnet test --nologo` in the repo.",
      parameters: {
        type: "object",
        properties: { args: { type: "array", items: { type: "string" } } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) =>
        dotnetRun(ctx, ["test", "--nologo", ...((payload["args"] as string[]) ?? [])]),
    },
  ];
}
