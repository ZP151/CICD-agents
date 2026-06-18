import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import { PipelineRowCard } from "./pipelines/PipelineRowCard.js";
import { PipelineStatusFilters } from "./pipelines/PipelineStatusFilters.js";
import { usePipelinesRuntime } from "./pipelines/usePipelinesRuntime.js";

export default function Pipelines(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const runtime = usePipelinesRuntime(projectLinks);

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Pipelines</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            CI/CD execution workspace for Project Link pipeline configuration, recent run state,
            and controlled Azure Pipeline inspect or trigger actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none"
            value={runtime.projectLinkId}
            disabled={projectLinksLoading || projectLinks.length === 0}
            onChange={(event) => runtime.setProjectLinkId(event.target.value)}
          >
            {projectLinks.length === 0 && <option value="">No Project Links</option>}
            {projectLinks.length > 0 && <option value="">All Project Links</option>}
            {projectLinks.map((projectLink) => (
              <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
            ))}
          </select>
          <button
            onClick={() => void runtime.loadRelatedPullRequests()}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </header>

      {runtime.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {runtime.error}
        </div>
      )}

      <PipelineStatusFilters
        filter={runtime.filter}
        counts={runtime.counts}
        onFilterChange={runtime.setFilter}
      />

      {runtime.loading && <p className="text-sm text-zinc-600">Loading pipeline-linked pull requests...</p>}

      {!runtime.loading && runtime.rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-400">No Project Links available</p>
            <p className="mt-1 text-sm text-zinc-600">Create a Project Link before inspecting pipelines.</p>
          </div>
        </div>
      )}

      {runtime.rows.length > 0 && (
        <div className="flex flex-1 flex-col gap-3">
          {runtime.paginatedRows.pageItems.map((row) => (
            <PipelineRowCard
              key={row.projectLinkId}
              row={row}
              state={runtime.inspectState[row.projectLinkId] ?? { phase: "idle" }}
              onInspect={(selected) => void runtime.inspectPipeline(selected)}
              onTrigger={(selected) => void runtime.triggerPipeline(selected)}
            />
          ))}

          {runtime.filteredRows.length === 0 && (
            <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center">
              <p className="text-sm text-zinc-500">No pipelines match this filter.</p>
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
