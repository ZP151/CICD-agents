import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { redact, ToolError, type Tool } from "./executor.js";
import { ALLOWED_GIT_COMMANDS, runGit, runGitReadOnly } from "./gitCommand.js";

const ALLOWED = ALLOWED_GIT_COMMANDS;
const git = runGitReadOnly;

const READ_TEXT_FILE_DEFAULT_BYTES = 262_144; // 256 KiB
const READ_TEXT_FILE_MAX_BYTES = 1_048_576; // 1 MiB

/** Resolve a repo-relative path and reject any escape out of the repo root. */
function resolveRepoFile(repoPath: string, relPath: string): string {
  const root = path.resolve(repoPath);
  const candidate = path.resolve(root, relPath);
  const rel = path.relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new ToolError(`read_text_file: '${relPath}' is outside the repository`);
  }
  // Follow symlinks: a link inside the repo must not reach files outside it.
  let realRoot: string;
  let realFile: string;
  try {
    realRoot = realpathSync(root);
    realFile = realpathSync(candidate);
  } catch (err) {
    throw new ToolError(`read_text_file: cannot stat '${relPath}': ${(err as Error).message}`);
  }
  const realRel = path.relative(realRoot, realFile);
  if (realRel === ".." || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) {
    throw new ToolError(`read_text_file: '${relPath}' resolves outside the repository`);
  }
  return candidate;
}

export function gitReadTools(): Tool[] {
  return [
    {
      name: "git_status",
      description: "Show working-tree status. Supports common flags such as --short, --branch, --ignored, and --untracked-files.",
      parameters: {
        type: "object",
        properties: {
          short: { type: "boolean", description: "Use git status --short instead of porcelain v1." },
          branch: { type: "boolean", description: "Include branch tracking information. Defaults to true." },
          ignored: { type: "boolean", description: "Include ignored files." },
          untracked: { type: "string", enum: ["no", "normal", "all"], description: "Control untracked file display." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const args = ["status"];
        args.push(payload["short"] ? "--short" : "--porcelain=v1");
        if (payload["branch"] !== false) args.push("-b");
        const untracked = String(payload["untracked"] ?? "").trim();
        if (["no", "normal", "all"].includes(untracked)) args.push(`--untracked-files=${untracked}`);
        if (payload["ignored"]) args.push("--ignored");
        return git(ctx, args);
      },
    },
    {
      name: "git_diff",
      description: "Show Git diffs. Omit target_branch to inspect uncommitted working-tree changes. Use staged/cached for the index. target_branch compares committed branch history and does not include unstaged working-tree edits.",
      parameters: {
        type: "object",
        properties: {
          target_branch: { type: "string" },
          staged: { type: "boolean", description: "Show staged changes (git diff --staged)." },
          cached: { type: "boolean", description: "Alias for staged." },
          name_only: { type: "boolean" },
          stat: { type: "boolean", description: "Show diffstat instead of full patch." },
          context: { type: "integer", minimum: 0, maximum: 100, description: "Unified diff context lines." },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Optional pathspec filters.",
          },
        },
      },
      allowedCommands: ALLOWED,
      handler: async (ctx, payload) => {
        const args: string[] = ["diff"];
        if (payload["staged"] || payload["cached"]) args.push("--staged");
        if (payload["name_only"]) args.push("--name-only");
        if (payload["stat"]) args.push("--stat");
        if (typeof payload["context"] === "number") args.push(`--unified=${Math.max(0, Math.min(100, Math.trunc(payload["context"])))}`);
        const target = String(payload["target_branch"] ?? "");
        if (target) args.push(`${target}...HEAD`);
        const paths = Array.isArray(payload["paths"]) ? payload["paths"].map(String).filter(Boolean) : [];
        if (paths.length > 0) args.push("--", ...paths);
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
      handler: async (ctx, payload) => {
        const revision = String(payload["revision"] ?? "HEAD").trim() || "HEAD";
        const path = String(payload["path"] ?? "").trim();
        if (!path) return git(ctx, payload["stat"] ? ["show", "--stat", revision] : ["show", revision]);
        const res = await git(ctx, ["show", `${revision}:${path}`]);
        if (res.returncode !== 0 && /exists on disk, but not in/i.test(String(res.stderr ?? ""))) {
          throw new ToolError(
            `git_show: '${path}' exists in the working tree but has no '${revision}' revision ` +
              `(untracked or newly added file). Use read_text_file with a repository-relative path to read it.`,
          );
        }
        return res;
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
        return runGit(ctx, args);
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
      name: "read_text_file",
      description:
        "Read the text content of a file in the repository working tree, including untracked and staged files. Use this when git_show or git_diff cannot show a file (for example an untracked file has no revision to show). The returned content is secret-redacted server-side. Rejects paths outside the repository and binary files.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", description: "Repository-relative file path." },
          max_bytes: {
            type: "integer",
            minimum: 1024,
            maximum: READ_TEXT_FILE_MAX_BYTES,
            description: "Maximum bytes to read (default 262144).",
          },
        },
      },
      handler: async (ctx, payload) => {
        const relPath = String(payload["path"] ?? "").trim();
        if (!relPath) throw new ToolError("read_text_file requires a non-empty 'path'");
        const rawCap = Number(payload["max_bytes"] ?? READ_TEXT_FILE_DEFAULT_BYTES);
        const cap = Number.isFinite(rawCap)
          ? Math.min(Math.max(Math.trunc(rawCap), 1024), READ_TEXT_FILE_MAX_BYTES)
          : READ_TEXT_FILE_DEFAULT_BYTES;
        const filePath = resolveRepoFile(ctx.repoPath, relPath);
        const started = Date.now();
        let stat;
        try {
          stat = statSync(filePath);
        } catch (err) {
          throw new ToolError(`read_text_file: cannot stat '${relPath}': ${(err as Error).message}`);
        }
        if (!stat.isFile()) throw new ToolError(`read_text_file: '${relPath}' is not a regular file`);
        if (stat.size > cap) {
          throw new ToolError(
            `read_text_file: '${relPath}' is ${stat.size} bytes, exceeding the ${cap}-byte limit (raise max_bytes up to ${READ_TEXT_FILE_MAX_BYTES})`,
          );
        }
        let content: string;
        try {
          content = readFileSync(filePath, "utf8");
        } catch (err) {
          throw new ToolError(`read_text_file: cannot read '${relPath}': ${(err as Error).message}`);
        }
        if (content.includes("\u0000")) {
          throw new ToolError(`read_text_file: '${relPath}' appears to be a binary file`);
        }
        return {
          returncode: 0,
          stdout: redact(content),
          stderr: "",
          duration_ms: Date.now() - started,
        };
      },
    },
  ];
}
