import { describe, expect, it } from "vitest";
import { pinnedSummaryPanelShellClass } from "./PinnedSummaryPanel.js";
import { workspaceProjectLinkActionsGridClass } from "./WorkspaceProjectLinkPanel.js";

describe("PinnedSummaryPanel layout", () => {
  it("keeps the floating panel bounded to the viewport", () => {
    const className = pinnedSummaryPanelShellClass();

    expect(className).toContain("w-[min(20rem,calc(100vw-2rem))]");
    expect(className).toContain("max-w-[calc(100%-24px)]");
    expect(className).not.toContain("w-[300px]");
  });

  it("uses the shared auto-fit grid for compact ADO actions", () => {
    const className = workspaceProjectLinkActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
  });
});
