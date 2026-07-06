import fs from "node:fs";
import path from "node:path";
import { getSettings } from "../settings.js";
import { ToolError, type ToolContext } from "./executor.js";
import { gitReadOnlyText, runGit, runGitReadOnly } from "./gitCommand.js";
import {
  checkpointFilesFromDiff,
  pathsFromPorcelainStatus,
} from "./gitCheckpointParsing.js";

export {
  checkpointFilesFromDiff,
  pathsFromPorcelainStatus,
} from "./gitCheckpointParsing.js";

function checkpointPath(dataDir: string, id: string): string {
  return path.join(dataDir, "checkpoints", `${id}.json`);
}

function isSafeCheckpointId(id: string): boolean {
  return /^git-[A-Za-z0-9-]+$/.test(id);
}

export async function createGitCheckpoint(
  ctx: ToolContext,
  reason: string,
): Promise<Record<string, unknown>> {
  const dataDir = String(ctx.extra["data_dir"] ?? getSettings().dataDir);
  const createdAt = new Date().toISOString();
  const safeTimestamp = createdAt.replace(/[:.]/g, "-");
  const id = `git-${safeTimestamp}`;
  const branch = await gitReadOnlyText(ctx, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "");
  const head = await gitReadOnlyText(ctx, ["rev-parse", "HEAD"]).catch(() => "");
  const status = await gitReadOnlyText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => "");
  const diffResult = await runGitReadOnly(ctx, ["diff", "--binary"]).catch(() => ({ stdout: "" }));
  const diff = String(diffResult["stdout"] ?? "");
  const record = {
    id,
    kind: "git_checkpoint",
    createdAt,
    repoPath: ctx.repoPath,
    reason,
    branch,
    head,
    status,
    diff,
  };
  const filePath = checkpointPath(dataDir, id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
  return {
    ok: true,
    checkpointId: id,
    path: filePath,
    branch,
    head,
    status_chars: status.length,
    diff_chars: diff.length,
  };
}

