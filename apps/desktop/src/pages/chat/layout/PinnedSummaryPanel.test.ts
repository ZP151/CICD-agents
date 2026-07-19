import { describe, expect, it } from "vitest";
import {
  pinnedSummaryAdoActionsGridClass,
  pinnedSummaryPanelShellClass,
} from "./PinnedSummaryPanel.js";

describe("PinnedSummaryPanel layout", () => {
  it("keeps the floating panel bounded to the viewport", () => {
    const className = pinnedSummaryPanelShellClass();

    expect(className).toContain("w-[min(20rem,calc(100vw-2rem))]");
    expect(className).toContain("max-w-[calc(100%-24px)]");
    expect(className).not.toContain("w-[300px]");
  });

  it("uses an auto-fit grid for ADO actions", () => {
    const className = pinnedSummaryAdoActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,6.5rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
  });
});
