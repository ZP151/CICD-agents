import nodeFs from "node:fs";
import nodePath from "node:path";
import { runCommand, splitCommand, ToolError, type Tool, type ToolContext } from "./executor.js";

const POWERSHELL = process.platform === "win32" ? "powershell.exe" : "pwsh";
const CMD = "cmd.exe";

function repoLocalPnpm(repoPath: string): string {
  return process.platform === "win32"
    ? nodePath.join(repoPath, ".tools", "pnpm.exe")
    : nodePath.join(repoPath, ".tools", "pnpm");
}

function normalizeCommandPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function safeArgs(args: string[]): string[] {
  for (const arg of args) {
    if (/[;&|<>`]/.test(arg)) throw new ToolError(`validation command argument is not allowed: ${arg}`);
  }
  return args;
}

function windowsCmdRunner(command: string, args: string[]): { cmd: string[]; allowed: string[] } {
  return {
    cmd: [CMD, "/d", "/s", "/c", command, ...args],
    allowed: [CMD],
  };
}

function resolveValidationCommand(repoPath: string, command: string): { cmd: string[]; allowed: string[] } {
  const tokens = splitCommand(command);
  if (tokens.length === 0) throw new ToolError("Validation command is empty.");
  const [head = "", ...rest] = tokens;
  const normalized = normalizeCommandPath(head);
  const args = safeArgs(rest);

  if (normalized === "scripts/windows/pnpm-project.ps1") {
    const script = nodePath.join(repoPath, "scripts", "windows", "pnpm-project.ps1");
    if (!nodeFs.existsSync(script)) throw new ToolError("Repository-local pnpm-project.ps1 was not found.");
    return {
      cmd: [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
      allowed: [POWERSHELL],
    };
  }

  if (normalized === ".tools/pnpm.exe" || normalized === ".tools/pnpm" || normalized === "pnpm" || normalized === "pnpm.cmd") {
    const local = repoLocalPnpm(repoPath);
    if (nodeFs.existsSync(local)) return { cmd: [local, ...args], allowed: [local] };
    if (process.platform === "win32") return windowsCmdRunner("pnpm.cmd", args);
    const pnpm = "pnpm";
    return { cmd: [pnpm, ...args], allowed: [pnpm] };
  }

  if (normalized === "npm" || normalized === "npm.cmd") {
    if (process.platform === "win32") return windowsCmdRunner("npm.cmd", args);
    const npm = "npm";
    return { cmd: [npm, ...args], allowed: [npm] };
  }

  if (normalized === "dotnet") return { cmd: ["dotnet", ...args], allowed: ["dotnet"] };

  if (normalized === "pytest" || normalized === "py.test") {
    const python = process.platform === "win32" ? "python" : "python3";
    return { cmd: [python, "-m", "pytest", ...args], allowed: [python] };
  }

  if ((normalized === "python" || normalized === "python3") && args[0] === "-m" && args[1] === "pytest") {
    const python = process.platform === "win32" ? "python" : "python3";
    return { cmd: [python, ...args], allowed: [python] };
  }

  throw new ToolError(`Validation command is outside the allowed build/test runners: ${head}`);
}

function validationSummary(returncode: number, stdout: string, stderr: string): { summary: string; failure_excerpt: string } {
  if (returncode === 0) return { summary: "Validation command completed successfully.", failure_excerpt: "" };
  const combined = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const interesting = combined.filter((line) =>
    /\b(error|failed|failure|exception|traceback|assert|expected|received|not found|cannot find|timed out)\b/i.test(line),
  );
  const excerpt = (interesting.length ? interesting : combined).slice(0, 12).join("\n");
  return {
    summary: excerpt ? `Validation command failed. Key output:\n${excerpt}` : "Validation command failed without captured output.",
    failure_excerpt: excerpt,
  };
}

export function validationTools(): Tool[] {
  return [
    {
      name: "validation_command",
      description: "Run an approved Project Link build/test validation command through a constrained runner.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          kind: { type: "string", enum: ["test", "build"] },
        },
        required: ["command", "kind"],
      },
      handler: async (ctx: ToolContext, payload) => {
        const command = String(payload["command"] ?? "").trim();
        const { cmd, allowed } = resolveValidationCommand(ctx.repoPath, command);
        const res = await runCommand(cmd, {
          cwd: ctx.repoPath,
          timeoutSec: ctx.timeoutSec,
          allowed,
          onOutput: ctx.emitToolEvent
            ? (chunk) => ctx.emitToolEvent?.({ type: "output", ...chunk })
            : undefined,
        });
        const diagnostic = validationSummary(res.returncode, res.stdout, res.stderr);
        return {
          command,
          kind: String(payload["kind"] ?? "test"),
          returncode: res.returncode,
          stdout: res.stdout.slice(-20000),
          stderr: res.stderr.slice(-6000),
          duration_ms: res.durationMs,
          summary: diagnostic.summary,
          failure_excerpt: diagnostic.failure_excerpt,
        };
      },
    },
  ];
}
