import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { getAzureCredential } from "./store/azureAuth.js";

const REVIEW_HISTORY_TABLE = "ReviewHistory";

export interface ReviewQueueItem {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  decisionReasonCodes: string[];
  contextConfidence: "high" | "medium" | "low" | "";
  autoApprovedAt: string;
  autoApprovalActor: string;
  discardedFindingCount: number;
  hunkCoverageFiles: number;
  wholeFileFallbackFiles: number;
  changedHunkLines: number;
  manualDisposition: "" | "acknowledged" | "marked_safe" | "marked_blocked" | "changes_requested";
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

export interface ReviewDispositionEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  actor: string;
  note: string;
}

export interface ReviewWriteBackEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  ok: boolean;
  actor: string;
  note: string;
  error: string;
  threadId: string;
  url: string;
}

export interface ReviewQueuePriority {
  score: number;
  reasons: string[];
}

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

type ReviewHistoryEntity = {
  partitionKey: string;
  rowKey: string;
  lastIterationId?: number;
  findingCount?: number;
  lastRunAt?: string;
  sourceCommit?: string;
  decisionQueue?: string;
  decisionRiskLevel?: string;
  decisionReason?: string;
  decisionReasonCodes?: string;
  contextConfidence?: string;
  autoApprovedAt?: string;
  autoApprovalActor?: string;
  discardedFindingCount?: number;
  hunkCoverageFiles?: number;
  wholeFileFallbackFiles?: number;
  changedHunkLines?: number;
  manualDisposition?: string;
  manualDispositionAt?: string;
  manualDispositionActor?: string;
  manualDispositionNote?: string;
  manualDispositionEvents?: string;
  manualDispositionWriteBackAttempted?: boolean;
  manualDispositionWriteBackOk?: boolean;
  manualDispositionWriteBackError?: string;
  manualDispositionWriteBackAt?: string;
  manualDispositionWriteBackThreadId?: string;
  manualDispositionWriteBackUrl?: string;
  manualDispositionWriteBackEvents?: string;
};

function tableUrl(accountName: string): string {
  return `https://${accountName}.table.core.windows.net`;
}

export async function listReviewQueueItems(args: {
  storageAccount: string;
  repository: string;
  limit?: number;
}): Promise<ReviewQueueItem[]> {
  const storageAccount = args.storageAccount.trim();
  const repository = args.repository.trim();
  if (!storageAccount || !repository) return [];

  const client = new TableClient(tableUrl(storageAccount), REVIEW_HISTORY_TABLE, getAzureCredential({ interactive: false }));
  const items: ReviewQueueItem[] = [];
  try {
    const iter = client.listEntities<TableEntity<ReviewHistoryEntity>>({
      queryOptions: { filter: odata`PartitionKey eq ${repository}` },
    });
    for await (const entity of iter) {
      items.push(entityToQueueItem(entity));
      if (args.limit && items.length >= args.limit) break;
    }
  } catch (err: unknown) {
    if ((err as { statusCode?: number })?.statusCode === 404) return [];
    throw err;
  }
  return items.sort(compareReviewQueueItems);
}

export function reviewQueuePriorityScore(item: ReviewQueueItem): number {
  return getReviewQueuePriority(item).score;
}

export function getReviewQueuePriority(item: ReviewQueueItem): ReviewQueuePriority {
  const reasons: string[] = [];
  if (item.decisionQueue === "blocked") reasons.push("blocked queue");
  if (item.decisionQueue === "needs_human_review") reasons.push("needs human review");
  if (item.decisionRiskLevel === "high") reasons.push("high risk");
  if (item.decisionRiskLevel === "medium") reasons.push("medium risk");
  for (const code of item.decisionReasonCodes) reasons.push(code.replace(/[._]/g, " "));
  if (item.findingCount > 0) reasons.push(`${item.findingCount} finding(s)`);
  if (item.discardedFindingCount > 0) reasons.push(`${item.discardedFindingCount} discarded finding(s)`);
  if (item.wholeFileFallbackFiles > 0) reasons.push(`${item.wholeFileFallbackFiles} whole-file fallback file(s)`);
  if (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0) reasons.push("no hunk coverage");

  const score =
    queuePriority[item.decisionQueue] +
    riskPriority[item.decisionRiskLevel] +
    item.findingCount * 10 +
    item.discardedFindingCount * 12 +
    item.wholeFileFallbackFiles * 35 +
    (item.hunkCoverageFiles === 0 && item.wholeFileFallbackFiles > 0 ? 50 : 0);

  return { score, reasons };
}

export function compareReviewQueueItems(a: ReviewQueueItem, b: ReviewQueueItem): number {
  const priorityDelta = reviewQueuePriorityScore(b) - reviewQueuePriorityScore(a);
  if (priorityDelta !== 0) return priorityDelta;
  return Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0");
}

