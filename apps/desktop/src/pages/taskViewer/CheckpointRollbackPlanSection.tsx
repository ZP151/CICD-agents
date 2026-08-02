import type { ChatCheckpointRollbackPlan } from "../../api.js";
import { WorkbenchDisclosure } from "../../components/workbench/WorkbenchPrimitives.js";

interface CheckpointRollbackPlanSectionProps {
  rollbackPlan: ChatCheckpointRollbackPlan | null;
  rollbackLoading: boolean;
  onOpenRollbackPlanInChat: () => void;
}

export function CheckpointRollbackPlanSection({
  rollbackPlan,
  rollbackLoading,
  onOpenRollbackPlanInChat,
}: CheckpointRollbackPlanSectionProps): JSX.Element {
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Rollback Plan
        </h3>
        {rollbackLoading && (
          <span className="rounded-full bg-[rgb(var(--app-surface-raised))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-muted))] ring-1 ring-[rgb(var(--app-border))]">
            Preparing recovery
          </span>
        )}
      </div>
      {rollbackLoading && !rollbackPlan && (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Checking whether this checkpoint can be restored safely...
        </p>
      )}
      {!rollbackLoading && !rollbackPlan && (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          No rollback plan available for this checkpoint.
        </p>
      )}
      {rollbackPlan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                rollbackPlan.supported
                  ? "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]"
                  : "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]"
              }`}
            >
              {rollbackPlan.supported ? "proposal ready" : "planning only"}
            </span>
            <span className="font-mono text-xs text-[rgb(var(--app-text-muted))]">
              {rollbackPlan.mode}
            </span>
          </div>
          <p className="text-sm text-[rgb(var(--app-text))]">{rollbackPlan.reason}</p>
          {rollbackPlan.proposal && (
            <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  Confirmed Action Proposal
                </p>
                <button
                  onClick={onOpenRollbackPlanInChat}
                  className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
                >
                  Open in Chat for approval
                </button>
              </div>
              <p className="text-sm text-[rgb(var(--app-text))]">
                {rollbackPlan.proposal.description}
              </p>
              <WorkbenchDisclosure label="Raw proposal">
                <pre className="max-h-48 overflow-auto text-xs text-[rgb(var(--app-text-subtle))]">
                  {JSON.stringify(
                    {
                      tool: rollbackPlan.proposal.tool,
                      args: rollbackPlan.proposal.args,
                    },
                    null,
                    2,
                  )}
                </pre>
              </WorkbenchDisclosure>
            </div>
          )}
          {rollbackPlan.requiredCapability && (
            <p className="font-mono text-xs text-[rgb(var(--app-text-subtle))]">
              Required capability: {rollbackPlan.requiredCapability}
            </p>
          )}
          {rollbackPlan.currentTrackedPaths.length > 0 && (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">
              Tracked paths to restore: {rollbackPlan.currentTrackedPaths.slice(0, 8).join(", ")}
              {rollbackPlan.currentTrackedPaths.length > 8
                ? `, +${rollbackPlan.currentTrackedPaths.length - 8} more`
                : ""}
            </p>
          )}
          {rollbackPlan.warnings.length > 0 && (
            <div className="space-y-1">
              {rollbackPlan.warnings.map((warning) => (
                <p key={warning} className="text-xs text-[rgb(var(--app-warning))]">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
