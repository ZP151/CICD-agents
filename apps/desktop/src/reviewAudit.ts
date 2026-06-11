import type { ReviewQueueItem } from "./api";

export interface ReviewAuditDispositionEventView {
  label: string;
  at: string;
  actor: string;
  note: string;
}

export interface ReviewAuditWriteBackSummaryView {
  statusLabel: "posted" | "not posted";
  ok: boolean;
  at: string;
  error: string;
  threadId: string;
  url: string;
}

export interface ReviewAuditWriteBackAttemptView {
  statusLabel: "Posted" | "Failed";
  dispositionLabel: string;
  ok: boolean;
  at: string;
  actor: string;
  note: string;
  error: string;
  threadId: string;
  url: string;
}

export interface ReviewAuditViewModel {
  hasAudit: boolean;
  dispositionSummary: string;
  dispositionAt: string;
  dispositionEvents: ReviewAuditDispositionEventView[];
  writeBackSummary: ReviewAuditWriteBackSummaryView | null;
  writeBackAttempts: ReviewAuditWriteBackAttemptView[];
}

export interface ReviewAuditCardSummary {
  hasAudit: boolean;
  label: string;
  tone: "neutral" | "success" | "warning";
  dispositionCount: number;
  writeBackAttemptCount: number;
  latestDispositionLabel: string;
  latestWriteBackLabel: string;
  threadId: string;
  url: string;
}

export function dispositionLabel(value: ReviewQueueItem["manualDisposition"]): string {
  const map: Record<ReviewQueueItem["manualDisposition"], string> = {
    "": "",
    acknowledged: "Acknowledged",
    marked_safe: "Marked safe",
    marked_blocked: "Marked blocked",
    changes_requested: "Changes requested",
  };
  return map[value] ?? value;
}

export function buildReviewAuditViewModel(item: ReviewQueueItem): ReviewAuditViewModel {
  const dispositionEvents = (item.manualDispositionEvents ?? [])
    .slice()
    .reverse()
    .map((event) => ({
      label: dispositionLabel(event.disposition),
      at: event.at,
      actor: event.actor || "unknown actor",
      note: event.note,
    }));

  const writeBackSummary = item.manualDispositionWriteBackAttempted
    ? {
        statusLabel: item.manualDispositionWriteBackOk ? "posted" as const : "not posted" as const,
        ok: item.manualDispositionWriteBackOk,
        at: item.manualDispositionWriteBackAt,
        error: item.manualDispositionWriteBackError,
        threadId: item.manualDispositionWriteBackThreadId,
        url: item.manualDispositionWriteBackUrl,
      }
    : null;

  const writeBackAttempts = (item.manualDispositionWriteBackEvents ?? [])
    .slice()
    .reverse()
    .map((event) => ({
      statusLabel: event.ok ? "Posted" as const : "Failed" as const,
      dispositionLabel: dispositionLabel(event.disposition),
      ok: event.ok,
      at: event.at,
      actor: event.actor || "unknown actor",
      note: event.note,
      error: event.error,
      threadId: event.threadId,
      url: event.url,
    }));

  const dispositionSummary = item.manualDisposition
    ? `${dispositionLabel(item.manualDisposition)} by ${item.manualDispositionActor || "unknown actor"}`
    : "No manual disposition recorded";

  return {
    hasAudit: dispositionEvents.length > 0 || writeBackAttempts.length > 0 || item.manualDispositionWriteBackAttempted,
    dispositionSummary,
    dispositionAt: item.manualDispositionAt,
    dispositionEvents,
    writeBackSummary,
    writeBackAttempts,
  };
}

export function buildReviewAuditCardSummary(item: ReviewQueueItem): ReviewAuditCardSummary {
  const dispositionCount = item.manualDispositionEvents?.length ?? 0;
  const writeBackAttemptCount = item.manualDispositionWriteBackEvents?.length ?? 0;
  const latestDispositionLabel = item.manualDisposition
    ? dispositionLabel(item.manualDisposition)
    : "";
  const latestWriteBackLabel = item.manualDispositionWriteBackAttempted
    ? item.manualDispositionWriteBackOk
      ? "ADO posted"
      : "ADO pending"
    : "";

  const hasAudit = Boolean(
    latestDispositionLabel ||
    dispositionCount > 0 ||
    item.manualDispositionWriteBackAttempted ||
    writeBackAttemptCount > 0,
  );

  const tone: ReviewAuditCardSummary["tone"] = item.manualDispositionWriteBackAttempted
    ? item.manualDispositionWriteBackOk
      ? "success"
      : "warning"
    : hasAudit
      ? "neutral"
      : "neutral";

  const pieces = hasAudit
    ? [
        latestDispositionLabel || "No disposition",
        latestWriteBackLabel,
        dispositionCount > 0 ? `${dispositionCount} audit event${dispositionCount === 1 ? "" : "s"}` : "",
        writeBackAttemptCount > 0 ? `${writeBackAttemptCount} write-back attempt${writeBackAttemptCount === 1 ? "" : "s"}` : "",
      ].filter(Boolean)
    : [];

  return {
    hasAudit,
    label: pieces.length > 0 ? pieces.join(" · ") : "No manual audit",
    tone,
    dispositionCount,
    writeBackAttemptCount,
    latestDispositionLabel,
    latestWriteBackLabel,
    threadId: item.manualDispositionWriteBackThreadId,
    url: item.manualDispositionWriteBackUrl,
  };
}
