import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitTools } from "../src/tools/git.js";
import type { ToolContext } from "../src/tools/executor.js";

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function gitText(repo: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function context(repo: string): ToolContext {
  return { repoPath: repo, env: {}, timeoutSec: 30, extra: {} };
}

function tool(name: string) {
  const found = gitTools().find((candidate) => candidate.name === name);
  expect(found).toBeDefined();
  return found!;
}

describe("git tool options", () => {
  it("supports short status and staged diff flags", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-options-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");
    fs.writeFileSync(path.join(repo, "notes.txt"), "new\n", "utf8");
    git(repo, ["add", "README.md"]);

    const status = await tool("git_status").handler(context(repo), { short: true });
    expect(String(status["stdout"])).toContain("M  README.md");
    expect(String(status["stdout"])).toContain("?? notes.txt");

    const stagedDiff = await tool("git_diff").handler(context(repo), { staged: true, name_only: true });
    expect(String(stagedDiff["stdout"]).trim()).toBe("README.md");
  });

  it("supports structured add, commit, and switch options", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-options-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "hello\n", "utf8");

    await tool("git_add").handler(context(repo), { paths: ["README.md"], dryRun: true });
    const dryRunStatus = await tool("git_status").handler(context(repo), { short: true });
    expect(String(dryRunStatus["stdout"])).toContain("?? README.md");

    await tool("git_add").handler(context(repo), { paths: ["README.md"] });
    await tool("git_commit").handler(context(repo), { message: "initial", noVerify: true });
    await tool("git_switch").handler(context(repo), { branch: "feature/options", create: true });

    const branch = await tool("git_current_branch").handler(context(repo), {});
    expect(branch["branch"]).toBe("feature/options");
  });

  it("supports structured local tag creation without pushing tags", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-tag-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "release\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "release base"]);

    const result = await tool("git_tag").handler(context(repo), {
      name: "v1.2.3-test",
      ref: "HEAD",
      message: "Test release tag",
      annotated: true,
    });

    expect(result["returncode"]).toBe(0);
    const tagList = await tool("git_show").handler(context(repo), { revision: "v1.2.3-test" });
    expect(String(tagList["stdout"])).toContain("tag v1.2.3-test");
    expect(String(tagList["stdout"])).toContain("Test release tag");
  });

  it("pushes one tag without pushing branches or other tags", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-push-tag-root-"));
    const origin = path.join(root, "origin.git");
    const repo = path.join(root, "work");
    fs.mkdirSync(repo);
    git(root, ["init", "--bare", origin]);
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "release\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "release base"]);
    git(repo, ["remote", "add", "origin", origin]);
    git(repo, ["tag", "v1.2.3-test"]);
    git(repo, ["tag", "v9.9.9-unpushed"]);

    const result = await tool("git_push_tag").handler(context(repo), {
      name: "v1.2.3-test",
      remote: "origin",
    });

    expect(result["returncode"]).toBe(0);
    expect(gitText(root, ["--git-dir", origin, "rev-parse", "refs/tags/v1.2.3-test"])).toBe(
      gitText(repo, ["rev-parse", "refs/tags/v1.2.3-test"]),
    );
    expect(spawnSync("git", ["--git-dir", origin, "rev-parse", "refs/tags/v9.9.9-unpushed"], { encoding: "utf8" }).status).not.toBe(0);
    expect(spawnSync("git", ["--git-dir", origin, "rev-parse", "refs/heads/main"], { encoding: "utf8" }).status).not.toBe(0);
  });

  it("applies a stash without dropping it", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-stash-apply-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "after\n", "utf8");
    git(repo, ["stash", "push", "-m", "apply fixture"]);

    const result = await tool("git_stash").handler(context(repo), { action: "apply" });

    expect(result["returncode"]).toBe(0);
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8").replace(/\r\n/g, "\n")).toBe("after\n");
    expect(gitText(repo, ["stash", "list"])).toContain("apply fixture");
  });

  it("pops a stash and drops it after a clean restore", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-stash-pop-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "after pop\n", "utf8");
    git(repo, ["stash", "push", "-m", "pop fixture"]);

    const result = await tool("git_stash").handler(context(repo), { action: "pop" });

    expect(result["returncode"]).toBe(0);
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8").replace(/\r\n/g, "\n")).toBe("after pop\n");
    expect(gitText(repo, ["stash", "list"])).toBe("");
  });

  it("keeps a stash entry when pop hits a conflict", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-stash-pop-conflict-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(repo, "README.md"), "line 1\nshared\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "line 1\nstashed change\n", "utf8");
    git(repo, ["stash", "push", "-m", "conflict fixture"]);
    fs.writeFileSync(path.join(repo, "README.md"), "line 1\ncommitted change\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "conflicting change"]);

    const result = await tool("git_stash").handler(context(repo), { action: "pop" });

    expect(result["returncode"]).not.toBe(0);
    expect(String(result["stdout"]) + String(result["stderr"])).toMatch(/conflict|could not restore|needs merge/i);
    expect(gitText(repo, ["stash", "list"])).toContain("conflict fixture");
    expect(gitText(repo, ["status", "--short"])).toContain("UU README.md");
  });

  it("supports rebase continuation actions without requiring an onto ref", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-rebase-action-repo-"));
    git(repo, ["init"]);

    const result = await tool("git_rebase").handler(context(repo), { action: "continue" });

    expect(result["returncode"]).not.toBe(0);
    expect(String(result["stderr"]).toLowerCase()).toContain("no rebase in progress");
  });

  it("supports merge, cherry-pick, and revert recovery actions without requiring a ref", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-recovery-action-repo-"));
    git(repo, ["init"]);

    const merge = await tool("git_merge").handler(context(repo), { action: "abort" });
    const cherryPick = await tool("git_cherry_pick").handler(context(repo), { action: "skip" });
    const revert = await tool("git_revert").handler(context(repo), { action: "abort" });

    expect(merge["returncode"]).not.toBe(0);
    expect(cherryPick["returncode"]).not.toBe(0);
    expect(revert["returncode"]).not.toBe(0);
  });
});
