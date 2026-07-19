import { describe, expect, it } from "vitest";
import { workspaceProjectLinkActionsGridClass } from "./WorkspaceProjectLinkPanel.js";

describe("WorkspaceProjectLinkPanel layout", () => {
  it("uses an auto-fit action grid for compact environment panels", () => {
    const className = workspaceProjectLinkActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
  });
});
