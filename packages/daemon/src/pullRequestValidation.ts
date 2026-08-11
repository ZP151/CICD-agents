import fs from "node:fs";
import path from "node:path";
import { runCommand, type ProjectLink, type PullRequestValidationEvidence } from "@mergepilot/core";

export interface PullRequestValidationResult extends PullRequestValidationEvidence {
  projectLinkId: string;
  repoPath: string;
  completedAt: number;
}

export interface ValidationCommandPlan {
  command: string[];
  displayCommand: string;
  kind: "msbuild" | "dotnet" | "node" | "python";
}

export interface PullRequestValidationDependencies {
  readHead: (repoPath: string) => Promise<string>;
  detectPlan: (repoPath: string) => ValidationCommandPlan | undefined;
  execute: (repoPath: string, plan: ValidationCommandPlan) => Promise<{
    returncode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }>;
  now: () => number;
}

const DEFAULT_DEPENDENCIES: PullRequestValidationDependencies = {
  readHead: async (repoPath) => {
    const result = await runCommand(["git", "rev-parse", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 20,
    });
    return result.returncode === 0 ? result.stdout.trim() : "";
  },
  detectPlan: detectPullRequestValidationPlan,
  execute: async (repoPath, plan) => {
    const result = await runCommand(plan.command, {
      cwd: repoPath,
      allowed: [plan.command[0]!],
      timeoutSec: 900,
    });
    return result;
  },
  now: () => Date.now(),
};

/**
 * Execute a server-selected validation command against one exact local HEAD.
 * The client can approve the run but cannot inject a command. A moved HEAD
 * invalidates the result even if the command itself returned success.
 */
