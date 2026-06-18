import type {
  ChatCheckpointActivity,
  ChatCheckpointPreview,
  ChatCheckpointRollbackPlan,
} from "../../api.js";
import { checkpointActivityKindLabel } from "./checkpointActivity.js";
import { CheckpointPreviewSection } from "./CheckpointPreviewSection.js";
import { CheckpointRollbackPlanSection } from "./CheckpointRollbackPlanSection.js";

interface CheckpointDetailPanelProps {
  checkpoint: ChatCheckpointActivity;
  preview: ChatCheckpointPreview | null;
  rollbackPlan: ChatCheckpointRollbackPlan | null;
  previewLoading: boolean;
  rollbackLoading: boolean;
  onOpenRollbackPlanInChat: () => void;
}

function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function checkpointStatusClass(ok: boolean): string {
  return ok
    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
    : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
}

export function CheckpointDetailPanel({
  checkpoint,
  preview,
  rollbackPlan,
  previewLoading,
  rollbackLoading,
  onOpenRollbackPlanInChat,
}: CheckpointDetailPanelProps): JSX.Element {
  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-800/70 pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${checkpointStatusClass(checkpoint.toolOk !== false)}`}
          >
            {checkpointActivityKindLabel(checkpoint)}
          </span>
          <span className="text-xs text-zinc-600">{checkpoint.toolName}</span>
          <span className="text-xs text-zinc-600">{formatTime(checkpoint.at)}</span>
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">
          {checkpoint.targetCheckpointId
            ? "Checkpoint apply safety snapshot"
            : "Git checkpoint before confirmed action"}
        </h2>
        <p className="mt-1 font-mono text-xs text-zinc-600">{checkpoint.checkpointId}</p>
      </header>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Repository</p>
          <p className="mt-1 break-words font-mono text-zinc-300">{checkpoint.repoPath}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Session</p>
          <p className="mt-1 break-words font-mono text-zinc-300">{checkpoint.sessionId}</p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {checkpoint.targetCheckpointId ? "Safety Snapshot Path" : "Snapshot Path"}
        </h3>
        <p className="break-words font-mono text-xs text-zinc-300">{checkpoint.checkpointPath}</p>
      </section>

      {checkpoint.targetCheckpointId && <CheckpointApplySummary checkpoint={checkpoint} />}
      <CheckpointRollbackPlanSection
        rollbackPlan={rollbackPlan}
        rollbackLoading={rollbackLoading}
        onOpenRollbackPlanInChat={onOpenRollbackPlanInChat}
      />
      <CheckpointPreviewSection preview={preview} previewLoading={previewLoading} />

      {checkpoint.toolSummary && (
        <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Tool Result
          </h3>
          <p className="break-words font-mono text-xs text-zinc-300">{checkpoint.toolSummary}</p>
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
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Checkpoint Apply
      </h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-zinc-600">Restored Checkpoint</p>
          <p className="mt-1 break-words font-mono text-zinc-300">
            {checkpoint.targetCheckpointId}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Apply Mode</p>
          <p className="mt-1 break-words font-mono text-zinc-300">
            {checkpoint.applyMode ?? "unknown"}
          </p>
        </div>
      </div>
      {checkpoint.restoredFiles && checkpoint.restoredFiles.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          Restored files: {checkpoint.restoredFiles.slice(0, 8).join(", ")}
          {checkpoint.restoredFiles.length > 8
            ? `, +${checkpoint.restoredFiles.length - 8} more`
            : ""}
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Preview and rollback planning below use the safety snapshot captured immediately before this
        apply action.
      </p>
    </section>
  );
}
