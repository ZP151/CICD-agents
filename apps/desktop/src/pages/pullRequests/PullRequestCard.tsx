import {
  prInsightArtifactProjectLinkId,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { PullRequestContextPanel } from "./PullRequestContextPanel.js";
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

  const buttonClass = `rounded-md border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
    isDone ? `${decisionTone} cursor-default`
    : isError ? "border-[rgb(var(--app-danger))]/35 text-[rgb(var(--app-danger))] hover:bg-[rgb(var(--app-danger)_/_0.10)]"
    : isRunning ? "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-subtle))] cursor-wait"
    : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
  }`;

  return (
    <article
      className={`rounded-lg border p-4 transition ${
        highlighted
          ? "border-[rgb(var(--app-accent))]/60 bg-[rgb(var(--app-accent-soft))] shadow-[0_0_0_1px_rgba(var(--app-accent),0.22)]"
          : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">#{pr.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${state.tone}`}>
              {state.label}
            </span>
            <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">{pr.status}</span>
            {!projectLinkId && pr.sourceProjectLinkName && (
              <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
                {pr.sourceProjectLinkName}
              </span>
            )}
          </div>
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">{pr.title || "(untitled)"}</h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-subtle))]">
            {pr.sourceBranch} {"->"} {pr.targetBranch}
          </p>
        </div>
        <div className={pullRequestActionsClass()}>
          <div className={pullRequestActionRowClass()}>
            <button
              onClick={() => onToggleContext(pr)}
              className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
            >
              {isExpanded ? "Hide details" : contextState?.phase === "loaded" ? "Show details" : "Load details"}
            </button>
            <button
              onClick={() => {
                if (hasInsight) {
                  onOpenInsight(pr);
                  return;
                }
                onOpenInsight(pr);
                onPreviewInsight(pr);
              }}
              disabled={previewState.phase === "loading"}
              className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
            >
              {previewState.phase === "loading" ? "Generating..." : hasInsight ? "Open insight" : "Generate insight"}
            </button>
            <button
              onClick={() => onQueueForReview(pr)}
              disabled={isRunning || isDone}
              className={buttonClass}
            >
              {qState.phase === "watching" ? "Preparing..."
              : qState.phase === "reviewing" ? "Analyzing..."
              : isDone ? decisionLabel
              : isError ? "Retry"
              : "Run review"}
            </button>
            {pr.url && (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
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
          className="mt-4 block w-full border-t border-[rgb(var(--app-border))] pt-3 text-left transition hover:border-[rgb(var(--app-border-strong))]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Latest insight</p>
            {(reviewTone || insightTone || storedInsightTone) && (
              <span className={`rounded border px-2 py-0.5 text-[10px] ${(reviewTone ?? insightTone ?? storedInsightTone)!.tone}`}>
                {(reviewTone ?? insightTone ?? storedInsightTone)!.label}
              </span>
            )}
          </div>
          <p className={pullRequestInsightPreviewClass()} title={latestInsightSummary}>
            {latestInsightPreview}
          </p>
        </button>
      )}

      {previewState.phase === "error" && (
        <p className="mt-3 rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] px-3 py-2 text-xs text-[rgb(var(--app-danger))]">
          {previewState.message}
        </p>
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
