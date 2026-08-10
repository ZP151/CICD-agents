import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatHistoryEntry } from "../../../api.js";
import { HistoryDeleteConfirmation } from "./HistorySidebar.js";

const entry: ChatHistoryEntry = {
  sessionId: "chat-1",
  title: "Review the release readiness evidence",
  preview: "Review the release readiness evidence",
  createdAt: 1_786_000_000,
};

describe("HistoryDeleteConfirmation", () => {
  it("uses an in-app, labelled confirmation with the affected conversation title", () => {
    const html = renderToStaticMarkup(
      <HistoryDeleteConfirmation entry={entry} onCancel={() => undefined} onConfirm={() => undefined} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label="Delete chat Review the release readiness evidence"');
    expect(html).toContain("This removes the saved conversation");
    expect(html).toContain("Cancel");
    expect(html).toContain("Delete chat");
    expect(html).toContain("break-words");
  });
});
