import { ApprovalEvidence } from "../../../components/conversation/ApprovalEvidence.js";
import type { Bubble } from "../chat.types.js";

interface PendingActionCardProps {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PendingActionCard({ bubble, onConfirm, onCancel }: PendingActionCardProps) {
  const status = bubble.pendingStatus ?? "waiting";

  if (status === "executing") {
    return (
      <ApprovalStateCard
        status="executing"
        label="Executing approved action"
        description={bubble.pendingDescription}
      />
    );
  }
  if (status === "done") {
    return (
      <ApprovalStateCard
        status="done"
        label="Approved action finished"
        description={bubble.pendingDescription}
      />
    );
  }
  if (status === "cancelled") {
    return (
      <ApprovalStateCard
        status="cancelled"
        label="Approval skipped"
        description={bubble.pendingDescription}
      />
    );
  }

  const riskLevel = bubble.riskLevel ?? "medium";

  return (
    <section className="my-2 overflow-hidden rounded-lg border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] text-xs shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
          {bubble.pendingTool && (
            <span className="truncate rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">
              {bubble.pendingTool}
            </span>
          )}
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${approvalRiskClass(riskLevel)}`}>
          {riskLevel.toUpperCase()} risk
        </span>
      </div>
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-relaxed text-[rgb(var(--app-text))]">
            {bubble.pendingDescription}
          </p>
          {bubble.pendingNextHint && (
            <p className="mt-1.5 leading-relaxed text-[rgb(var(--app-text-muted))]">
              <span className="font-medium text-[rgb(var(--app-text-subtle))]">Next: </span>
              {bubble.pendingNextHint}
            </p>
          )}
          <ApprovalEvidence
            toolName={bubble.pendingTool}
            args={bubble.pendingArgs}
            nextHint={bubble.pendingNextHint}
            workflow={bubble.pendingWorkflow}
            readiness={bubble.pendingReadiness}
            preflight={bubble.pendingPreflight}
          />
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2.5">
          <div>
            <p className="font-medium text-[rgb(var(--app-text))]">Decision</p>
            <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">
              Approving runs only the scoped action shown here.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app-surface-raised))] active:translate-y-px"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-[rgb(var(--app-border-strong))] px-3 py-2 text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app-surface-raised))] active:translate-y-px"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

interface ApprovalStateCardProps {
  status: "executing" | "done" | "cancelled";
  label: string;
  description?: string;
}

function ApprovalStateCard({ status, label, description }: ApprovalStateCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${approvalStatusDotClass(status)}`} />
      <span className="font-medium text-[rgb(var(--app-text-subtle))]">{label}</span>
      {description && <span className="min-w-0 truncate">{description}</span>}
      {status === "executing" ? <ApprovalBusyDots /> : <span className="ml-auto text-[10px] uppercase">{status}</span>}
    </div>
  );
}

function approvalRiskClass(level?: string): string {
  if (level === "high") return "border-red-400/40 bg-red-500/10 text-red-500";
  if (level === "low") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-600";
  return "border-amber-400/40 bg-amber-500/10 text-amber-600";
}

function approvalStatusDotClass(status: "executing" | "done" | "cancelled"): string {
  if (status === "done") return "bg-emerald-500";
  if (status === "cancelled") return "bg-zinc-400";
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
