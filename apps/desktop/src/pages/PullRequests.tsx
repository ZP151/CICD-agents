import { useEffect, useMemo, useState } from "react";
import { PaginationControls } from "../components/PaginationControls.js";
import { PullRequestCard } from "./pullRequests/PullRequestCard.js";
import { PullRequestPageHeader } from "./pullRequests/PullRequestPageHeader.js";
import {
  InsightPreviewPanel,
  ReviewRunPanel,
  StoredInsightPanel,
} from "./pullRequests/PullRequestInsightPanels.js";
import { prCategories, insightReadinessTone } from "./pullRequests/pullRequestViewModel.js";
import {
  pullRequestRuntimeKey,
  type ContextState,
  type DisplayPullRequest,
  type PreviewState,
  type QueueState,
} from "./pullRequests/pullRequestTypes.js";
import { usePullRequestsRuntime } from "./pullRequests/usePullRequestsRuntime.js";
import {
  prInsightArtifactFreshness,
  prInsightArtifactProjectLinkId,
  type PrInsightArtifact,
} from "../prInsightArtifacts.js";

export default function PullRequests(): JSX.Element {
  const runtime = usePullRequestsRuntime();
  const {
    projectLinks,
    projectLinksLoading,
    projectLinkId,
    status,
    category,
    page,
    pageSize,
    prs,
    loading,
    refreshing,
    error,
    pullRequestWarnings,
    expandedPrKey,
    highlightedPrKey,
    contexts,
    queueing,
    previews,
    insightArtifacts,
    selectedProjectLink,
    branchScope,
    categoryCounts,
    filteredPrs,
    paginatedPrs,
    setProjectLinkId,
    setStatus,
    setCategory,
    setPage,
    setPageSize,
    load,
    toggleContext,
    handlePreviewInsight,
    handleQueueForReview,
    openSavedInsightInChat,
  } = runtime;
  const [selectedInsightPrKey, setSelectedInsightPrKey] = useState<string | null>(null);
  const selectedInsightPr = useMemo(() => {
    const pr = prs.find((item) => pullRequestRuntimeKey(item) === selectedInsightPrKey) ?? null;
    if (!pr) return null;
    if (projectLinkId && pr.sourceProjectLinkId && pr.sourceProjectLinkId !== projectLinkId)
      return null;
    return pr;
  }, [prs, projectLinkId, selectedInsightPrKey]);

  useEffect(() => {
    setSelectedInsightPrKey(null);
  }, [category, projectLinkId, status]);

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <PullRequestPageHeader
        projectLinks={projectLinks}
        projectLinksLoading={projectLinksLoading}
        projectLinkId={projectLinkId}
        status={status}
        selectedProjectLink={selectedProjectLink}
        branchScope={branchScope}
        onProjectLinkChange={setProjectLinkId}
        onStatusChange={setStatus}
        onRefresh={() => void load()}
      />

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {!error && pullRequestWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Some Project Links could not refresh.</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
            {pullRequestWarnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {(projectLinksLoading || loading) && (
        <p className="text-sm text-zinc-600">Loading pull requests...</p>
      )}
      {!loading && refreshing && (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">Refreshing pull requests...</p>
      )}

      {!projectLinksLoading && !loading && !error && prs.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-400">No pull requests found</p>
            <p className="mt-1 text-sm text-zinc-600">Try another Project Link or status filter.</p>
          </div>
        </div>
      )}

      {prs.length > 0 && (
        <div
          className={
            selectedInsightPr
              ? "grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]"
              : "flex flex-1 flex-col gap-3"
          }
        >
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-3">
              <div className="flex flex-wrap gap-1.5">
                {prCategories.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCategory(item.key)}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${
                      category === item.key
                        ? "border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))] ring-1 ring-[rgb(var(--app-border))]"
                        : "border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:bg-zinc-900/40 hover:text-zinc-300"
                    }`}
                  >
                    {item.label}
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {categoryCounts[item.key]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-600">
                {filteredPrs.length} of {prs.length} PRs in view
              </p>
            </div>

            {filteredPrs.length === 0 && (
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center">
                <p className="text-sm text-zinc-500">No pull requests match this category.</p>
              </div>
            )}

            {paginatedPrs.pageItems.map((pr) => {
              const prKey = pullRequestRuntimeKey(pr);
              return (
                <PullRequestCard
                  key={prKey}
                  pr={pr}
                  projectLinkId={projectLinkId}
                  queueState={queueing[prKey] ?? { phase: "idle" }}
                  previewState={previews[prKey] ?? { phase: "idle" }}
                  insightArtifacts={insightArtifacts}
                  contextState={contexts[prKey]}
                  isExpanded={expandedPrKey === prKey}
                  highlighted={highlightedPrKey === prKey}
                  onToggleContext={(target) => void toggleContext(target)}
                  onPreviewInsight={(target) => void handlePreviewInsight(target)}
                  onQueueForReview={(target) => void handleQueueForReview(target)}
                  onOpenInsight={(target) => setSelectedInsightPrKey(pullRequestRuntimeKey(target))}
                  onOpenSavedInsightInChat={openSavedInsightInChat}
                />
              );
            })}
            <PaginationControls
              page={page}
              pageCount={paginatedPrs.pageCount}
              pageSize={pageSize}
              totalItems={filteredPrs.length}
              visibleItems={paginatedPrs.pageItems.length}
              itemLabel="pull requests"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </div>
          {selectedInsightPr && (
            <PullRequestInsightSidePanel
              pr={selectedInsightPr}
              queueState={queueing[pullRequestRuntimeKey(selectedInsightPr)] ?? { phase: "idle" }}
              previewState={previews[pullRequestRuntimeKey(selectedInsightPr)] ?? { phase: "idle" }}
              insightArtifacts={insightArtifacts}
              contextState={contexts[pullRequestRuntimeKey(selectedInsightPr)]}
              onClose={() => setSelectedInsightPrKey(null)}
              onPreviewInsight={(target) => void handlePreviewInsight(target)}
              onQueueForReview={(target) => void handleQueueForReview(target)}
              onOpenSavedInsightInChat={openSavedInsightInChat}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PullRequestInsightSidePanel({
  pr,
  queueState,
  previewState,
  insightArtifacts,
  contextState,
  onClose,
  onPreviewInsight,
  onQueueForReview,
  onOpenSavedInsightInChat,
}: {
  pr: DisplayPullRequest;
  queueState: QueueState;
  previewState: PreviewState;
  insightArtifacts: PrInsightArtifact[];
  contextState: ContextState | undefined;
  onClose: () => void;
  onPreviewInsight: (pr: DisplayPullRequest) => void;
  onQueueForReview: (pr: DisplayPullRequest) => void;
  onOpenSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}): JSX.Element {
  const storedInsightHistory = insightArtifacts.filter(
    (artifact) =>
      artifact.repository === pr.repository &&
      artifact.pullRequestId === pr.id &&
      (!pr.sourceProjectLinkId ||
        prInsightArtifactProjectLinkId(artifact) === pr.sourceProjectLinkId),
  );
  const storedInsight = storedInsightHistory[0] ?? null;
  const previousStoredInsights = storedInsightHistory.slice(1, 4);
  const storedInsightTone = storedInsight?.readiness
    ? insightReadinessTone(storedInsight.readiness)
    : null;
  const currentPrBaseline =
    contextState?.phase === "loaded"
      ? {
          iterationId: contextState.data.changes.iterationId,
          sourceCommit: contextState.data.changes.sourceCommit,
        }
      : null;
  const storedInsightFreshness = storedInsight
    ? prInsightArtifactFreshness(storedInsight, currentPrBaseline)
    : null;
  const previewTone =
    previewState.phase === "done" ? insightReadinessTone(previewState.result.readiness) : null;
  const reviewTone =
    queueState.phase === "done" ? insightReadinessTone(queueState.result.readiness) : null;
  const isRunning = queueState.phase === "watching" || queueState.phase === "reviewing";
  const scopeLabel = pr.sourceProjectLinkName || pr.repository;

  return (
    <aside className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-[rgb(var(--app-text-subtle))]">
            PR insight
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-[rgb(var(--app-text))]">
            #{pr.id} {pr.title || "(untitled)"}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
            {pr.sourceBranch} {"->"} {pr.targetBranch}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 border-b border-[rgb(var(--app-border))] pb-3">
        <button
          type="button"
          disabled={previewState.phase === "loading"}
          onClick={() => onPreviewInsight(pr)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
        >
          {previewState.phase === "loading" ? "Generating..." : "Generate insight"}
        </button>
        <button
          type="button"
          disabled={isRunning || queueState.phase === "done"}
          onClick={() => onQueueForReview(pr)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
        >
          {queueState.phase === "watching"
            ? "Preparing..."
            : queueState.phase === "reviewing"
              ? "Analyzing..."
              : "Run review"}
        </button>
      </div>

      <div className="space-y-3">
        {previewState.phase === "error" && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-800 dark:text-red-200">
            {previewState.message}
          </p>
        )}
        {queueState.phase === "error" && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-800 dark:text-red-200">
            {queueState.message}
          </p>
        )}
        {previewState.phase === "done" && (
          <InsightPreviewPanel previewState={previewState} insightTone={previewTone} />
        )}
        {queueState.phase === "done" && (
          <ReviewRunPanel result={queueState.result} reviewTone={reviewTone} />
        )}
        {storedInsight && previewState.phase !== "done" && queueState.phase !== "done" && (
          <StoredInsightPanel
            pr={pr}
            storedInsight={storedInsight}
            storedInsightTone={storedInsightTone}
            storedInsightFreshness={storedInsightFreshness}
            storedInsightHistory={storedInsightHistory}
            previousStoredInsights={previousStoredInsights}
            isRunning={isRunning}
            previewLoading={previewState.phase === "loading"}
            onOpenSavedInsightInChat={onOpenSavedInsightInChat}
            onPreviewInsight={onPreviewInsight}
            onQueueForReview={onQueueForReview}
          />
        )}
        {!storedInsight &&
          previewState.phase !== "done" &&
          previewState.phase !== "error" &&
          queueState.phase !== "done" &&
          queueState.phase !== "error" && (
            <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3 text-xs text-[rgb(var(--app-text-muted))]">
              Generate an insight or run a review to inspect AI evidence here.
            </p>
          )}
        {scopeLabel && (
          <p className="text-[10px] text-[rgb(var(--app-text-subtle))]">Scope: {scopeLabel}</p>
        )}
      </div>
    </aside>
  );
}
