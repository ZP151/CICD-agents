import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHAT_PANEL_LAYOUT,
  constrainHistoryPanelWidth,
  constrainRightPanelWidth,
  effectiveRightPanelWidth,
  nextPanelVisibilityForWorkspace,
  shouldOverlayRightPanel,
} from "./chatPanelLayout.js";

describe("chat panel layout", () => {
  it("constrains drag widths to panel and workspace limits", () => {
    expect(constrainHistoryPanelWidth({
      startWidth: 220,
      deltaX: 500,
      workspaceWidth: 900,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toBe(160);

    expect(constrainRightPanelWidth({
      startWidth: 420,
      deltaX: -800,
      workspaceWidth: 1000,
      historyOpen: true,
      historyWidth: 220,
    })).toBe(452);
  });

  it("keeps the right panel open as an overlay when workspace is too narrow for three columns", () => {
    expect(nextPanelVisibilityForWorkspace({
      workspaceWidth: 800,
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toEqual({ historyOpen: true, rightPanelOpen: true });

    expect(nextPanelVisibilityForWorkspace({
      workspaceWidth: 700,
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: false,
      rightWidth: 420,
    })).toEqual({ historyOpen: true, rightPanelOpen: false });

    expect(nextPanelVisibilityForWorkspace({
      workspaceWidth: 500,
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toEqual({ historyOpen: false, rightPanelOpen: true });
  });

  it("uses bounded overlay widths for the right panel on compact workspaces", () => {
    expect(shouldOverlayRightPanel(900)).toBe(true);
    expect(shouldOverlayRightPanel(1200)).toBe(false);

    expect(effectiveRightPanelWidth({
      rightWidth: 780,
      workspaceWidth: 900,
    })).toBe(CHAT_PANEL_LAYOUT.rightOverlayMax);
    expect(effectiveRightPanelWidth({
      rightWidth: 420,
      workspaceWidth: 460,
    })).toBe(404);
  });

  it("keeps the CSS middle-panel floor aligned with the resize model", () => {
    const css = readFileSync(
      new URL("../../../styles/chat-workspace.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain(`flex: 1 1 ${CHAT_PANEL_LAYOUT.middleMin}px`);
    expect(css).toContain(`min-width: ${CHAT_PANEL_LAYOUT.middleMin}px`);
    expect(css).toMatch(/@media \(max-width: 900px\) \{\s*\.middle-panel \{[^}]*min-width: 0;/s);
    expect(css).toContain(".right-panel--overlay");
    expect(css).not.toContain("min-width: 420px");
  });

  it("disables decorative New Chat motion when the operating system requests it", () => {
    const css = readFileSync(
      new URL("../../../styles/chat-workspace.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.prompt-particle-deck__particles i \{[\s\S]*animation: none;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.prompt-particle-deck__card \{[\s\S]*transition: none;/);
    expect(css).not.toContain("prompt-particle-deck__insert");
  });
});
