import type { ChatHistoryEntry } from "../../api.js";

export function sortChatHistory(history: ChatHistoryEntry[]): ChatHistoryEntry[] {
  return [...history].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });
}

export function chatHistoryTitle(entry: ChatHistoryEntry): string {
  return entry.title?.trim() || entry.preview?.trim() || "(empty)";
}

export function chatHistoryPreview(entry: ChatHistoryEntry): string {
  const preview = entry.preview?.trim() ?? "";
  return preview && preview !== chatHistoryTitle(entry) ? preview : "";
}

