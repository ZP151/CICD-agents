import type { ReviewFinding, ReviewQueueItem } from "./api.js";

export const REVIEW_HISTORY_LS_KEY = "mergepilot_review_history_v1";
export const FINDINGS_LS_KEY = "mergepilot_pr_findings_v1";

type FindingsStore = Record<string, Record<string, ReviewFinding[]>>;

function loadFindingsStore(): FindingsStore {
  try {
    const raw = localStorage.getItem(FINDINGS_LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as FindingsStore;
  } catch {
    return {};
  }
}

function saveFindingsStore(store: FindingsStore): void {
  localStorage.setItem(FINDINGS_LS_KEY, JSON.stringify(store));
}

export function saveFindingsLocal(repository: string, pullRequestId: number, findings: ReviewFinding[]): void {
  const repo = repository.trim();
  if (!repo || !Number.isFinite(pullRequestId)) return;
  const store = loadFindingsStore();
  const bucket = store[repo] ?? {};
  bucket[String(pullRequestId)] = findings;
  store[repo] = bucket;
  saveFindingsStore(store);
}

export function loadFindingsLocal(repository: string, pullRequestId: number): ReviewFinding[] {
  const repo = repository.trim();
  if (!repo || !Number.isFinite(pullRequestId)) return [];
  const store = loadFindingsStore();
  return store[repo]?.[String(pullRequestId)] ?? [];
}

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

function loadStore(): ReviewHistoryStore {
  try {
    const raw = localStorage.getItem(REVIEW_HISTORY_LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ReviewHistoryStore;
  } catch {
    return {};
  }
}

function saveStore(store: ReviewHistoryStore): void {
  localStorage.setItem(REVIEW_HISTORY_LS_KEY, JSON.stringify(store));
}

function recordToItem(record: ReviewHistoryRecord): ReviewQueueItem {
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

function reviewQueuePriorityScore(item: ReviewQueueItem): number {
  const queuePriority: Record<ReviewQueueItem["decisionQueue"], number> = {
    blocked: 4000,
    needs_human_review: 3000,
    watching: 2000,
    auto_approved: 1000,
  };
  const riskPriority: Record<ReviewQueueItem["decisionRiskLevel"], number> = {
    high: 300,
    medium: 200,
    low: 100,
  };
  return (
    queuePriority[item.decisionQueue] +
    riskPriority[item.decisionRiskLevel] +
    item.findingCount * 10 +
    item.discardedFindingCount * 12 +
    item.wholeFileFallbackFiles * 35 +
    (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0 ? 50 : 0)
  );
}

export function compareReviewQueueItems(a: ReviewQueueItem, b: ReviewQueueItem): number {
  const priorityDelta = reviewQueuePriorityScore(b) - reviewQueuePriorityScore(a);
  if (priorityDelta !== 0) return priorityDelta;
  return Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0");
}

export function reviewQueuePriorityReasons(item: ReviewQueueItem): string[] {
  const reasons: string[] = [];
  if (item.decisionQueue === "blocked") reasons.push("blocked queue");
  if (item.decisionQueue === "needs_human_review") reasons.push("needs human review");
  if (item.decisionRiskLevel === "high") reasons.push("high risk");
  if (item.decisionRiskLevel === "medium") reasons.push("medium risk");
  for (const code of item.decisionReasonCodes ?? []) reasons.push(code.replace(/[._]/g, " "));
  if (item.findingCount > 0) reasons.push(`${item.findingCount} finding(s)`);
  if (item.discardedFindingCount > 0) reasons.push(`${item.discardedFindingCount} discarded finding(s)`);
  if (item.wholeFileFallbackFiles > 0) reasons.push(`${item.wholeFileFallbackFiles} whole-file fallback file(s)`);
  if (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0) reasons.push("no hunk coverage");
  return reasons;
}

export function listReviewHistoryLocal(repository: string): ReviewQueueItem[] {
  const repo = repository.trim();
  if (!repo) return [];
  const store = loadStore();
  return Object.values(store[repo] ?? {})
    .map(recordToItem)
    .sort(compareReviewQueueItems);
}

export function upsertReviewHistoryLocal(record: ReviewHistoryRecord): void {
  const repository = record.repository.trim();
  if (!repository || !Number.isFinite(record.pullRequestId)) return;
  const store = loadStore();
  const repoBucket = store[repository] ?? {};
  repoBucket[String(record.pullRequestId)] = { ...record, repository };
  store[repository] = repoBucket;
  saveStore(store);
}

export function syncReviewHistoryLocal(items: ReviewQueueItem[]): void {
  for (const item of items) {
    upsertReviewHistoryLocal({
      repository: item.repository,
      pullRequestId: item.pullRequestId,
      lastIterationId: item.lastIterationId,
      findingCount: item.findingCount,
      lastRunAt: item.lastRunAt,
      sourceCommit: item.sourceCommit,
      decisionQueue: item.decisionQueue,
      decisionRiskLevel: item.decisionRiskLevel,
      decisionReason: item.decisionReason,
      decisionReasonCodes: item.decisionReasonCodes ?? [],
      contextConfidence: item.contextConfidence ?? "",
      autoApprovedAt: item.autoApprovedAt,
      autoApprovalActor: item.autoApprovalActor,
      discardedFindingCount: item.discardedFindingCount,
      hunkCoverageFiles: item.hunkCoverageFiles,
      wholeFileFallbackFiles: item.wholeFileFallbackFiles,
      changedHunkLines: item.changedHunkLines,
      manualDisposition: item.manualDisposition ?? "",
      manualDispositionAt: item.manualDispositionAt ?? "",
      manualDispositionActor: item.manualDispositionActor ?? "",
      manualDispositionNote: item.manualDispositionNote ?? "",
      manualDispositionEvents: item.manualDispositionEvents ?? [],
      manualDispositionWriteBackAttempted: item.manualDispositionWriteBackAttempted ?? false,
      manualDispositionWriteBackOk: item.manualDispositionWriteBackOk ?? false,
      manualDispositionWriteBackError: item.manualDispositionWriteBackError ?? "",
      manualDispositionWriteBackAt: item.manualDispositionWriteBackAt ?? "",
      manualDispositionWriteBackThreadId: item.manualDispositionWriteBackThreadId ?? "",
      manualDispositionWriteBackUrl: item.manualDispositionWriteBackUrl ?? "",
      manualDispositionWriteBackEvents: item.manualDispositionWriteBackEvents ?? [],
    });
  }
}

export function mergeReviewQueueItems(...groups: ReviewQueueItem[][]): ReviewQueueItem[] {
  const byKey = new Map<string, ReviewQueueItem>();
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.repository}/${item.pullRequestId}`;
      const existing = byKey.get(key);
      if (!existing || Date.parse(item.lastRunAt || "0") >= Date.parse(existing.lastRunAt || "0")) {
        byKey.set(key, item);
      }
    }
  }
  return [...byKey.values()].sort(compareReviewQueueItems);
}
