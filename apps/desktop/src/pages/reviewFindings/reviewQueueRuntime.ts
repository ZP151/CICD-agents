import type { ReviewQueueItem } from "../../api.js";
import { dispositionLabel } from "../../reviewAudit.js";
import { DEFAULT_STALE_REVIEW_AGE_HOURS } from "../../reviewRunHistory.js";

export type ManualDisposition = ReviewQueueItem["manualDisposition"];

export interface ManualDispositionOptions {
  actor: string;
  now: string;
}

export function normalizeStaleAgeHours(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_STALE_REVIEW_AGE_HOURS;
}

export function requiresDispositionWriteBack(disposition: ManualDisposition): boolean {
  return disposition === "marked_blocked" || disposition === "changes_requested";
}

export function buildManualDispositionUpdate(
  item: ReviewQueueItem,
  disposition: ManualDisposition,
  options: ManualDispositionOptions,
): ReviewQueueItem {
  const note = dispositionLabel(disposition);
  const writeBackRequired = requiresDispositionWriteBack(disposition);
  const event = {
    disposition,
    at: options.now,
    actor: options.actor,
    note,
  };

  return {
    ...item,
    manualDisposition: disposition,
    manualDispositionAt: options.now,
    manualDispositionActor: options.actor,
    manualDispositionNote: note,
    manualDispositionEvents: [...(item.manualDispositionEvents ?? []), event],
    manualDispositionWriteBackAttempted: writeBackRequired,
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "",
    manualDispositionWriteBackAt: "",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: item.manualDispositionWriteBackEvents ?? [],
    decisionQueue: manualDispositionDecisionQueue(item, disposition),
    decisionRiskLevel: manualDispositionRiskLevel(item, disposition),
    decisionReason: manualDispositionReason(item, disposition, options.actor),
  };
}

export function buildRetryDispositionWriteBackUpdate(item: ReviewQueueItem): ReviewQueueItem {
  return {
    ...item,
    manualDispositionWriteBackAttempted: true,
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "",
    manualDispositionWriteBackAt: "",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: item.manualDispositionWriteBackEvents ?? [],
  };
}

export function isSameReviewQueueItem(
  left: Pick<ReviewQueueItem, "repository" | "pullRequestId"> | null,
  right: Pick<ReviewQueueItem, "repository" | "pullRequestId">,
): boolean {
  return Boolean(
    left && left.repository === right.repository && left.pullRequestId === right.pullRequestId,
  );
}

export function replaceReviewQueueItem(
  items: ReviewQueueItem[],
  source: Pick<ReviewQueueItem, "repository" | "pullRequestId">,
  next: ReviewQueueItem,
): ReviewQueueItem[] {
  return items.map((current) => (isSameReviewQueueItem(current, source) ? next : current));
}

export function replaceSelectedReviewQueueItem(
  current: ReviewQueueItem | null,
  source: Pick<ReviewQueueItem, "repository" | "pullRequestId">,
  next: ReviewQueueItem,
): ReviewQueueItem | null {
  return isSameReviewQueueItem(current, source) ? next : current;
}

function manualDispositionDecisionQueue(
  item: ReviewQueueItem,
  disposition: ManualDisposition,
): ReviewQueueItem["decisionQueue"] {
  if (disposition === "marked_blocked" || disposition === "changes_requested") return "blocked";
  if (disposition === "marked_safe") return "auto_approved";
  return item.decisionQueue;
}

function manualDispositionRiskLevel(
  item: ReviewQueueItem,
  disposition: ManualDisposition,
): ReviewQueueItem["decisionRiskLevel"] {
  if (disposition === "marked_blocked" || disposition === "changes_requested") return "high";
  if (disposition === "marked_safe") return "low";
  return item.decisionRiskLevel;
}

function manualDispositionReason(
  item: ReviewQueueItem,
  disposition: ManualDisposition,
  actor: string,
): string {
  if (disposition === "acknowledged") return `Acknowledged by ${actor}. ${item.decisionReason}`;
  if (disposition === "marked_safe") return "Manually marked safe in Review Queue.";
  if (disposition === "marked_blocked") return "Manually marked blocked in Review Queue.";
  if (disposition === "changes_requested") return "Changes requested from Review Queue.";
  return item.decisionReason;
}
