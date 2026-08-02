import { useState } from "react";
import type { ReviewQueueItem } from "../../api.js";
import { buildReviewAuditCardSummary } from "../../reviewAudit.js";
import { loadFindingsLocal } from "../../reviewHistoryLocal.js";
import {
  reviewQueueFreshnessStatus,
  reviewQueueItemKey,
} from "../../reviewRunHistory.js";
import {
  formatDate,
  riskTone,
  shortCommit,
} from "./reviewQueueViewModel.js";
import { ActionButton, StatusBadge } from "../../components/workbench/WorkbenchPrimitives.js";
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
  const hasStoredFindings = storedFindings.length > 0;
  const itemKey = reviewQueueItemKey(item);
  const isRetryingWriteBack = Boolean(writeBackRetrying[itemKey]);
  const isRerunning = Boolean(rerunning[itemKey]);
  const isDispositionSaving = Boolean(dispositionSaving[itemKey]);
  const freshness = reviewQueueFreshnessStatus(item, Date.now(), staleAgeHours);
  const auditSummary = buildReviewAuditCardSummary(item);

  return (
    <article className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
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
                aria-label={`Audit status: ${auditSummary.label}${auditSummary.threadId ? `, thread ${auditSummary.threadId}` : ""}`}
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
          <span aria-label={hasStoredFindings
            ? `${storedFindings.length} findings available to inspect`
            : item.findingCount > 0
              ? `${item.findingCount} findings were recorded, but detailed records are unavailable. Rerun the review to restore them.`
              : "No findings recorded"}
          >
            {hasStoredFindings ? `findings ${storedFindings.length}` : item.findingCount > 0 ? `summary ${item.findingCount}` : "findings 0"}
          </span>
          <span aria-label={`${item.discardedFindingCount} discarded findings`}>discarded {item.discardedFindingCount}</span>
          <span aria-label={`${item.hunkCoverageFiles} changed files and ${item.changedHunkLines} changed lines covered by hunks`}>
            hunks {item.hunkCoverageFiles}f/{item.changedHunkLines}l
          </span>
          <span aria-label={`${item.wholeFileFallbackFiles} files required whole-file fallback`}>
            fallback {item.wholeFileFallbackFiles}f
          </span>
        </div>
        <ReviewQueueCardActions
          item={item}
          hasStoredFindings={hasStoredFindings}
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

function ReviewQueueCardActions({
  item,
  hasStoredFindings,
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
  hasStoredFindings: boolean;
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
      <ActionButton
        type="button"
        onClick={() => onOpenFindings(item)}
        className="min-h-7 px-2.5 py-1"
      >
        {hasStoredFindings ? "View findings" : "Review summary"}
        {(storedFindingsCount > 0 || item.findingCount > 0) && (
          <span className="ml-1.5 rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
            {hasStoredFindings ? storedFindingsCount : item.findingCount}
          </span>
        )}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={isRerunning}
        onClick={() => onRerunReview(item)}
        loading={isRerunning}
        className="min-h-7 px-2.5 py-1"
      >
        {isRerunning ? "Rerunning..." : "Rerun review"}
      </ActionButton>
      {item.manualDisposition &&
        (item.manualDisposition === "marked_blocked" || item.manualDisposition === "changes_requested") &&
        !item.manualDispositionWriteBackOk && (
          <ActionButton
            type="button"
            disabled={isRetryingWriteBack}
            onClick={() => onRetryDispositionWriteBack(item)}
            loading={isRetryingWriteBack}
            className="min-h-7 px-2.5 py-1"
          >
            {isRetryingWriteBack ? "Retrying..." : "Retry ADO"}
          </ActionButton>
        )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <ActionButton
            type="button"
            tone="secondary"
            className="min-h-7 px-2.5 py-1"
          >
            Actions
          </ActionButton>
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
