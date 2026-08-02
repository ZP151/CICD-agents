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
import { ActivityDetailSection, ActivityFact, ActivityFactGrid } from "./ActivityDetailPrimitives.js";
import { WorkbenchDisclosure } from "../../components/workbench/WorkbenchPrimitives.js";

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
    ? "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]"
    : "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]";
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

      <ActivityFactGrid className={checkpointMetadataGridClass()}>
        <ActivityFact label="Repository" mono>
          <span title={checkpoint.repoPath}>{checkpoint.repoPath}</span>
        </ActivityFact>
        <ActivityFact label="Session" mono>
          <span title={checkpoint.sessionId}>{checkpoint.sessionId}</span>
        </ActivityFact>
      </ActivityFactGrid>

      <ActivityDetailSection title={checkpoint.targetCheckpointId ? "Safety snapshot path" : "Snapshot path"}>
        <p className="break-all font-mono text-xs text-[rgb(var(--app-text))]">{checkpoint.checkpointPath}</p>
      </ActivityDetailSection>

      {checkpoint.targetCheckpointId && <CheckpointApplySummary checkpoint={checkpoint} />}
      <CheckpointRollbackPlanSection
        rollbackPlan={rollbackPlan}
        rollbackLoading={rollbackLoading}
        onOpenRollbackPlanInChat={onOpenRollbackPlanInChat}
      />
      <CheckpointPreviewSection preview={preview} previewLoading={previewLoading} />

      {checkpoint.toolSummary && (
        <ActivityDetailSection title="Tool Result">
          <p className="break-words text-sm text-[rgb(var(--app-text))]">
            {toolSummary ?? "Structured checkpoint tool output is available."}
          </p>
          <WorkbenchDisclosure label="Raw output">
            <p className="break-words font-mono text-xs text-[rgb(var(--app-text))]">
              {checkpoint.toolSummary}
            </p>
          </WorkbenchDisclosure>
        </ActivityDetailSection>
      )}
    </div>
  );
}

export function checkpointMetadataGridClass(): string {
  return "min-w-0 gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]";
}

export function checkpointApplySummaryGridClass(): string {
  return "gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
}

function CheckpointApplySummary({
  checkpoint,
}: {
  checkpoint: ChatCheckpointActivity;
}): JSX.Element {
  return (
    <ActivityDetailSection title="Checkpoint apply">
      <ActivityFactGrid className={checkpointApplySummaryGridClass()}>
        <ActivityFact label="Restored checkpoint" mono>{checkpoint.targetCheckpointId}</ActivityFact>
        <ActivityFact label="Apply mode" mono>{checkpoint.applyMode ?? "not available"}</ActivityFact>
      </ActivityFactGrid>
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
    </ActivityDetailSection>
  );
}
