import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import { PipelineRowCard } from "./pipelines/PipelineRowCard.js";
import { PipelineStatusFilters } from "./pipelines/PipelineStatusFilters.js";
import { usePipelinesRuntime } from "./pipelines/usePipelinesRuntime.js";

export default function Pipelines(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const runtime = usePipelinesRuntime(projectLinks);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-4 px-4 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-[rgb(var(--app-text))]">Pipelines</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            CI/CD execution workspace for Azure Pipeline discovery, saved pipeline connections,
            recent run state, controlled triggers, and AI-assisted run analysis.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1">
          <select
            className="rounded-md border border-transparent bg-[rgb(var(--app-surface-raised))] px-3 py-1.5 text-sm text-[rgb(var(--app-text))] outline-none transition focus:border-[rgb(var(--app-accent))]"
            value={runtime.projectFilter}
            disabled={projectLinksLoading || runtime.projectOptions.length === 0}
            onChange={(event) => runtime.setProjectFilter(event.target.value)}
          >
            {runtime.projectOptions.length === 0 && <option value="">No ADO projects</option>}
            {runtime.projectOptions.length > 0 && <option value="">All projects</option>}
            {runtime.projectOptions.map((project) => (
              <option key={project} value={project}>{project}</option>
            ))}
          </select>
          <button
            onClick={() => {
              void runtime.loadConnections();
              void runtime.loadRelatedPullRequests();
              void runtime.discoverPipelines();
            }}
            className="rounded-md px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            {runtime.discovering ? "Discovering..." : "Refresh"}
          </button>
        </div>
      </header>

      {runtime.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {runtime.error}
        </div>
      )}

      {runtime.notice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {runtime.notice}
        </div>
      )}

      <PipelineStatusFilters
        filter={runtime.filter}
        counts={runtime.counts}
        onFilterChange={runtime.setFilter}
      />

      {runtime.loading && <p className="text-sm text-[rgb(var(--app-text-muted))]">Loading pipeline-linked pull requests...</p>}

      {!runtime.loading && runtime.rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-8 text-center">
          <div>
            <p className="text-sm font-medium text-[rgb(var(--app-text))]">
              {projectLinks.length === 0 ? "No Project Links available" : "No pipelines discovered yet"}
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--app-text-muted))]">
              {projectLinks.length === 0
                ? "Create a Project Link with Azure DevOps mapping before inspecting pipelines."
                : "Refresh discovery or check that the selected ADO project has repository and pipeline access."}
            </p>
          </div>
        </div>
      )}

      {runtime.rows.length > 0 && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {runtime.paginatedRows.pageItems.map((row) => (
              <PipelineRowCard
                key={`${row.projectLinkId}:${row.pipelineId}`}
                row={row}
                state={runtime.inspectState[`${row.projectLinkId}:${row.pipelineId}`] ?? { phase: "idle" }}
                onInspect={(selected) => void runtime.inspectPipeline(selected)}
                onTrigger={(selected) => void runtime.triggerPipeline(selected)}
                onAnalyze={(selected) => void runtime.analyzePipeline(selected)}
                onSave={(selected) => void runtime.savePipeline(selected)}
              />
            ))}
          </div>

          {runtime.filteredRows.length === 0 && (
            <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6 text-center">
              <p className="text-sm text-[rgb(var(--app-text-muted))]">No pipelines match this filter.</p>
            </div>
          )}

          <PaginationControls
            page={runtime.page}
            pageCount={runtime.paginatedRows.pageCount}
            pageSize={runtime.pageSize}
            totalItems={runtime.filteredRows.length}
            visibleItems={runtime.paginatedRows.pageItems.length}
            itemLabel="pipelines"
            onPageChange={runtime.setPage}
            onPageSizeChange={(nextPageSize) => {
              runtime.setPageSize(nextPageSize);
              runtime.setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
