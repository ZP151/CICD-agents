import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExecutionCommandRow } from "./ExecutionCommandRow.js";
import { ChevronIcon } from "./ExecutionTimelineIcons.js";
import {
  defaultGroupOpen,
  executionGroupTranscriptLabel,
  groupExecutionItems,
  isRunningState,
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
  const running = items.some((item) => isRunningState(item.state));
  const hasError = items.some((item) => item.state === "error" || item.ok === false);
  const hasApproval = items.some((item) => item.approval);
  const completed = !running && !hasApproval && !hasError;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [timelineOpen, setTimelineOpen] = useState(() => !completed);
  const completedAutoCollapsedRef = useRef(completed);
  const headerLabel = running ? "Working" : hasError ? "Stopped" : hasApproval ? "Waiting for approval" : "Worked";

  useEffect(() => {
    setOpenGroups((current) => {
      const next: Record<string, boolean> = {};
      const shouldAutoCollapseCompleted = completed && !completedAutoCollapsedRef.current;
      for (const group of groups) {
        const existing = current[group.id];
        next[group.id] = shouldAutoCollapseCompleted
          ? false
          : existing ?? defaultGroupOpen(group, completed);
      }
      return next;
    });
    if (completed && !completedAutoCollapsedRef.current) setTimelineOpen(false);
    if (!completed) setTimelineOpen(true);
    completedAutoCollapsedRef.current = completed;
  }, [completed, groups]);

  if (items.length === 0) return null;

  const toggleItem = (id: string) => {
    setOpenItems((current) => ({ ...current, [id]: !(current[id] ?? items.find((item) => item.id === id)?.open ?? false) }));
    onToggleItem(id);
  };
  const itemWithOpenState = (item: ExecutionTimelineItem): ExecutionTimelineItem => ({
    ...item,
    open: openItems[item.id] ?? item.open,
  });

  return (
    <section className="mb-3 border-t border-[rgb(var(--app-border))] pt-2 text-xs">
      <button
        type="button"
        onClick={() => setTimelineOpen((open) => !open)}
        title={`${timelineOpen ? "Collapse" : "Expand"} execution details`}
        aria-expanded={timelineOpen}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-0 py-1 text-left text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35"
      >
        <span>{headerLabel}</span>
        <span>
          {items.length} command{items.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        <ChevronIcon open={timelineOpen} />
      </button>

      {timelineOpen && (
        completed ? (
          <div className="space-y-1 pb-1">
            {groups.flatMap((group) => group.items).map((item) => (
              <ExecutionCommandRow
                key={item.id}
                item={itemWithOpenState(item)}
                onToggleItem={toggleItem}
                renderOutput={renderOutput}
                renderApproval={renderApproval}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((group) => {
              const groupOpen = openGroups[group.id] ?? defaultGroupOpen(group, completed);
              const groupLabel = executionGroupTranscriptLabel(group);

              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !groupOpen }))}
                    title={`${groupOpen ? "Collapse" : "Expand"} ${groupLabel}`}
                    aria-expanded={groupOpen}
                    className="flex w-full items-center gap-2 rounded-md px-0 py-1.5 text-left text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-accent))]/35 active:bg-[rgb(var(--app-bg-muted))]"
                  >
                    <TranscriptIcon status={group.status} />
                    <span className="min-w-0 flex-1 truncate">{groupLabel}</span>
                    <span className="hidden text-[11px] text-[rgb(var(--app-text-subtle))] sm:inline">
                      {group.title}
                    </span>
                    <ChevronIcon open={groupOpen} />
                  </button>

                  {groupOpen && (
                    <div className="pb-2 pl-5">
                      <div className="space-y-1">
                        {group.items.map((item) => (
                          <ExecutionCommandRow
                            key={item.id}
                            item={itemWithOpenState(item)}
                            onToggleItem={toggleItem}
                            renderOutput={renderOutput}
                            renderApproval={renderApproval}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
}

function TranscriptIcon({ status }: { status: ExecutionGroup["status"] }): JSX.Element {
  const color = status === "error"
    ? "text-[rgb(var(--app-danger))]"
    : status === "approval"
      ? "text-[rgb(var(--app-warning))]"
      : status === "running"
        ? "text-[rgb(var(--app-text-muted))]"
        : "text-[rgb(var(--app-text-subtle))]";
  return (
    <span className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center ${color}`} aria-hidden="true">
      {status === "running" ? "..." : status === "error" ? "!" : status === "approval" ? "?" : ">"}
    </span>
  );
}
