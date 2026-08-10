import type { Bubble } from "../chat.types.js";
import { ActionButton, StatusBadge } from "../../../components/workbench/WorkbenchPrimitives.js";

interface ConfirmCardProps {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ bubble, onConfirm, onCancel }: ConfirmCardProps) {
  if (bubble.confirmed !== null && bubble.confirmed !== undefined) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
        <span className={`h-1.5 w-1.5 rounded-full ${bubble.confirmed ? "bg-[rgb(var(--app-success))]" : "bg-[rgb(var(--app-text-subtle))]"}`} />
        <span>{bubble.confirmed ? "Confirmed - executing..." : "Action not run."}</span>
      </div>
    );
  }

  return (
    <div data-approval-style="compact" className="my-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-warning))]" />
          <span className="font-semibold text-[rgb(var(--app-text))]">Review before running</span>
          <span className="sr-only">Approval required</span>
        </div>
        <StatusBadge tone={legacyRiskTone(bubble.riskLevel)} className="uppercase tracking-wide">
          {(bubble.riskLevel ?? "medium").toUpperCase()} risk
        </StatusBadge>
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          type="button"
          onClick={onConfirm}
          tone="primary"
        >
          Approve and run
        </ActionButton>
        <ActionButton
          type="button"
          onClick={onCancel}
          tone="secondary"
        >
          Skip action
        </ActionButton>
      </div>
    </div>
  );
}

function legacyRiskTone(level?: string): "danger" | "success" | "warning" {
  if (level === "high") return "danger";
  if (level === "low") return "success";
  return "warning";
}
