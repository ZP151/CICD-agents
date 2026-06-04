import fs from "node:fs";
import path from "node:path";
import type { ReviewQueueItem } from "./reviewQueue.js";

/** Durable review history record (matches Azure ReviewHistory + queue UI fields). */
export interface ReviewHistoryRecord {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: ReviewQueueItem["decisionQueue"];
  decisionRiskLevel: ReviewQueueItem["decisionRiskLevel"];
  decisionReason: string;
  autoApprovedAt: string;
  autoApprovalActor: string;
  lastTokensIn?: number;
  lastTokensOut?: number;
}

type ReviewHistoryStore = Record<string, Record<string, ReviewHistoryRecord>>;

export function reviewHistoryStorePath(dataDir: string): string {
  return path.join(dataDir, "review-history.json");
}

function loadStore(dataDir: string): ReviewHistoryStore {
  const p = reviewHistoryStorePath(dataDir);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ReviewHistoryStore;
  } catch {
    return {};
  }
}

function saveStore(dataDir: string, store: ReviewHistoryStore): void {
  const p = reviewHistoryStorePath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
}

export function recordToQueueItem(record: ReviewHistoryRecord): ReviewQueueItem {
  return {
    repository: record.repository,
    pullRequestId: record.pullRequestId,
    lastIterationId: record.lastIterationId,
    findingCount: record.findingCount,
    lastRunAt: record.lastRunAt,
    sourceCommit: record.sourceCommit,
    decisionQueue: record.decisionQueue,
    decisionRiskLevel: record.decisionRiskLevel,
    decisionReason: record.decisionReason,
    autoApprovedAt: record.autoApprovedAt,
    autoApprovalActor: record.autoApprovalActor,
  };
}

export function upsertLocalReviewHistory(dataDir: string, record: ReviewHistoryRecord): ReviewHistoryRecord {
  const repository = record.repository.trim();
  const pullRequestId = record.pullRequestId;
  if (!repository || !Number.isFinite(pullRequestId)) {
    throw new Error("repository and pullRequestId are required");
  }
  const store = loadStore(dataDir);
  const repoBucket = store[repository] ?? {};
  repoBucket[String(pullRequestId)] = { ...record, repository, pullRequestId };
  store[repository] = repoBucket;
  saveStore(dataDir, store);
  return repoBucket[String(pullRequestId)]!;
}

export function listLocalReviewHistory(args: {
  dataDir: string;
  repository: string;
  limit?: number;
}): ReviewQueueItem[] {
  const repository = args.repository.trim();
  if (!repository) return [];
  const store = loadStore(args.dataDir);
  const items = Object.values(store[repository] ?? {}).map(recordToQueueItem);
  const sorted = items.sort((a, b) => Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0"));
  if (args.limit && args.limit > 0) return sorted.slice(0, args.limit);
  return sorted;
}
