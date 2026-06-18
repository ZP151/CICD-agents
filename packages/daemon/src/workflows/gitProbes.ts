import { runCommand } from "@mergepilot/core";
import type { GitProbeResult } from "./gitOperation.js";

export interface GitProbeCommand {
  name: string;
  args: string[];
  timeoutSec?: number;
}

export interface RunGitWorkflowProbesOptions {
  isRecoveryAction?: (action: string) => boolean;
  runner?: (repoPath: string, command: GitProbeCommand) => Promise<Omit<GitProbeResult, "name">>;
}

export interface GitWorkflowProbeResult {
  tools: GitProbeResult[];
  failed?: GitProbeResult;
}

export async function runGitWorkflowProbes(
  repoPath: string,
  action: string,
  options: RunGitWorkflowProbesOptions = {},
): Promise<GitWorkflowProbeResult> {
  const runner = options.runner ?? runGitProbe;
  const tools: GitProbeResult[] = [];
  const add = async (command: GitProbeCommand): Promise<void> => {
    tools.push({ name: command.name, ...await runner(repoPath, command) });
  };

  for (const command of gitProbePlanForAction(action, options.isRecoveryAction)) {
    await add(command);
  }

  if (action === "push_branch") {
    const upstream = tools.find((tool) => tool.name === "git_upstream" && tool.ok)?.stdout.trim();
    if (upstream) {
      await add({
        name: "git_divergence",
        args: ["rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      });
    }
  }

  return {
    tools,
    failed: failedBlockingGitProbe(action, tools),
  };
}

export function gitProbePlanForAction(
  action: string,
  isRecoveryAction: (action: string) => boolean = () => false,
): GitProbeCommand[] {
  if (action === "inspect_environment") {
    return [
      currentBranchProbe(),
      branchListProbe(),
      statusProbe(),
      gitDirProbe(),
      remoteProbe(),
      diffStatProbe(),
    ];
  }
  if (action === "inspect_changes") {
    return [
      statusProbe(),
      gitDirProbe(),
      diffStatProbe(),
      diffNameOnlyProbe(),
    ];
  }
  if (action === "refresh_branch") {
    return [currentBranchProbe(), branchListProbe()];
  }
  if (action === "checkout_branch" || action === "create_branch") {
    return [currentBranchProbe(), statusProbe(), gitDirProbe(), branchListProbe()];
  }
  if (action === "push_branch") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      remoteProbe(),
      {
        name: "git_upstream",
        args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      },
    ];
  }
  if (action === "prepare_commit") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      diffStatProbe(),
      { name: "git_diff_staged", args: ["diff", "--cached", "--stat"], timeoutSec: 20 },
      { name: "git_log", args: ["log", "-5", "--oneline"], timeoutSec: 20 },
    ];
  }
  if (action === "run_tests" || action === "run_build") {
    return [currentBranchProbe(), statusProbe(), diffStatProbe(), diffNameOnlyProbe()];
  }
  if (action === "stage_resolved_conflicts" || isRecoveryAction(action)) {
    return [currentBranchProbe(), statusProbe(), gitDirProbe()];
  }
  if (action === "create_pr") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      { name: "git_log_subject", args: ["log", "-1", "--pretty=%s"], timeoutSec: 20 },
      remoteProbe(),
    ];
  }
  return [];
}

export function failedBlockingGitProbe(action: string, tools: GitProbeResult[]): GitProbeResult | undefined {
  const nonBlockingFailures = nonBlockingGitProbeNames(action);
  return tools.find((tool) => !tool.ok && !nonBlockingFailures.has(tool.name));
}

async function runGitProbe(repoPath: string, command: GitProbeCommand): Promise<Omit<GitProbeResult, "name">> {
  const result = await runCommand(["git", ...command.args], {
    cwd: repoPath,
    allowed: ["git"],
    timeoutSec: command.timeoutSec ?? 10,
  });
  return {
    command: `git ${command.args.join(" ")}`,
    ok: result.returncode === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    returncode: result.returncode,
  };
}

function nonBlockingGitProbeNames(action: string): Set<string> {
  if (action === "prepare_commit") return new Set(["git_log", "git_diff_staged"]);
  if (action === "push_branch") return new Set(["git_upstream", "git_divergence"]);
  return new Set();
}

function currentBranchProbe(): GitProbeCommand {
  return { name: "git_current_branch", args: ["branch", "--show-current"] };
}

function branchListProbe(): GitProbeCommand {
  return { name: "git_branch_list", args: ["branch", "-a"] };
}

function statusProbe(): GitProbeCommand {
  return { name: "git_status", args: ["status", "--porcelain=v1", "-b"] };
}

function gitDirProbe(): GitProbeCommand {
  return { name: "git_dir", args: ["rev-parse", "--git-dir"] };
}

function remoteProbe(): GitProbeCommand {
  return { name: "git_remote", args: ["remote", "-v"] };
}

function diffStatProbe(): GitProbeCommand {
  return { name: "git_diff", args: ["diff", "--stat"], timeoutSec: 20 };
}

function diffNameOnlyProbe(): GitProbeCommand {
  return { name: "git_diff_name_only", args: ["diff", "--name-only"], timeoutSec: 20 };
}
