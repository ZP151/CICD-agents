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
