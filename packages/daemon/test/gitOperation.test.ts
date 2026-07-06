import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  dirtyWorkingTreeSummary,
  gitOperationBlockForAction,
  gitOperationStateFromTools,
  type GitProbeResult,
} from "../src/workflows/gitOperation.js";

const tempDirs: string[] = [];

function makeRepoGitDir(): string {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "cicd-git-operation-"));
  const gitDir = nodePath.join(dir, ".git");
  nodeFs.mkdirSync(gitDir, { recursive: true });
  tempDirs.push(dir);
  return gitDir;
}

function probe(name: string, stdout: string): GitProbeResult {
  return {
    name,
    command: `git ${name}`,
    ok: true,
    stdout,
    stderr: "",
    returncode: 0,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    nodeFs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("gitOperation", () => {
  it("reports normal state when no operation or conflict exists", () => {
    const gitDir = makeRepoGitDir();
    const state = gitOperationStateFromTools(nodePath.dirname(gitDir), "## main", [
      probe("git_dir", ".git"),
    ]);

    expect(state).toMatchObject({
      status: "normal",
      phase: "normal",
      conflictFiles: [],
    });
  });

  it("detects in-progress rebase from git directory markers", () => {
    const gitDir = makeRepoGitDir();
    nodeFs.mkdirSync(nodePath.join(gitDir, "rebase-merge"));
    const state = gitOperationStateFromTools(nodePath.dirname(gitDir), "## main", [
      probe("git_dir", ".git"),
    ]);

    expect(state).toMatchObject({
      status: "in_progress",
      phase: "rebase",
    });
  });

  it("reports conflicted files from porcelain status", () => {
    const gitDir = makeRepoGitDir();
    nodeFs.writeFileSync(nodePath.join(gitDir, "MERGE_HEAD"), "abc123");
    const state = gitOperationStateFromTools(nodePath.dirname(gitDir), "## main\nUU src/app.ts\nM  README.md", [
      probe("git_dir", ".git"),
    ]);

    expect(state).toMatchObject({
      status: "conflicted",
      phase: "merge",
      conflictFiles: ["src/app.ts"],
    });
  });

  it("blocks mutating git workflows while an operation is in progress", () => {
    const gitDir = makeRepoGitDir();
    nodeFs.writeFileSync(nodePath.join(gitDir, "MERGE_HEAD"), "abc123");
    const state = gitOperationStateFromTools(nodePath.dirname(gitDir), "## main", [
      probe("git_dir", ".git"),
    ]);

    expect(gitOperationBlockForAction("prepare_commit", state)).toMatchObject({
      workflowPhase: "merge_in_progress",
    });
    expect(gitOperationBlockForAction("inspect_changes", state)).toBeUndefined();
  });

  it("gives stash-safe guidance for ordinary index conflicts", () => {
    const gitDir = makeRepoGitDir();
    const state = gitOperationStateFromTools(nodePath.dirname(gitDir), "## main\nUU README.md", [
      probe("git_dir", ".git"),
    ]);

    expect(gitOperationBlockForAction("prepare_commit", state)).toMatchObject({
      workflowPhase: "git_conflict",
      summary: expect.stringContaining("Git keeps the stash entry"),
    });
  });

  it("summarizes dirty working tree status", () => {
    expect(dirtyWorkingTreeSummary("## main\n M src/app.ts\n?? note.md")).toContain("2 pending changes");
    expect(dirtyWorkingTreeSummary("## main")).toBe("");
  });
});
