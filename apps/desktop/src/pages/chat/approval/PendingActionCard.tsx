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
  const actionTitle = bubble.pendingDescription ?? "Review this action before it runs";
  const workflowLabel = workflowStageLabel(bubble.pendingWorkflow?.kind, bubble.pendingWorkflow?.phase);

  return (
    <section
      aria-labelledby={`${bubble.id}-approval-title`}
      data-risk-level={riskLevel}
      data-testid="pending-action-card"
      className="my-3 overflow-hidden rounded-lg border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] text-xs shadow-[0_3px_8px_rgb(0_0_0_/_0.16)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 px-3 pt-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--app-warning))]/15 text-[11px] font-bold text-[rgb(var(--app-warning))]" aria-hidden="true">!</span>
          <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
        </div>
        <span className={`mr-3 mt-3 rounded border border-current/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${approvalRiskClass(riskLevel)}`}>
          {riskLevel.toUpperCase()} risk
        </span>
      </div>

      <div className="px-3 pb-3 pt-2">
        <h3 id={`${bubble.id}-approval-title`} className="text-sm font-semibold leading-5 text-[rgb(var(--app-text))]">
          {actionTitle}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[rgb(var(--app-text-muted))]">
          {bubble.pendingTool && (
            <span className="font-mono text-[rgb(var(--app-text-subtle))]">{bubble.pendingTool}</span>
          )}
          {workflowLabel && <span aria-hidden="true">·</span>}
          {workflowLabel && <span>{workflowLabel}</span>}
          <span aria-hidden="true">·</span>
          <span>Nothing runs until you approve.</span>
        </div>
      </div>

      {commandPreview && (
        <div className="border-y border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">Command to execute</p>
          <code className="block whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text))]">
            {commandPreview}
          </code>
        </div>
      )}

      <div className="space-y-2 px-3 py-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-[rgb(var(--app-text-muted))]">Change request <span className="font-normal text-[rgb(var(--app-text-subtle))]">(optional)</span></span>
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={2}
          placeholder="Tell MergePilot what to do differently..."
          className="w-full resize-none rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-xs text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] focus:border-[rgb(var(--app-accent))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-[rgb(var(--app-accent))] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          Approve and run
        </button>
        <button
          type="button"
          onClick={() => onCancel(feedback)}
          className="rounded-md border border-[rgb(var(--app-border-strong))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          Skip action
        </button>
      </div>
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
    </div>
  );
}

function approvalRiskClass(level?: string): string {
  if (level === "high") return "text-[rgb(var(--app-danger))]";
  if (level === "low") return "text-[rgb(var(--app-success))]";
  return "text-[rgb(var(--app-warning))]";
}

function approvalStatusDotClass(status: "executing"): string {
  return "bg-[rgb(var(--app-accent))]";
}

function workflowStageLabel(kind?: string, phase?: string): string | null {
  if (!kind) return null;
  if (!phase) return `${kind} workflow`;
  return `${kind} workflow · ${phase.replaceAll("_", " ")}`;
}
