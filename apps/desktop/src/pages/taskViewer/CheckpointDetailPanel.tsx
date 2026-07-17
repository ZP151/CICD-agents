import type {
  ChatCheckpointActivity,
  ChatCheckpointPreview,
  ChatCheckpointRollbackPlan,
} from "../../api.js";
import { formatTime } from "./activityPresentation.js";
import { checkpointActivityKindLabel } from "./checkpointActivity.js";
import { CheckpointPreviewSection } from "./CheckpointPreviewSection.js";
import { CheckpointRollbackPlanSection } from "./CheckpointRollbackPlanSection.js";
import { operationDetailSummary } from "./operationDetailSummary.js";

interface CheckpointDetailPanelProps {
  checkpoint: ChatCheckpointActivity;
  preview: ChatCheckpointPreview | null;
  rollbackPlan: ChatCheckpointRollbackPlan | null;
  previewLoading: boolean;
  rollbackLoading: boolean;
  onOpenRollbackPlanInChat: () => void;
}

function checkpointStatusClass(ok: boolean): string {
  return ok
    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
    : "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300";
}

export function CheckpointDetailPanel({
  checkpoint,
  preview,
  rollbackPlan,
  previewLoading,
  rollbackLoading,
  onOpenRollbackPlanInChat,
}: CheckpointDetailPanelProps): JSX.Element {
  const toolSummary = checkpoint.toolSummary
    ? operationDetailSummary(checkpoint.toolSummary)
    : null;

  return (
    <div className="space-y-5">
      <header className="border-b border-[rgb(var(--app-border))] pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${checkpointStatusClass(checkpoint.toolOk !== false)}`}
          >
            {checkpointActivityKindLabel(checkpoint)}
          </span>
          <span className="text-xs text-[rgb(var(--app-text-muted))]">{checkpoint.toolName}</span>
          <span className="text-xs text-[rgb(var(--app-text-muted))]">
            {formatTime(checkpoint.at)}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-[rgb(var(--app-text))]">
          {checkpoint.targetCheckpointId
            ? "Checkpoint apply safety snapshot"
            : "Git checkpoint before confirmed action"}
        </h2>
        <p className="mt-1 font-mono text-xs text-[rgb(var(--app-text-muted))]">
          {checkpoint.checkpointId}
        </p>
      </header>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Repository</p>
          <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
            {checkpoint.repoPath}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Session</p>
          <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
            {checkpoint.sessionId}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          {checkpoint.targetCheckpointId ? "Safety Snapshot Path" : "Snapshot Path"}
        </h3>
        <p className="break-words font-mono text-xs text-[rgb(var(--app-text))]">
          {checkpoint.checkpointPath}
        </p>
      </section>

      {checkpoint.targetCheckpointId && <CheckpointApplySummary checkpoint={checkpoint} />}
      <CheckpointRollbackPlanSection
        rollbackPlan={rollbackPlan}
        rollbackLoading={rollbackLoading}
        onOpenRollbackPlanInChat={onOpenRollbackPlanInChat}
      />
      <CheckpointPreviewSection preview={preview} previewLoading={previewLoading} />

      {checkpoint.toolSummary && (
        <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            Tool Result
          </h3>
          <p className="break-words text-sm text-[rgb(var(--app-text))]">
            {toolSummary ?? "Structured checkpoint tool output is available."}
          </p>
          <details className="mt-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2">
            <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--app-text-muted))]">
              Raw output
            </summary>
            <p className="mt-2 break-words font-mono text-xs text-[rgb(var(--app-text))]">
              {checkpoint.toolSummary}
            </p>
          </details>
        </section>
      )}
    </div>
  );
}

function CheckpointApplySummary({
  checkpoint,
}: {
  checkpoint: ChatCheckpointActivity;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        Checkpoint Apply
      </h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Restored Checkpoint</p>
          <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
            {checkpoint.targetCheckpointId}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Apply Mode</p>
          <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
            {checkpoint.applyMode ?? "not available"}
          </p>
        </div>
      </div>
      {checkpoint.restoredFiles && checkpoint.restoredFiles.length > 0 && (
        <p className="mt-3 text-xs text-[rgb(var(--app-text-subtle))]">
          Restored files: {checkpoint.restoredFiles.slice(0, 8).join(", ")}
          {checkpoint.restoredFiles.length > 8
            ? `, +${checkpoint.restoredFiles.length - 8} more`
            : ""}
        </p>
      )}
      <p className="mt-3 text-xs text-[rgb(var(--app-text-subtle))]">
        Preview and rollback planning below use the safety snapshot captured immediately before this
        apply action.
      </p>
    </section>
  );
}
