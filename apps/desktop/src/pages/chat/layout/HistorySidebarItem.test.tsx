import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatHistoryEntry } from "../../../api.js";
import { HistorySidebarItem } from "./HistorySidebarItem.js";

function entry(overrides: Partial<ChatHistoryEntry> = {}): ChatHistoryEntry {
  return {
    sessionId: "chat-1",
    preview: "Review my changes",
    createdAt: 1_786_000_000,
    title: "Review my changes",
    ...overrides,
  };
}

function renderHistoryItem(item: ChatHistoryEntry): string {
  return renderToStaticMarkup(
    <HistorySidebarItem
      active={false}
      entry={item}
      renamingHistoryId={null}
      renamingHistoryValue=""
      onBeginMenu={() => undefined}
      onCancelRename={() => undefined}
      onCommitRename={() => undefined}
      onLoadSession={() => undefined}
      onRenameValueChange={() => undefined}
      onTogglePin={() => undefined}
    />,
  );
}

describe("HistorySidebarItem", () => {
  it("does not surface invalid history timestamps", () => {
    const html = renderHistoryItem(entry({ createdAt: Number.NaN }));

    expect(html).toContain("Time not available");
    expect(html).not.toContain("Invalid Date");
  });

  it("renders valid history timestamps in both row and hover details", () => {
    const html = renderHistoryItem(entry({ createdAt: 1_786_000_000 }));

    expect(html).not.toContain("Time not available");
    expect(html).not.toContain("Invalid Date");
  });
});
