import { useState } from "react";
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
import { StatusBadge } from "../../components/workbench/WorkbenchPrimitives.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu.js";

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
            <StatusBadge className={riskTone(item.decisionRiskLevel)}>
              {item.decisionRiskLevel}
            </StatusBadge>
            <StatusBadge>
              {item.decisionQueue.replace(/_/g, " ")}
            </StatusBadge>
            <StatusBadge className={
              freshness.stale
                ? "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/30"
                : "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/30"
            }>
              {freshness.label}
            </StatusBadge>
            {auditSummary.hasAudit && (
              <StatusBadge
                className={`max-w-[14rem] truncate ${
                  auditSummary.tone === "success"
                    ? "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/30"
                    : auditSummary.tone === "warning"
                      ? "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/30"
                      : "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]"
                }`}
                title={`Audit: ${auditSummary.label}${auditSummary.threadId ? ` · thread ${auditSummary.threadId}` : ""}`}
              >
                {auditSummary.label}
              </StatusBadge>
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
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            Actions
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Review disposition actions">
          <DropdownMenuItem
            disabled={isDispositionSaving}
            onSelect={() => onApplyDisposition(item, "acknowledged")}
          >
            {isDispositionSaving ? "Saving..." : "Acknowledge"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDispositionSaving}
            onSelect={() => onApplyDisposition(item, "marked_safe")}
            className="text-[rgb(var(--app-success))] data-[highlighted]:bg-[rgb(var(--app-success-soft))] data-[highlighted]:text-[rgb(var(--app-success))]"
          >
            Mark safe
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDispositionSaving}
            onSelect={() => onApplyDisposition(item, "marked_blocked")}
            className="text-[rgb(var(--app-danger))] data-[highlighted]:bg-[rgb(var(--app-danger-soft))] data-[highlighted]:text-[rgb(var(--app-danger))]"
          >
            Block
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDispositionSaving}
            onSelect={() => onApplyDisposition(item, "changes_requested")}
            className="text-[rgb(var(--app-warning))] data-[highlighted]:bg-[rgb(var(--app-warning-soft))] data-[highlighted]:text-[rgb(var(--app-warning))]"
          >
            Request changes
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
