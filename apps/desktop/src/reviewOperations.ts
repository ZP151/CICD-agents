import type { ReviewQueueItem } from "./api.js";
import { reviewQueueItemKey } from "./reviewRunHistory.js";

export const REVIEW_OPERATIONS_LS_KEY = "cicd_agent_review_operations_v1";
const MAX_REVIEW_OPERATIONS = 50;

export type ReviewOperationKind =
  | "rerun"
  | "batch_rerun"
  | "stale_rerun"
  | "disposition"
  | "ado_retry"
  | "insight_preview"
  | "review_run";

export interface ReviewOperationEvent {
  id: string;
  kind: ReviewOperationKind;
  at: string;
  repository: string;
  pullRequestId: number;
  actor: string;
  label: string;
  ok: boolean;
  details: string;
}

type ReviewOperationStore = ReviewOperationEvent[];

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function loadStore(): ReviewOperationStore {
  try {
    const target = storage();
    if (!target) return [];
    const raw = target.getItem(REVIEW_OPERATIONS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ReviewOperationStore : [];
  } catch {
    return [];
  }
}

function saveStore(store: ReviewOperationStore): void {
  const target = storage();
  if (!target) return;
  target.setItem(REVIEW_OPERATIONS_LS_KEY, JSON.stringify(store.slice(0, MAX_REVIEW_OPERATIONS)));
}

export function listReviewOperations(): ReviewOperationEvent[] {
  return loadStore().slice().sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
}

export function appendReviewOperation(
  event: Omit<ReviewOperationEvent, "id" | "at" | "actor"> & {
    at?: string;
    actor?: string;
  },
): ReviewOperationEvent {
  const at = event.at ?? new Date().toISOString();
  const actor = event.actor ?? "desktop-user";
  const saved: ReviewOperationEvent = {
    ...event,
    id: `${at}-${event.kind}-${event.repository}-${event.pullRequestId}`,
    at,
    actor,
  };
  const next = [saved, ...loadStore()].slice(0, MAX_REVIEW_OPERATIONS);
  saveStore(next);
  return saved;
}

export function clearReviewOperations(): void {
  storage()?.removeItem(REVIEW_OPERATIONS_LS_KEY);
}

export function reviewOperationTarget(item: Pick<ReviewQueueItem, "repository" | "pullRequestId">): string {
  return reviewQueueItemKey(item);
}
