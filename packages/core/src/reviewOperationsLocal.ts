import fs from "node:fs";
import path from "node:path";
import { parseSortableDate } from "./safeDate.js";

export type ReviewOperationKind =
  | "rerun"
  | "batch_rerun"
  | "stale_rerun"
  | "disposition"
  | "ado_retry"
  | "insight_preview"
  | "review_run";

export interface ReviewOperationRecord {
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

type ReviewOperationStore = ReviewOperationRecord[];

const MAX_REVIEW_OPERATIONS = 200;

export function reviewOperationsStorePath(dataDir: string): string {
  return path.join(dataDir, "review-operations.json");
}

function loadStore(dataDir: string): ReviewOperationStore {
  const p = reviewOperationsStorePath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed as ReviewOperationStore : [];
  } catch {
    return [];
  }
}

function saveStore(dataDir: string, store: ReviewOperationStore): void {
  const p = reviewOperationsStorePath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store.slice(0, MAX_REVIEW_OPERATIONS), null, 2), "utf8");
}

export function appendLocalReviewOperation(
  dataDir: string,
  event: Omit<ReviewOperationRecord, "id" | "at" | "actor"> & {
    id?: string;
    at?: string;
    actor?: string;
  },
): ReviewOperationRecord {
  const at = event.at ?? new Date().toISOString();
  const actor = event.actor ?? "desktop-user";
  const saved: ReviewOperationRecord = {
    ...event,
    id: event.id ?? `${at}-${event.kind}-${event.repository}-${event.pullRequestId}`,
    at,
    actor,
  };
  const next = [saved, ...loadStore(dataDir)].slice(0, MAX_REVIEW_OPERATIONS);
  saveStore(dataDir, next);
  return saved;
}

export function listLocalReviewOperations(args: {
  dataDir: string;
  repository?: string;
  limit?: number;
}): ReviewOperationRecord[] {
  const repository = args.repository?.trim() ?? "";
  const events = loadStore(args.dataDir)
    .filter((event) => !repository || event.repository === repository)
    .sort((a, b) => parseSortableDate(b.at) - parseSortableDate(a.at));
  if (args.limit && args.limit > 0) return events.slice(0, args.limit);
  return events;
}
