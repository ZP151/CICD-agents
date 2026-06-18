import type { Tool } from "./executor.js";
import { ALLOWED_GIT_COMMANDS } from "./gitCommand.js";
import {
  applyGitCheckpoint,
  createGitCheckpoint,
  readGitCheckpoint,
} from "./gitCheckpoint.js";
import { gitReadTools } from "./gitReadTools.js";
import { gitWriteTools } from "./gitWriteTools.js";

export {
  applyGitCheckpoint,
  createGitCheckpoint,
  planGitCheckpointRollback,
  previewGitCheckpoint,
  readGitCheckpoint,
} from "./gitCheckpoint.js";

const ALLOWED = ALLOWED_GIT_COMMANDS;

function gitCheckpointTools(): Tool[] {
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
  ];
}

export function gitTools(): Tool[] {
  return [
    ...gitCheckpointTools(),
    ...gitReadTools(),
    ...gitWriteTools(),
  ];
}
