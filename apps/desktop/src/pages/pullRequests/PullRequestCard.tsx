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
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
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

  const isRunning = qState.phase === "watching" || qState.phase === "reviewing";
  const isDone = qState.phase === "done";
  const isError = qState.phase === "error";
  const hasInsight = Boolean(storedInsight || previewState.phase === "done" || isDone);

  const decisionLabel = isDone
    ? qState.result.decisionQueue === "auto_approved" ? "Auto-approved"
    : qState.result.decisionQueue === "needs_human_review" ? "Needs review"
    : qState.result.decisionQueue === "blocked" ? "Blocked"
    : "Reviewed"
    : "";

  const decisionTone = isDone
    ? qState.result.decisionQueue === "auto_approved" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : qState.result.decisionQueue === "needs_human_review" ? "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
    : qState.result.decisionQueue === "blocked" ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    : "";

  const buttonClass = `rounded-md border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
    isDone ? `${decisionTone} cursor-default`
    : isError ? "border-red-500/35 text-red-700 hover:bg-red-500/10 dark:text-red-300"
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
            <span className="font-mono text-xs text-[rgb(var(--app-accent))]">#{pr.id}</span>
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
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
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
            <p className="max-w-xs truncate text-right text-[10px] leading-relaxed text-[rgb(var(--app-text-subtle))]" title={qState.result.decisionReason}>
              {qState.result.findingCount} finding{qState.result.findingCount === 1 ? "" : "s"} · {qState.result.decisionReason}
            </p>
          )}
          {isError && (
            <p className="max-w-xs truncate text-right text-[10px] text-red-500" title={qState.message}>
              {qState.message}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[rgb(var(--app-text-muted))] sm:grid-cols-3">
        <div>
          <p className="text-[rgb(var(--app-text-subtle))]">Author</p>
          <p className="mt-1 truncate text-[rgb(var(--app-text))]">
            {pr.createdBy || "Not available"}
          </p>
        </div>
        <div>
          <p className="text-[rgb(var(--app-text-subtle))]">Created</p>
          <p className="mt-1 truncate text-[rgb(var(--app-text))]">
            {formatDate(pr.creationDate) || "Not available"}
          </p>
        </div>
        <div>
          <p className="text-[rgb(var(--app-text-subtle))]">Reviewers</p>
          <p className="mt-1 text-[rgb(var(--app-text))]">
            {pr.voteSummary.approved} approved / {pr.reviewerCount} total
          </p>
        </div>
      </div>

      {hasInsight && (
        <button
          type="button"
          onClick={() => onOpenInsight(pr)}
          className="mt-4 block w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3 text-left transition hover:border-[rgb(var(--app-border-strong))]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Latest insight</p>
            {(reviewTone || insightTone || storedInsightTone) && (
              <span className={`rounded border px-2 py-0.5 text-[10px] ${(reviewTone ?? insightTone ?? storedInsightTone)!.tone}`}>
                {(reviewTone ?? insightTone ?? storedInsightTone)!.label}
              </span>
            )}
          </div>
          <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
            <MarkdownContent
              markdown={
                isDone
                  ? qState.result.summary || "Review completed."
                  : previewState.phase === "done"
                    ? previewState.result.summary || "Insight preview generated."
                    : storedInsight?.summary || "Saved insight available."
              }
            />
          </div>
        </button>
      )}

      {previewState.phase === "error" && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {previewState.message}
        </p>
      )}
      {isExpanded && <PullRequestContextPanel state={contextState} />}
    </article>
  );
}
