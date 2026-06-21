import type { ReactNode } from "react";
import {
  commandPreviewForItem,
  executionItemTranscriptLabel,
  formatUnknown,
  isRunningState,
  outputExitCode,
  safeOutputFallback,
  shellOutputText,
  summarizeInput,
  type ExecutionTimelineItem,
} from "./executionTimelineModel.js";
import { ChevronIcon } from "./ExecutionTimelineIcons.js";

export function ExecutionCommandRow({
  item,
  onToggleItem,
  renderOutput,
  renderApproval,
}: {
  item: ExecutionTimelineItem;
  onToggleItem: (id: string) => void;
  renderOutput?: (item: ExecutionTimelineItem) => ReactNode;
  renderApproval?: (item: ExecutionTimelineItem) => ReactNode;
}): JSX.Element {
  const toolName = item.toolName ?? "unknown";
  const pending = isRunningState(item.state);
  const liveOutput = item.liveOutput?.trim() ?? "";
  const command = commandPreviewForItem(item);
  const inputSummary = command ? "" : summarizeInput(item.input);
  const shellOutput = shellOutputText(item, liveOutput);
  const hasOutput = Boolean(liveOutput) || (item.output !== undefined && !pending);
  const hasDetails = hasOutput || Boolean(inputSummary) || Boolean(command);
  const exitCode = outputExitCode(item.output);
  const commandLabel = executionItemTranscriptLabel(item);

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        onClick={hasDetails ? (event) => {
          event.stopPropagation();
          onToggleItem(item.id);
        } : undefined}
        title={
          hasDetails
            ? `${item.open ? "Collapse" : "Expand"} ${toolName} details`
            : `${toolName} has no details`
        }
        aria-label={
          hasDetails
            ? `${item.open ? "Collapse" : "Expand"} ${toolName} details`
            : `${toolName} has no details`
        }
        className={`flex w-full items-start gap-2 rounded-md px-0 py-1.5 text-left text-[rgb(var(--app-text-subtle))] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 ${
          hasDetails
            ? "cursor-pointer hover:bg-[rgb(var(--app-bg-muted))] active:bg-[rgb(var(--app-surface-raised))]"
            : "cursor-default"
        }`}
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[11px]" aria-hidden="true">
          {pending ? "..." : item.state === "error" || item.ok === false ? "!" : item.approval ? "?" : ">"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="max-w-[42rem] truncate">
              {commandLabel}
            </span>
            {exitCode !== undefined && (
              <span className="font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">
                exit {exitCode}
              </span>
            )}
          </span>
          {item.approval?.description && (
            <span className="mt-0.5 block truncate text-[rgb(var(--app-warning))]">
              {item.approval.description}
            </span>
          )}
        </span>
        {hasDetails && <ChevronIcon open={Boolean(item.open)} compact />}
      </button>

      {item.open && hasDetails && (
        <div className="pb-2 pl-6">
          {command && (
            <div className="mb-2 overflow-hidden rounded-md bg-[rgb(var(--app-bg-muted))]">
              <div className="px-2.5 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
                Shell
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-2.5 pb-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                <span className="text-[rgb(var(--app-text-subtle))]">$ </span>
                {command}
                {shellOutput ? `\n${shellOutput}` : ""}
              </pre>
              {!pending && (
                <div className="flex justify-end px-2.5 py-1 text-[11px] text-[rgb(var(--app-text-subtle))]">
                  {item.ok === false ? `Exit code ${exitCode ?? 1}` : "Success"}
                </div>
              )}
            </div>
          )}
          {!command && inputSummary && (
            <div className="mb-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2">
              <p className="mb-1 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
                Input
              </p>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                {formatUnknown(item.input)}
              </pre>
            </div>
          )}
          {!command &&
            item.output !== undefined &&
            !pending &&
            (renderOutput?.(item) ?? (
              <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 text-[11px] leading-relaxed text-[rgb(var(--app-text-subtle))]">
                {safeOutputFallback(item.output)}
              </p>
            ))}
        </div>
      )}

      {item.approval && (
        <div className="py-2 pl-6">
          {renderApproval?.(item) ?? (
            <div className="rounded-md border border-amber-500/30 bg-[rgb(var(--app-surface))] p-2 text-xs text-[rgb(var(--app-warning))]">
              <p className="font-medium text-[rgb(var(--app-text))]">Approval pending</p>
              {item.approval.description && <p className="mt-1">{item.approval.description}</p>}
              {item.approval.riskLevel && (
                <p className="mt-1 text-[rgb(var(--app-text-subtle))]">
                  Risk: {item.approval.riskLevel}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
