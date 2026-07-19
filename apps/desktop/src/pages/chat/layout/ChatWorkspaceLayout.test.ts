import { describe, expect, it } from "vitest";
import {
  rightPanelClass,
  shouldRenderCodeSidePanel,
  shouldShowChatComposer,
} from "./ChatWorkspaceLayout.js";

describe("shouldShowChatComposer", () => {
  it("hides the composer for an empty full-page onboarding state without a Project Link", () => {
    expect(
      shouldShowChatComposer({
        mini: false,
        projectLinksLoading: false,
        activeProjectLinkId: null,
        bubbleCount: 0,
      }),
    ).toBe(false);
  });

  it("keeps the composer visible once chat or Project Link context exists", () => {
    expect(
      shouldShowChatComposer({
        mini: false,
        projectLinksLoading: false,
        activeProjectLinkId: "pl-1",
        bubbleCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowChatComposer({
        mini: false,
        projectLinksLoading: false,
        activeProjectLinkId: null,
        bubbleCount: 1,
      }),
    ).toBe(true);
  });

  it("does not hide mini composers", () => {
    expect(
      shouldShowChatComposer({
        mini: true,
        projectLinksLoading: false,
        activeProjectLinkId: null,
        bubbleCount: 0,
      }),
    ).toBe(true);
  });

  it("hides the full-page composer while Project Links are still resolving", () => {
    expect(
      shouldShowChatComposer({
        mini: false,
        projectLinksLoading: true,
        activeProjectLinkId: null,
        bubbleCount: 0,
      }),
    ).toBe(false);
  });
});

describe("shouldRenderCodeSidePanel", () => {
  it("does not mount hidden right-panel content when the source panel is closed", () => {
    expect(shouldRenderCodeSidePanel({ mini: false, rightPanelOpen: false })).toBe(false);
  });

  it("renders source panel content only for open full chat workspaces", () => {
    expect(shouldRenderCodeSidePanel({ mini: false, rightPanelOpen: true })).toBe(true);
    expect(shouldRenderCodeSidePanel({ mini: true, rightPanelOpen: true })).toBe(false);
  });
});

describe("rightPanelClass", () => {
  it("switches the code panel into overlay chrome on compact workspaces", () => {
    expect(rightPanelClass(false)).toBe("right-panel");
    expect(rightPanelClass(true)).toBe("right-panel right-panel--overlay");
  });
});
