import { runCommand, ToolError, type Tool, type ToolContext } from "./executor.js";

const ALLOWED = ["git"] as const;

async function git(
  ctx: ToolContext,
  args: string[],
  timeoutSec?: number,
): Promise<Record<string, unknown>> {
  const res = await runCommand(["git", ...args], {
    cwd: ctx.repoPath,
    timeoutSec: timeoutSec ?? ctx.timeoutSec,
    allowed: ALLOWED,
  });
  return {
    returncode: res.returncode,
    stdout: res.stdout,
    stderr: res.stderr,
    duration_ms: res.durationMs,
  };
}

export function gitTools(): Tool[] {
  return [
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
