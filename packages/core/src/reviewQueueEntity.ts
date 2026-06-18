import type { TableEntity } from "@azure/data-tables";
import type {
  ReviewDispositionEvent,
  ReviewQueueItem,
  ReviewWriteBackEvent,
} from "./reviewQueueTypes.js";

export type ReviewHistoryEntity = {
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

export function entityToQueueItem(entity: TableEntity<ReviewHistoryEntity>): ReviewQueueItem {
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
  if (Array.isArray(value)) {
    return value.map(normalizeDispositionEvent).filter((event): event is ReviewDispositionEvent => event !== null);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeDispositionEvent).filter((event): event is ReviewDispositionEvent => event !== null);
    }
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
  if (Array.isArray(value)) {
    return value.map(normalizeWriteBackEvent).filter((event): event is ReviewWriteBackEvent => event !== null);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeWriteBackEvent).filter((event): event is ReviewWriteBackEvent => event !== null);
    }
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
