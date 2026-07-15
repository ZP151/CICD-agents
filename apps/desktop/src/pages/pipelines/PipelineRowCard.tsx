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
  const inspectedRuns = state.phase === "done" || state.phase === "analyzing" || state.phase === "analysis_done"
    ? state.runs
    : [];

  return (
    <article className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-blue-400">
              #{row.pipelineId}
            </span>
            <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {row.source === "saved" ? "saved" : "discovered"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.tone}`}>
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
        {dateLabel && (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">
            {dateLabel}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-[rgb(var(--app-text-muted))] sm:grid-cols-2 2xl:grid-cols-4">
        <PipelineField label="Default branch" value={row.defaultBranch || "not set"} />
        <PipelineField label="Target branch" value={row.targetBranch || "main"} />
        <PipelineField label="Linked PRs" value={String(row.relatedPullRequests.length)} />
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
                  <div key={run.id} className="grid gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="min-w-0 truncate text-[rgb(var(--app-text-muted))]">{run.name || `Run ${run.id}`}</span>
                    <span className={inspectedTone.tone.split(" ")[0]}>{inspectedTone.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(state.phase === "analyzing" || state.phase === "analysis_done") && (
        <div className="mt-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase text-[rgb(var(--app-text-muted))]">
              AI analysis
            </p>
            <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {state.phase === "analyzing" ? "Analyzing" : "Ready"}
            </span>
          </div>
          <div className="max-h-36 overflow-hidden text-xs">
            <MarkdownContent markdown={state.analysis || "Starting analysis..."} />
          </div>
          <button
            type="button"
            onClick={() => onOpenDetails(row)}
            className="mt-2 text-xs text-[rgb(var(--app-accent))] hover:underline"
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
        <div className="mt-3 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-300">
          {state.message}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[rgb(var(--app-border))] pt-3">
        {row.source === "discovered" && (
          <button
            type="button"
            disabled={state.phase === "loading"}
            onClick={() => onSave(row)}
            className="rounded-md border border-emerald-500/40 px-2.5 py-1.5 text-xs text-emerald-700 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-300"
          >
            Save connection
          </button>
        )}
        {(state.phase === "done" || state.phase === "analyzing" || state.phase === "analysis_done" || state.phase === "error") && (
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
          className="rounded-md border border-purple-500/40 px-2.5 py-1.5 text-xs text-purple-700 transition hover:bg-purple-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-purple-300"
        >
          AI analyze
        </button>
        <button
          type="button"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onTrigger(row)}
          className="rounded-md border border-blue-500/40 px-2.5 py-1.5 text-xs text-blue-700 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
        >
          Trigger pipeline
        </button>
      </div>
    </article>
  );
}

function PipelineField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-[rgb(var(--app-text-subtle))]">{label}</p>
      <p className="mt-1 truncate text-[rgb(var(--app-text))]">{value}</p>
    </div>
  );
}

function LatestRunLink({ row }: { row: PipelineRow }): JSX.Element {
  return (
    <div>
      <p className="text-[rgb(var(--app-text-subtle))]">Latest run</p>
      {row.latestRun?.url ? (
        <a
          href={row.latestRun.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-blue-700 hover:text-blue-600 dark:text-blue-300"
        >
          {row.latestRun.name || `Run ${row.latestRun.id}`}
        </a>
      ) : (
        <p className="mt-1 truncate text-[rgb(var(--app-text))]">No run linked yet</p>
      )}
    </div>
  );
}
