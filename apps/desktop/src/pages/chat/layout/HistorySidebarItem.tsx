import type { ChatHistoryEntry } from "../../../api.js";
import {
  chatHistoryPreview,
  chatHistoryTitle,
} from "../chatHistory.js";
import {
  InlineTooltip,
  MoreIcon,
  PinIcon,
  UnpinIcon,
} from "./HistorySidebarIcons.js";
import type { HistoryMenuState } from "./HistorySidebar.js";

interface HistorySidebarItemProps {
  active: boolean;
  entry: ChatHistoryEntry;
  renamingHistoryId: string | null;
  renamingHistoryValue: string;
  onBeginMenu: (menu: HistoryMenuState) => void;
  onCancelRename: () => void;
  onCommitRename: (entry: ChatHistoryEntry, value: string) => void;
  onLoadSession: (sessionId: string) => void;
  onRenameValueChange: (value: string) => void;
  onTogglePin: (entry: ChatHistoryEntry) => void;
}

function setHistoryHoverCardPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const left = Math.min(rect.right + 10, window.innerWidth - 320);
  const top = Math.min(Math.max(rect.top, 48), window.innerHeight - 170);
  element.style.setProperty("--history-card-left", `${Math.max(12, left)}px`);
  element.style.setProperty("--history-card-top", `${top}px`);
}

function formatHistoryTimestamp(value: number): string {
  const date = new Date(value * 1000);
  if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return "Time not available";
  return date.toLocaleString();
}

export function HistorySidebarItem({
  active,
  entry,
  renamingHistoryId,
  renamingHistoryValue,
  onBeginMenu,
  onCancelRename,
  onCommitRename,
  onLoadSession,
  onRenameValueChange,
  onTogglePin,
}: HistorySidebarItemProps) {
  const title = chatHistoryTitle(entry);
  const preview = chatHistoryPreview(entry);
  const createdAtLabel = formatHistoryTimestamp(entry.createdAt);
  const itemClass = active
    ? "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))]"
    : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]";
  const subtleTextClass = "text-[rgb(var(--app-text-subtle))]";
  const iconButtonClass =
    "rounded p-1 text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]";

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        onBeginMenu({ sessionId: entry.sessionId, x: event.clientX, y: event.clientY });
      }}
      className={`group/history relative flex items-start gap-1 px-2 py-1.5 transition-colors ${itemClass}`}
    >
      <button
        type="button"
        onClick={() => onLoadSession(entry.sessionId)}
        onMouseEnter={(event) => setHistoryHoverCardPosition(event.currentTarget)}
        onFocus={(event) => setHistoryHoverCardPosition(event.currentTarget)}
        className="history-item-hover-card min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
        aria-label={`Open chat ${title}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {entry.pinned && <span className="shrink-0 text-[rgb(var(--app-accent-readable))]"><PinIcon filled /></span>}
          <span className="truncate">{title}</span>
        </span>
        <span className={`block text-[10px] ${subtleTextClass}`}>
          {createdAtLabel}
        </span>
        <span className="history-hover-card">
          <span className="block text-[11px] font-medium leading-snug text-[rgb(var(--app-text))]">{title}</span>
          {preview && (
            <span className="mt-1.5 block text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
              {preview}
            </span>
          )}
          <span className={`mt-2 block text-[10px] ${subtleTextClass}`}>{createdAtLabel}</span>
        </span>
      </button>
      {renamingHistoryId === entry.sessionId ? (
        <input
          className="absolute inset-x-2 top-1.5 z-20 rounded-md border border-[rgb(var(--app-accent))]/60 bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-text))] shadow-xl focus:outline-none"
          value={renamingHistoryValue}
          onChange={(event) => onRenameValueChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => {
            if (renamingHistoryId === entry.sessionId) onCommitRename(entry, renamingHistoryValue);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") onCancelRename();
          }}
          autoFocus
        />
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover/history:opacity-100 group-focus-within/history:opacity-100">
        <InlineTooltip label={entry.pinned ? "Unpin chat" : "Pin chat"}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(entry);
            }}
            className={`rounded p-1 transition ${
              entry.pinned
                ? "text-[rgb(var(--app-accent-readable))] hover:bg-[rgb(var(--app-accent-soft))]"
                : iconButtonClass
            }`}
            aria-label={entry.pinned ? "Unpin chat" : "Pin chat"}
          >
            {entry.pinned ? <UnpinIcon /> : <PinIcon />}
          </button>
        </InlineTooltip>
        <InlineTooltip label="Chat actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onBeginMenu({ sessionId: entry.sessionId, x: rect.right - 8, y: rect.bottom + 4 });
            }}
            className={iconButtonClass}
            aria-label="Open chat actions"
          >
            <MoreIcon />
          </button>
        </InlineTooltip>
      </div>
    </div>
  );
}
