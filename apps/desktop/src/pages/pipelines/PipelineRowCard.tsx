import { formatDate, runTone } from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow } from "./pipelineTypes.js";

interface PipelineRowCardProps {
  row: PipelineRow;
  state: PipelineInspectState;
  onInspect: (row: PipelineRow) => void;
  onTrigger: (row: PipelineRow) => void;
}

export function PipelineRowCard({
  row,
  state,
  onInspect,
  onTrigger,
}: PipelineRowCardProps): JSX.Element {
  const tone = runTone(row.latestRun);
  const inspectedRuns = state.phase === "done" ? state.runs : [];

  return (
    <article className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-blue-400">
              {row.pipelineId ? `#${row.pipelineId}` : "No pipeline"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.tone}`}>
              {tone.label}
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              {row.projectLinkName}
            </span>
          </div>
          <h3 className="truncate text-sm font-medium text-zinc-200">
            {row.pipelineName || row.pipelineId || "Pipeline not configured"}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-zinc-600">
            {row.project || "No project"} / {row.repository || "No repository"}
          </p>
        </div>
        <p className="text-xs text-zinc-600">
          {formatDate(row.latestRun?.finishedDate || row.latestRun?.createdDate)}
        </p>
      </div>

      <div className="mt-4 grid gap-3 text-xs text-zinc-500 sm:grid-cols-4">
        <PipelineField label="Default branch" value={row.defaultBranch || "not set"} />
        <PipelineField label="Target branch" value={row.targetBranch || "main"} />
        <PipelineField label="Linked PRs" value={String(row.relatedPullRequests.length)} />
        <LatestRunLink row={row} />
      </div>

      {state.phase === "done" && (
        <div className="mt-4 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
          <p className="text-xs text-zinc-400">{state.result.summary}</p>
          {inspectedRuns.length > 0 && (
            <div className="mt-3 divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
              {inspectedRuns.slice(0, 5).map((run) => {
                const inspectedTone = runTone(run);
                return (
                  <div key={run.id} className="grid gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="min-w-0 truncate text-zinc-400">{run.name || `Run ${run.id}`}</span>
                    <span className={inspectedTone.tone.split(" ")[0]}>{inspectedTone.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {state.phase === "approval" && (
        <div className="mt-4 rounded-md border border-blue-900/40 bg-blue-950/10 p-3 text-xs text-blue-300/80">
          {state.result.summary}. Open Chat to review and confirm the approval proposal.
        </div>
      )}

      {state.phase === "error" && (
        <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-300">
          {state.message}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={!row.pipelineId || state.phase === "loading"}
          onClick={() => onInspect(row)}
          className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.phase === "loading" ? "Working..." : "Inspect runs"}
        </button>
        <button
          type="button"
          disabled={!row.pipelineId || state.phase === "loading"}
          onClick={() => onTrigger(row)}
          className="rounded-md border border-blue-900/50 px-3 py-1.5 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="text-zinc-700">{label}</p>
      <p className="mt-1 truncate text-zinc-400">{value}</p>
    </div>
  );
}

function LatestRunLink({ row }: { row: PipelineRow }): JSX.Element {
  return (
    <div>
      <p className="text-zinc-700">Latest run</p>
      {row.latestRun?.url ? (
        <a
          href={row.latestRun.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-blue-400 hover:text-blue-300"
        >
          {row.latestRun.name || `Run ${row.latestRun.id}`}
        </a>
      ) : (
        <p className="mt-1 truncate text-zinc-400">No run linked yet</p>
      )}
    </div>
  );
}