function entityToQueueItem(entity: TableEntity<ReviewHistoryEntity>): ReviewQueueItem {
  return {
    repository: entity.partitionKey,
    pullRequestId: Number(entity.rowKey ?? 0),
    lastIterationId: Number(entity.lastIterationId ?? 0),
    findingCount: Number(entity.findingCount ?? 0),
    lastRunAt: String(entity.lastRunAt ?? ""),
    sourceCommit: String(entity.sourceCommit ?? ""),
    decisionQueue: normalizeQueue(entity.decisionQueue),
    decisionRiskLevel: normalizeRisk(entity.decisionRiskLevel),
    decisionReason: String(entity.decisionReason ?? ""),
    decisionReasonCodes: parseReasonCodes(entity.decisionReasonCodes),
    contextConfidence: normalizeContextConfidence(entity.contextConfidence),
    autoApprovedAt: String(entity.autoApprovedAt ?? ""),
    autoApprovalActor: String(entity.autoApprovalActor ?? ""),
    discardedFindingCount: Number(entity.discardedFindingCount ?? 0),
    hunkCoverageFiles: Number(entity.hunkCoverageFiles ?? 0),
    wholeFileFallbackFiles: Number(entity.wholeFileFallbackFiles ?? 0),
    changedHunkLines: Number(entity.changedHunkLines ?? 0),
    manualDisposition: normalizeManualDisposition(entity.manualDisposition),
    manualDispositionAt: String(entity.manualDispositionAt ?? ""),
    manualDispositionActor: String(entity.manualDispositionActor ?? ""),
    manualDispositionNote: String(entity.manualDispositionNote ?? ""),
    manualDispositionEvents: parseDispositionEvents(entity.manualDispositionEvents),
    manualDispositionWriteBackAttempted: Boolean(entity.manualDispositionWriteBackAttempted ?? false),
    manualDispositionWriteBackOk: Boolean(entity.manualDispositionWriteBackOk ?? false),
    manualDispositionWriteBackError: String(entity.manualDispositionWriteBackError ?? ""),
    manualDispositionWriteBackAt: String(entity.manualDispositionWriteBackAt ?? ""),
    manualDispositionWriteBackThreadId: String(entity.manualDispositionWriteBackThreadId ?? ""),
    manualDispositionWriteBackUrl: String(entity.manualDispositionWriteBackUrl ?? ""),
    manualDispositionWriteBackEvents: parseWriteBackEvents(entity.manualDispositionWriteBackEvents),
  };
}

function parseDispositionEvents(value: unknown): ReviewDispositionEvent[] {
  if (Array.isArray(value)) return value.map(normalizeDispositionEvent).filter((event): event is ReviewDispositionEvent => event !== null);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(normalizeDispositionEvent).filter((event): event is ReviewDispositionEvent => event !== null);
  } catch {
    return [];
  }
  return [];
}

function normalizeDispositionEvent(value: unknown): ReviewDispositionEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<ReviewDispositionEvent>;
  const disposition = normalizeManualDisposition(event.disposition);
  if (!disposition) return null;
  return {
    disposition,
    at: typeof event.at === "string" ? event.at : "",
    actor: typeof event.actor === "string" ? event.actor : "",
    note: typeof event.note === "string" ? event.note : "",
  };
}

function parseWriteBackEvents(value: unknown): ReviewWriteBackEvent[] {
  if (Array.isArray(value)) return value.map(normalizeWriteBackEvent).filter((event): event is ReviewWriteBackEvent => event !== null);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(normalizeWriteBackEvent).filter((event): event is ReviewWriteBackEvent => event !== null);
  } catch {
    return [];
  }
  return [];
}

function normalizeWriteBackEvent(value: unknown): ReviewWriteBackEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<ReviewWriteBackEvent>;
  const disposition = normalizeManualDisposition(event.disposition);
  if (!disposition) return null;
  return {
    disposition,
    at: typeof event.at === "string" ? event.at : "",
    ok: Boolean(event.ok),
    actor: typeof event.actor === "string" ? event.actor : "",
    note: typeof event.note === "string" ? event.note : "",
    error: typeof event.error === "string" ? event.error : "",
    threadId: typeof event.threadId === "string" ? event.threadId : "",
    url: typeof event.url === "string" ? event.url : "",
  };
}

function normalizeManualDisposition(value: unknown): ReviewQueueItem["manualDisposition"] {
  if (
    value === "acknowledged" ||
    value === "marked_safe" ||
    value === "marked_blocked" ||
    value === "changes_requested"
  ) {
    return value;
  }
  return "";
}

function parseReasonCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return value.split(";").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeContextConfidence(value: unknown): ReviewQueueItem["contextConfidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "";
}

function normalizeQueue(value: unknown): ReviewQueueItem["decisionQueue"] {
  if (value === "auto_approved" || value === "needs_human_review" || value === "blocked" || value === "watching") {
    return value;
  }
  return "needs_human_review";
}

function normalizeRisk(value: unknown): ReviewQueueItem["decisionRiskLevel"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}
