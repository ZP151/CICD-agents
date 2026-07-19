import { describe, expect, it } from "vitest";
import {
  composerAttachmentChipClass,
  composerBottomControlsClass,
  composerModelButtonClass,
  composerModelLabelClass,
  composerModelMenuClass,
  composerProjectLinkSelectorClass,
} from "./ComposerShell.js";

describe("ComposerShell layout classes", () => {
  it("keeps project link and bottom controls shrinkable in narrow chat panels", () => {
    expect(composerProjectLinkSelectorClass()).toContain("min-w-0");
    expect(composerProjectLinkSelectorClass()).toContain("w-full");
    expect(composerProjectLinkSelectorClass()).toContain("sm:min-w-[12rem]");
    expect(composerProjectLinkSelectorClass()).not.toContain("min-w-[180px]");
    expect(composerBottomControlsClass()).toContain("min-w-0");
  });

  it("bounds model controls and menus to the visible viewport", () => {
    expect(composerModelButtonClass()).toContain("max-w-full");
    expect(composerModelButtonClass()).toContain("min-w-0");
    expect(composerModelLabelClass()).toContain("max-w-[min(12rem,45vw)]");
    expect(composerModelLabelClass()).toContain("truncate");
    expect(composerModelMenuClass()).toContain("w-[min(16rem,calc(100vw-2rem))]");
    expect(composerModelMenuClass()).not.toContain("w-64");
  });

  it("keeps image attachment chips inside the composer", () => {
    expect(composerAttachmentChipClass()).toContain("max-w-[min(220px,100%)]");
    expect(composerAttachmentChipClass()).toContain("min-w-0");
    expect(composerAttachmentChipClass()).not.toContain("max-w-[220px]");
  });
});
