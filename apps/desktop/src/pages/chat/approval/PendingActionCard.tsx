import { useState } from "react";
import { toolCommandPreview } from "../../../components/conversation/ApprovalEvidenceModel.js";
import { ActionButton, StatusBadge, WorkbenchTextArea } from "../../../components/workbench/WorkbenchPrimitives.js";
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
      data-approval-style="compact"
      className="my-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 px-3 pt-3">
          <span className="font-semibold text-[rgb(var(--app-text))]">Review before running</span>
        </div>
        <StatusBadge className={`mr-3 mt-3 uppercase tracking-wide ${approvalRiskClass(riskLevel)}`} tone={approvalRiskTone(riskLevel)}>
          {riskLevel.toUpperCase()} risk
        </StatusBadge>
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
        <details className="border-t border-[rgb(var(--app-border))] px-3 py-2 text-[rgb(var(--app-text-muted))]">
          <summary className="cursor-pointer text-[11px] font-medium">Review command</summary>
          <div className="mt-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-2.5 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">Command to execute</p>
            <code className="block whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text))]">
              {commandPreview}
            </code>
          </div>
        </details>
      )}

      <div className="space-y-2 px-3 py-3">
      <details>
        <summary className="cursor-pointer text-[11px] font-medium text-[rgb(var(--app-text-muted))]">Request changes</summary>
        <label className="mt-2 block">
          <span className="sr-only">Change request</span>
          <WorkbenchTextArea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            placeholder="Tell MergePilot what to do differently..."
            className="resize-none"
          />
        </label>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          type="button"
          onClick={onConfirm}
          tone="primary"
        >
          Approve and run
        </ActionButton>
        <ActionButton
          type="button"
          onClick={() => onCancel(feedback)}
          tone="secondary"
        >
          Skip action
        </ActionButton>
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

function approvalRiskTone(level?: string): "danger" | "success" | "warning" {
  if (level === "high") return "danger";
  if (level === "low") return "success";
  return "warning";
}

function approvalStatusDotClass(status: "executing"): string {
  return "bg-[rgb(var(--app-accent))]";
}

function workflowStageLabel(kind?: string, phase?: string): string | null {
  if (!kind) return null;
  if (!phase) return `${kind} workflow`;
  return `${kind} workflow · ${phase.replaceAll("_", " ")}`;
}
