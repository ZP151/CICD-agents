import { useEffect, useRef, useState } from "react";
import type { ReviewQueueItem } from "../../api.js";
import { buildReviewAuditCardSummary, dispositionLabel } from "../../reviewAudit.js";
import { loadFindingsLocal, reviewQueuePriorityReasons } from "../../reviewHistoryLocal.js";
import {
  reviewQueueFreshnessStatus,
  reviewQueueItemKey,
} from "../../reviewRunHistory.js";
import {
  formatDate,
  riskTone,
  shortCommit,
} from "./reviewQueueViewModel.js";

export interface ReviewQueueCardProps {
  item: ReviewQueueItem;
  projectLinkId: string;
  staleAgeHours: number;
  writeBackRetrying: Record<string, boolean>;
  rerunning: Record<string, boolean>;
  dispositionSaving: Record<string, boolean>;
  onOpenFindings: (item: ReviewQueueItem) => void;
  onRerunReview: (item: ReviewQueueItem) => void;
  onRetryDispositionWriteBack: (item: ReviewQueueItem) => void;
  onApplyDisposition: (item: ReviewQueueItem, disposition: ReviewQueueItem["manualDisposition"]) => void;
}

export function ReviewQueueCard({
  item,
  projectLinkId,
  staleAgeHours,
  writeBackRetrying,
  rerunning,
  dispositionSaving,
  onOpenFindings,
  onRerunReview,
  onRetryDispositionWriteBack,
  onApplyDisposition,
}: ReviewQueueCardProps): JSX.Element {
  const storedFindings = loadFindingsLocal(item.repository, item.pullRequestId, projectLinkId);
  const hasFindings = item.findingCount > 0 || storedFindings.length > 0;
  const attentionReasons = reviewQueuePriorityReasons(item);
  const itemKey = reviewQueueItemKey(item);
  const isRetryingWriteBack = Boolean(writeBackRetrying[itemKey]);
  const isRerunning = Boolean(rerunning[itemKey]);
  const isDispositionSaving = Boolean(dispositionSaving[itemKey]);
  const freshness = reviewQueueFreshnessStatus(item, Date.now(), staleAgeHours);
  const auditSummary = buildReviewAuditCardSummary(item);
  const detailTitle = reviewQueueCardDetailTitle({
    item,
    attentionReasons,
    auditLabel: auditSummary.hasAudit ? auditSummary.label : "",
    auditThreadId: auditSummary.threadId ?? "",
  });

  return (
    <article
      className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3"
      title={detailTitle || undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">#{item.pullRequestId}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${riskTone(item.decisionRiskLevel)}`}>
              {item.decisionRiskLevel}
            </span>
            <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {item.decisionQueue.replace(/_/g, " ")}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
              freshness.stale
                ? "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/30"
                : "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/30"
            }`}>
              {freshness.label}
            </span>
            {auditSummary.hasAudit && (
              <span
                className={`max-w-[14rem] truncate rounded-full px-2 py-0.5 text-[10px] ring-1 ${
                  auditSummary.tone === "success"
                    ? "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/30"
                    : auditSummary.tone === "warning"
                      ? "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/30"
                      : "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]"
                }`}
                title={`Audit: ${auditSummary.label}${auditSummary.threadId ? ` · thread ${auditSummary.threadId}` : ""}`}
              >
                {auditSummary.label}
              </span>
            )}
          </div>
          <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">{item.decisionReason || "No decision reason recorded."}</p>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-subtle))]">
            iteration {item.lastIterationId} · {shortCommit(item.sourceCommit)} · {formatDate(item.lastRunAt)}
          </p>
          {(item.autoApprovedAt || item.autoApprovalActor) && (
            <p className="mt-1 text-xs text-[rgb(var(--app-text-subtle))]">
              Auto-approval: {item.autoApprovedAt ? formatDate(item.autoApprovedAt) : "not recorded"}
              {item.autoApprovalActor ? ` · ${item.autoApprovalActor}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className={reviewQueueCardFooterClass()}>
        <div className={reviewQueueCardMetricsGridClass()}>
          <span title={`${item.findingCount} findings`}>findings {item.findingCount}</span>
          <span title={`${item.discardedFindingCount} discarded findings`}>discarded {item.discardedFindingCount}</span>
          <span title={`${item.hunkCoverageFiles} changed files and ${item.changedHunkLines} changed lines covered by hunks`}>
            hunks {item.hunkCoverageFiles}f/{item.changedHunkLines}l
          </span>
          <span title={`${item.wholeFileFallbackFiles} files required whole-file fallback`}>
            fallback {item.wholeFileFallbackFiles}f
          </span>
        </div>
        <ReviewQueueCardActions
          item={item}
          hasFindings={hasFindings}
          storedFindingsCount={storedFindings.length}
          isRerunning={isRerunning}
          isRetryingWriteBack={isRetryingWriteBack}
          isDispositionSaving={isDispositionSaving}
          onOpenFindings={onOpenFindings}
          onRerunReview={onRerunReview}
          onRetryDispositionWriteBack={onRetryDispositionWriteBack}
          onApplyDisposition={onApplyDisposition}
        />
      </div>
    </article>
  );
}

