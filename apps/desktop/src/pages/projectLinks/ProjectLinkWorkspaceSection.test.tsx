import { describe, expect, it } from "vitest";
import { projectLinkBranchGridClass } from "./ProjectLinkWorkspaceSection.js";

describe("ProjectLinkWorkspaceSection layout", () => {
  it("keeps branch controls single-column until there is enough width", () => {
    const className = projectLinkBranchGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,14rem),1fr)");
    expect(className).toContain("gap-3");
    expect(className).not.toContain("grid-cols-2 gap-4");
    expect(className).not.toContain("md:grid-cols-2");
  });
});
