import { useState } from "react";
import { toolCommandPreview } from "../../../components/conversation/ApprovalEvidenceModel.js";
import type { Bubble } from "../chat.types.js";

interface PendingActionCardProps {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: (feedback?: string) => void;
}

export function PendingActionCard({ bubble, onConfirm, onCancel }: PendingActionCardProps) {
  const [feedback, setFeedback] = useState("");
  const status = bubble.pendingStatus ?? "waiting";

  if (status === "executing") {
    return (
      <ApprovalStateCard
        status="executing"
        label="Executing approved action"
      />
    );
  }
  if (status === "done" || status === "cancelled") return null;

  const riskLevel = bubble.riskLevel ?? "medium";
  const commandPreview = toolCommandPreview(bubble.pendingTool, bubble.pendingArgs);

  return (
    <section className="my-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-warning))]" />
          <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
        </div>
        <span className={`text-[10px] font-semibold ${approvalRiskClass(riskLevel)}`}>
          {riskLevel.toUpperCase()} risk
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-[rgb(var(--app-text))]">
        Approve this command?
      </p>
      {commandPreview && (
        <code className="mt-2 block rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text))]">
          {commandPreview}
        </code>
      )}

      <label className="mt-2 block">
        <span className="sr-only">Tell MergePilot what to do differently</span>
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={2}
          placeholder="Tell MergePilot what to do differently..."
          className="w-full resize-none rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-xs text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] focus:border-[rgb(var(--app-accent))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20"
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:translate-y-px"
        >
          Yes, run this action
        </button>
        <button
          type="button"
          onClick={() => onCancel(feedback)}
          className="rounded-md border border-[rgb(var(--app-border-strong))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          No, don't run it
        </button>
      </div>
    </section>
  );
}

interface ApprovalStateCardProps {
  status: "executing";
  label: string;
}

function ApprovalStateCard({ status, label }: ApprovalStateCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${approvalStatusDotClass(status)}`} />
      <span className="font-medium text-[rgb(var(--app-text-subtle))]">{label}</span>
      <ApprovalBusyDots />
    </div>
  );
}

function approvalRiskClass(level?: string): string {
  if (level === "high") return "text-red-500";
  if (level === "low") return "text-emerald-600";
  return "text-amber-600";
}

function approvalStatusDotClass(status: "executing"): string {
  return "bg-blue-500";
}

function ApprovalBusyDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
