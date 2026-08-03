import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import { MarkdownContent } from "../components/conversation/ConversationPartRenderer.js";
import {
  ActionButton,
  ActionLink,
  InlineNotice,
  WorkbenchDisclosure,
  WorkbenchHeader,
  WorkbenchPage,
  WorkbenchSelect,
  WorkbenchSidePanel,
} from "../components/workbench/WorkbenchPrimitives.js";
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
  const contentState = pipelineContentState({
    firstLoad,
    rowCount: runtime.rows.length,
    discovering: runtime.discovering,
  });
  const showTopLevelError = pipelineShouldShowTopLevelError(runtime.error, contentState);
  const showStatusFilters = pipelineShouldShowStatusFilters({
    hasProjectLinks: projectLinks.length > 0,
    rowCount: runtime.rows.length,
    contentState,
  });

  return (
    <WorkbenchPage className={pipelinesPageShellClass()}>
      <WorkbenchHeader
        title="Pipelines"
        description="Pipeline discovery, recent run state, controlled triggers, and AI-assisted run analysis."
        descriptionClassName={pipelineHeaderDescriptionClass()}
        actions={<div className={pipelineHeaderControlsClass()}>
          <WorkbenchSelect
            aria-label="Pipelines project filter"
            className="text-sm"
            value={runtime.projectFilter}
            disabled={projectLinksLoading || runtime.projectOptions.length === 0}
            onChange={(event) => runtime.setProjectFilter(event.target.value)}
          >
            {runtime.projectOptions.length === 0 && (
              <option value="">
                {pipelineProjectFilterFallbackLabel({
                  projectLinksLoading,
                  hasProjectLinks: projectLinks.length > 0,
                })}
              </option>
            )}
            {runtime.projectOptions.length > 0 && <option value="">All projects</option>}
            {runtime.projectOptions.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </WorkbenchSelect>
          <ActionButton
            onClick={() => {
              void runtime.loadConnections();
              void runtime.loadRelatedPullRequests();
              void runtime.discoverPipelines();
            }}
          >
            Refresh
          </ActionButton>
        </div>}
      />

      {showTopLevelError && (
        <InlineNotice tone="danger" title="Pipeline data unavailable">{runtime.error}</InlineNotice>
      )}

      {runtime.notice && (
        <InlineNotice tone="warning">{runtime.notice}</InlineNotice>
      )}

      {showStatusFilters && (
        <PipelineStatusFilters
          filter={runtime.filter}
          counts={runtime.counts}
          onFilterChange={runtime.setFilter}
        />
      )}

      {runtime.discovering && contentState === "rows" && (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">
          Refreshing pipeline discovery...
        </p>
      )}

      {contentState === "loading" && <PipelineLoadingSkeleton />}

      {contentState === "refreshing-empty" && (
        <PipelineEmptyState
          mode="refreshing"
          hasProjectLinks={projectLinks.length > 0}
          error={runtime.error}
          onRefresh={runtime.discoverPipelines}
        />
      )}

      {contentState === "empty" && (
        <PipelineEmptyState
          mode="empty"
          hasProjectLinks={projectLinks.length > 0}
          error={runtime.error}
          onRefresh={runtime.discoverPipelines}
        />
      )}

      {contentState === "rows" && (
        <div className="flex flex-1 flex-col gap-3">
          <div
            className={pipelineWorkspaceGridClass(Boolean(selectedDetailRow))}
          >
            <div className={pipelineRowsGridClass(Boolean(selectedDetailRow))}>
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
                  onSelectCandidate={(selected, candidateId) => void runtime.selectPipelineCandidate(selected, candidateId)}
                  onOpenInChat={(selected, result) => runtime.openPipelineInChat(selected, result)}
                  onRefreshPipelines={(selected) => void runtime.discoverPipelines()}
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
    </WorkbenchPage>
  );
}

export type PipelineContentState = "loading" | "refreshing-empty" | "empty" | "rows";

export function pipelinesPageShellClass(): string {
  return "gap-3";
}

export function pipelineHeaderDescriptionClass(): string {
  return "mt-1 hidden max-w-2xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))] xl:block";
}

export function pipelineHeaderControlsClass(): string {
  return [
    "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]",
    "xl:w-[clamp(18rem,30vw,32rem)]",
  ].join(" ");
}

export function pipelineShouldShowTopLevelError(
  error: string | null | undefined,
  contentState: PipelineContentState,
): boolean {
  return Boolean(error && contentState === "rows");
}

export function pipelineContentState({
  firstLoad,
  rowCount,
  discovering,
}: {
  firstLoad: boolean;
  rowCount: number;
  discovering: boolean;
}): PipelineContentState {
  if (firstLoad) return "loading";
  if (rowCount > 0) return "rows";
  if (discovering) return "refreshing-empty";
  return "empty";
}

export function pipelineShouldShowStatusFilters({
  hasProjectLinks,
  rowCount,
  contentState = "rows",
}: {
  hasProjectLinks: boolean;
  rowCount: number;
  contentState?: PipelineContentState;
}): boolean {
  if (contentState === "loading" || contentState === "refreshing-empty") return false;
  return hasProjectLinks || rowCount > 0;
}

export function pipelineRowsGridClass(detailOpen: boolean): string {
  void detailOpen;
  return "grid items-start gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))]";
}

export function pipelineWorkspaceGridClass(detailOpen: boolean): string {
  void detailOpen;
  return "";
}

export function pipelineProjectFilterFallbackLabel({
  projectLinksLoading,
  hasProjectLinks,
}: {
  projectLinksLoading: boolean;
  hasProjectLinks: boolean;
}): string {
  if (projectLinksLoading) return "Loading projects...";
  if (!hasProjectLinks) return "No Project Links";
  return "No ADO projects";
}

export function PipelineLoadingSkeleton(): JSX.Element {
  return (
    <section
      className="w-full max-w-4xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-4 py-3"
      aria-label="Loading pipelines"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Loading pipelines
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            Checking Project Link mappings and Azure DevOps pipeline definitions.
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs text-[rgb(var(--app-text-subtle))]"
          aria-hidden="true"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--app-accent))]" />
          <span>Discovery running</span>
        </div>
      </div>
    </section>
  );
}

