import { describe, expect, it } from "vitest";
import { conversationTopBarRightSlotWidth } from "./ConversationTopBar.js";

describe("conversationTopBarRightSlotWidth", () => {
  it("does not reserve source-panel width when the right panel is an overlay", () => {
    expect(conversationTopBarRightSlotWidth({
      rightPanelOpen: true,
      rightPanelOverlay: true,
      rightWidth: 520,
    })).toBe(40);
  });

  it("reserves the docked source-panel width on wide layouts", () => {
    expect(conversationTopBarRightSlotWidth({
      rightPanelOpen: true,
      rightPanelOverlay: false,
      rightWidth: 520,
    })).toBe(520);
  });

  it("uses the compact toggle slot when the source panel is closed", () => {
    expect(conversationTopBarRightSlotWidth({
      rightPanelOpen: false,
      rightPanelOverlay: false,
      rightWidth: 520,
    })).toBe(40);
  });
});
