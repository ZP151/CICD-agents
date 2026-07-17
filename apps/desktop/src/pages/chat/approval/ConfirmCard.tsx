import type { Bubble } from "../chat.types.js";

interface ConfirmCardProps {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ bubble, onConfirm, onCancel }: ConfirmCardProps) {
  if (bubble.confirmed !== null && bubble.confirmed !== undefined) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
        <span className={`h-1.5 w-1.5 rounded-full ${bubble.confirmed ? "bg-emerald-500" : "bg-zinc-400"}`} />
        <span>{bubble.confirmed ? "Confirmed - executing..." : "Action not run."}</span>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-warning))]" />
        <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
        <span className={`text-[10px] font-semibold ${legacyRiskColor(bubble.riskLevel)}`}>
          {(bubble.riskLevel ?? "medium").toUpperCase()} risk
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:translate-y-px"
        >
          Yes, run this action
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-[rgb(var(--app-border-strong))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          No, don't run it
        </button>
      </div>
    </div>
  );
}

function legacyRiskColor(level = "low") {
  if (level === "high") return "text-red-500";
  if (level === "medium") return "text-amber-600";
  return "text-emerald-600";
}
