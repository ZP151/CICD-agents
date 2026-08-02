import { formatDate, runTone } from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow } from "./pipelineTypes.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { ActionButton, InlineNotice, StatusBadge } from "../../components/workbench/WorkbenchPrimitives.js";

interface PipelineRowCardProps {
  row: PipelineRow;
  state: PipelineInspectState;
  onInspect: (row: PipelineRow) => void;
  onTrigger: (row: PipelineRow) => void;
  onAnalyze: (row: PipelineRow) => void;
  onSave: (row: PipelineRow) => void;
  onOpenDetails: (row: PipelineRow) => void;
}

export function PipelineRowCard({
  row,
  state,
  onInspect,
  onTrigger,
  onAnalyze,
  onSave,
  onOpenDetails,
}: PipelineRowCardProps): JSX.Element {
  const tone = runTone(row.latestRun);
  const dateLabel = formatDate(row.latestRun?.finishedDate || row.latestRun?.createdDate);
  const inspectedRuns =
    state.phase === "done" ||
    state.phase === "analyzing" ||
    state.phase === "analysis_done" ||
    state.phase === "analysis_error"
      ? state.runs
      : [];

  return (
    <article
      data-testid="pipeline-row-card"
      className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">
              #{row.pipelineId}
            </span>
            <StatusBadge className={tone.tone}>
              {tone.label}
            </StatusBadge>
          </div>
          <h3 className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
            {row.pipelineName || row.pipelineId}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
            {row.project || "No project"} / {row.repository || "No repository"}
            <span className="font-sans text-[rgb(var(--app-text-subtle))]"> · {row.projectLinkName} · {row.source}</span>
          </p>
        </div>
        {dateLabel && <p className="shrink-0 text-xs text-[rgb(var(--app-text-subtle))]">{dateLabel}</p>}
      </div>

      <div className={pipelineFieldGridClass()} aria-label="Pipeline summary">
        <span title={`Default branch: ${row.defaultBranch || "not set"}; Target branch: ${row.targetBranch || "main"}`}>
          {row.defaultBranch || "not set"} → {row.targetBranch || "main"}
        </span>
        <span aria-hidden="true">·</span>
        <span title={`${row.relatedPullRequests.length} linked pull request${row.relatedPullRequests.length === 1 ? "" : "s"}`}>
          {row.relatedPullRequests.length} linked PR{row.relatedPullRequests.length === 1 ? "" : "s"}
        </span>
        <LatestRunLink row={row} />
      </div>

      {state.phase === "done" && (
        <div className="mt-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">{state.result.summary}</p>
          {inspectedRuns.length > 0 && (
            <div className="mt-3 divide-y divide-[rgb(var(--app-border))] rounded-md border border-[rgb(var(--app-border))]">
              {inspectedRuns.slice(0, 5).map((run) => {
                const inspectedTone = runTone(run);
                return (
                  <div
                    key={run.id}
                    className="grid gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0 truncate text-[rgb(var(--app-text-muted))]">
                      {run.name || `Run ${run.id}`}
                    </span>
                    <StatusBadge className={inspectedTone.tone}>
                      {inspectedTone.label}
                    </StatusBadge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(state.phase === "analyzing" ||
        state.phase === "analysis_done" ||
        state.phase === "analysis_error") && (
        <div className="mt-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase text-[rgb(var(--app-text-muted))]">
              AI analysis
            </p>
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
          <div className={pipelineAnalysisPreviewClass()}>
            <MarkdownContent markdown={state.analysis || "Starting analysis..."} />
          </div>
          <button
            type="button"
            onClick={() => onOpenDetails(row)}
            className="mt-2 text-xs text-[rgb(var(--app-accent-readable))] hover:underline"
          >
            Open analysis
          </button>
        </div>
      )}

      {state.phase === "approval" && (
        <InlineNotice tone="info" title="Approval required">
          {state.result.summary}. Open Chat to review and confirm the approval proposal.
        </InlineNotice>
      )}

      {state.phase === "error" && (
        <div className="mt-3"><InlineNotice tone="danger" title="Pipeline action failed">{state.message}</InlineNotice></div>
      )}

      <div className={pipelineActionRowClass()}>
        {row.source === "discovered" && (
          <ActionButton
            type="button"
            disabled={state.phase === "loading"}
            onClick={() => onSave(row)}
          >
            Save connection
          </ActionButton>
        )}
        {(state.phase === "done" ||
          state.phase === "analyzing" ||
          state.phase === "analysis_done" ||
          state.phase === "analysis_error" ||
          state.phase === "error") && (
          <ActionButton
            type="button"
            onClick={() => onOpenDetails(row)}
          >
            Details
          </ActionButton>
        )}
        <ActionButton
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onInspect(row)}
          loading={state.phase === "loading"}
        >
          {state.phase === "loading" ? "Working..." : "Inspect runs"}
        </ActionButton>
        <ActionButton
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onAnalyze(row)}
          loading={state.phase === "analyzing"}
        >
          AI analyze
        </ActionButton>
        <ActionButton
          tone="primary"
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onTrigger(row)}
        >
          Trigger pipeline
        </ActionButton>
      </div>
    </article>
  );
}

export function pipelineActionRowClass(): string {
  return "mt-3 flex flex-wrap justify-start gap-2 border-t border-[rgb(var(--app-border))] pt-3 sm:justify-end";
}

export function pipelineAnalysisPreviewClass(): string {
  return [
    "max-h-16 overflow-hidden text-xs leading-relaxed text-[rgb(var(--app-text-muted))]",
    "[&_ul]:m-0 [&_ol]:m-0 [&_p]:m-0 [&_li]:truncate",
  ].join(" ");
}

export function pipelineFieldGridClass(): string {
  return "mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[rgb(var(--app-text-muted))]";
}

function LatestRunLink({ row }: { row: PipelineRow }): JSX.Element | null {
  if (!row.latestRun) return null;
  const label = row.latestRun.name || `Run ${row.latestRun.id}`;
  const title = `Latest run: ${label}`;
  return row.latestRun.url ? (
    <a
      href={row.latestRun.url}
      target="_blank"
      rel="noreferrer"
      className="min-w-0 truncate text-[rgb(var(--app-accent-readable))] hover:underline"
      title={title}
    >
      · Latest run {label}
    </a>
  ) : (
    <span className="min-w-0 truncate" title={title}>· Latest run {label}</span>
  );
}
