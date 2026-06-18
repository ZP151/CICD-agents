import {
  approvalPreflightRows,
  approvalRows,
  toolCommandPreview,
  workflowBoundaryText,
  type ApprovalEvidenceProps,
} from "./ApprovalEvidenceModel.js";

export {
  toolCommandPreview,
  type ApprovalEvidenceProps,
  type ApprovalPreflightEvidence,
  type ApprovalReadinessEvidence,
  type ApprovalWorkflowEvidence,
} from "./ApprovalEvidenceModel.js";

export function ApprovalEvidence({
  toolName,
  args,
  nextHint,
  workflow,
  readiness,
  preflight,
}: ApprovalEvidenceProps) {
  const rows = approvalRows(toolName, args, workflow);
  const preflightRows = approvalPreflightRows(preflight);
  const command = toolCommandPreview(toolName, args);
  if (!toolName && rows.length === 0 && !workflow && !readiness && !preflight && !nextHint) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] px-3 py-2">
        <span className="font-medium text-[rgb(var(--app-text))]">Scope and checks</span>
        {workflow && (
          <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            {workflow.kind}:{workflow.phase}
          </span>
        )}
      </div>
      <div className="space-y-3 px-3 py-2.5">
        {command && (
          <div>
            <p className="mb-1 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
              Command preview
            </p>
            <code className="block whitespace-pre-wrap break-words rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1.5 font-mono text-[11px] text-[rgb(var(--app-text-muted))]">
              {command}
            </code>
          </div>
        )}

        <EvidenceRows rows={rows} />
        <EvidenceRows rows={preflightRows} separated />

        <div className="space-y-1.5 border-t border-[rgb(var(--app-border))] pt-2">
          {workflow && (
            <EvidenceNote
              label="Boundary"
              text={workflowBoundaryText(workflow, nextHint)}
            />
          )}
          {readiness?.summary && <EvidenceNote label="Readiness" text={readiness.summary} />}
          {preflight?.summary && <EvidenceNote label="Preflight" text={preflight.summary} />}
          {!workflow && nextHint && <EvidenceNote label="Next" text={nextHint} />}
        </div>
      </div>
    </div>
  );
}

function EvidenceRows({
  rows,
  separated = false,
}: {
  rows: Array<{ label: string; value: string }>;
  separated?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <dl className={`grid gap-x-3 gap-y-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)]${separated ? " border-t border-[rgb(var(--app-border))] pt-2" : ""}`}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-[rgb(var(--app-text-subtle))]">{row.label}</dt>
          <dd className="min-w-0 break-words font-mono text-[11px] text-[rgb(var(--app-text-muted))]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceNote({ label, text }: { label: string; text: string }) {
  return (
    <p className="leading-relaxed text-[rgb(var(--app-text-muted))]">
      <span className="font-medium text-[rgb(var(--app-text-subtle))]">{label}: </span>
      {text}
    </p>
  );
}
