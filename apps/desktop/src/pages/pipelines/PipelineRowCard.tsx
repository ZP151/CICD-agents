import type { ChatWorkflowActionResult } from "../../api.js";
import { formatDate, runTone } from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow } from "./pipelineTypes.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import {
  ActionButton,
  ActionLink,
  InlineNotice,
  StatusBadge,
} from "../../components/workbench/WorkbenchPrimitives.js";

interface PipelineRowCardProps {
  row: PipelineRow;
  state: PipelineInspectState;
  onInspect: (row: PipelineRow) => void;
  onTrigger: (row: PipelineRow) => void;
  onAnalyze: (row: PipelineRow) => void;
  onSave: (row: PipelineRow) => void;
  onOpenDetails: (row: PipelineRow) => void;
  onSelectCandidate: (row: PipelineRow, candidateId: number) => void;
  onRefreshPipelines: (row: PipelineRow) => void;
}

export function PipelineRowCard({
  row,
  state,
  onInspect,
  onTrigger,
  onAnalyze,
  onSave,
  onOpenDetails,
  onSelectCandidate,
  onRefreshPipelines,
}: PipelineRowCardProps): JSX.Element {
  const tone = runTone(row.latestRun);
  const dateLabel = formatDate(row.latestRun?.finishedDate || row.latestRun?.createdDate);
  const triggerDisabled = !canTriggerPipeline(state);
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
          <h3 className="break-words text-sm font-medium leading-5 text-[rgb(var(--app-text))]">
            {row.pipelineName || row.pipelineId}
          </h3>
          <p
            className="mt-1 break-words font-mono text-xs leading-5 text-[rgb(var(--app-text-muted))]"
            title={`${row.project || "No project"} / ${row.repository || "No repository"} · ${row.projectLinkName} · ${row.source}`}
          >
            {row.project || "No project"} / {row.repository || "No repository"}
            <span className="font-sans text-[rgb(var(--app-text-subtle))]"> · {row.projectLinkName} · {row.source}</span>
          </p>
        </div>
        {dateLabel && <p className="shrink-0 text-xs text-[rgb(var(--app-text-subtle))]">{dateLabel}</p>}
      </div>

      <div className={pipelineFieldGridClass()} aria-label="Pipeline summary">
        <span title={`Default branch: ${row.defaultBranch || "not set"}; Target branch: ${row.targetBranch || "not set"}`}>
          {row.defaultBranch || "not set"} → {row.targetBranch || "not set"}
        </span>
        <span aria-hidden="true">·</span>
        <span title={`${row.relatedPullRequests.length} linked pull request${row.relatedPullRequests.length === 1 ? "" : "s"}`}>
          {row.relatedPullRequests.length} linked PR{row.relatedPullRequests.length === 1 ? "" : "s"}
        </span>
        <LatestRunLink row={row} />
      </div>

      {state.phase === "done" && (
        <div className="mt-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-xs text-[rgb(var(--app-text-muted))]">
              {pipelineInspectionSummary(state.result.summary, inspectedRuns.length)}
            </p>
            <ActionButton
              type="button"
              tone="quiet"
              className="shrink-0 min-h-7 px-2 text-[rgb(var(--app-accent-readable))]"
              onClick={() => onAnalyze(row)}
            >
              Diagnose in Inspector
            </ActionButton>
          </div>
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
            <StatusBadge className={
              state.phase === "analysis_error"
                ? "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/35"
                : "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]"
            }>
              {state.phase === "analyzing"
                ? "Analyzing"
                : state.phase === "analysis_error"
                  ? "Error"
              : "Ready"}
            </StatusBadge>
          </div>
          <div className={pipelineAnalysisPreviewClass()}>
            <MarkdownContent markdown={state.analysis || "Starting analysis..."} />
          </div>
          <ActionButton
            type="button"
            tone="quiet"
            onClick={() => onOpenDetails(row)}
            className="mt-2 min-h-7 px-0 py-1 text-[rgb(var(--app-accent-readable))] hover:underline"
          >
            Open analysis
          </ActionButton>
        </div>
      )}

      {state.phase === "approval" && (
        <div data-approval-style="compact">
        <InlineNotice tone="info" title="Review before running">
          <span className="sr-only">Approval required</span>
          <p>{state.result.summary}. Review and confirm the proposal in Chat.</p>
          <ActionLink href="#/chat" tone="secondary" className="mt-2 w-fit">
            Open Chat approval
          </ActionLink>
        </InlineNotice>
        </div>
      )}

      {state.phase === "target_failure" && (
        <PipelineTargetFailureNotice
          failure={state.failure}
          onSelectCandidate={(candidateId) => onSelectCandidate(row, candidateId)}
          onRefresh={() => onRefreshPipelines(row)}
        />
      )}

      {state.phase === "error" && (
        <div className="mt-3"><InlineNotice tone="danger" title="Pipeline action failed">{state.message}</InlineNotice></div>
      )}

      <div className={pipelineActionRowClass()}>
        {row.source === "discovered" && (
          <ActionButton
            type="button"
            tone="quiet"
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
            tone="quiet"
            onClick={() => onOpenDetails(row)}
          >
            Details
          </ActionButton>
        )}
        <ActionButton
          type="button"
          tone="quiet"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onInspect(row)}
          loading={state.phase === "loading"}
        >
          {state.phase === "loading" ? "Working..." : "Inspect runs"}
        </ActionButton>
        <ActionButton
          type="button"
          tone="quiet"
          disabled={state.phase === "loading" || state.phase === "analyzing"}
          onClick={() => onAnalyze(row)}
          loading={state.phase === "analyzing"}
        >
          AI analyze
        </ActionButton>
        <ActionButton
          tone="primary"
          type="button"
          disabled={triggerDisabled}
          onClick={() => onTrigger(row)}
        >
          {state.phase === "approval" ? "Approval pending" : "Trigger pipeline"}
        </ActionButton>
      </div>
    </article>
  );
}

