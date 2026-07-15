import type { ChatCheckpointRollbackPlan } from "../../api.js";

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
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Rollback Plan
        </h3>
        {rollbackLoading && <span className="text-[11px] text-zinc-600">Loading</span>}
      </div>
      {!rollbackLoading && !rollbackPlan && (
        <p className="text-sm text-zinc-600">No rollback plan available for this checkpoint.</p>
      )}
      {rollbackPlan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                rollbackPlan.supported
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200"
              }`}
            >
              {rollbackPlan.supported ? "proposal ready" : "planning only"}
            </span>
            <span className="font-mono text-xs text-zinc-600">{rollbackPlan.mode}</span>
          </div>
          <p className="text-sm text-zinc-800">{rollbackPlan.reason}</p>
          {rollbackPlan.proposal && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-600">Confirmed Action Proposal</p>
                <button
                  onClick={onOpenRollbackPlanInChat}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
                >
                  Open in Chat for approval
                </button>
              </div>
              <p className="text-sm text-zinc-800">{rollbackPlan.proposal.description}</p>
              <pre className="mt-2 overflow-auto text-xs text-zinc-500">
                {JSON.stringify(
                  {
                    tool: rollbackPlan.proposal.tool,
                    args: rollbackPlan.proposal.args,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          )}
          {rollbackPlan.requiredCapability && (
            <p className="font-mono text-xs text-zinc-500">
              Required capability: {rollbackPlan.requiredCapability}
            </p>
          )}
          {rollbackPlan.currentTrackedPaths.length > 0 && (
            <p className="text-xs text-zinc-500">
              Tracked paths to restore: {rollbackPlan.currentTrackedPaths.slice(0, 8).join(", ")}
              {rollbackPlan.currentTrackedPaths.length > 8
                ? `, +${rollbackPlan.currentTrackedPaths.length - 8} more`
                : ""}
            </p>
          )}
          {rollbackPlan.warnings.length > 0 && (
            <div className="space-y-1">
              {rollbackPlan.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-700">
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