export async function readGitCheckpoint(
  ctx: ToolContext,
  checkpointId: string,
): Promise<Record<string, unknown>> {
  const id = checkpointId.trim();
  if (!isSafeCheckpointId(id)) throw new ToolError("git_checkpoint_show requires a valid checkpoint id");
  const dataDir = String(ctx.extra["data_dir"] ?? getSettings().dataDir);
  const filePath = checkpointPath(dataDir, id);
  if (!fs.existsSync(filePath)) throw new ToolError(`checkpoint not found: ${id}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const saved = JSON.parse(raw) as Record<string, unknown>;
  return {
    ok: true,
    checkpointId: id,
    path: filePath,
    createdAt: saved["createdAt"],
    repoPath: saved["repoPath"],
    reason: saved["reason"],
    branch: saved["branch"],
    head: saved["head"],
    status: saved["status"],
    diff: saved["diff"],
    status_chars: String(saved["status"] ?? "").length,
    diff_chars: String(saved["diff"] ?? "").length,
  };
}

export async function previewGitCheckpoint(
  ctx: ToolContext,
  checkpointId: string,
  maxDiffChars = 12_000,
): Promise<Record<string, unknown>> {
  const checkpoint = await readGitCheckpoint(ctx, checkpointId);
  const status = String(checkpoint["status"] ?? "");
  const diff = String(checkpoint["diff"] ?? "");
  const limit = Math.max(0, Math.min(maxDiffChars, 100_000));
  return {
    ok: true,
    checkpointId: checkpoint["checkpointId"],
    path: checkpoint["path"],
    createdAt: checkpoint["createdAt"],
    repoPath: checkpoint["repoPath"],
    reason: checkpoint["reason"],
    branch: checkpoint["branch"],
    head: checkpoint["head"],
    statusLines: status.split(/\r?\n/).filter((line) => line.trim().length > 0),
    files: checkpointFilesFromDiff(diff),
    diffPreview: diff.slice(0, limit),
    diffChars: diff.length,
    diffTruncated: diff.length > limit,
  };
}

export async function planGitCheckpointRollback(
  ctx: ToolContext,
  checkpointId: string,
): Promise<Record<string, unknown>> {
  const checkpoint = await readGitCheckpoint(ctx, checkpointId);
  const repoPath = String(checkpoint["repoPath"] ?? ctx.repoPath);
  const diff = String(checkpoint["diff"] ?? "");
  const checkpointFiles = checkpointFilesFromDiff(diff);
  const planCtx = { ...ctx, repoPath };
  const currentStatus = await gitReadOnlyText(planCtx, ["status", "--porcelain=v1", "-b"]).catch(() => "");
  const currentPaths = pathsFromPorcelainStatus(currentStatus);
  const currentStatusLines = currentStatus.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (diff.trim().length > 0) {
    return {
      ok: true,
      checkpointId: checkpoint["checkpointId"],
      repoPath,
      branch: checkpoint["branch"],
      head: checkpoint["head"],
      supported: true,
      mode: "apply_checkpoint_patch",
      reason: "This checkpoint contains uncommitted changes. It can be restored with the confirmed git_checkpoint_apply action.",
      checkpointFiles,
      currentStatusLines,
      currentTrackedPaths: currentPaths.tracked,
      currentUntrackedPaths: currentPaths.untracked,
      proposal: {
        tool: "git_checkpoint_apply",
        args: { checkpointId: checkpoint["checkpointId"] },
        description: `Restore ${checkpointFiles.length} file${checkpointFiles.length === 1 ? "" : "s"} from checkpoint ${checkpoint["checkpointId"]}.`,
        nextHint: "verify git status after checkpoint apply",
      },
      warnings: [
        "Applying this checkpoint resets the checkpoint files to HEAD first, then applies the stored checkpoint patch.",
      ],
    };
  }

  if (currentPaths.tracked.length === 0 && currentPaths.untracked.length === 0) {
    return {
      ok: true,
      checkpointId: checkpoint["checkpointId"],
      repoPath,
      branch: checkpoint["branch"],
      head: checkpoint["head"],
      supported: true,
      mode: "already_at_checkpoint",
      reason: "The checkpoint was clean and the repository currently has no working-tree changes.",
      checkpointFiles,
      currentStatusLines,
      currentTrackedPaths: [],
      currentUntrackedPaths: [],
      proposal: null,
      warnings: [],
    };
  }

  const warnings = currentPaths.untracked.length > 0
    ? ["Untracked files are present. Existing git_restore tooling will not remove untracked files."]
    : [];
  return {
    ok: true,
    checkpointId: checkpoint["checkpointId"],
    repoPath,
    branch: checkpoint["branch"],
    head: checkpoint["head"],
    supported: currentPaths.tracked.length > 0,
    mode: currentPaths.tracked.length > 0 ? "restore_tracked_to_clean_checkpoint" : "untracked_only",
    reason: currentPaths.tracked.length > 0
      ? "The checkpoint was clean. Tracked working-tree changes can be restored to HEAD with the existing confirmed git_restore action."
      : "The checkpoint was clean, but only untracked files are present; no existing restore proposal can remove them.",
    checkpointFiles,
    currentStatusLines,
    currentTrackedPaths: currentPaths.tracked,
    currentUntrackedPaths: currentPaths.untracked,
    proposal: currentPaths.tracked.length > 0
      ? {
          tool: "git_restore",
          args: { paths: currentPaths.tracked, staged: false },
          description: `Restore ${currentPaths.tracked.length} tracked file${currentPaths.tracked.length === 1 ? "" : "s"} to the clean checkpoint state.`,
          nextHint: "verify git status after rollback",
        }
      : null,
    warnings,
  };
}

function sameResolvedPath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

export async function applyGitCheckpoint(
  ctx: ToolContext,
  checkpointId: string,
): Promise<Record<string, unknown>> {
  const checkpoint = await readGitCheckpoint(ctx, checkpointId);
  const checkpointRepoPath = String(checkpoint["repoPath"] ?? "");
  if (checkpointRepoPath && !sameResolvedPath(checkpointRepoPath, ctx.repoPath)) {
    throw new ToolError("checkpoint repoPath does not match the current tool repository");
  }

  const expectedHead = String(checkpoint["head"] ?? "").trim();
  const currentHead = await gitReadOnlyText(ctx, ["rev-parse", "HEAD"]).catch(() => "");
  if (!expectedHead) throw new ToolError("checkpoint is missing HEAD metadata");
  if (currentHead !== expectedHead) {
    throw new ToolError(`checkpoint HEAD mismatch: expected ${expectedHead}, current ${currentHead || "unknown"}`);
  }

  const diff = String(checkpoint["diff"] ?? "");
  const checkpointFiles = checkpointFilesFromDiff(diff);
  const currentStatusBefore = await gitReadOnlyText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => "");

  if (diff.trim().length === 0) {
    const currentPaths = pathsFromPorcelainStatus(currentStatusBefore);
    if (currentPaths.tracked.length > 0) {
      const restore = await runGit(ctx, ["restore", "--staged", "--worktree", "--", ...currentPaths.tracked]);
      if (Number(restore["returncode"]) !== 0) return { ok: false, error: restore["stderr"], restore };
    }
    return {
      ok: true,
      checkpointId: checkpoint["checkpointId"],
      mode: "restored_clean_checkpoint",
      restoredFiles: currentPaths.tracked,
      untrackedFiles: currentPaths.untracked,
      warning: currentPaths.untracked.length > 0
        ? "Untracked files were not removed because checkpoints do not store untracked file content."
        : "",
      statusBefore: currentStatusBefore,
      statusAfter: await gitReadOnlyText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => ""),
    };
  }

  if (checkpointFiles.length === 0) {
    throw new ToolError("checkpoint contains a diff but no restorable file paths were found");
  }

  const restore = await runGit(ctx, ["restore", "--staged", "--worktree", "--", ...checkpointFiles]);
  if (Number(restore["returncode"]) !== 0) {
    return { ok: false, checkpointId: checkpoint["checkpointId"], phase: "restore_to_head", error: restore["stderr"], restore };
  }

  const patch = diff.endsWith("\n") ? diff : `${diff}\n`;
  const apply = await runGit(ctx, ["apply", "--binary", "-"], undefined, patch);
  if (Number(apply["returncode"]) !== 0) {
    return { ok: false, checkpointId: checkpoint["checkpointId"], phase: "apply_patch", error: apply["stderr"], apply };
  }

  return {
    ok: true,
    checkpointId: checkpoint["checkpointId"],
    mode: "applied_checkpoint_patch",
    restoredFiles: checkpointFiles,
    statusBefore: currentStatusBefore,
    statusAfter: await gitReadOnlyText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => ""),
  };
}
