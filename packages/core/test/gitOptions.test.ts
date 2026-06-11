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
});
