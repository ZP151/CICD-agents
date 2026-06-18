import type { Bubble } from "../chat.types.js";

interface ConfirmCardProps {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ bubble, onConfirm, onCancel }: ConfirmCardProps) {
  if (bubble.confirmed !== null && bubble.confirmed !== undefined) {
    return (
      <div className="my-2 rounded-xl border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm">
        <span className={bubble.confirmed ? "text-green-400" : "text-zinc-500"}>
          {bubble.confirmed ? "Confirmed - executing..." : "Cancelled."}
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${legacyRiskColor(bubble.riskLevel)}`}>
          {(bubble.riskLevel ?? "medium").toUpperCase()} RISK
        </span>
        <span className="text-xs text-zinc-400">Confirm before proceeding</span>
      </div>
      {bubble.plan && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-200">{bubble.plan}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-600 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 active:scale-95"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function legacyRiskColor(level = "low") {
  if (level === "high") return "text-red-400 bg-red-900/30";
  if (level === "medium") return "text-yellow-400 bg-yellow-900/30";
  return "text-green-400 bg-green-900/30";
}
