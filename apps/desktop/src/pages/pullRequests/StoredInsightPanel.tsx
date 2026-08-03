import {
  prInsightArtifactFreshness,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { ActionButton, StatusBadge } from "../../components/workbench/WorkbenchPrimitives.js";
import { formatDate, insightReadinessTone } from "./pullRequestViewModel.js";
import type { DisplayPullRequest } from "./pullRequestTypes.js";

export function StoredInsightPanel({
  pr,
  storedInsight,
  storedInsightTone,
  storedInsightFreshness,
  storedInsightHistory,
  previousStoredInsights,
  isRunning,
  previewLoading,
  onOpenSavedInsightInChat,
  onPreviewInsight,
  onQueueForReview,
}: {
  pr: DisplayPullRequest;
  storedInsight: PrInsightArtifact;
  storedInsightTone: ReturnType<typeof insightReadinessTone> | null;
  storedInsightFreshness: ReturnType<typeof prInsightArtifactFreshness> | null;
  storedInsightHistory: PrInsightArtifact[];
  previousStoredInsights: PrInsightArtifact[];
  isRunning: boolean;
  previewLoading: boolean;
  onOpenSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
  onPreviewInsight: (pr: DisplayPullRequest) => void;
  onQueueForReview: (pr: DisplayPullRequest) => void;
}): JSX.Element {
  return (
    <div className="mt-4 space-y-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Last AI Insight</h4>
          {storedInsightTone && (
            <StatusBadge className={storedInsightTone.tone}>
              {storedInsightTone.label}
            </StatusBadge>
          )}
          <StatusBadge>
            {storedInsight.kind === "review_run" ? "full review" : "preview"}
          </StatusBadge>
          {storedInsightHistory.length > 1 && (
            <StatusBadge>
              {storedInsightHistory.length} saved runs
            </StatusBadge>
          )}
          {storedInsightFreshness && <FreshnessBadge freshness={storedInsightFreshness} />}
        </div>
        <span className="text-[10px] text-[rgb(var(--app-text-subtle))]">
          {formatDate(storedInsight.at)} · tokens {storedInsight.tokensIn}/{storedInsight.tokensOut}
        </span>
      </div>
      <ActionButton
        type="button"
        tone="quiet"
        onClick={() => onOpenSavedInsightInChat(pr, storedInsight)}
        className="min-h-7 px-0 py-1 text-[rgb(var(--app-accent-readable))]"
      >
        Ask in Chat
      </ActionButton>
      {storedInsightFreshness?.state === "stale" && (
        <ActionButton
          type="button"
          title={storedInsight.kind === "review_run"
            ? "Reruns the automated review and updates the Review Queue"
            : "Read-only: refreshes the cached preview without creating a review run"}
          onClick={() => storedInsight.kind === "review_run"
            ? onQueueForReview(pr)
            : onPreviewInsight(pr)}
          loading={isRunning || previewLoading}
          className="min-h-7 px-2.5 py-1 text-[rgb(var(--app-warning))]"
        >
          Refresh insight
        </ActionButton>
      )}
      <article
        aria-label="Insight report"
        className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]"
      >
        <MarkdownContent markdown={storedInsight.summary || "No summary stored."} />
      </article>
      {storedInsightFreshness && storedInsightFreshness.state !== "fresh" && (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">{storedInsightFreshness.label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {storedInsight.decisionQueue && (
          <span className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
            {storedInsight.decisionQueue.replace(/_/g, " ")}
          </span>
        )}
        {typeof storedInsight.findingCount === "number" && (
          <span className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
            {storedInsight.findingCount} finding{storedInsight.findingCount === 1 ? "" : "s"}
          </span>
        )}
        {storedInsight.risks.slice(0, 5).map((risk) => (
          <span key={`stored-risk-${storedInsight.id}-${risk}`} className="rounded border border-[rgb(var(--app-warning))]/35 bg-[rgb(var(--app-warning)_/_0.10)] px-2 py-0.5 text-[10px] text-[rgb(var(--app-warning))]">
            {risk}
          </span>
        ))}
      </div>
      {previousStoredInsights.length > 0 && (
        <PreviousStoredInsights
          pr={pr}
          storedInsightHistory={storedInsightHistory}
          previousStoredInsights={previousStoredInsights}
          onOpenSavedInsightInChat={onOpenSavedInsightInChat}
        />
      )}
    </div>
  );
}

function FreshnessBadge({
  freshness,
}: {
  freshness: NonNullable<ReturnType<typeof prInsightArtifactFreshness>>;
}): JSX.Element {
  const label = freshnessBadgeLabel(freshness);
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] ${
      freshness.state === "stale"
        ? "border-[rgb(var(--app-warning))]/35 bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))]"
        : freshness.state === "fresh"
          ? "border-[rgb(var(--app-success))]/30 bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))]"
          : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
    }`}>
      {label}
    </span>
  );
}

export function freshnessBadgeLabel(
  freshness: NonNullable<ReturnType<typeof prInsightArtifactFreshness>>,
): string {
  if (freshness.state === "fresh") return "Fresh";
  if (freshness.state === "stale") return "Stale";
  if (freshness.reasons.includes("missing_baseline")) return "No baseline";
  return "Baseline unavailable";
}

function PreviousStoredInsights({
  pr,
  storedInsightHistory,
  previousStoredInsights,
  onOpenSavedInsightInChat,
}: {
  pr: DisplayPullRequest;
  storedInsightHistory: PrInsightArtifact[];
  previousStoredInsights: PrInsightArtifact[];
  onOpenSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}): JSX.Element {
  return (
    <div className="space-y-1.5 border-t border-[rgb(var(--app-border))] pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">Previous saved runs</p>
      {previousStoredInsights.map((artifact, index) => (
        <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[rgb(var(--app-border))] px-2 py-1.5">
          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[11px] text-[rgb(var(--app-text-muted))]">
                {artifact.kind === "review_run" ? "full review" : "preview"} · {formatDate(artifact.at)}
              </span>
              <span className="rounded border border-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-subtle))]">
                older {index + 2}/{storedInsightHistory.length}
              </span>
            </div>
            <p className="max-w-xl truncate text-[11px] text-[rgb(var(--app-text-subtle))]" title={artifact.summary}>
              {artifact.summary || "No summary stored."}
            </p>
          </div>
          <ActionButton
            type="button"
            tone="quiet"
            onClick={() => onOpenSavedInsightInChat(pr, artifact)}
            className="min-h-7 shrink-0 px-1.5 py-1 text-[11px] text-[rgb(var(--app-accent-readable))]"
          >
            Ask in Chat
          </ActionButton>
        </div>
      ))}
    </div>
  );
}
