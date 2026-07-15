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
    ? qState.result.decisionQueue === "auto_approved" ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-400"
    : qState.result.decisionQueue === "needs_human_review" ? "border-yellow-800/60 bg-yellow-950/20 text-yellow-400"
    : qState.result.decisionQueue === "blocked" ? "border-red-800/60 bg-red-950/20 text-red-400"
    : "border-blue-800/60 bg-blue-950/20 text-blue-400"
    : "";

  const buttonClass = `rounded-md border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
    isDone ? `${decisionTone} cursor-default`
    : isError ? "border-red-800/60 text-red-400 hover:border-red-700 hover:text-red-300"
    : isRunning ? "border-zinc-700 text-zinc-500 cursor-wait"
    : "border-zinc-700 text-zinc-400 hover:border-blue-700 hover:text-blue-300"
  }`;

  return (
    <article
      className={`rounded-lg border p-4 transition ${
        highlighted
          ? "border-blue-700/70 bg-blue-950/20 shadow-[0_0_0_1px_rgba(29,78,216,0.25)]"
          : "border-zinc-800/70 bg-zinc-900/30"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-blue-400">#{pr.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${state.tone}`}>
              {state.label}
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{pr.status}</span>
            {!projectLinkId && pr.sourceProjectLinkName && (
              <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                {pr.sourceProjectLinkName}
              </span>
            )}
          </div>
          <h3 className="truncate text-sm font-semibold text-zinc-100">{pr.title || "(untitled)"}</h3>
          <p className="mt-1 truncate font-mono text-xs text-zinc-600">
            {pr.sourceBranch} {"->"} {pr.targetBranch}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleContext(pr)}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
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
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-60"
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
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
              >
                Open in ADO
              </a>
            )}
          </div>
          {isDone && (
            <p className="max-w-xs truncate text-right text-[10px] leading-relaxed text-zinc-500" title={qState.result.decisionReason}>
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

      <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
        <div>
          <p className="text-zinc-700">Author</p>
          <p className="mt-1 truncate text-zinc-400">{pr.createdBy || "Unknown"}</p>
        </div>
        <div>
          <p className="text-zinc-700">Created</p>
          <p className="mt-1 truncate text-zinc-400">{formatDate(pr.creationDate) || "Unknown"}</p>
        </div>
        <div>
          <p className="text-zinc-700">Reviewers</p>
          <p className="mt-1 text-zinc-400">
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
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
            {isDone
              ? qState.result.summary || "Review completed."
              : previewState.phase === "done"
                ? previewState.result.summary || "Insight preview generated."
                : storedInsight?.summary || "Saved insight available."}
          </p>
        </button>
      )}

      {previewState.phase === "error" && (
        <p className="mt-3 rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
          {previewState.message}
        </p>
      )}
      {isExpanded && <PullRequestContextPanel state={contextState} />}
    </article>
  );
}
