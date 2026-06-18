import { PaginationControls } from "../components/PaginationControls.js";
import { PullRequestCard } from "./pullRequests/PullRequestCard.js";
import { PullRequestPageHeader } from "./pullRequests/PullRequestPageHeader.js";
import {
  prCategories,
} from "./pullRequests/pullRequestViewModel.js";
import { usePullRequestsRuntime } from "./pullRequests/usePullRequestsRuntime.js";

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
    error,
    expandedPrId,
    highlightedPrId,
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

      {loading && <p className="text-sm text-zinc-600">Loading pull requests...</p>}

      {!loading && !error && prs.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-400">No pull requests found</p>
            <p className="mt-1 text-sm text-zinc-600">Try another Project Link or status filter.</p>
          </div>
        </div>
      )}

      {prs.length > 0 && (
        <div className="flex flex-1 flex-col gap-3">
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
                  <span className="ml-1.5 text-[10px] opacity-70">{categoryCounts[item.key]}</span>
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

          {paginatedPrs.pageItems.map((pr) => (
            <PullRequestCard
              key={`${pr.sourceProjectLinkId ?? "project-link"}-${pr.repository}-${pr.id}`}
              pr={pr}
              projectLinkId={projectLinkId}
              queueState={queueing[pr.id] ?? { phase: "idle" }}
              previewState={previews[pr.id] ?? { phase: "idle" }}
              insightArtifacts={insightArtifacts}
              contextState={contexts[pr.id]}
              isExpanded={expandedPrId === pr.id}
              highlighted={highlightedPrId === pr.id}
              onToggleContext={(target) => void toggleContext(target)}
              onPreviewInsight={(target) => void handlePreviewInsight(target)}
              onQueueForReview={(target) => void handleQueueForReview(target)}
              onOpenSavedInsightInChat={openSavedInsightInChat}
            />
          ))}
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
      )}
    </div>
  );
}
