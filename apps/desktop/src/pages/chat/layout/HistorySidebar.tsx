import type { ChatHistoryEntry } from "../../../api.js";
import { HistorySidebarItem } from "./HistorySidebarItem.js";
import { HistorySidebarMenu } from "./HistorySidebarMenu.js";
import { HistorySidebarPagination } from "./HistorySidebarPagination.js";

export const HISTORY_COLLAPSED_LIMIT = 12;
export const HISTORY_PAGE_SIZE = 12;

export interface HistoryMenuState {
  sessionId: string;
  x: number;
  y: number;
}

interface HistorySidebarProps {
  open: boolean;
  width: number;
  history: ChatHistoryEntry[];
  activeSessionId: string | null;
  historyError: string | null;
  expanded: boolean;
  loading: boolean;
  page: number;
  menu: HistoryMenuState | null;
  renamingHistoryId: string | null;
  renamingHistoryValue: string;
  onPageChange: (updater: (page: number) => number) => void;
  onExpandedChange: (expanded: boolean) => void;
  onMenuChange: (menu: HistoryMenuState | null) => void;
  onRenameValueChange: (value: string) => void;
  onCancelRename: () => void;
  onLoadSession: (sessionId: string) => void;
  onTogglePin: (entry: ChatHistoryEntry) => void;
  onBeginRename: (entry: ChatHistoryEntry) => void;
  onCommitRename: (entry: ChatHistoryEntry, value: string) => void;
  onDeleteEntry: (entry: ChatHistoryEntry) => void;
}

export function HistorySidebar({
  open,
  width,
  history,
  activeSessionId,
  historyError,
  expanded,
  loading,
  page,
  menu,
  renamingHistoryId,
  renamingHistoryValue,
  onPageChange,
  onExpandedChange,
  onMenuChange,
  onRenameValueChange,
  onCancelRename,
  onLoadSession,
  onTogglePin,
  onBeginRename,
  onCommitRename,
  onDeleteEntry,
}: HistorySidebarProps) {
  const menuEntry = menu ? history.find((item) => item.sessionId === menu.sessionId) ?? null : null;
  const pageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const normalizedPage = Math.min(Math.max(1, page), pageCount);
  const pageStart = (normalizedPage - 1) * HISTORY_PAGE_SIZE;
  const visibleHistory = expanded
    ? history.slice(pageStart, pageStart + HISTORY_PAGE_SIZE)
    : history.slice(0, HISTORY_COLLAPSED_LIMIT);
  const showingStart = history.length === 0 ? 0 : expanded ? pageStart + 1 : 1;
  const showingEnd = expanded
    ? Math.min(pageStart + visibleHistory.length, history.length)
    : Math.min(visibleHistory.length, history.length);

  return (
    <aside
      className="history-panel"
      style={{
        width: open ? width : 0,
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <p className="shrink-0 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        History
      </p>
      {loading && history.length === 0 ? (
        <div className="space-y-2 px-3 py-2" aria-label="Loading chat history">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="block h-9 animate-pulse rounded-md bg-[rgb(var(--app-surface-raised))]"
            />
          ))}
        </div>
      ) : history.length === 0 && (
        <p className="px-3 py-2 text-xs text-zinc-700">No sessions yet.</p>
      )}
      {historyError && (
        <p className="mx-3 mb-2 rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300">
          {historyError}
        </p>
      )}
      {visibleHistory.map((entry) => (
        <HistorySidebarItem
          key={entry.sessionId}
          active={activeSessionId === entry.sessionId}
          entry={entry}
          renamingHistoryId={renamingHistoryId}
          renamingHistoryValue={renamingHistoryValue}
          onBeginMenu={onMenuChange}
          onCancelRename={onCancelRename}
          onCommitRename={onCommitRename}
          onLoadSession={onLoadSession}
          onRenameValueChange={onRenameValueChange}
          onTogglePin={onTogglePin}
        />
      ))}
      <HistorySidebarPagination
        collapsedLimit={HISTORY_COLLAPSED_LIMIT}
        expanded={expanded}
        historyLength={history.length}
        normalizedPage={normalizedPage}
        pageCount={pageCount}
        showingEnd={showingEnd}
        showingStart={showingStart}
        onExpandedChange={onExpandedChange}
        onPageChange={onPageChange}
      />
      <HistorySidebarMenu
        menu={menu}
        menuEntry={menuEntry}
        onBeginRename={onBeginRename}
        onDeleteEntry={onDeleteEntry}
        onMenuChange={onMenuChange}
        onTogglePin={onTogglePin}
      />
    </aside>
  );
}
