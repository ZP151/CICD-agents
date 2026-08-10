import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  deleteChatSession,
  fetchChatHistory,
  updateChatSessionMetadata,
  type ChatHistoryEntry,
} from "../../api.js";
import { clampHistoryPage, removeHistoryEntry, upsertHistoryEntry } from "./chatSessionHistory.js";
import { sortChatHistory } from "./chatHistory.js";
import type { HistoryMenuState } from "./layout/HistorySidebar.js";

let cachedChatHistory: ChatHistoryEntry[] | null = null;

interface UseChatHistoryRuntimeArgs {
  mini: boolean;
  sessionId: string | null;
  pageSize: number;
  onActiveSessionDeleted: () => void;
  onCurrentTitleUpdated: (title: string | null) => void;
  onTitleEditCancelled: () => void;
}

export interface ChatHistoryRuntime {
  history: ChatHistoryEntry[];
  setHistory: Dispatch<SetStateAction<ChatHistoryEntry[]>>;
  historyMenu: HistoryMenuState | null;
  setHistoryMenu: Dispatch<SetStateAction<HistoryMenuState | null>>;
  renamingHistoryId: string | null;
  renamingHistoryValue: string;
  setRenamingHistoryValue: Dispatch<SetStateAction<string>>;
  historyError: string | null;
  historyLoading: boolean;
  historyExpanded: boolean;
  setHistoryExpanded: Dispatch<SetStateAction<boolean>>;
  historyPage: number;
  setHistoryPage: Dispatch<SetStateAction<number>>;
  refreshHistory: () => Promise<void>;
  updateHistoryEntry: (entry: ChatHistoryEntry) => void;
  toggleHistoryPin: (entry: ChatHistoryEntry) => Promise<void>;
  beginRenameHistory: (entry: ChatHistoryEntry) => void;
  cancelHistoryRename: () => void;
  commitHistoryRename: (entry: ChatHistoryEntry, value: string) => Promise<void>;
  deleteHistoryEntry: (entry: ChatHistoryEntry) => Promise<void>;
  renameCurrentSession: (value: string) => Promise<void>;
}

export function useChatHistoryRuntime({
  mini,
  sessionId,
  pageSize,
  onActiveSessionDeleted,
  onCurrentTitleUpdated,
  onTitleEditCancelled,
}: UseChatHistoryRuntimeArgs): ChatHistoryRuntime {
  const [history, setHistoryState] = useState<ChatHistoryEntry[]>(() => cachedChatHistory ?? []);
  const [historyMenu, setHistoryMenu] = useState<HistoryMenuState | null>(null);
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null);
  const [renamingHistoryValue, setRenamingHistoryValue] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(!mini && !cachedChatHistory);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const setHistory = useCallback<Dispatch<SetStateAction<ChatHistoryEntry[]>>>((value) => {
    setHistoryState((current) => {
      const next =
        typeof value === "function"
          ? (value as (items: ChatHistoryEntry[]) => ChatHistoryEntry[])(current)
          : value;
      cachedChatHistory = next;
      return next;
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await fetchChatHistory();
      setHistory(sortChatHistory(items));
    } finally {
      setHistoryLoading(false);
    }
  }, [setHistory]);

  useEffect(() => {
    if (!mini) void refreshHistory().catch(() => undefined);
  }, [mini, refreshHistory]);

  useEffect(() => {
    setHistoryPage((page) => clampHistoryPage(page, history.length, pageSize));
  }, [history.length, pageSize]);

  useEffect(() => {
    if (!historyMenu) return;
    const close = () => setHistoryMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyMenu]);

  const updateHistoryEntry = useCallback((entry: ChatHistoryEntry) => {
    setHistory((items) => upsertHistoryEntry(items, entry));
  }, []);

  const toggleHistoryPin = useCallback(
    async (entry: ChatHistoryEntry) => {
      setHistoryError(null);
      try {
        const updated = await updateChatSessionMetadata(entry.sessionId, { pinned: !entry.pinned });
        updateHistoryEntry(updated);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to update pinned state.");
      }
    },
    [updateHistoryEntry],
  );

  const beginRenameHistory = useCallback((entry: ChatHistoryEntry) => {
    setHistoryMenu(null);
    setRenamingHistoryId(entry.sessionId);
    setRenamingHistoryValue(entry.title ?? entry.preview ?? "");
  }, []);

  const cancelHistoryRename = useCallback(() => {
    setRenamingHistoryId(null);
    setRenamingHistoryValue("");
  }, []);

  const commitHistoryRename = useCallback(
    async (entry: ChatHistoryEntry, value: string) => {
      const title = value.trim();
      cancelHistoryRename();
      setHistoryError(null);
      try {
        const updated = await updateChatSessionMetadata(entry.sessionId, { title: title || null });
        updateHistoryEntry(updated);
        if (entry.sessionId === sessionId) onCurrentTitleUpdated(updated.title ?? null);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to rename chat.");
      }
    },
    [cancelHistoryRename, onCurrentTitleUpdated, sessionId, updateHistoryEntry],
  );

  const deleteHistoryEntry = useCallback(
    async (entry: ChatHistoryEntry) => {
      setHistoryMenu(null);
      setHistoryError(null);
      try {
        await deleteChatSession(entry.sessionId);
        setHistory((items) => removeHistoryEntry(items, entry.sessionId));
        if (entry.sessionId === sessionId) {
          onActiveSessionDeleted();
          onTitleEditCancelled();
        }
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to delete chat.");
      }
    },
    [onActiveSessionDeleted, onTitleEditCancelled, sessionId],
  );

  const renameCurrentSession = useCallback(
    async (value: string) => {
      const title = value.trim();
      onCurrentTitleUpdated(title || null);
      onTitleEditCancelled();
      if (!sessionId) return;
      try {
        const updated = await updateChatSessionMetadata(sessionId, { title: title || null });
        updateHistoryEntry(updated);
      } catch {
        void refreshHistory().catch(() => undefined);
      }
    },
    [onCurrentTitleUpdated, onTitleEditCancelled, refreshHistory, sessionId, updateHistoryEntry],
  );

  return {
    history,
    setHistory,
    historyMenu,
    setHistoryMenu,
    renamingHistoryId,
    renamingHistoryValue,
    setRenamingHistoryValue,
    historyError,
    historyLoading,
    historyExpanded,
    setHistoryExpanded,
    historyPage,
    setHistoryPage,
    refreshHistory,
    updateHistoryEntry,
    toggleHistoryPin,
    beginRenameHistory,
    cancelHistoryRename,
    commitHistoryRename,
    deleteHistoryEntry,
    renameCurrentSession,
  };
}
