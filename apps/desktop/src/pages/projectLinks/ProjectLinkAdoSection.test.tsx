import { describe, expect, it } from "vitest";
import { projectLinkAdoProjectRepoGridClass } from "./ProjectLinkAdoSection.js";

describe("ProjectLinkAdoSection layout", () => {
  it("lets project and repository fields reflow by available width", () => {
    const className = projectLinkAdoProjectRepoGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,14rem),1fr)");
    expect(className).toContain("gap-3");
    expect(className).not.toContain("sm:grid-cols-2");
  });
});
