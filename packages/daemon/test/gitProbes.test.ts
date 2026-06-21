import { describe, expect, it } from "vitest";
import {
  failedBlockingGitProbe,
  gitProbePlanForAction,
  runGitWorkflowProbes,
  type GitProbeCommand,
} from "../src/workflows/gitProbes.js";

describe("gitProbes", () => {
  it("selects the inspect-changes probe inventory", () => {
    expect(gitProbePlanForAction("inspect_changes").map((probe) => probe.name)).toEqual([
      "git_status",
      "git_dir",
      "git_diff",
      "git_diff_name_only",
    ]);
  });

  it("selects staged-diff probes for staged change inspection", () => {
    expect(gitProbePlanForAction("inspect_staged_changes").map((probe) => probe.name)).toEqual([
      "git_status",
      "git_dir",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
  });

  it("selects read-only probes for drafting commit messages", () => {
    expect(gitProbePlanForAction("draft_commit_message").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
      "git_log",
    ]);
  });

  it("selects read-only probes for explaining change scope", () => {
    expect(gitProbePlanForAction("explain_change_scope").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_diff",
      "git_diff_name_only",
      "git_diff_staged",
      "git_diff_staged_name_only",
    ]);
  });

  it("selects recovery probes through the recovery action seam", () => {
    expect(gitProbePlanForAction("continue_rebase", (action) => action === "continue_rebase").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
    ]);
  });

  it("refreshes branch readiness, not only branch names", () => {
    expect(gitProbePlanForAction("refresh_branch").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_branch_list",
      "git_status",
      "git_remote",
      "git_upstream",
    ]);
  });

  it("checks remote target readiness without branch inventory", () => {
    expect(gitProbePlanForAction("inspect_remote_target").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
    ]);
  });

  it("selects latest-commit inspection probes with remote readiness", () => {
    expect(gitProbePlanForAction("inspect_latest_commit").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_log_subject",
      "git_show_head_stat",
    ]);
  });

  it("checks repo and remote context before fetching remotes", () => {
    expect(gitProbePlanForAction("fetch_remotes").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_remote",
    ]);
  });

  it("adds divergence probing only when an upstream branch exists", async () => {
    const executed: GitProbeCommand[] = [];
    const result = await runGitWorkflowProbes("repo", "inspect_remote_target", {
      runner: async (_repoPath, command) => {
        executed.push(command);
        return {
          command: `git ${command.args.join(" ")}`,
          ok: true,
          stdout: command.name === "git_upstream"
            ? "origin/main\n"
            : command.name === "git_divergence"
              ? "0\t2\n"
              : "",
          stderr: "",
          returncode: 0,
        };
      },
    });

    expect(executed.map((command) => command.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_remote",
      "git_upstream",
      "git_divergence",
    ]);
    expect(result.failed).toBeUndefined();
    expect(result.tools.find((tool) => tool.name === "git_divergence")?.stdout).toBe("0\t2\n");
  });

  it("uses push-readiness probes for sync-before-push actions", () => {
    expect(gitProbePlanForAction("sync_branch_rebase").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
      "git_remote",
      "git_upstream",
    ]);
  });

  it("treats expected optional probes as non-blocking failures", () => {
    expect(failedBlockingGitProbe("prepare_commit", [
      failedTool("git_diff_staged"),
      failedTool("git_log"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("draft_commit_message", [
      failedTool("git_diff"),
      failedTool("git_diff_name_only"),
      failedTool("git_diff_staged"),
      failedTool("git_diff_staged_name_only"),
      failedTool("git_log"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("explain_change_scope", [
      failedTool("git_diff"),
      failedTool("git_diff_name_only"),
      failedTool("git_diff_staged"),
      failedTool("git_diff_staged_name_only"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("push_branch", [
      failedTool("git_upstream"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("sync_branch_rebase", [
      failedTool("git_upstream"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("inspect_remote_target", [
      failedTool("git_upstream"),
      failedTool("git_divergence"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("inspect_latest_commit", [
      failedTool("git_upstream"),
      failedTool("git_divergence"),
      failedTool("git_log_subject"),
      failedTool("git_show_head_stat"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("inspect_changes", [
      failedTool("git_status"),
    ])?.name).toBe("git_status");
  });
});

function failedTool(name: string) {
  return {
    name,
    command: `git ${name}`,
    ok: false,
    stdout: "",
    stderr: "failed",
    returncode: 1,
  };
}
