import fs from "node:fs";
import path from "node:path";
import { getSettings } from "../settings.js";
import { runCommand, ToolError, type Tool, type ToolContext } from "./executor.js";

const ALLOWED = ["git"] as const;

async function git(
  ctx: ToolContext,
  args: string[],
  timeoutSec?: number,
  inputText?: string,
): Promise<Record<string, unknown>> {
  const res = await runCommand(["git", ...args], {
    cwd: ctx.repoPath,
    timeoutSec: timeoutSec ?? ctx.timeoutSec,
    allowed: ALLOWED,
    inputText,
  });
  return {
    returncode: res.returncode,
    stdout: res.stdout,
    stderr: res.stderr,
    duration_ms: res.durationMs,
  };
}

async function gitText(ctx: ToolContext, args: string[]): Promise<string> {
  const res = await git(ctx, args);
  return String(res["stdout"] ?? "").trim();
}

async function gitStdout(ctx: ToolContext, args: string[]): Promise<string> {
  const res = await git(ctx, args);
  return String(res["stdout"] ?? "");
}

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
  const branch = await gitText(ctx, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "");
  const head = await gitText(ctx, ["rev-parse", "HEAD"]).catch(() => "");
  const status = await gitText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => "");
  const diff = await gitStdout(ctx, ["diff", "--binary"]).catch(() => "");
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

export async function readGitCheckpoint(ctx: ToolContext, checkpointId: string): Promise<Record<string, unknown>> {
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

function checkpointFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match?.[2]) files.add(match[2]);
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

function pathsFromPorcelainStatus(status: string): { tracked: string[]; untracked: string[] } {
  const tracked = new Set<string>();
  const untracked = new Set<string>();
  for (const line of status.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("## ")) continue;
    const pathPart = line.slice(3).trim();
    if (!pathPart) continue;
    const normalized = pathPart.includes(" -> ") ? pathPart.split(" -> ").pop()!.trim() : pathPart;
    if (line.startsWith("??")) {
      untracked.add(normalized);
    } else {
      tracked.add(normalized);
    }
  }
  return {
    tracked: [...tracked].sort((a, b) => a.localeCompare(b)),
    untracked: [...untracked].sort((a, b) => a.localeCompare(b)),
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
  const currentStatus = await gitText(planCtx, ["status", "--porcelain=v1", "-b"]).catch(() => "");
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
  const currentHead = await gitText(ctx, ["rev-parse", "HEAD"]).catch(() => "");
  if (!expectedHead) throw new ToolError("checkpoint is missing HEAD metadata");
  if (currentHead !== expectedHead) {
    throw new ToolError(`checkpoint HEAD mismatch: expected ${expectedHead}, current ${currentHead || "unknown"}`);
  }

  const diff = String(checkpoint["diff"] ?? "");
  const checkpointFiles = checkpointFilesFromDiff(diff);
  const currentStatusBefore = await gitText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => "");

  if (diff.trim().length === 0) {
    const currentPaths = pathsFromPorcelainStatus(currentStatusBefore);
    if (currentPaths.tracked.length > 0) {
      const restore = await git(ctx, ["restore", "--staged", "--worktree", "--", ...currentPaths.tracked]);
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
      statusAfter: await gitText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => ""),
    };
  }

  if (checkpointFiles.length === 0) {
    throw new ToolError("checkpoint contains a diff but no restorable file paths were found");
  }

  const restore = await git(ctx, ["restore", "--staged", "--worktree", "--", ...checkpointFiles]);
  if (Number(restore["returncode"]) !== 0) {
    return { ok: false, checkpointId: checkpoint["checkpointId"], phase: "restore_to_head", error: restore["stderr"], restore };
  }

  const patch = diff.endsWith("\n") ? diff : `${diff}\n`;
  const apply = await git(ctx, ["apply", "--binary", "-"], undefined, patch);
  if (Number(apply["returncode"]) !== 0) {
    return { ok: false, checkpointId: checkpoint["checkpointId"], phase: "apply_patch", error: apply["stderr"], apply };
  }

  return {
    ok: true,
    checkpointId: checkpoint["checkpointId"],
    mode: "applied_checkpoint_patch",
    restoredFiles: checkpointFiles,
    statusBefore: currentStatusBefore,
    statusAfter: await gitText(ctx, ["status", "--porcelain=v1", "-b"]).catch(() => ""),
  };
}