export function pipelineActionRowClass(): string {
  return "mt-3 flex flex-wrap justify-start gap-2 border-t border-[rgb(var(--app-border))] pt-3 sm:justify-end";
}

/** A pending proposal owns this mutation until it is approved, skipped, or resolved in Chat. */
export function canTriggerPipeline(state: PipelineInspectState): boolean {
  return state.phase !== "loading" && state.phase !== "analyzing" && state.phase !== "approval";
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

/**
 * MP-010: typed target-resolution failures with per-kind recovery. The page
 * keeps the user in control: ambiguous targets require an explicit choice,
 * authorization failures point at the reauthorize path, and connector or
 * capability problems are never disguised as a missing pipeline.
 */
function PipelineTargetFailureNotice({
  failure,
  onSelectCandidate,
  onRefresh,
}: {
  failure: NonNullable<ChatWorkflowActionResult["failure"]>;
  onSelectCandidate: (candidateId: number) => void;
  onRefresh: () => void;
}): JSX.Element {
  if (failure.kind === "ambiguous_target" && failure.candidates && failure.candidates.length > 0) {
    return (
      <InlineNotice tone="warning" title="Multiple pipelines match">
        <p>{failure.message}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {failure.candidates.map((candidate) => (
            <ActionButton
              key={candidate.id}
              type="button"
              tone="secondary"
              className="min-h-7 px-2"
              onClick={() => onSelectCandidate(candidate.id)}
            >
              #{candidate.id} {candidate.name}
            </ActionButton>
          ))}
        </div>
      </InlineNotice>
    );
  }
  if (failure.kind === "unauthorized") {
    return (
      <InlineNotice tone="warning" title="Azure DevOps access required">
        <p>{failure.message}</p>
        <ActionLink href="#/project-links" tone="secondary" className="mt-2 w-fit">
          Re-authorize in Project Link
        </ActionLink>
      </InlineNotice>
    );
  }
  if (failure.kind === "capability_missing" || failure.kind === "connector_unavailable") {
    return (
      <InlineNotice tone="warning" title="Pipeline connector unavailable">
        <p>{failure.message}</p>
        <ActionLink href="#/project-links" tone="secondary" className="mt-2 w-fit">
          Open connector settings
        </ActionLink>
      </InlineNotice>
    );
  }
  return (
    <InlineNotice tone="warning" title="Pipeline not found">
      <p>{failure.message}</p>
      {failure.candidates && failure.candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {failure.candidates.map((candidate) => (
            <ActionButton
              key={candidate.id}
              type="button"
              tone="secondary"
              className="min-h-7 px-2"
              onClick={() => onSelectCandidate(candidate.id)}
            >
              #{candidate.id} {candidate.name}
            </ActionButton>
          ))}
        </div>
      )}
      <ActionButton type="button" tone="quiet" className="mt-2 min-h-7" onClick={onRefresh}>
        Refresh pipeline list
      </ActionButton>
    </InlineNotice>
  );
}

/** A compact card must never render raw tool output; full evidence lives in Details. */
export function pipelineInspectionSummary(_rawSummary: string, runCount: number): string {
  if (runCount === 0) return "Inspection completed. No recent pipeline runs were returned.";
  return `Inspection completed. ${runCount} recent run${runCount === 1 ? " is" : "s are"} available in Details.`;
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
