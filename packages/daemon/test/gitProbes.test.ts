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

  it("selects recovery probes through the recovery action seam", () => {
    expect(gitProbePlanForAction("continue_rebase", (action) => action === "continue_rebase").map((probe) => probe.name)).toEqual([
      "git_current_branch",
      "git_status",
      "git_dir",
    ]);
  });

  it("adds divergence probing only when an upstream branch exists", async () => {
    const executed: GitProbeCommand[] = [];
    const result = await runGitWorkflowProbes("repo", "push_branch", {
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
      "git_dir",
      "git_remote",
      "git_upstream",
      "git_divergence",
    ]);
    expect(result.failed).toBeUndefined();
    expect(result.tools.find((tool) => tool.name === "git_divergence")?.stdout).toBe("0\t2\n");
  });

  it("treats expected optional probes as non-blocking failures", () => {
    expect(failedBlockingGitProbe("prepare_commit", [
      failedTool("git_diff_staged"),
      failedTool("git_log"),
    ])).toBeUndefined();

    expect(failedBlockingGitProbe("push_branch", [
      failedTool("git_upstream"),
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
