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

export function pullRequestsWorkspaceLayoutClass(insightOpen: boolean): string {
  void insightOpen;
  return "flex flex-1 flex-col gap-3";
}

export function pullRequestsListGridClass(): string {
  return [
    "grid gap-3 items-start",
    "grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))]",
  ].join(" ");
}

export function pullRequestsPageShellClass(): string {
  return "mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4";
}

export function pullRequestInsightPanelClass(): string {
  return [
    "fixed inset-y-0 right-0 z-40 min-w-0 w-[min(30rem,calc(100vw-2rem))]",
    "overflow-y-auto border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl",
  ].join(" ");
}

export function pullRequestLoadingMetaGridClass(): string {
  return "mt-3 grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))]";
}

export function pullRequestEmptyChecklistGridClass(): string {
  return "mt-3 grid gap-1.5 text-xs text-[rgb(var(--app-text-muted))] grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]";
}

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

  const projectLinkResolving = projectLinksLoading && projectLinks.length === 0 && !projectLinkId;
  const firstLoad = !projectLinkResolving && loading;

  return (
    <div className={pullRequestsPageShellClass()}>
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

      {error && prs.length > 0 && (
        <div className="rounded-lg border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-4 text-sm text-[rgb(var(--app-danger))]">
          {error}
        </div>
      )}
      {!error && pullRequestWarnings.length > 0 && (
        <div className="rounded-lg border border-[rgb(var(--app-warning))]/25 bg-[rgb(var(--app-warning)_/_0.10)] p-3 text-sm text-[rgb(var(--app-warning))]">
          <p className="font-medium">Some Project Links could not refresh.</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
            {pullRequestWarnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {projectLinkResolving && <PullRequestProjectLinkResolvingState />}
      {firstLoad && <PullRequestLoadingSkeleton />}
      {!loading && refreshing && (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">Refreshing pull requests...</p>
      )}

      {!projectLinkResolving && !firstLoad && error && prs.length === 0 && (
        <PullRequestEmptyState
          mode="error"
          hasProjectLinks={projectLinks.length > 0}
          message={error}
          onRefresh={() => void load()}
        />
      )}

      {!projectLinkResolving && !firstLoad && !error && prs.length === 0 && (
        <PullRequestEmptyState
          mode="empty"
          hasProjectLinks={projectLinks.length > 0}
          onRefresh={() => void load()}
        />
      )}

      {prs.length > 0 && (
        <div className={pullRequestsWorkspaceLayoutClass(Boolean(selectedInsightPr))}>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2">
              <div className="flex flex-wrap gap-1.5">
                {prCategories.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCategory(item.key)}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${
                      category === item.key
                        ? "border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))] ring-1 ring-[rgb(var(--app-border))]"
                        : "border border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
                    }`}
                  >
                    {item.label}
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {categoryCounts[item.key]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-[rgb(var(--app-text-subtle))]">
                {filteredPrs.length} of {prs.length} PRs in view
              </p>
            </div>

            {filteredPrs.length === 0 && (
              <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6 text-center">
                <p className="text-sm text-[rgb(var(--app-text-muted))]">
                  No pull requests match this category.
                </p>
              </div>
            )}

            <div className={pullRequestsListGridClass()}>
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
            </div>
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

export function PullRequestLoadingSkeleton(): JSX.Element {
  return (
    <section
      className="grid gap-3"
      aria-label="Preparing pull requests"
      aria-live="polite"
    >
      <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        <div className="flex max-w-xl items-center gap-3">
          <span className="h-9 w-9 animate-pulse rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
              Preparing pull requests
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
              Keeping the workspace ready while Azure DevOps returns active PRs and saved insight.
            </p>
          </div>
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-12 animate-pulse rounded-full bg-[rgb(var(--app-surface-raised))]" />
            <span className="h-5 w-24 animate-pulse rounded-full bg-[rgb(var(--app-surface-raised))]" />
          </div>
          <div className="h-4 w-2/3 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
          <div className={pullRequestLoadingMetaGridClass()}>
            <span className="h-8 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
            <span className="h-8 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
            <span className="h-8 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
          </div>
        </div>
      ))}
    </section>
  );
}

export function PullRequestProjectLinkResolvingState(): JSX.Element {
  return (
    <section
      className="w-full max-w-5xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5"
      aria-label="Loading Project Links"
    >
      <div className="flex max-w-xl items-center gap-3">
        <span className="h-9 w-9 animate-pulse rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Loading Project Links
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            Checking repository mappings before loading pull requests.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PullRequestEmptyState({
  mode,
  hasProjectLinks,
  message,
  onRefresh,
}: {
  mode: "empty" | "error";
  hasProjectLinks: boolean;
  message?: string;
  onRefresh: () => void | Promise<void>;
}): JSX.Element {
  const isError = mode === "error";
  const title = isError
    ? "Pull requests unavailable"
    : hasProjectLinks
      ? "No pull requests found"
      : "No Project Link available";
  const description = isError
    ? (message || "Azure DevOps could not refresh pull requests right now.")
    : hasProjectLinks
      ? "Try another Project Link or status filter, or refresh after creating a pull request."
      : "Create a Project Link with Azure DevOps mapping before reviewing pull requests or generating PR insight.";
  return (
    <section
      className={`w-full max-w-5xl rounded-lg border p-5 ${
        isError
          ? "border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.08)]"
          : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className={`text-sm font-semibold ${isError ? "text-[rgb(var(--app-danger))]" : "text-[rgb(var(--app-text))]"}`}>
            {title}
          </p>
          <p className={`mt-1 text-sm leading-relaxed ${isError ? "text-[rgb(var(--app-danger))]" : "text-[rgb(var(--app-text-muted))]"}`}>
            {description}
          </p>
          <ul className={pullRequestEmptyChecklistGridClass()}>
            <li>Microsoft sign-in</li>
            <li>Repository permissions</li>
            <li>Project Link branch scope</li>
          </ul>
        </div>
        {!hasProjectLinks && !isError ? (
          <a
            href="#/project-links"
            className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--app-text))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
          >
            Open Project Links
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            Refresh
          </button>
        )}
      </div>
    </section>
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
  const hasExistingInsight =
    Boolean(storedInsight) || previewState.phase === "done" || queueState.phase === "done";
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
    <aside className={pullRequestInsightPanelClass()}>
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
          {previewState.phase === "loading"
            ? "Generating..."
            : hasExistingInsight
              ? "Refresh insight"
              : "Generate insight"}
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
          <p className="rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-3 text-xs leading-relaxed text-[rgb(var(--app-danger))]">
            {previewState.message}
          </p>
        )}
        {queueState.phase === "error" && (
          <p className="rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-3 text-xs leading-relaxed text-[rgb(var(--app-danger))]">
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
