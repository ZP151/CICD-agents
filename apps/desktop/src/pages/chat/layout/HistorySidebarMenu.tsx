import type { ChatHistoryEntry } from "../../../api.js";
import {
  PinIcon,
  UnpinIcon,
} from "./HistorySidebarIcons.js";
import type { HistoryMenuState } from "./HistorySidebar.js";

interface HistorySidebarMenuProps {
  menu: HistoryMenuState | null;
  menuEntry: ChatHistoryEntry | null;
  onBeginRename: (entry: ChatHistoryEntry) => void;
  onDeleteEntry: (entry: ChatHistoryEntry) => void;
  onMenuChange: (menu: HistoryMenuState | null) => void;
  onTogglePin: (entry: ChatHistoryEntry) => void;
}

export function HistorySidebarMenu({
  menu,
  menuEntry,
  onBeginRename,
  onDeleteEntry,
  onMenuChange,
  onTogglePin,
}: HistorySidebarMenuProps) {
  if (!menu || !menuEntry) return null;

  return (
    <div
      className="fixed z-50 w-40 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1 text-sm text-[rgb(var(--app-text))] shadow-2xl"
      style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 140) }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onMenuChange(null);
          onTogglePin(menuEntry);
        }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-[rgb(var(--app-surface-raised))]"
      >
        {menuEntry.pinned ? <UnpinIcon /> : <PinIcon />}
        {menuEntry.pinned ? "Unpin" : "Pin"}
      </button>
      <button
        type="button"
        onClick={() => onBeginRename(menuEntry)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-[rgb(var(--app-surface-raised))]"
      >
        <span className="w-3.5 text-center text-[11px]">T</span>
        Rename
      </button>
      <button
        type="button"
        onClick={() => onDeleteEntry(menuEntry)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 transition hover:bg-red-950/40"
      >
        <span className="w-3.5 text-center text-[11px]">x</span>
        Delete
      </button>
    </div>
  );
}
