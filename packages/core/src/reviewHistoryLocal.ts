import fs from "node:fs";
import path from "node:path";
import { compareReviewQueueItems, type ReviewQueueItem } from "./reviewQueue.js";

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
  decisionReasonCodes?: string[];
  contextConfidence?: ReviewQueueItem["contextConfidence"];
  autoApprovedAt: string;
  autoApprovalActor: string;
  lastTokensIn?: number;
  lastTokensOut?: number;
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
  manualDisposition?: ReviewQueueItem["manualDisposition"];
  manualDispositionAt?: string;
  manualDispositionActor?: string;
  manualDispositionNote?: string;
  manualDispositionEvents?: ReviewQueueItem["manualDispositionEvents"];
  manualDispositionWriteBackAttempted?: boolean;
  manualDispositionWriteBackOk?: boolean;
  manualDispositionWriteBackError?: string;
  manualDispositionWriteBackAt?: string;
  manualDispositionWriteBackThreadId?: string;
  manualDispositionWriteBackUrl?: string;
  manualDispositionWriteBackEvents?: ReviewQueueItem["manualDispositionWriteBackEvents"];
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
    decisionReasonCodes: record.decisionReasonCodes ?? [],
    contextConfidence: record.contextConfidence ?? "",
    autoApprovedAt: record.autoApprovedAt,
    autoApprovalActor: record.autoApprovalActor,
    discardedFindingCount: record.discardedFindingCount ?? 0,
    hunkCoverageFiles: record.hunkCoverageFiles ?? 0,
    wholeFileFallbackFiles: record.wholeFileFallbackFiles ?? 0,
    changedHunkLines: record.changedHunkLines ?? 0,
    manualDisposition: record.manualDisposition ?? "",
    manualDispositionAt: record.manualDispositionAt ?? "",
    manualDispositionActor: record.manualDispositionActor ?? "",
    manualDispositionNote: record.manualDispositionNote ?? "",
    manualDispositionEvents: record.manualDispositionEvents ?? [],
    manualDispositionWriteBackAttempted: record.manualDispositionWriteBackAttempted ?? false,
    manualDispositionWriteBackOk: record.manualDispositionWriteBackOk ?? false,
    manualDispositionWriteBackError: record.manualDispositionWriteBackError ?? "",
    manualDispositionWriteBackAt: record.manualDispositionWriteBackAt ?? "",
    manualDispositionWriteBackThreadId: record.manualDispositionWriteBackThreadId ?? "",
    manualDispositionWriteBackUrl: record.manualDispositionWriteBackUrl ?? "",
    manualDispositionWriteBackEvents: record.manualDispositionWriteBackEvents ?? [],
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
  const sorted = items.sort(compareReviewQueueItems);
  if (args.limit && args.limit > 0) return sorted.slice(0, args.limit);
  return sorted;
}