export function PipelineEmptyState({
  mode,
  hasProjectLinks,
  error,
  onRefresh,
}: {
  mode: "refreshing" | "empty";
  hasProjectLinks: boolean;
  error?: string | null;
  onRefresh: () => void | Promise<void>;
}): JSX.Element {
  const hasBlockingError = Boolean(error && mode === "empty");
  const recovery = pipelineRecovery(error, hasProjectLinks);
  const title = hasBlockingError
    ? recovery.title
    : mode === "refreshing"
    ? "Refreshing pipeline discovery"
    : hasProjectLinks
      ? "No pipelines discovered yet"
      : "No Project Links available";
  const description = hasBlockingError
    ? recovery.description
    : mode === "refreshing"
    ? "Checking Azure DevOps for pipeline definitions."
    : hasProjectLinks
      ? "Check the Project Link mapping, then refresh discovery."
      : "Connect a Project Link before inspecting pipeline runs or triggering CI.";
  return (
    <section className={pipelineEmptyStateClass(mode)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            {description}
          </p>
          {hasBlockingError && error && (
            <WorkbenchDisclosure>{error}</WorkbenchDisclosure>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasBlockingError && recovery.primaryHref ? (
            <ActionLink
              href={recovery.primaryHref}
              tone="primary"
            >
              {recovery.primaryAction}
            </ActionLink>
          ) : !hasProjectLinks && (
            <ActionLink
              href="#/project-links"
              className="text-sm"
            >
              Open Project Links
            </ActionLink>
          )}
          {(hasProjectLinks || hasBlockingError) && !recovery.primaryHref && (
            <ActionButton
              onClick={() => void onRefresh()}
              disabled={mode === "refreshing"}
            >
              {mode === "refreshing"
                ? "Refreshing..."
                : hasBlockingError
                  ? recovery.primaryAction
                  : "Refresh discovery"}
            </ActionButton>
          )}
        </div>
      </div>
    </section>
  );
}

export interface PipelineRecovery {
  title: string;
  description: string;
  primaryAction: string;
  primaryHref?: string;
}

export function pipelineRecovery(error: string | null | undefined, hasProjectLinks: boolean): PipelineRecovery {
  const issue = error?.toLowerCase() ?? "";
  if (issue.includes("ado_project_link_incomplete") || (issue.includes("project link") && issue.includes("mapping"))) {
    return {
      title: "Complete this Project Link",
      description: "Pipeline discovery needs an Azure DevOps organization, project, repository, and branch scope.",
      primaryAction: "Open Project Links",
      primaryHref: "#/project-links",
    };
  }
  if (issue.includes("sign in") || issue.includes("credential") || issue.includes("401") || issue.includes("unauthorized")) {
    return {
      title: "Azure DevOps sign-in needs attention",
      description: "Refresh your Microsoft session, then retry pipeline discovery.",
      primaryAction: "Try again",
    };
  }
  if (issue.includes("permission") || issue.includes("403") || issue.includes("forbidden")) {
    return {
      title: "Azure DevOps access is missing",
      description: "Confirm that your account can read this project, then retry pipeline discovery.",
      primaryAction: "Try again",
    };
  }
  return {
    title: "Pipeline workspace unavailable",
    description: hasProjectLinks
      ? "MergePilot could not load pipeline discovery for this project. Retry, or check the Project Link setup."
      : "Connect a Project Link before discovering pipeline definitions.",
    primaryAction: hasProjectLinks ? "Try again" : "Open Project Links",
    primaryHref: hasProjectLinks ? undefined : "#/project-links",
  };
}

export function pipelineEmptyStateClass(mode: "refreshing" | "empty"): string {
  if (mode === "refreshing") {
    return "w-full max-w-xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5";
  }
  return "w-full max-w-4xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-4 py-3";
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
    <WorkbenchSidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={row.pipelineName || row.pipelineId}
      description={`${row.project || "No project"} / ${row.repository || "No repository"}`}
    >

      {isWorking && (
        <section className="mb-4 border-t border-[rgb(var(--app-border))] pt-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Inspecting pipeline runs...</p>
        </section>
      )}

      {isError && (
        <section className="mb-4 rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-3">
          <p className="text-xs font-semibold text-[rgb(var(--app-danger))]">
            Pipeline action failed
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[rgb(var(--app-danger))]">
            {state.message}
          </p>
        </section>
      )}

      {isApproval && (
        <div className="mb-4">
          <InlineNotice tone="info" title="Approval required">
            <p>{state.result.summary}. Review and confirm the proposal in Chat.</p>
            <ActionLink href="#/chat" tone="secondary" className="mt-2 w-fit">
              Open Chat approval
            </ActionLink>
          </InlineNotice>
        </div>
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
                  ? "border-[rgb(var(--app-warning))]/35 bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))]"
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
            <p className="mb-2 rounded-md border border-[rgb(var(--app-warning))]/30 bg-[rgb(var(--app-warning)_/_0.10)] p-2 text-xs leading-relaxed text-[rgb(var(--app-warning))]">
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
                      className="mt-1 block truncate text-[rgb(var(--app-accent-readable))]"
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
    </WorkbenchSidePanel>
  );
}
