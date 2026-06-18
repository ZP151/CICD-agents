import {
  prInsightArtifactFreshness,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
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
    <div className="mt-4 space-y-2 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last AI Insight</h4>
          {storedInsightTone && (
            <span className={`rounded border px-2 py-0.5 text-[10px] ${storedInsightTone.tone}`}>
              {storedInsightTone.label}
            </span>
          )}
          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            {storedInsight.kind === "review_run" ? "full review" : "preview"}
          </span>
          {storedInsightHistory.length > 1 && (
            <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
              {storedInsightHistory.length} saved runs
            </span>
          )}
          {storedInsightFreshness && <FreshnessBadge freshness={storedInsightFreshness} />}
        </div>
        <span className="text-[10px] text-zinc-700">
          {formatDate(storedInsight.at)} · tokens {storedInsight.tokensIn}/{storedInsight.tokensOut}
        </span>
      </div>
      <button
        onClick={() => onOpenSavedInsightInChat(pr, storedInsight)}
        className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
      >
        Ask in Chat
      </button>
      {storedInsightFreshness?.state === "stale" && (
        <button
          onClick={() => storedInsight.kind === "review_run"
            ? onQueueForReview(pr)
            : onPreviewInsight(pr)}
          disabled={isRunning || previewLoading}
          className="rounded-md border border-yellow-900/50 px-2 py-1 text-xs text-yellow-300/80 transition hover:border-yellow-700 hover:text-yellow-200 disabled:cursor-wait disabled:opacity-60"
        >
          Refresh insight
        </button>
      )}
      <p className="max-h-16 overflow-hidden whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
        {storedInsight.summary || "No summary stored."}
      </p>
      {storedInsightFreshness && storedInsightFreshness.state !== "fresh" && (
        <p className="text-xs text-zinc-500">{storedInsightFreshness.label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {storedInsight.decisionQueue && (
          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            {storedInsight.decisionQueue.replace(/_/g, " ")}
          </span>
        )}
        {typeof storedInsight.findingCount === "number" && (
          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            {storedInsight.findingCount} finding{storedInsight.findingCount === 1 ? "" : "s"}
          </span>
        )}
        {storedInsight.risks.slice(0, 5).map((risk) => (
          <span key={`stored-risk-${storedInsight.id}-${risk}`} className="rounded border border-yellow-900/50 px-2 py-0.5 text-[10px] text-yellow-300/80">
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
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] ${
      freshness.state === "stale"
        ? "border-yellow-900/50 text-yellow-300/80"
        : freshness.state === "fresh"
          ? "border-emerald-900/50 text-emerald-300/80"
          : "border-zinc-800 text-zinc-500"
    }`}>
      {freshness.state}
    </span>
  );
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
    <div className="space-y-1.5 border-t border-zinc-800/70 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Previous saved runs</p>
      {previousStoredInsights.map((artifact, index) => (
        <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/70 px-2 py-1.5">
          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[11px] text-zinc-500">
                {artifact.kind === "review_run" ? "full review" : "preview"} · {formatDate(artifact.at)}
              </span>
              <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600">
                older {index + 2}/{storedInsightHistory.length}
              </span>
            </div>
            <p className="max-w-xl truncate text-[11px] text-zinc-600" title={artifact.summary}>
              {artifact.summary || "No summary stored."}
            </p>
          </div>
          <button
            onClick={() => onOpenSavedInsightInChat(pr, artifact)}
            className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Ask in Chat
          </button>
        </div>
      ))}
    </div>
  );
}
