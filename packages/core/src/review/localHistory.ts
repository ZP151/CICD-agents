import fs from "node:fs";
import path from "node:path";
import { parseSortableDate } from "../safeDate.js";

/** Review decision queue states shared by the review runtime history row. */
export type ReviewQueueDecision = "auto_approved" | "needs_human_review" | "blocked" | "watching";
/** Review risk levels shared by the review runtime history row. */
export type ReviewQueueRiskLevel = "low" | "medium" | "high";
/** Context confidence labels shared by the review runtime history row. */
export type ReviewContextConfidence = "high" | "medium" | "low" | "";
/** Manual disposition labels shared by the review runtime history row. */
export type ReviewManualDisposition =
  | ""
  | "acknowledged"
  | "marked_safe"
  | "marked_blocked"
  | "changes_requested";

export interface ReviewDispositionEvent {
  disposition: ReviewManualDisposition;
  at: string;
  actor: string;
  note: string;
}

export interface ReviewWriteBackEvent {
  disposition: ReviewManualDisposition;
  at: string;
  ok: boolean;
  actor: string;
  note: string;
  error: string;
  threadId: string;
  url: string;
}

/** Durable review history record (matches Azure ReviewHistory + review runtime fields). */
export interface ReviewHistoryRecord {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: ReviewQueueDecision;
  decisionRiskLevel: ReviewQueueRiskLevel;
  decisionReason: string;
  decisionReasonCodes?: string[];
  contextConfidence?: ReviewContextConfidence;
  autoApprovedAt: string;
  autoApprovalActor: string;
  lastTokensIn?: number;
  lastTokensOut?: number;
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
  manualDisposition?: ReviewManualDisposition;
  manualDispositionAt?: string;
  manualDispositionActor?: string;
  manualDispositionNote?: string;
  manualDispositionEvents?: ReviewDispositionEvent[];
  manualDispositionWriteBackAttempted?: boolean;
  manualDispositionWriteBackOk?: boolean;
  manualDispositionWriteBackError?: string;
  manualDispositionWriteBackAt?: string;
  manualDispositionWriteBackThreadId?: string;
  manualDispositionWriteBackUrl?: string;
  manualDispositionWriteBackEvents?: ReviewWriteBackEvent[];
}

/** Fully materialized review history item returned by local list/read helpers. */
export interface ReviewHistoryItem {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: ReviewQueueDecision;
  decisionRiskLevel: ReviewQueueRiskLevel;
  decisionReason: string;
  decisionReasonCodes: string[];
  contextConfidence: ReviewContextConfidence;
  autoApprovedAt: string;
  autoApprovalActor: string;
  discardedFindingCount: number;
  hunkCoverageFiles: number;
  wholeFileFallbackFiles: number;
  changedHunkLines: number;
  manualDisposition: ReviewManualDisposition;
  manualDispositionAt: string;
  manualDispositionActor: string;
  manualDispositionNote: string;
  manualDispositionEvents: ReviewDispositionEvent[];
  manualDispositionWriteBackAttempted: boolean;
  manualDispositionWriteBackOk: boolean;
  manualDispositionWriteBackError: string;
  manualDispositionWriteBackAt: string;
  manualDispositionWriteBackThreadId: string;
  manualDispositionWriteBackUrl: string;
  manualDispositionWriteBackEvents: ReviewWriteBackEvent[];
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

function recordToItem(record: ReviewHistoryRecord): ReviewHistoryItem {
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

const queuePriority: Record<ReviewQueueDecision, number> = {
  blocked: 4000,
  needs_human_review: 3000,
  watching: 2000,
  auto_approved: 1000,
};

const riskPriority: Record<ReviewQueueRiskLevel, number> = {
  high: 300,
  medium: 200,
  low: 100,
};

function priorityScore(item: ReviewHistoryItem): number {
  return (
    queuePriority[item.decisionQueue] +
    riskPriority[item.decisionRiskLevel] +
    item.findingCount * 10 +
    item.discardedFindingCount * 12 +
    item.wholeFileFallbackFiles * 35 +
    (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0 ? 50 : 0)
  );
}

function compareReviewHistoryItems(a: ReviewHistoryItem, b: ReviewHistoryItem): number {
  const priorityDelta = priorityScore(b) - priorityScore(a);
  if (priorityDelta !== 0) return priorityDelta;
  return parseSortableDate(b.lastRunAt) - parseSortableDate(a.lastRunAt);
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
}): ReviewHistoryItem[] {
  const repository = args.repository.trim();
  if (!repository) return [];
  const store = loadStore(args.dataDir);
  const items = Object.values(store[repository] ?? {}).map(recordToItem);
  const sorted = items.sort(compareReviewHistoryItems);
  if (args.limit && args.limit > 0) return sorted.slice(0, args.limit);
  return sorted;
}
