import type { ChatCheckpointActivity } from "../../api.js";

export function checkpointActivityKindLabel(event: ChatCheckpointActivity): string {
  return event.targetCheckpointId ? "checkpoint apply" : "checkpoint";
}

export function checkpointActivityDetail(event: ChatCheckpointActivity): string {
  if (event.targetCheckpointId) {
    return `restored ${event.targetCheckpointId} · safety ${event.safetyCheckpointId ?? event.checkpointId}`;
  }
  return compactActivityPath(event.repoPath);
}

export function compactActivityPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) return trimmed;
  return `...\\${parts.slice(-2).join("\\")}`;
}
