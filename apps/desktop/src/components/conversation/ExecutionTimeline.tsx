import type { ReactNode } from "react";
import { toolCommandPreview } from "./ApprovalEvidence.js";

export type ExecutionTimelineState = "input-streaming" | "input-available" | "running" | "result" | "error";

export interface ExecutionTimelineItem {
  id: string;
  toolName?: string;
  state: ExecutionTimelineState;
  ok?: boolean;
  input?: unknown;
  output?: unknown;
  summary?: string;
  open?: boolean;
  liveOutput?: string;
  approval?: ExecutionTimelineApproval;
}

export interface ExecutionTimelineApproval {
  id: string;
  toolName?: string;
  description?: string;
  riskLevel?: string;
}

export interface ExecutionTimelineProps {
  items: ExecutionTimelineItem[];
  onToggleItem: (id: string) => void;
  renderOutput?: (item: ExecutionTimelineItem) => ReactNode;
  renderApproval?: (item: ExecutionTimelineItem) => ReactNode;
}

export function ExecutionTimeline({ items, onToggleItem, renderOutput, renderApproval }: ExecutionTimelineProps) {
  if (items.length === 0) return null;

  const running = items.some((item) => isRunningState(item.state));
  const hasError = items.some((item) => item.state === "error" || item.ok === false);
  const hasApproval = items.some((item) => item.approval);
  const statusLabel = running
    ? "running"
    : hasError
      ? "error"
      : hasApproval
        ? "approval"
      : `${items.length} step${items.length === 1 ? "" : "s"}`;

  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-xs">
      <div className="flex items-center gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-[rgb(var(--app-text-subtle))]">
        <span className={timelineHeaderIconClass(hasError, running, hasApproval)} />
        <span className="font-medium text-[rgb(var(--app-text))]">Execution</span>
        <span className={timelineStatusPillClass(hasError, running, hasApproval)}>{statusLabel}</span>
      </div>

      <div className="divide-y divide-[rgb(var(--app-border))]">
        {items.map((item) => {
          const toolName = item.toolName ?? "unknown";
          const pending = isRunningState(item.state);
          const liveOutput = item.liveOutput?.trim() ?? "";
          const inputSummary = summarizeInput(item.input);
          const command = toolCommandPreview(toolName, objectInput(item.input));
          const outputSummary = item.summary || summarizeOutput(item.output);
          const hasOutput = Boolean(liveOutput) || (item.output !== undefined && !pending);
          const hasDetails = hasOutput || Boolean(inputSummary) || Boolean(command);

          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={hasDetails ? () => onToggleItem(item.id) : undefined}
                title={hasDetails ? `${item.open ? "Collapse" : "Expand"} ${toolName} details` : `${toolName} has no details`}
                aria-label={hasDetails ? `${item.open ? "Collapse" : "Expand"} ${toolName} details` : `${toolName} has no details`}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 ${
                  hasDetails ? "cursor-pointer hover:bg-[rgb(var(--app-surface-raised))] active:bg-[rgb(var(--app-bg-muted))]" : "cursor-default"
                }`}
              >
                <span className={timelineDotClass(item, pending)} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="max-w-[14rem] truncate font-mono text-[rgb(var(--app-accent))]">{toolName}</span>
                    <span className={timelineStatePillClass(item.state, item.ok)}>
                      {stateLabel(item.state)}
                    </span>
                    {item.approval && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]">
                        Approval pending
                      </span>
                    )}
                  </span>
                  {item.approval?.description && (
                    <span className="mt-1 block truncate text-amber-700 dark:text-amber-300">
                      {item.approval.description}
                    </span>
                  )}
                  {inputSummary && (
                    <span className="mt-1 block truncate font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
                      {inputSummary}
                    </span>
                  )}
                  {command && (
                    <span className="mt-1 block truncate rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-1.5 py-0.5 font-mono text-[11px] text-[rgb(var(--app-text-muted))]">
                      {command}
                    </span>
                  )}
                  {!pending && outputSummary && (
                    <span className="mt-1 block truncate text-[rgb(var(--app-text-muted))]">{outputSummary}</span>
                  )}
                  {pending && (
                    <span className="mt-1 block italic text-[rgb(var(--app-text-subtle))]">
                      {liveOutput ? "streaming output" : "running"}
                    </span>
                  )}
                </span>
                {hasDetails && (
                  <span className="mt-0.5 shrink-0 text-[rgb(var(--app-text-subtle))]">{item.open ? "▲" : "▼"}</span>
                )}
              </button>

              {item.open && hasDetails && (
                <div className="border-t border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
                  {command && (
                    <div className="mb-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2">
                      <p className="mb-1 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
                        Command
                      </p>
                      <code className="block whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                        {command}
                      </code>
                    </div>
                  )}
                  {inputSummary && (
                    <div className="mb-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2">
                      <p className="mb-1 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
                        Input
                      </p>
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                        {formatUnknown(item.input)}
                      </pre>
                    </div>
                  )}
                  {liveOutput && (
                    <pre className="mb-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                      {liveOutput}
                    </pre>
                  )}
                  {item.output !== undefined && !pending && (
                    renderOutput?.(item) ?? (
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                        {formatUnknown(item.output)}
                      </pre>
                    )
                  )}
                </div>
              )}

              {item.approval && (
                <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  {renderApproval?.(item) ?? (
                    <div className="rounded-md border border-amber-500/30 bg-[rgb(var(--app-surface))] p-2 text-xs text-[rgb(var(--app-warning))]">
                      <p className="font-medium text-[rgb(var(--app-text))]">Approval pending</p>
                      {item.approval.description && <p className="mt-1">{item.approval.description}</p>}
                      {item.approval.riskLevel && (
                        <p className="mt-1 text-[rgb(var(--app-text-subtle))]">Risk: {item.approval.riskLevel}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function isRunningState(state: ExecutionTimelineState): boolean {
  return state === "input-streaming" || state === "input-available" || state === "running";
}

function stateLabel(state: ExecutionTimelineState): string {
  if (state === "input-streaming") return "preparing";
  if (state === "input-available") return "ready";
  if (state === "result") return "done";
  return state;
}

function timelineHeaderIconClass(hasError: boolean, running: boolean, hasApproval: boolean): string {
  const color = hasError
    ? "bg-red-500"
    : hasApproval
      ? "bg-amber-500"
      : running
        ? "bg-[rgb(var(--app-text-subtle))]"
        : "bg-emerald-500";
  return `h-1.5 w-1.5 rounded-full ${color}`;
}

function timelineStatusPillClass(hasError: boolean, running: boolean, hasApproval: boolean): string {
  if (hasError) return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  if (hasApproval) return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  if (running) return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

function timelineStatePillClass(state: ExecutionTimelineState, ok?: boolean): string {
  if (state === "error" || ok === false) return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  if (isRunningState(state)) return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

function timelineDotClass(item: ExecutionTimelineItem, pending: boolean): string {
  const color = item.state === "error" || item.ok === false
    ? "bg-red-500"
    : pending
      ? "bg-[rgb(var(--app-text-subtle))] animate-pulse"
      : "bg-emerald-500";
  return `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}`;
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  const pathValue = record["path"] ?? record["paths"] ?? record["files"];
  const message = record["message"];
  const branch = record["branch"] ?? record["sourceBranch"] ?? record["targetBranch"];
  const flags = record["flags"] ?? record["options"];
  const pieces = [
    pathValue !== undefined ? `paths=${shortValue(pathValue)}` : "",
    branch !== undefined ? `branch=${shortValue(branch)}` : "",
    message !== undefined ? `message=${shortValue(message)}` : "",
    flags !== undefined ? `flags=${shortValue(flags)}` : "",
  ].filter(Boolean);
  return pieces.length ? pieces.join(" ") : shortValue(input);
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

function summarizeOutput(output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const record = output as Record<string, unknown>;
  const stdout = String(record["stdout"] ?? "").trim();
  const stderr = String(record["stderr"] ?? "").trim();
  if (stderr) return stderr.split(/\r?\n/)[0]?.slice(0, 120) ?? "error";
  if (stdout) return stdout.split(/\r?\n/)[0]?.slice(0, 120) ?? "output";
  const returncode = record["returncode"];
  if (returncode !== undefined) return `returncode ${String(returncode)}`;
  return "";
}

function shortValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(",")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
