import { ToolError, type Tool } from "./executor.js";
import { ALLOWED_GIT_COMMANDS, runGit } from "./gitCommand.js";

const ALLOWED = ALLOWED_GIT_COMMANDS;
const git = runGit;

export function gitHistoryTools(): Tool[] {
  return [
    {
      name: "git_merge",
      description: "Merge another ref into the current branch, or continue/abort an in-progress merge.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Branch, tag, or revision to merge." },
          action: { type: "string", enum: ["start", "continue", "abort"], default: "start" },
          noCommit: { type: "boolean", default: false },
          ffOnly: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const action = String(payload["action"] ?? "start");
        if (action === "continue" || action === "abort") {
          return git(ctx, ["merge", `--${action}`]);
        }
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
      name: "git_cherry_pick",
      description: "Cherry-pick a commit, or continue/abort/skip an in-progress cherry-pick.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Commit or revision to cherry-pick." },
          action: { type: "string", enum: ["start", "continue", "abort", "skip"], default: "start" },
          noCommit: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const action = String(payload["action"] ?? "start");
        if (["continue", "abort", "skip"].includes(action)) {
          return git(ctx, ["cherry-pick", `--${action}`]);
        }
        const ref = String(payload["ref"] ?? "").trim();
        if (!ref) throw new ToolError("git_cherry_pick requires 'ref'");
        const args = ["cherry-pick"];
        if (payload["noCommit"]) args.push("--no-commit");
        args.push(ref);
        return git(ctx, args);
      },
    },
    {
      name: "git_revert",
      description: "Revert a commit, or continue/abort/skip an in-progress revert.",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Commit or revision to revert." },
          action: { type: "string", enum: ["start", "continue", "abort", "skip"], default: "start" },
          noCommit: { type: "boolean", default: false },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const action = String(payload["action"] ?? "start");
        if (["continue", "abort", "skip"].includes(action)) {
          return git(ctx, ["revert", `--${action}`]);
        }
        const ref = String(payload["ref"] ?? "").trim();
        if (!ref) throw new ToolError("git_revert requires 'ref'");
        const args = ["revert"];
        if (payload["noCommit"]) args.push("--no-commit");
        args.push(ref);
        return git(ctx, args);
      },
    },
    {
      name: "git_rebase",
      description: "Rebase the current branch onto another ref, or continue/abort/skip an in-progress rebase.",
      parameters: {
        type: "object",
        properties: {
          onto: { type: "string", description: "Branch, tag, or revision to rebase onto." },
          autostash: { type: "boolean", default: false },
          action: { type: "string", enum: ["start", "continue", "abort", "skip"], default: "start" },
        },
      },
      allowedCommands: ALLOWED,
      handler: (ctx, payload) => {
        const action = String(payload["action"] ?? "start");
        if (["continue", "abort", "skip"].includes(action)) {
          return git(ctx, ["rebase", `--${action}`]);
        }
        const onto = String(payload["onto"] ?? "").trim();
        if (!onto) throw new ToolError("git_rebase requires 'onto'");
        const args = ["rebase"];
        if (payload["autostash"]) args.push("--autostash");
        args.push(onto);
        return git(ctx, args);
      },
    },
  ];
}
