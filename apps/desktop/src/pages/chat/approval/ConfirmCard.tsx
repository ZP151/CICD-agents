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
    <div className="my-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-warning))]" />
        <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
        <StatusBadge tone={legacyRiskTone(bubble.riskLevel)} className="uppercase tracking-wide">
          {(bubble.riskLevel ?? "medium").toUpperCase()} risk
        </StatusBadge>
      </div>
      <div className="flex gap-2">
        <ActionButton
          type="button"
          onClick={onConfirm}
          tone="primary"
        >
          Yes, run this action
        </ActionButton>
        <ActionButton
          type="button"
          onClick={onCancel}
          tone="secondary"
        >
          No, don't run it
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
