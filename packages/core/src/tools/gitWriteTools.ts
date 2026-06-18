import { ToolError, type Tool } from "./executor.js";
import { ALLOWED_GIT_COMMANDS, runGit } from "./gitCommand.js";
import { gitHistoryTools } from "./gitHistoryTools.js";

const ALLOWED = ALLOWED_GIT_COMMANDS;
const git = runGit;

export function gitWriteTools(): Tool[] {
  return [
    {
      name: "git_push",
      description: "Push a branch to a remote (defaults to origin). Supports --set-upstream, --force-with-lease, --tags, and --dry-run.",
      parameters: {
        type: "object",
        required: ["branch"],
        properties: {
          branch: { type: "string" },
          remote: { type: "string", default: "origin" },
          setUpstream: { type: "boolean", default: true },
          forceWithLease: { type: "boolean", default: false },
          tags: { type: "boolean", default: false },
          dryRun: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const branch = String(payload["branch"] ?? "");
        if (!branch) throw new ToolError("git_push requires 'branch'");
        const remote = String(payload["remote"] ?? "origin");
        const args = ["push"];
        if (payload["setUpstream"] !== false) args.push("-u");
        if (payload["forceWithLease"]) args.push("--force-with-lease");
        if (payload["tags"]) args.push("--tags");
        if (payload["dryRun"]) args.push("--dry-run");
        args.push(remote, branch);
        return git(ctx, args);
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
      name: "git_switch",
      description: "Switch branches using git switch. Can create a branch with create=true.",
      parameters: {
        type: "object",
        required: ["branch"],
        properties: {
          branch: { type: "string", description: "Branch name to switch to or create." },
          create: { type: "boolean", default: false, description: "Create the branch before switching." },
          startPoint: { type: "string", description: "Optional start point when creating a branch." },
          detach: { type: "boolean", default: false, description: "Detach HEAD at the target." },
          track: { type: "boolean", default: false, description: "Set upstream tracking when creating from a remote branch." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const branch = String(payload["branch"] ?? "").trim();
        if (!branch) throw new ToolError("git_switch requires 'branch'");
        const args = ["switch"];
        if (payload["create"]) args.push("-c");
        if (payload["detach"]) args.push("--detach");
        if (payload["track"]) args.push("--track");
        args.push(branch);
        const startPoint = String(payload["startPoint"] ?? "").trim();
        if (startPoint) args.push(startPoint);
        return git(ctx, args);
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
    ...gitHistoryTools(),
    {
      name: "git_add",
      description: "Stage files for commit. Supports path filters plus common flags such as --all, --update, --intent-to-add, and --dry-run.",
      parameters: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Specific files/dirs to stage. Omit to stage everything.",
          },
          all: { type: "boolean", description: "Stage all changes including deletions. Defaults to true when paths are omitted." },
          update: { type: "boolean", description: "Stage modified/deleted tracked files only (git add --update)." },
          intentToAdd: { type: "boolean", description: "Record only intent to add (git add --intent-to-add)." },
          dryRun: { type: "boolean", description: "Show what would be staged without staging it." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const paths = payload["paths"] as string[] | undefined;
        const args = ["add"];
        if (payload["dryRun"]) args.push("--dry-run");
        if (payload["intentToAdd"]) args.push("--intent-to-add");
        if (payload["update"]) args.push("--update");
        else if (!paths || paths.length === 0 || payload["all"]) args.push("--all");
        if (paths && paths.length > 0) args.push("--", ...paths);
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
      description: "Commit staged changes with the given message. Supports --amend, --no-verify, --allow-empty, and --all.",
      parameters: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", description: "The commit message." },
          amend: { type: "boolean", default: false },
          noVerify: { type: "boolean", default: false },
          allowEmpty: { type: "boolean", default: false },
          all: { type: "boolean", default: false, description: "Stage tracked modifications before committing (git commit --all)." },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const message = String(payload["message"] ?? "").trim();
        if (!message) throw new ToolError("git_commit requires 'message'");
        const args = ["commit"];
        if (payload["all"]) args.push("--all");
        if (payload["amend"]) args.push("--amend");
        if (payload["noVerify"]) args.push("--no-verify");
        if (payload["allowEmpty"]) args.push("--allow-empty");
        args.push("-m", message);
        return git(ctx, args);
      },
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
