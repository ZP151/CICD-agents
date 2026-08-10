import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationTopBar } from "./ConversationTopBar.js";

const baseProps = {
  historyOpen: false,
  historyWidth: 260,
  onToggleHistory: () => undefined,
  rightPanelOpen: false,
  rightPanelOverlay: false,
  rightWidth: 360,
  onToggleRight: () => undefined,
  summaryPinnedAvailable: false,
  summaryPinnedOpen: false,
  onToggleSummaryPinned: () => undefined,
  titleEditing: false,
  customTitle: null,
  conversationTitle: null,
  titleInputRef: { current: null },
  onStartTitleEdit: () => undefined,
  onConfirmTitle: () => undefined,
  onCancelTitle: () => undefined,
};

describe("ConversationTopBar", () => {
  it("does not duplicate the New chat entry with a top-bar new-conversation control", () => {
    const html = renderToStaticMarkup(<ConversationTopBar {...baseProps} />);

    expect(html).not.toContain("New conversation");
    expect(html).not.toContain("Click to rename");
    expect(html).toContain('aria-label="Expand history"');
    expect(html).toContain('aria-label="Expand code panel"');
    expect(html).toContain("min-h-9");
    expect(html).toContain("min-w-9");
  });

  it("keeps a real conversation title available for rename", () => {
    const html = renderToStaticMarkup(<ConversationTopBar {...baseProps} conversationTitle="Investigate pipeline failure" />);

    expect(html).toContain("Investigate pipeline failure");
    expect(html).toContain("Click to rename");
  });
});
