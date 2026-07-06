import { ToolError, type Tool } from "./executor.js";
import { ALLOWED_GIT_COMMANDS, runGit, runGitReadOnly } from "./gitCommand.js";

const ALLOWED = ALLOWED_GIT_COMMANDS;
const git = runGitReadOnly;

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
  ];
}
