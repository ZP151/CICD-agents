import { formatDate, runTone } from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow } from "./pipelineTypes.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";

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
            <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {row.source === "saved" ? "saved" : "discovered"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.tone}`}
            >
              {tone.label}
            </span>
            <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {row.projectLinkName}
            </span>
          </div>
          <h3 className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
            {row.pipelineName || row.pipelineId}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
            {row.project || "No project"} / {row.repository || "No repository"}
          </p>
        </div>
        {dateLabel && <p className="shrink-0 text-xs text-[rgb(var(--app-text-subtle))]">{dateLabel}</p>}
      </div>

      <div className={pipelineFieldGridClass()} aria-label="Pipeline summary">
        <PipelineSummaryChip
          label="Branches"
          value={`${row.defaultBranch || "not set"} -> ${row.targetBranch || "main"}`}
          title={`Default branch: ${row.defaultBranch || "not set"}; Target branch: ${row.targetBranch || "main"}`}
        />
        <PipelineSummaryChip
          label="Linked PRs"
          value={String(row.relatedPullRequests.length)}
          title={`${row.relatedPullRequests.length} linked pull request${row.relatedPullRequests.length === 1 ? "" : "s"}`}
        />
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${inspectedTone.tone}`}
                    >
                      {inspectedTone.label}
                    </span>
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
        <div className="mt-3 rounded-md border border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] p-3 text-xs text-[rgb(var(--app-text-muted))]">
          {state.result.summary}. Open Chat to review and confirm the approval proposal.
        </div>
      )}

      {state.phase === "error" && (
        <div className="mt-3 rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-3 text-xs text-[rgb(var(--app-danger))]">
          {state.message}
        </div>
      )}

      <div className={pipelineActionRowClass()}>
        {row.source === "discovered" && (
          <button
            type="button"
            disabled={state.phase === "loading"}
            onClick={() => onSave(row)}
            className="rounded-md border border-[rgb(var(--app-success))]/40 px-2.5 py-1.5 text-xs text-[rgb(var(--app-success))] transition hover:bg-[rgb(var(--app-success)_/_0.10)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save connection
          </button>
        )}
        {(state.phase === "done" ||
          state.phase === "analyzing" ||
          state.phase === "analysis_done" ||
          state.phase === "analysis_error" ||
          state.phase === "error") && (
          <button
            type="button"
            onClick={() => onOpenDetails(row)}
            className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            Details
          </button>
        )}
        <button
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onInspect(row)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.phase === "loading" ? "Working..." : "Inspect runs"}
        </button>
        <button
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onAnalyze(row)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-accent))]/35 hover:bg-[rgb(var(--app-accent-soft))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          AI analyze
        </button>
        <button
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onTrigger(row)}
          className="rounded-md border border-[rgb(var(--app-accent))]/35 px-2.5 py-1.5 text-xs text-[rgb(var(--app-accent-readable))] transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trigger pipeline
        </button>
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

function PipelineSummaryChip({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title: string;
}): JSX.Element {
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5"
      title={title}
    >
      <span className="text-[rgb(var(--app-text-subtle))]">{label}</span>
      <span className="min-w-0 truncate text-[rgb(var(--app-text))]">{value}</span>
    </span>
  );
}

function LatestRunLink({ row }: { row: PipelineRow }): JSX.Element | null {
  if (!row.latestRun) return null;
  const label = row.latestRun.name || `Run ${row.latestRun.id}`;
  const title = `Latest run: ${label}`;
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5"
      title={title}
    >
      <span className="text-[rgb(var(--app-text-subtle))]">Latest run</span>
      {row.latestRun.url ? (
        <a
          href={row.latestRun.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-[rgb(var(--app-accent-readable))] hover:underline"
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 truncate text-[rgb(var(--app-text))]">{label}</span>
      )}
    </span>
  );
}
