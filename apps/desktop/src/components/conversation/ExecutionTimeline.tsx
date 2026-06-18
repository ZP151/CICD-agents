import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExecutionCommandRow } from "./ExecutionCommandRow.js";
import { ChevronIcon } from "./ExecutionTimelineIcons.js";
import {
  completedWorkflowSummary,
  defaultGroupOpen,
  executionGroupReflection,
  executionGroupSummary,
  groupExecutionItems,
  isRunningState,
  timelineGroupPillClass,
  timelineGroupRailClass,
  timelineHeaderIconClass,
  timelineStatusPillClass,
  type ExecutionGroup,
  type ExecutionTimelineItem,
} from "./executionTimelineModel.js";

export type {
  ExecutionTimelineApproval,
  ExecutionTimelineItem,
  ExecutionTimelineState,
} from "./executionTimelineModel.js";
export { isRunningState } from "./executionTimelineModel.js";

export interface ExecutionTimelineProps {
  items: ExecutionTimelineItem[];
  onToggleItem: (id: string) => void;
  renderOutput?: (item: ExecutionTimelineItem) => ReactNode;
  renderApproval?: (item: ExecutionTimelineItem) => ReactNode;
}

export function ExecutionTimeline({
  items,
  onToggleItem,
  renderOutput,
  renderApproval,
}: ExecutionTimelineProps): JSX.Element | null {
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
        next[group.id] = existing ?? defaultGroupOpen(group, completed);
      }
      return next;
    });
  }, [completed, groups]);

  if (items.length === 0) return null;
  if (completed) return <CompletedExecutionSummary groups={groups} commandCount={items.length} />;

  return (
    <section className="mb-2 text-xs">
      <div className="flex items-center gap-2 px-0 py-1.5 text-[rgb(var(--app-text-subtle))]">
        <span className={timelineHeaderIconClass(hasError, running, hasApproval)} />
        <span className="font-medium text-[rgb(var(--app-text))]">Execution</span>
        <span className={timelineStatusPillClass(hasError, running, hasApproval)}>
          {statusLabel}
        </span>
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

function CompletedExecutionSummary({
  groups,
  commandCount,
}: {
  groups: ExecutionGroup[];
  commandCount: number;
}): JSX.Element {
  return (
    <section className="mb-2 border-t border-[rgb(var(--app-border))] pt-2 text-xs">
      <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-medium text-[rgb(var(--app-text))]">Summary</span>
          <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">
            {groups.length} step{groups.length === 1 ? "" : "s"} · {commandCount} command
            {commandCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 max-w-[72ch] leading-relaxed text-[rgb(var(--app-text-muted))]">
          {completedWorkflowSummary(groups)}
        </p>
      </div>
    </section>
  );
}

function ExecutionGroupPlan({
  summary,
  reflection,
}: {
  summary: string;
  reflection: string;
}): JSX.Element {
  return (
    <div className="ml-3 mt-2 border-l border-[rgb(var(--app-border))] pl-3 text-[11px] leading-relaxed">
      <p className="max-w-[72ch] text-[rgb(var(--app-text-muted))]">{summary}</p>
      {reflection && (
        <p className="max-w-[72ch] text-[rgb(var(--app-text-subtle))]">{reflection}</p>
      )}
    </div>
  );
}
