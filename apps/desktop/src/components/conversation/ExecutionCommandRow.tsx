import type { ReactNode } from "react";
import {
  commandPreviewForItem,
  formatUnknown,
  isRunningState,
  outputExitCode,
  safeOutputFallback,
  shellOutputText,
  stateLabel,
  summarizeInput,
  summarizeOutput,
  timelineDotClass,
  timelineStatePillClass,
  truncateText,
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
  const outputSummary = item.summary || summarizeOutput(item.output);
  const shellOutput = shellOutputText(item, liveOutput);
  const hasOutput = Boolean(liveOutput) || (item.output !== undefined && !pending);
  const hasDetails = hasOutput || Boolean(inputSummary) || Boolean(command);
  const exitCode = outputExitCode(item.output);
  const commandLabel = command ? `Ran ${truncateText(command, 96)}` : toolName;

  return (
    <div className="overflow-hidden rounded-md">
      <button
        type="button"
        onClick={hasDetails ? () => onToggleItem(item.id) : undefined}
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
        className={`flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 ${
          hasDetails
            ? "cursor-pointer hover:bg-[rgb(var(--app-bg-muted))] active:bg-[rgb(var(--app-surface-raised))]"
            : "cursor-default"
        }`}
      >
        <span className={timelineDotClass(item, pending)} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="max-w-[32rem] truncate font-medium text-[rgb(var(--app-text-muted))]">
              {commandLabel}
            </span>
            <span className={timelineStatePillClass(item.state, item.ok)}>
              {stateLabel(item.state)}
            </span>
            {exitCode !== undefined && (
              <span className="rounded border border-[rgb(var(--app-border))] px-1.5 py-0.5 font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">
                exit {exitCode}
              </span>
            )}
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
              $ {command}
            </span>
          )}
          {!pending && outputSummary && (
            <span className="mt-1 block truncate text-[rgb(var(--app-text-muted))]">
              {outputSummary}
            </span>
          )}
          {pending && (
            <span className="mt-1 block italic text-[rgb(var(--app-text-subtle))]">
              {liveOutput ? "streaming output" : "running"}
            </span>
          )}
        </span>
        {hasDetails && <ChevronIcon open={Boolean(item.open)} compact />}
      </button>

      {item.open && hasDetails && (
        <div className="px-3 pb-2">
          {command && (
            <div className="mb-2 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))]">
              <div className="border-b border-[rgb(var(--app-border))] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
                Shell
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                <span className="text-[rgb(var(--app-text-subtle))]">$ </span>
                {command}
                {shellOutput ? `\n${shellOutput}` : ""}
              </pre>
              {!pending && (
                <div className="flex justify-end border-t border-[rgb(var(--app-border))] px-2.5 py-1 text-[11px] text-[rgb(var(--app-text-subtle))]">
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
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2">
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
