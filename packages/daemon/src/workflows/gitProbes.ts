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

  if (action === "refresh_branch" || action === "inspect_remote_target" || action === "inspect_latest_commit" || action === "inspect_pr_plan_context" || action === "push_branch" || action === "sync_branch_rebase") {
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
  if (action === "inspect_staged_changes") {
    return [
      statusProbe(),
      gitDirProbe(),
      stagedDiffStatProbe(),
      stagedDiffNameOnlyProbe(),
    ];
  }
  if (action === "draft_commit_message") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      diffStatProbe(),
      diffNameOnlyProbe(),
      stagedDiffStatProbe(),
      stagedDiffNameOnlyProbe(),
      { name: "git_log", args: ["log", "-5", "--oneline"], timeoutSec: 20 },
    ];
  }
  if (action === "explain_change_scope") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      diffStatProbe(),
      diffNameOnlyProbe(),
      stagedDiffStatProbe(),
      stagedDiffNameOnlyProbe(),
    ];
  }
  if (action === "refresh_branch") {
    return [
      currentBranchProbe(),
      branchListProbe(),
      statusProbe(),
      remoteProbe(),
      {
        name: "git_upstream",
        args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      },
    ];
  }
  if (action === "inspect_remote_target") {
    return [
      currentBranchProbe(),
      statusProbe(),
      remoteProbe(),
      {
        name: "git_upstream",
        args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      },
    ];
  }
  if (action === "inspect_latest_commit") {
    return [
      currentBranchProbe(),
      statusProbe(),
      remoteProbe(),
      {
        name: "git_upstream",
        args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      },
      { name: "git_log_subject", args: ["log", "-1", "--pretty=%h %s"], timeoutSec: 20 },
      { name: "git_show_head_stat", args: ["show", "--stat", "--oneline", "--decorate", "--no-renames", "HEAD"], timeoutSec: 20 },
    ];
  }
  if (action === "inspect_pr_plan_context") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      remoteProbe(),
      {
        name: "git_upstream",
        args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      },
      { name: "git_log_subject", args: ["log", "-1", "--pretty=%s"], timeoutSec: 20 },
    ];
  }
  if (action === "fetch_remotes") {
    return [
      currentBranchProbe(),
      statusProbe(),
      gitDirProbe(),
      remoteProbe(),
    ];
  }
  if (action === "checkout_branch" || action === "create_branch") {
    return [currentBranchProbe(), statusProbe(), gitDirProbe(), branchListProbe()];
  }
  if (action === "sync_branch_rebase" || action === "push_branch") {
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
      stagedDiffStatProbe(),
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
    stdout: redactGitProbeOutput(result.stdout ?? ""),
    stderr: redactGitProbeOutput(result.stderr ?? ""),
    returncode: result.returncode,
  };
}

function redactGitProbeOutput(text: string): string {
  return text.replace(/(?<lead>https?:\/\/)[^@\s/]+:[^@\s/]+@/gi, (_match, ...args) => {
    const groups = args[args.length - 1] as { lead?: string };
    return `${groups.lead ?? ""}***REDACTED***@`;
  });
}

function nonBlockingGitProbeNames(action: string): Set<string> {
  if (action === "prepare_commit") return new Set(["git_log", "git_diff_staged"]);
  if (action === "draft_commit_message") return new Set(["git_log", "git_diff", "git_diff_name_only", "git_diff_staged", "git_diff_staged_name_only"]);
  if (action === "explain_change_scope") return new Set(["git_diff", "git_diff_name_only", "git_diff_staged", "git_diff_staged_name_only"]);
  if (action === "inspect_latest_commit") return new Set(["git_upstream", "git_divergence", "git_log_subject", "git_show_head_stat"]);
  if (action === "inspect_pr_plan_context") return new Set(["git_upstream", "git_divergence", "git_log_subject"]);
  if (action === "refresh_branch" || action === "inspect_remote_target" || action === "push_branch" || action === "sync_branch_rebase") return new Set(["git_upstream", "git_divergence"]);
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

function stagedDiffStatProbe(): GitProbeCommand {
  return { name: "git_diff_staged", args: ["diff", "--cached", "--stat"], timeoutSec: 20 };
}

function stagedDiffNameOnlyProbe(): GitProbeCommand {
  return { name: "git_diff_staged_name_only", args: ["diff", "--cached", "--name-only"], timeoutSec: 20 };
}
