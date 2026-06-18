import { describe, expect, it } from "vitest";
import {
  constrainHistoryPanelWidth,
  constrainRightPanelWidth,
  nextPanelVisibilityForWorkspace,
  requiredChatWindowWidth,
} from "./chatPanelLayout.js";

describe("chat panel layout", () => {
  it("computes required window width from visible panels", () => {
    expect(requiredChatWindowWidth({
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toBe(1192);
  });

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

  it("collapses the right panel before history when workspace is too narrow", () => {
    expect(nextPanelVisibilityForWorkspace({
      workspaceWidth: 800,
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toEqual({ historyOpen: true, rightPanelOpen: false });

    expect(nextPanelVisibilityForWorkspace({
      workspaceWidth: 500,
      historyOpen: true,
      historyWidth: 220,
      rightPanelOpen: true,
      rightWidth: 420,
    })).toEqual({ historyOpen: false, rightPanelOpen: false });
  });
});
