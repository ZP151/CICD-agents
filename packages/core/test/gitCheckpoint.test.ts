import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { applyGitCheckpoint, gitTools, planGitCheckpointRollback, previewGitCheckpoint } from "../src/tools/git.js";

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

describe("git checkpoint tool", () => {
  it("creates a non-destructive checkpoint snapshot with status and diff", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-repo-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-data-"));
    git(repo, ["init"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");

    const checkpoint = gitTools().find((tool) => tool.name === "git_checkpoint");
    expect(checkpoint).toBeDefined();
    const result = await checkpoint!.handler({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, { reason: "before test mutation" });

    expect(result).toMatchObject({
      ok: true,
      branch: expect.any(String),
      head: expect.any(String),
      status_chars: expect.any(Number),
      diff_chars: expect.any(Number),
    });
    const filePath = String(result["path"]);
    expect(fs.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      reason: string;
      status: string;
      diff: string;
    };
    expect(saved.reason).toBe("before test mutation");
    expect(saved.status).toContain("README.md");
    expect(saved.diff).toContain("+after");

    const show = gitTools().find((tool) => tool.name === "git_checkpoint_show");
    expect(show).toBeDefined();
    const shown = await show!.handler({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, { checkpointId: result["checkpointId"] });
    expect(shown).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      reason: "before test mutation",
      branch: expect.any(String),
      head: expect.any(String),
    });
    expect(String(shown["diff"])).toContain("+after");

    const preview = await previewGitCheckpoint({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]), 24);
    expect(preview).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      files: ["README.md"],
      diffTruncated: true,
    });
    expect(preview["statusLines"]).toContain(" M README.md");
    expect(String(preview["diffPreview"]).length).toBeLessThanOrEqual(24);

    const rollbackPlan = await planGitCheckpointRollback({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]));
    expect(rollbackPlan).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      supported: true,
      mode: "apply_checkpoint_patch",
      checkpointFiles: ["README.md"],
      proposal: {
        tool: "git_checkpoint_apply",
        args: { checkpointId: result["checkpointId"] },
      },
    });

    fs.writeFileSync(path.join(repo, "README.md"), "mutated\n", "utf8");
    const applied = await applyGitCheckpoint({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]));
    expect(applied).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      mode: "applied_checkpoint_patch",
      restoredFiles: ["README.md"],
    });
    expect(normalizeNewlines(fs.readFileSync(path.join(repo, "README.md"), "utf8"))).toBe("before\nafter\n");
  });

  it("plans a confirmed git_restore proposal for clean checkpoints", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-clean-repo-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-clean-data-"));
    git(repo, ["init"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);

    const checkpoint = gitTools().find((tool) => tool.name === "git_checkpoint");
    const result = await checkpoint!.handler({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, { reason: "clean baseline" });

    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");

    const rollbackPlan = await planGitCheckpointRollback({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]));

    expect(rollbackPlan).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      supported: true,
      mode: "restore_tracked_to_clean_checkpoint",
      currentTrackedPaths: ["README.md"],
      proposal: {
        tool: "git_restore",
        args: { paths: ["README.md"], staged: false },
      },
    });

    fs.writeFileSync(path.join(repo, "scratch.txt"), "untracked\n", "utf8");
    const applied = await applyGitCheckpoint({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]));
    expect(applied).toMatchObject({
      ok: true,
      checkpointId: result["checkpointId"],
      mode: "restored_clean_checkpoint",
      restoredFiles: ["README.md"],
      untrackedFiles: ["scratch.txt"],
    });
    expect(normalizeNewlines(fs.readFileSync(path.join(repo, "README.md"), "utf8"))).toBe("before\n");
    expect(fs.existsSync(path.join(repo, "scratch.txt"))).toBe(true);
  });

  it("refuses to apply a checkpoint from a different HEAD", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-head-repo-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-checkpoint-head-data-"));
    git(repo, ["init"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(repo, ["add", "README.md"]);
    git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");

    const checkpoint = gitTools().find((tool) => tool.name === "git_checkpoint")!;
    const result = await checkpoint.handler({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, { reason: "before head change" });

    git(repo, ["add", "README.md"]);
    git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "advance head"]);

    await expect(applyGitCheckpoint({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    }, String(result["checkpointId"]))).rejects.toThrow(/HEAD mismatch/);
  });
});