export function gitTools(): Tool[] {
  return [
    {
      name: "git_checkpoint",
      description: "Create a non-destructive checkpoint snapshot of the current Git working tree for audit and later rollback planning.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why this checkpoint is being created." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => createGitCheckpoint(ctx, String(payload["reason"] ?? "").trim()),
    },
    {
      name: "git_checkpoint_show",
      description: "Read a previously created Git checkpoint snapshot by id without changing the working tree.",
      parameters: {
        type: "object",
        required: ["checkpointId"],
        properties: {
          checkpointId: { type: "string", description: "Checkpoint id returned by git_checkpoint or Activity." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => readGitCheckpoint(ctx, String(payload["checkpointId"] ?? "")),
    },
    {
      name: "git_checkpoint_apply",
      description: "Restore the working tree to a previously saved Git checkpoint snapshot. Requires confirmation because it resets tracked files and applies the stored checkpoint patch.",
      parameters: {
        type: "object",
        required: ["checkpointId"],
        properties: {
          checkpointId: { type: "string", description: "Checkpoint id returned by git_checkpoint or Activity." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => applyGitCheckpoint(ctx, String(payload["checkpointId"] ?? "")),
    },
    {
      name: "git_status",
      description: "Show working-tree status (porcelain v1 including branch info).",
      parameters: { type: "object", properties: {} },
      allowedCommands: ALLOWED,
      handler: (ctx) => git(ctx, ["status", "--porcelain=v1", "-b"]),
    },
    {
      name: "git_diff",
      description: "Show diff against an optional target branch (e.g. 'main').",
      parameters: {
        type: "object",
        properties: {
          target_branch: { type: "string" },
          name_only: { type: "boolean" },
        },
      },
      allowedCommands: ALLOWED,
      handler: async (ctx, payload) => {
        const args: string[] = ["diff"];
        const target = String(payload["target_branch"] ?? "");
        if (target) args.push(`${target}...HEAD`);
        if (payload["name_only"]) args.push("--name-only");
        return git(ctx, args);
      },
    },
    {
      name: "git_current_branch",
      description: "Return the current branch name.",
      parameters: { type: "object", properties: {} },
      allowedCommands: ALLOWED,
      handler: async (ctx) => {
        const res = await git(ctx, ["rev-parse", "--abbrev-ref", "HEAD"]);
        return { ...res, branch: String(res["stdout"] ?? "").trim() };
      },
    },
    {
      name: "git_log",
      description: "Recent commits (one-line summary).",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", default: 20 } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) =>
        git(ctx, [
          "log",
          `-n${Number(payload["limit"] ?? 20)}`,
          "--pretty=format:%h %an %ad %s",
          "--date=short",
        ]),
    },
    {
      name: "git_show",
      description: "Show a commit, tag, or file at a revision. Use path to inspect a single file at that revision.",
      parameters: {
        type: "object",
        properties: {
          revision: { type: "string", default: "HEAD" },
          path: { type: "string", description: "Optional file path to show at the revision." },
          stat: { type: "boolean", description: "Show summary statistics instead of the full patch/content." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const revision = String(payload["revision"] ?? "HEAD").trim() || "HEAD";
        const path = String(payload["path"] ?? "").trim();
        if (path) return git(ctx, ["show", `${revision}:${path}`]);
        return git(ctx, payload["stat"] ? ["show", "--stat", revision] : ["show", revision]);
      },
    },
    {
      name: "git_fetch",
      description: "Fetch remote-tracking refs from a remote without changing the working tree.",
      parameters: {
        type: "object",
        properties: {
          remote: { type: "string", default: "origin" },
          prune: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const remote = String(payload["remote"] ?? "origin").trim() || "origin";
        const args = payload["prune"] ? ["fetch", "--prune", remote] : ["fetch", remote];
        return git(ctx, args);
      },
    },
    {
      name: "git_merge_base",
      description: "Find the best common ancestor between two refs.",
      parameters: {
        type: "object",
        required: ["left", "right"],
        properties: {
          left: { type: "string", description: "First branch, tag, or revision." },
          right: { type: "string", description: "Second branch, tag, or revision." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const left = String(payload["left"] ?? "").trim();
        const right = String(payload["right"] ?? "").trim();
        if (!left || !right) throw new ToolError("git_merge_base requires 'left' and 'right'");
        return git(ctx, ["merge-base", left, right]);
      },
    },
    {
      name: "git_push",
      description: "Push a branch to a remote (defaults to origin).",
      parameters: {
        type: "object",
        required: ["branch"],
        properties: {
          branch: { type: "string" },
          remote: { type: "string", default: "origin" },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const branch = String(payload["branch"] ?? "");
        if (!branch) throw new ToolError("git_push requires 'branch'");
        const remote = String(payload["remote"] ?? "origin");
        return git(ctx, ["push", "-u", remote, branch]);
      },
    },
    {
      name: "git_create_branch",
      description: "Create and switch to a new branch.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const name = String(payload["name"] ?? "");
        if (!name) throw new ToolError("git_create_branch requires 'name'");
        return git(ctx, ["checkout", "-b", name]);
      },
    },
    {
      name: "git_checkout",
      description: "Switch to an existing branch or revision.",
      parameters: {
        type: "object",
        required: ["ref"],
        properties: {
          ref: { type: "string", description: "Existing branch, tag, or revision to check out." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const ref = String(payload["ref"] ?? "").trim();
        if (!ref) throw new ToolError("git_checkout requires 'ref'");
        return git(ctx, ["checkout", ref]);
      },
    },
    {
      name: "git_pull",
      description: "Pull changes from a remote branch into the current branch.",
      parameters: {
        type: "object",
        properties: {
          remote: { type: "string", default: "origin" },
          branch: { type: "string", description: "Optional remote branch to pull." },
          rebase: { type: "boolean", default: false },
          ffOnly: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const remote = String(payload["remote"] ?? "origin").trim() || "origin";
        const branch = String(payload["branch"] ?? "").trim();
        const args = ["pull"];
        if (payload["rebase"]) args.push("--rebase");
        if (payload["ffOnly"]) args.push("--ff-only");
        args.push(remote);
        if (branch) args.push(branch);
        return git(ctx, args);
      },
    },
    {
      name: "git_merge",
      description: "Merge another ref into the current branch.",
      parameters: {
        type: "object",
        required: ["ref"],
        properties: {
          ref: { type: "string", description: "Branch, tag, or revision to merge." },
          noCommit: { type: "boolean", default: false },
          ffOnly: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const ref = String(payload["ref"] ?? "").trim();
        if (!ref) throw new ToolError("git_merge requires 'ref'");
        const args = ["merge"];
        if (payload["noCommit"]) args.push("--no-commit");
        if (payload["ffOnly"]) args.push("--ff-only");
        args.push(ref);
        return git(ctx, args);
      },
    },
    {
      name: "git_rebase",
      description: "Rebase the current branch onto another ref.",
      parameters: {
        type: "object",
        required: ["onto"],
        properties: {
          onto: { type: "string", description: "Branch, tag, or revision to rebase onto." },
          autostash: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const onto = String(payload["onto"] ?? "").trim();
        if (!onto) throw new ToolError("git_rebase requires 'onto'");
        const args = ["rebase"];
        if (payload["autostash"]) args.push("--autostash");
        args.push(onto);
        return git(ctx, args);
      },
    },
    {
      name: "git_add",
      description: "Stage files for commit. Pass paths as an array, or leave empty to stage all changes (git add .).",
      parameters: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Specific files/dirs to stage. Omit to stage everything.",
          },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const paths = payload["paths"] as string[] | undefined;
        const args = paths && paths.length > 0 ? ["add", "--", ...paths] : ["add", "."];
        return git(ctx, args);
      },
    },
    {
      name: "git_restore",
      description: "Restore files in the working tree or staged area.",
      parameters: {
        type: "object",
        required: ["paths"],
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Specific files or directories to restore.",
          },
          source: { type: "string", description: "Optional source revision, such as HEAD." },
          staged: { type: "boolean", description: "Restore the staged area instead of the working tree." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const paths = payload["paths"] as string[] | undefined;
        if (!paths || paths.length === 0) throw new ToolError("git_restore requires at least one path");
        const source = String(payload["source"] ?? "").trim();
        const args = ["restore"];
        if (payload["staged"]) args.push("--staged");
        if (source) args.push("--source", source);
        args.push("--", ...paths);
        return git(ctx, args);
      },
    },
    {
      name: "git_commit",
      description: "Commit staged changes with the given message.",
      parameters: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", description: "The commit message." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const message = String(payload["message"] ?? "").trim();
        if (!message) throw new ToolError("git_commit requires 'message'");
        return git(ctx, ["commit", "-m", message]);
      },
    },
    {
      name: "git_branch_list",
      description: "List local branches. Shows the currently checked-out branch with an asterisk.",
      parameters: { type: "object", properties: { all: { type: "boolean", description: "Include remote-tracking branches." } } },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const args = payload["all"] ? ["branch", "-a"] : ["branch"];
        return git(ctx, args);
      },
    },
    {
      name: "git_remote",
      description: "Show configured remotes and their URLs.",
      parameters: { type: "object", properties: {} },
      allowedCommands: ALLOWED,
      handler: (ctx) => git(ctx, ["remote", "-v"]),
    },
    {
      name: "git_stash",
      description: "Stash or pop working-tree changes. action='push' to stash, 'pop' to restore.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["push", "pop"], default: "push" },
          message: { type: "string", description: "Optional stash message." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const action = String(payload["action"] ?? "push");
        if (action === "pop") return git(ctx, ["stash", "pop"]);
        const msg = String(payload["message"] ?? "").trim();
        return msg ? git(ctx, ["stash", "push", "-m", msg]) : git(ctx, ["stash", "push"]);
      },
    },
  ];
}