export async function runPullRequestValidation(args: {
  projectLink: ProjectLink;
  expectedHeadSha: string;
  dependencies?: Partial<PullRequestValidationDependencies>;
}): Promise<PullRequestValidationResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...args.dependencies };
  const startedHead = await dependencies.readHead(args.projectLink.repoPath);
  const expectedHeadSha = args.expectedHeadSha.trim();
  if (!startedHead || startedHead !== expectedHeadSha) {
    return {
      projectLinkId: args.projectLink.id,
      repoPath: args.projectLink.repoPath,
      status: "failed",
      sourceSha: startedHead || undefined,
      summary: "Validation was refused because the repository HEAD changed after preparation.",
      completedAt: dependencies.now(),
    };
  }
  const plan = dependencies.detectPlan(args.projectLink.repoPath);
  if (!plan) {
    return {
      projectLinkId: args.projectLink.id,
      repoPath: args.projectLink.repoPath,
      status: "unavailable",
      sourceSha: startedHead,
      summary: "No supported current-SHA validation entry point was found for this repository.",
      completedAt: dependencies.now(),
    };
  }

  let result: Awaited<ReturnType<PullRequestValidationDependencies["execute"]>>;
  try {
    result = await dependencies.execute(args.projectLink.repoPath, plan);
  } catch (error) {
    return {
      projectLinkId: args.projectLink.id,
      repoPath: args.projectLink.repoPath,
      status: "unavailable",
      command: plan.displayCommand,
      sourceSha: startedHead,
      summary: `The local validation runtime could not start: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
      completedAt: dependencies.now(),
    };
  }
  const completedHead = await dependencies.readHead(args.projectLink.repoPath);
  const headMoved = completedHead !== startedHead;
  const outputExcerpt = boundedOutput(result.stdout, result.stderr);
  const unavailable = result.returncode !== 0 && validationRuntimeUnavailable(result.stdout, result.stderr);
  const passed = result.returncode === 0 && !headMoved;
  return {
    projectLinkId: args.projectLink.id,
    repoPath: args.projectLink.repoPath,
    status: unavailable ? "unavailable" : passed ? "passed" : "failed",
    command: plan.displayCommand,
    sourceSha: startedHead,
    durationMs: result.durationMs,
    outputExcerpt,
    summary: headMoved
      ? `Validation output was discarded because HEAD moved from ${shortSha(startedHead)} to ${shortSha(completedHead)} during the run.`
      : unavailable
        ? `${validationLabel(plan.kind)} could not run because the required local toolchain components are unavailable.`
      : passed
        ? `${validationLabel(plan.kind)} passed for ${shortSha(startedHead)} in ${formatDuration(result.durationMs)}.`
        : `${validationLabel(plan.kind)} failed for ${shortSha(startedHead)} with exit code ${result.returncode}.`,
    completedAt: dependencies.now(),
  };
}

function validationRuntimeUnavailable(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`;
  return /MSB(?:4019|4226).*?(?:not found|could not be found)|WebApplications[\\/]Microsoft\.WebApplication\.targets.*not found|spawn .* ENOENT|command not found/i.test(text);
}

export class PullRequestValidationCache {
  private readonly records = new Map<string, PullRequestValidationResult>();

  get(projectLinkId: string, sourceSha: string): PullRequestValidationResult | undefined {
    const record = this.records.get(projectLinkId);
    return record?.sourceSha === sourceSha ? record : undefined;
  }

  latest(projectLinkId: string): PullRequestValidationResult | undefined {
    return this.records.get(projectLinkId);
  }

  set(record: PullRequestValidationResult): void {
    this.records.set(record.projectLinkId, record);
  }
}

export function detectPullRequestValidationPlan(repoPath: string): ValidationCommandPlan | undefined {
  const files = safeDirectoryFiles(repoPath);
  const solution = files.find((file) => file.toLowerCase().endsWith(".sln"));
  if (solution) {
    const solutionPath = path.join(repoPath, solution);
    const fullFramework = fs.existsSync(path.join(repoPath, "packages"))
      || hasFileRecursiveOneLevel(repoPath, "packages.config");
    if (fullFramework) {
      const msbuild = resolveMsBuildPath();
      if (msbuild) {
        const command = [msbuild, solutionPath, "/t:Build", "/p:Configuration=Release", "/m", "/v:minimal", "/nologo"];
        return { command, displayCommand: quoteCommand(command), kind: "msbuild" };
      }
    }
    const command = ["dotnet", "test", solutionPath, "--configuration", "Release", "--nologo"];
    return { command, displayCommand: quoteCommand(command), kind: "dotnet" };
  }

  const packageJsonPath = path.join(repoPath, "package.json");
  if (fs.existsSync(packageJsonPath) && packageJsonHasTestScript(packageJsonPath)) {
    const wrapper = path.join(repoPath, "scripts", "windows", "pnpm-project.ps1");
    if (process.platform === "win32" && fs.existsSync(wrapper)) {
      const command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wrapper, "test"];
      return { command, displayCommand: quoteCommand(command), kind: "node" };
    }
    const command = [process.platform === "win32" ? "npm.cmd" : "npm", "test"];
    return { command, displayCommand: quoteCommand(command), kind: "node" };
  }

  if (files.some((file) => ["pyproject.toml", "pytest.ini", "requirements.txt"].includes(file.toLowerCase()))) {
    const command = [process.platform === "win32" ? "python.exe" : "python3", "-m", "pytest"];
    return { command, displayCommand: quoteCommand(command), kind: "python" };
  }
  return undefined;
}

function resolveMsBuildPath(): string {
  const candidates = [
    process.env["MSBUILD_EXE_PATH"],
    "C:\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Current\\Bin\\MSBuild.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

function safeDirectoryFiles(repoPath: string): string[] {
  try {
    return fs.readdirSync(repoPath, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function hasFileRecursiveOneLevel(repoPath: string, name: string): boolean {
  try {
    return fs.readdirSync(repoPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .some((entry) => fs.existsSync(path.join(repoPath, entry.name, name)));
  } catch {
    return false;
  }
}

function packageJsonHasTestScript(packageJsonPath: string): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, unknown> };
    return typeof parsed.scripts?.["test"] === "string" && Boolean(String(parsed.scripts["test"]).trim());
  } catch {
    return false;
  }
}

function quoteCommand(command: string[]): string {
  return command.map((part) => /\s/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part).join(" ");
}

function boundedOutput(stdout: string, stderr: string): string | undefined {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  if (!combined) return undefined;
  return combined.slice(-4_000);
}

function validationLabel(kind: ValidationCommandPlan["kind"]): string {
  if (kind === "msbuild") return "MSBuild validation";
  if (kind === "dotnet") return ".NET test validation";
  if (kind === "node") return "Node test validation";
  return "Python test validation";
}

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 8) : "unknown";
}

function formatDuration(durationMs: number): string {
  return durationMs >= 1_000 ? `${(durationMs / 1_000).toFixed(1)}s` : `${durationMs}ms`;
}
