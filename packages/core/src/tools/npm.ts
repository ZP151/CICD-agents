import { runCommand, type Tool, type ToolContext } from "./executor.js";

function npmBin(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

const ALLOWED = ["npm", "npm.cmd"] as const;

async function npmRun(ctx: ToolContext, args: string[]): Promise<Record<string, unknown>> {
  const res = await runCommand([npmBin(), ...args], {
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

export function npmTools(): Tool[] {
  return [
    {
      name: "npm_test",
      description: "Run `npm run <script> --silent` (default: test).",
      parameters: {
        type: "object",
        properties: { script: { type: "string", default: "test" } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) =>
        npmRun(ctx, ["run", String(payload["script"] ?? "test"), "--silent"]),
    },
    {
      name: "npm_build",
      description: "Run `npm run <script>` (default: build).",
      parameters: {
        type: "object",
        properties: { script: { type: "string", default: "build" } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => npmRun(ctx, ["run", String(payload["script"] ?? "build")]),
    },
  ];
}
