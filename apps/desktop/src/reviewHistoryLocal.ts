import type { ReviewFinding, ReviewQueueItem } from "./api.js";

export const REVIEW_HISTORY_LS_KEY = "cicd_agent_review_history_v1";
export const FINDINGS_LS_KEY = "cicd_agent_pr_findings_v1";

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
  autoApprovedAt: string;
  autoApprovalActor: string;
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
    autoApprovedAt: record.autoApprovedAt,
    autoApprovalActor: record.autoApprovalActor,
  };
}

export function listReviewHistoryLocal(repository: string): ReviewQueueItem[] {
  const repo = repository.trim();
  if (!repo) return [];
  const store = loadStore();
  return Object.values(store[repo] ?? {})
    .map(recordToItem)
    .sort((a, b) => Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0"));
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
      autoApprovedAt: item.autoApprovedAt,
      autoApprovalActor: item.autoApprovalActor,
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
  return [...byKey.values()].sort(
    (a, b) => Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0"),
  );
}
