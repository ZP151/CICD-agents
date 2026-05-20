import { runCommand, type Tool, type ToolContext } from "./executor.js";

const ALLOWED = ["python", "python.exe", "python3", "pytest", "py.test"] as const;

function pythonBin(): string {
  return process.platform === "win32" ? "python" : "python3";
}

export function pytestTools(): Tool[] {
  return [
    {
      name: "pytest_run",
      description: "Run pytest via `python -m pytest` (default args: -q).",
      parameters: {
        type: "object",
        properties: { args: { type: "array", items: { type: "string" } } },
      },
      allowedCommands: ALLOWED,
      handler: async (ctx: ToolContext, payload) => {
        const extra = (payload["args"] as string[]) ?? ["-q"];
        const res = await runCommand([pythonBin(), "-m", "pytest", ...extra], {
          cwd: ctx.repoPath,
          timeoutSec: ctx.timeoutSec,
          allowed: ALLOWED,
        });
        return {
          returncode: res.returncode,
          stdout: res.stdout.slice(-20000),
          stderr: res.stderr.slice(-4000),
          duration_ms: res.durationMs,
        };
      },
    },
  ];
}
