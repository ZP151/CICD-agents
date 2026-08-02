import {
  prInsightArtifactProjectLinkId,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { PullRequestContextPanel } from "./PullRequestContextPanel.js";
import {
  ActionButton,
  ActionLink,
  InlineNotice,
  StatusBadge,
} from "../../components/workbench/WorkbenchPrimitives.js";
import {
  formatDate,
  insightReadinessTone,
  readiness,
} from "./pullRequestViewModel.js";
import type {
  ContextState,
  DisplayPullRequest,
  PreviewState,
  QueueState,
} from "./pullRequestTypes.js";

export interface PullRequestCardProps {
  pr: DisplayPullRequest;
  projectLinkId: string;
  queueState: QueueState;
  previewState: PreviewState;
  insightArtifacts: PrInsightArtifact[];
  contextState: ContextState | undefined;
  isExpanded: boolean;
  highlighted: boolean;
  onToggleContext: (pr: DisplayPullRequest) => void;
  onPreviewInsight: (pr: DisplayPullRequest) => void;
  onQueueForReview: (pr: DisplayPullRequest) => void;
  onOpenInsight: (pr: DisplayPullRequest) => void;
  onOpenSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}

export function PullRequestCard({
  pr,
  projectLinkId,
  queueState,
  previewState,
  insightArtifacts,
  contextState,
  isExpanded,
  highlighted,
  onToggleContext,
  onPreviewInsight,
  onQueueForReview,
  onOpenInsight,
}: PullRequestCardProps): JSX.Element {
  const state = readiness(pr);
  const qState = queueState;
  const insightTone = previewState.phase === "done"
    ? insightReadinessTone(previewState.result.readiness)
    : null;
  const reviewTone = qState.phase === "done"
    ? insightReadinessTone(qState.result.readiness)
    : null;
  const storedInsightHistory = insightArtifacts.filter((artifact) => (
    artifact.repository === pr.repository &&
    artifact.pullRequestId === pr.id &&
    (!pr.sourceProjectLinkId || prInsightArtifactProjectLinkId(artifact) === pr.sourceProjectLinkId)
  ));
  const storedInsight = storedInsightHistory[0] ?? null;
  const storedInsightTone = storedInsight?.readiness
    ? insightReadinessTone(storedInsight.readiness)
    : null;
  const authorLabel = pr.createdBy || "Not available";
  const createdLabel = formatDate(pr.creationDate) || "Not available";
  const reviewerLabel = `${pr.voteSummary.approved} approved / ${pr.reviewerCount} total`;

  const isRunning = qState.phase === "watching" || qState.phase === "reviewing";
  const isDone = qState.phase === "done";
  const isError = qState.phase === "error";
  const hasInsight = Boolean(storedInsight || previewState.phase === "done" || isDone);
  const latestInsightSummary = isDone
    ? qState.result.summary || "Review completed."
    : previewState.phase === "done"
      ? previewState.result.summary || "Insight preview generated."
      : storedInsight?.summary || "Saved insight available.";
  const latestInsightPreview = pullRequestInsightPreviewText(latestInsightSummary);

  const decisionLabel = isDone
    ? qState.result.decisionQueue === "auto_approved" ? "Auto-approved"
    : qState.result.decisionQueue === "needs_human_review" ? "Needs review"
    : qState.result.decisionQueue === "blocked" ? "Blocked"
    : "Reviewed"
    : "";

  const decisionTone = isDone
    ? qState.result.decisionQueue === "auto_approved" ? "border-[rgb(var(--app-success))]/35 bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))]"
    : qState.result.decisionQueue === "needs_human_review" ? "border-[rgb(var(--app-warning))]/35 bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))]"
    : qState.result.decisionQueue === "blocked" ? "border-[rgb(var(--app-danger))]/35 bg-[rgb(var(--app-danger)_/_0.10)] text-[rgb(var(--app-danger))]"
    : "border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]"
    : "";
  const opensReviewQueue = isDone && (
    qState.result.decisionQueue === "needs_human_review" || qState.result.decisionQueue === "blocked"
  );

  return (
    <article
      className={`border-b border-[rgb(var(--app-border))] px-4 py-4 transition-colors last:border-b-0 ${
        highlighted
          ? "bg-[rgb(var(--app-accent-soft))]"
          : "bg-[rgb(var(--app-surface))] hover:bg-[rgb(var(--app-surface-raised))]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">#{pr.id}</span>
            <StatusBadge className={state.tone}>
              {state.label}
            </StatusBadge>
            <StatusBadge>{pr.status}</StatusBadge>
            {!projectLinkId && pr.sourceProjectLinkName && (
              <StatusBadge>
                {pr.sourceProjectLinkName}
              </StatusBadge>
            )}
          </div>
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">{pr.title || "(untitled)"}</h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-subtle))]">
            {pr.sourceBranch} {"->"} {pr.targetBranch}
          </p>
        </div>
        <div className={pullRequestActionsClass()}>
          <div className={pullRequestActionRowClass()}>
            <ActionButton
              type="button"
              tone="quiet"
              onClick={() => onToggleContext(pr)}
              className="min-h-7 px-2.5 py-1"
            >
              {isExpanded ? "Hide details" : contextState?.phase === "loaded" ? "Show details" : "Load details"}
            </ActionButton>
            <ActionButton
              type="button"
              tone="quiet"
              onClick={() => {
                if (hasInsight) {
                  onOpenInsight(pr);
                  return;
                }
                onOpenInsight(pr);
                onPreviewInsight(pr);
              }}
              loading={previewState.phase === "loading"}
              className="min-h-7 px-2.5 py-1"
            >
              {previewState.phase === "loading" ? "Generating..." : hasInsight ? "Open insight" : "Generate insight"}
            </ActionButton>
            {isDone ? (
              <>
                <StatusBadge className={decisionTone}>{decisionLabel}</StatusBadge>
                {opensReviewQueue && (
                  <ActionLink href="#/findings" tone="quiet" className="min-h-7 px-2.5 py-1">
                    Open Review Queue
                  </ActionLink>
                )}
              </>
            ) : (
              <ActionButton
                type="button"
                tone={isError ? "danger" : "primary"}
                onClick={() => onQueueForReview(pr)}
                loading={isRunning}
                className="min-h-7 px-2.5 py-1"
              >
                {qState.phase === "watching" ? "Preparing..."
                : qState.phase === "reviewing" ? "Analyzing..."
                : isError ? "Retry"
                : "Run review"}
              </ActionButton>
            )}
            {pr.url && (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
              >
                Open in ADO
              </a>
            )}
          </div>
          {isDone && (
            <p className={pullRequestActionDetailClass("muted")} title={qState.result.decisionReason}>
              {qState.result.findingCount} finding{qState.result.findingCount === 1 ? "" : "s"} · {qState.result.decisionReason}
            </p>
          )}
          {isError && (
            <p className={pullRequestActionDetailClass("danger")} title={qState.message}>
              {qState.message}
            </p>
          )}
        </div>
      </div>

      <div
        className={pullRequestMetaGridClass()}
        title={`Author: ${authorLabel}; Created: ${createdLabel}; Reviewers: ${reviewerLabel}`}
      >
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Author:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{authorLabel}</span>
        </span>
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Created:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{createdLabel}</span>
        </span>
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Reviewers:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{reviewerLabel}</span>
        </span>
      </div>

      {hasInsight && (
        <button
          type="button"
          onClick={() => onOpenInsight(pr)}
          className="mt-3 block w-full rounded-lg bg-[rgb(var(--app-surface-raised))] px-3 py-2.5 text-left transition hover:bg-[rgb(var(--app-control-hover))]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Latest insight</p>
            {(reviewTone || insightTone || storedInsightTone) && (
              <StatusBadge className={(reviewTone ?? insightTone ?? storedInsightTone)!.tone}>
                {(reviewTone ?? insightTone ?? storedInsightTone)!.label}
              </StatusBadge>
            )}
          </div>
          <p className={pullRequestInsightPreviewClass()}>
            {latestInsightPreview}
          </p>
        </button>
      )}

      {previewState.phase === "error" && (
        <div className="mt-3"><InlineNotice tone="danger" title="Insight generation failed">{previewState.message}</InlineNotice></div>
      )}
      {isExpanded && <PullRequestContextPanel state={contextState} />}
    </article>
  );
}

export function pullRequestActionsClass(): string {
  return "flex w-full max-w-full flex-col items-start gap-1.5 md:min-w-[220px] md:flex-1 md:items-end";
}

export function pullRequestActionRowClass(): string {
  return "flex w-full min-w-0 flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end";
}

export function pullRequestMetaGridClass(): string {
  return "mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[rgb(var(--app-text-muted))]";
}

export function pullRequestInsightPreviewClass(): string {
  return "mt-1 max-w-[72ch] truncate text-xs leading-relaxed text-[rgb(var(--app-text-muted))]";
}

export function pullRequestActionDetailClass(tone: "muted" | "danger"): string {
  const color =
    tone === "danger"
      ? "text-[rgb(var(--app-danger))]"
      : "text-[rgb(var(--app-text-subtle))]";
  return `w-full max-w-full truncate text-left text-[10px] leading-relaxed ${color} md:max-w-xs md:text-right`;
}

export function pullRequestInsightPreviewText(markdown: string): string {
  const fallback = "Open the latest insight details.";
  const meaningfulLine = markdown
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => stripMarkdownLine(line))
    .find((line) => (
      line.length > 0 &&
      !line.endsWith(":") &&
      !/^PR Insight Summary\b/i.test(line)
    ));
  const text = (meaningfulLine || fallback).replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trimEnd()}...`;
}

function stripMarkdownLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}
