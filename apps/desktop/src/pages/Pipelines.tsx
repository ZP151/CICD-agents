import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import { MarkdownContent } from "../components/conversation/ConversationPartRenderer.js";
import { PipelineRowCard } from "./pipelines/PipelineRowCard.js";
import { PipelineStatusFilters } from "./pipelines/PipelineStatusFilters.js";
import { runTone } from "./pipelines/pipelineModel.js";
import type { PipelineInspectState, PipelineRow } from "./pipelines/pipelineTypes.js";
import { rowKey, usePipelinesRuntime } from "./pipelines/usePipelinesRuntime.js";

export default function Pipelines(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const runtime = usePipelinesRuntime(projectLinks);
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null);
  const selectedDetailRow = useMemo(
    () => runtime.filteredRows.find((row) => rowKey(row) === selectedDetailKey) ?? null,
    [runtime.filteredRows, selectedDetailKey],
  );
  const selectedDetailState = selectedDetailRow
    ? (runtime.inspectState[rowKey(selectedDetailRow)] ?? { phase: "idle" as const })
    : null;

  useEffect(() => {
    if (selectedDetailKey && !selectedDetailRow) setSelectedDetailKey(null);
  }, [selectedDetailKey, selectedDetailRow]);

  const firstLoad =
    (projectLinksLoading && projectLinks.length === 0) || runtime.firstDiscoveryLoading;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-4 px-4 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-[rgb(var(--app-text))]">Pipelines</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            CI/CD execution workspace for Azure Pipeline discovery, saved pipeline connections,
            recent run state, controlled triggers, and AI-assisted run analysis.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1">
          <select
            aria-label="Pipelines project filter"
            className="rounded-md border border-transparent bg-[rgb(var(--app-surface-raised))] px-3 py-1.5 text-sm text-[rgb(var(--app-text))] outline-none transition focus:border-[rgb(var(--app-accent))]"
            value={runtime.projectFilter}
            disabled={projectLinksLoading || runtime.projectOptions.length === 0}
            onChange={(event) => runtime.setProjectFilter(event.target.value)}
          >
            {runtime.projectOptions.length === 0 && <option value="">No ADO projects</option>}
            {runtime.projectOptions.length > 0 && <option value="">All projects</option>}
            {runtime.projectOptions.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
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
            Refresh
          </button>
        </div>
      </header>

      {runtime.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
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

      {runtime.discovering && !runtime.firstDiscoveryLoading && (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">
          Refreshing pipeline discovery...
        </p>
      )}

      {firstLoad && <PipelineLoadingSkeleton />}

      {!firstLoad && runtime.rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-8 text-center">
          <div>
            <p className="text-sm font-medium text-[rgb(var(--app-text))]">
              {projectLinks.length === 0
                ? "No Project Links available"
                : "No pipelines discovered yet"}
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--app-text-muted))]">
              {projectLinks.length === 0
                ? "Create a Project Link with Azure DevOps mapping before inspecting pipelines."
                : "Refresh discovery or check that the selected ADO project has repository and pipeline access."}
            </p>
          </div>
        </div>
      )}

      {!firstLoad && runtime.rows.length > 0 && (
        <div className="flex flex-1 flex-col gap-3">
          <div
            className={
              selectedDetailRow ? "grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]" : ""
            }
          >
            <div className="grid items-start gap-3 xl:grid-cols-2">
              {runtime.paginatedRows.pageItems.map((row) => (
                <PipelineRowCard
                  key={`${row.projectLinkId}:${row.pipelineId}`}
                  row={row}
                  state={
                    runtime.inspectState[rowKey(row)] ?? {
                      phase: "idle",
                    }
                  }
                  onInspect={(selected) => void runtime.inspectPipeline(selected)}
                  onTrigger={(selected) => void runtime.triggerPipeline(selected)}
                  onAnalyze={(selected) => {
                    setSelectedDetailKey(rowKey(selected));
                    void runtime.analyzePipeline(selected);
                  }}
                  onSave={(selected) => void runtime.savePipeline(selected)}
                  onOpenDetails={(selected) => setSelectedDetailKey(rowKey(selected))}
                />
              ))}
            </div>
            {selectedDetailRow && selectedDetailState && (
              <PipelineDetailPanel
                row={selectedDetailRow}
                state={selectedDetailState}
                onClose={() => setSelectedDetailKey(null)}
              />
            )}
          </div>

          {runtime.filteredRows.length === 0 && (
            <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6 text-center">
              <p className="text-sm text-[rgb(var(--app-text-muted))]">
                No pipelines match this filter.
              </p>
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

function PipelineLoadingSkeleton(): JSX.Element {
  return (
    <div className="grid gap-3 xl:grid-cols-2" aria-label="Pipeline loading placeholders">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="h-5 w-14 animate-pulse rounded-full bg-[rgb(var(--app-surface-raised))]" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-[rgb(var(--app-surface-raised))]" />
          </div>
          <div className="h-4 w-36 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="h-10 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
            <div className="h-10 animate-pulse rounded bg-[rgb(var(--app-surface-raised))]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PipelineDetailPanel({
  row,
  state,
  onClose,
}: {
  row: PipelineRow;
  state: PipelineInspectState;
  onClose: () => void;
}): JSX.Element {
  const runs =
    state.phase === "done" ||
    state.phase === "analyzing" ||
    state.phase === "analysis_done" ||
    state.phase === "analysis_error"
      ? state.runs
      : [];
  const analysis =
    state.phase === "analyzing" ||
    state.phase === "analysis_done" ||
    state.phase === "analysis_error"
      ? state.analysis
      : "";
  const isWorking = state.phase === "loading";
  const isError = state.phase === "error";
  const isApproval = state.phase === "approval";
  return (
    <aside className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 xl:sticky xl:top-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-[rgb(var(--app-text-subtle))]">
            Pipeline detail
          </p>
          <h3 className="mt-1 truncate text-sm font-semibold text-[rgb(var(--app-text))]">
            {row.pipelineName || row.pipelineId}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
            {row.project} / {row.repository}
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

      {isWorking && (
        <section className="mb-4 border-t border-[rgb(var(--app-border))] pt-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Inspecting pipeline runs...</p>
        </section>
      )}

      {isError && (
        <section className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-300">
            Pipeline action failed
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-red-800 dark:text-red-200">
            {state.message}
          </p>
        </section>
      )}

      {isApproval && (
        <section className="mb-4 rounded-md border border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] p-3">
          <p className="text-xs font-semibold text-[rgb(var(--app-text))]">
            Approval required in Chat
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
            {state.result.summary}. Open Chat to review and confirm the approval proposal.
          </p>
        </section>
      )}

      {(state.phase === "analyzing" ||
        state.phase === "analysis_done" ||
        state.phase === "analysis_error") && (
        <section className="mb-4 border-t border-[rgb(var(--app-border))] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">AI analysis</p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                state.phase === "analysis_error"
                  ? "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
              }`}
            >
              {state.phase === "analyzing"
                ? "Analyzing"
                : state.phase === "analysis_error"
                  ? "Error"
                  : "Ready"}
            </span>
          </div>
          {state.phase === "analysis_error" && (
            <p className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              AI analysis failed. Showing local run evidence summary instead. {state.message}
            </p>
          )}
          <MarkdownContent markdown={analysis || "Starting analysis..."} />
        </section>
      )}

      <section className="border-t border-[rgb(var(--app-border))] pt-3">
        <p className="mb-2 text-xs font-semibold text-[rgb(var(--app-text-muted))]">Run evidence</p>
        {runs.length === 0 ? (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">
            Inspect runs to collect pipeline evidence.
          </p>
        ) : (
          <ol className="space-y-2">
            {runs.slice(0, 8).map((run) => {
              const tone = runTone(run);
              return (
                <li
                  key={run.id}
                  className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-[rgb(var(--app-text))]">
                      {run.name || `Run ${run.id}`}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.tone}`}
                    >
                      {tone.label}
                    </span>
                  </div>
                  {run.url && (
                    <a
                      href={run.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-[rgb(var(--app-accent))]"
                    >
                      Open run
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}
