import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  const groups = useMemo(() => groupExecutionItems(items), [items]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const running = items.some((item) => isRunningState(item.state));
  const hasError = items.some((item) => item.state === "error" || item.ok === false);
  const hasApproval = items.some((item) => item.approval);
  const completed = !running && !hasApproval && !hasError;
  const statusLabel = running
    ? "running"
    : hasError
      ? "error"
      : hasApproval
        ? "approval"
      : `${groups.length} step${groups.length === 1 ? "" : "s"}`;

  useEffect(() => {
    setOpenGroups((current) => {
      const next: Record<string, boolean> = {};
      for (const group of groups) {
        const existing = current[group.id];
        if (existing !== undefined) {
          next[group.id] = existing;
          continue;
        }
        next[group.id] = defaultGroupOpen(group, completed);
      }
      return next;
    });
  }, [completed, groups]);

  if (items.length === 0) return null;
  if (completed) {
    return <CompletedExecutionSummary groups={groups} commandCount={items.length} />;
  }

  return (
    <section className="mb-2 text-xs">
      <div className="flex items-center gap-2 px-0 py-1.5 text-[rgb(var(--app-text-subtle))]">
        <span className={timelineHeaderIconClass(hasError, running, hasApproval)} />
        <span className="font-medium text-[rgb(var(--app-text))]">Execution</span>
        <span className={timelineStatusPillClass(hasError, running, hasApproval)}>{statusLabel}</span>
      </div>

      <div className="border-t border-[rgb(var(--app-border))]">
        {groups.map((group, groupIndex) => {
          const groupOpen = openGroups[group.id] ?? defaultGroupOpen(group, completed);
          const nextGroup = groups[groupIndex + 1];
          const groupSummary = executionGroupSummary(group);
          const groupReflection = executionGroupReflection(group, nextGroup);

          return (
            <div key={group.id} className="border-b border-[rgb(var(--app-border))]">
              <button
                type="button"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !groupOpen }))}
                title={`${groupOpen ? "Collapse" : "Expand"} ${group.title}`}
                aria-expanded={groupOpen}
                className="flex w-full items-start gap-3 px-0 py-2.5 text-left transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 active:bg-[rgb(var(--app-bg-muted))]"
              >
                <span className={timelineGroupRailClass(group.status)} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-[rgb(var(--app-text))]">{group.title}</span>
                    <span className={timelineGroupPillClass(group.status)}>{group.status}</span>
                    <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">
                      {group.items.length} command{group.items.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {!groupOpen && (
                    <span className="mt-1 block max-w-[72ch] leading-relaxed text-[rgb(var(--app-text-muted))]">
                      {groupSummary}
                    </span>
                  )}
                </span>
                <ChevronIcon open={groupOpen} />
              </button>

              {groupOpen && (
                <div className="px-0 pb-2">
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <ExecutionCommandRow
                        key={item.id}
                        item={item}
                        onToggleItem={onToggleItem}
                        renderOutput={renderOutput}
                        renderApproval={renderApproval}
                      />
                    ))}
                  </div>
                  <ExecutionGroupPlan summary={groupSummary} reflection={groupReflection} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompletedExecutionSummary({ groups, commandCount }: { groups: ExecutionGroup[]; commandCount: number }) {
  return (
    <section className="mb-2 border-t border-[rgb(var(--app-border))] pt-2 text-xs">
      <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium text-[rgb(var(--app-text))]">Summary</span>
          <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">
            {groups.length} step{groups.length === 1 ? "" : "s"} · {commandCount} command{commandCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 max-w-[72ch] leading-relaxed text-[rgb(var(--app-text-muted))]">
          {completedWorkflowSummary(groups)}
        </p>
      </div>
    </section>
  );
}

function ExecutionGroupPlan({ summary, reflection }: { summary: string; reflection: string }) {
  return (
    <div className="ml-3 mt-2 border-l border-[rgb(var(--app-border))] pl-3 text-[11px] leading-relaxed">
      <p className="max-w-[72ch] text-[rgb(var(--app-text-muted))]">{summary}</p>
      {reflection && <p className="max-w-[72ch] text-[rgb(var(--app-text-subtle))]">{reflection}</p>}
    </div>
  );
}

function ExecutionCommandRow({
  item,
  onToggleItem,
  renderOutput,
  renderApproval,
}: {
  item: ExecutionTimelineItem;
  onToggleItem: (id: string) => void;
  renderOutput?: (item: ExecutionTimelineItem) => ReactNode;
  renderApproval?: (item: ExecutionTimelineItem) => ReactNode;
}) {
  const toolName = item.toolName ?? "unknown";
  const pending = isRunningState(item.state);
  const liveOutput = item.liveOutput?.trim() ?? "";
  const command = toolCommandPreview(toolName, objectInput(item.input));
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
        title={hasDetails ? `${item.open ? "Collapse" : "Expand"} ${toolName} details` : `${toolName} has no details`}
        aria-label={hasDetails ? `${item.open ? "Collapse" : "Expand"} ${toolName} details` : `${toolName} has no details`}
        className={`flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 ${
          hasDetails ? "cursor-pointer hover:bg-[rgb(var(--app-bg-muted))] active:bg-[rgb(var(--app-surface-raised))]" : "cursor-default"
        }`}
      >
        <span className={timelineDotClass(item, pending)} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="max-w-[32rem] truncate font-medium text-[rgb(var(--app-text-muted))]">{commandLabel}</span>
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
            <span className="mt-1 block truncate text-[rgb(var(--app-text-muted))]">{outputSummary}</span>
          )}
          {pending && (
            <span className="mt-1 block italic text-[rgb(var(--app-text-subtle))]">
              {liveOutput ? "streaming output" : "running"}
            </span>
          )}
        </span>
        {hasDetails && (
          <ChevronIcon open={Boolean(item.open)} compact />
        )}
      </button>

      {item.open && hasDetails && (
        <div className="px-3 pb-2">
          {command && (
            <div className="mb-2 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))]">
              <div className="border-b border-[rgb(var(--app-border))] px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">
                Shell
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
                <span className="text-[rgb(var(--app-text-subtle))]">$ </span>{command}
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
          {!command && item.output !== undefined && !pending && (
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
}

export function isRunningState(state: ExecutionTimelineState): boolean {
  return state === "input-streaming" || state === "input-available" || state === "running";
}

function ChevronIcon({ open, compact = false }: { open: boolean; compact?: boolean }) {
  const size = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 inline-flex ${size} shrink-0 items-center justify-center text-[rgb(var(--app-text-subtle))] transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
    >
      <span className="h-1.5 w-1.5 rotate-45 border-b border-r border-current" />
    </span>
  );
}

type ExecutionGroupStatus = "running" | "done" | "error" | "approval";

interface ExecutionGroup {
  id: string;
  title: string;
  kind: string;
  items: ExecutionTimelineItem[];
  status: ExecutionGroupStatus;
  hasApproval: boolean;
}

function groupExecutionItems(items: ExecutionTimelineItem[]): ExecutionGroup[] {
  const groups: ExecutionGroup[] = [];
  for (const item of items) {
    const kind = executionGroupKind(item);
    const previous = groups[groups.length - 1];
    if (previous && previous.kind === kind) {
      previous.items.push(item);
      previous.status = executionGroupStatus(previous.items);
      previous.hasApproval = previous.items.some((entry) => Boolean(entry.approval));
      continue;
    }
    const groupItems = [item];
    groups.push({
      id: `${kind}-${groups.length}`,
      title: executionGroupTitle(kind),
      kind,
      items: groupItems,
      status: executionGroupStatus(groupItems),
      hasApproval: groupItems.some((entry) => Boolean(entry.approval)),
    });
  }
  return groups;
}

function executionGroupKind(item: ExecutionTimelineItem): string {
  const name = (item.toolName ?? "").toLowerCase();
  const command = toolCommandPreview(item.toolName ?? "", objectInput(item.input)).toLowerCase();
  const text = `${name} ${command}`;
  if (/\b(remote|status|branch|log|diff|ls-remote|fetch|rev-parse)\b/.test(text)) return "inspect";
  if (/\b(add|stage|restore|stash|clean|checkout|switch)\b/.test(text)) return "prepare";
  if (/\b(commit|tag|merge|rebase|cherry|revert)\b/.test(text)) return "change";
  if (/\b(push|pull)\b/.test(text)) return "sync";
  if (name.startsWith("ado_") || /\bazure|devops|pr|pull request|work item|pipeline\b/.test(text)) return "ado";
  if (/\b(test|build|lint|typecheck|validation)\b/.test(text)) return "validate";
  return "execute";
}

function executionGroupTitle(kind: string): string {
  const titles: Record<string, string> = {
    inspect: "Inspect repository state",
    prepare: "Prepare workspace",
    change: "Update local Git history",
    sync: "Sync remote repository",
    ado: "Update Azure DevOps",
    validate: "Run validation",
    execute: "Run command",
  };
  return titles[kind] ?? "Run command";
}

function executionGroupStatus(items: ExecutionTimelineItem[]): ExecutionGroupStatus {
  if (items.some((item) => item.state === "error" || item.ok === false)) return "error";
  if (items.some((item) => item.approval)) return "approval";
  if (items.some((item) => isRunningState(item.state))) return "running";
  return "done";
}

function executionGroupSummary(group: ExecutionGroup): string {
  if (group.status === "error") return `Stopped after ${group.items.length} command${group.items.length === 1 ? "" : "s"} because one command failed. Expand for stderr and exit code.`;
  if (group.status === "approval") return "Waiting for approval before executing the scoped action.";
  if (group.status === "running") return `Running ${group.items.length} command${group.items.length === 1 ? "" : "s"} in this step.`;
  const summaries = group.items
    .map((item) => item.summary || summarizeOutput(item.output))
    .filter(Boolean)
    .slice(0, 2);
  if (summaries.length) return summaries.join(" · ");
  return `Completed ${group.items.length} command${group.items.length === 1 ? "" : "s"}.`;
}

function executionGroupReflection(group: ExecutionGroup, nextGroup?: ExecutionGroup): string {
  if (group.status === "running") return "Waiting for command output before deciding whether to continue, retry, or change strategy.";
  if (group.status === "error") return "This failure changes the path: inspect the related state before retrying or proposing a safer command.";
  if (group.status === "approval") return "Execution is paused so the proposed action can be checked against policy and user intent.";
  if (nextGroup) return `The result is sufficient to move into ${nextGroup.title.toLowerCase()}.`;
  return "All planned execution evidence is available for the final answer.";
}

function completedWorkflowSummary(groups: ExecutionGroup[]): string {
  const summaries = groups
    .map((group) => executionGroupSummary(group).replace(/\.$/, ""))
    .filter(Boolean);
  if (!summaries.length) return "All requested execution steps completed.";
  return summaries.join(" · ");
}

function defaultGroupOpen(group: ExecutionGroup, completed: boolean): boolean {
  if (completed) return false;
  return group.items.some((item) => item.open) || group.status === "running" || group.status === "error" || group.hasApproval;
}

function timelineGroupRailClass(status: ExecutionGroupStatus): string {
  const color = status === "error"
    ? "bg-red-500"
    : status === "approval"
      ? "bg-amber-500"
      : status === "running"
        ? "bg-blue-500"
        : "bg-emerald-500";
  const motion = status === "running" ? " animate-pulse" : "";
  return `mt-1 h-8 w-1 shrink-0 rounded-full ${color}${motion}`;
}

function timelineGroupPillClass(status: ExecutionGroupStatus): string {
  if (status === "error") return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  if (status === "approval") return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  if (status === "running") return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
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

function outputExitCode(output: unknown): number | undefined {
  if (!output || typeof output !== "object") return undefined;
  const value = (output as Record<string, unknown>)["returncode"];
  return typeof value === "number" ? value : undefined;
}

function shellOutputText(item: ExecutionTimelineItem, liveOutput: string): string {
  if (liveOutput) return liveOutput;
  if (!item.output || typeof item.output !== "object") return "";
  const output = item.output as Record<string, unknown>;
  return [
    String(output["stdout"] ?? "").trim(),
    String(output["stderr"] ?? "").trim(),
  ].filter(Boolean).join("\n");
}

function shortValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(",")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