export function reviewQueueCardMetricsGridClass(): string {
  return "flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11px] text-[rgb(var(--app-text-muted))] [&>span]:rounded-full [&>span]:border [&>span]:border-[rgb(var(--app-border))] [&>span]:bg-[rgb(var(--app-surface-raised))] [&>span]:px-2 [&>span]:py-0.5";
}

export function reviewQueueCardFooterClass(): string {
  return "mt-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2";
}

export function reviewQueueCardActionsClass(): string {
  return "flex min-w-0 flex-wrap justify-start gap-1 sm:justify-end";
}

export function reviewQueueCardDetailTitle({
  item,
  attentionReasons,
  auditLabel,
  auditThreadId,
}: {
  item: ReviewQueueItem;
  attentionReasons: string[];
  auditLabel: string;
  auditThreadId: string;
}): string {
  return [
    attentionReasons.length > 0 ? `Attention: ${attentionReasons.join(" · ")}` : "",
    item.autoApprovedAt || item.autoApprovalActor
      ? `Auto-approval: ${item.autoApprovedAt ? formatDate(item.autoApprovedAt) : "not recorded"}${
          item.autoApprovalActor ? ` · ${item.autoApprovalActor}` : ""
        }`
      : "",
    auditLabel ? `Audit: ${auditLabel}${auditThreadId ? ` · thread ${auditThreadId}` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function ReviewQueueCardActions({
  item,
  hasFindings,
  storedFindingsCount,
  isRerunning,
  isRetryingWriteBack,
  isDispositionSaving,
  onOpenFindings,
  onRerunReview,
  onRetryDispositionWriteBack,
  onApplyDisposition,
}: {
  item: ReviewQueueItem;
  hasFindings: boolean;
  storedFindingsCount: number;
  isRerunning: boolean;
  isRetryingWriteBack: boolean;
  isDispositionSaving: boolean;
  onOpenFindings: (item: ReviewQueueItem) => void;
  onRerunReview: (item: ReviewQueueItem) => void;
  onRetryDispositionWriteBack: (item: ReviewQueueItem) => void;
  onApplyDisposition: (item: ReviewQueueItem, disposition: ReviewQueueItem["manualDisposition"]) => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const applyDisposition = (disposition: ReviewQueueItem["manualDisposition"]) => {
    setMenuOpen(false);
    onApplyDisposition(item, disposition);
  };

  return (
    <div className={reviewQueueCardActionsClass()}>
      {hasFindings && (
        <button
          type="button"
          onClick={() => onOpenFindings(item)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
        >
          View findings
          {storedFindingsCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {storedFindingsCount}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        disabled={isRerunning}
        onClick={() => onRerunReview(item)}
        className="rounded-md border border-[rgb(var(--app-accent))]/30 px-2.5 py-1 text-xs text-[rgb(var(--app-accent-readable))] transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRerunning ? "Rerunning..." : "Rerun review"}
      </button>
      {item.manualDisposition &&
        (item.manualDisposition === "marked_blocked" || item.manualDisposition === "changes_requested") &&
        !item.manualDispositionWriteBackOk && (
          <button
            type="button"
            disabled={isRetryingWriteBack}
            onClick={() => onRetryDispositionWriteBack(item)}
            className="rounded-md border border-[rgb(var(--app-accent))]/30 px-2.5 py-1 text-xs text-[rgb(var(--app-accent-readable))] transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetryingWriteBack ? "Retrying..." : "Retry ADO"}
          </button>
        )}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
        >
          Actions
        </button>
        <div
          hidden={!menuOpen}
          className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-1 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1.5 shadow-lg"
        >
          <button
            type="button"
            disabled={isDispositionSaving}
            onClick={() => applyDisposition("acknowledged")}
            className="rounded-md px-2.5 py-1 text-left text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDispositionSaving ? "Saving..." : "Acknowledge"}
          </button>
          <button
            type="button"
            disabled={isDispositionSaving}
            onClick={() => applyDisposition("marked_safe")}
            className="rounded-md px-2.5 py-1 text-left text-xs text-[rgb(var(--app-success))] transition hover:bg-[rgb(var(--app-success)_/_0.10)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark safe
          </button>
          <button
            type="button"
            disabled={isDispositionSaving}
            onClick={() => applyDisposition("marked_blocked")}
            className="rounded-md px-2.5 py-1 text-left text-xs text-[rgb(var(--app-danger))] transition hover:bg-[rgb(var(--app-danger)_/_0.10)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Block
          </button>
          <button
            type="button"
            disabled={isDispositionSaving}
            onClick={() => applyDisposition("changes_requested")}
            className="rounded-md px-2.5 py-1 text-left text-xs text-[rgb(var(--app-warning))] transition hover:bg-[rgb(var(--app-warning)_/_0.10)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Request changes
          </button>
        </div>
      </div>
    </div>
  );
}
