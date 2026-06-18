import type { ChatCheckpointActivity } from "../../api.js";

export function checkpointActivityKindLabel(event: ChatCheckpointActivity): string {
  return event.targetCheckpointId ? "checkpoint apply" : "checkpoint";
}

export function checkpointActivityDetail(event: ChatCheckpointActivity): string {
  if (event.targetCheckpointId) {
    return `restored ${event.targetCheckpointId} · safety ${event.safetyCheckpointId ?? event.checkpointId}`;
  }
  return event.repoPath;
}
