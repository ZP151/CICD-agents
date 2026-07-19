import { describe, expect, it } from "vitest";
import { projectLinkOnboardingBranchGridClass } from "./ProjectLinkBasicFields.js";

describe("ProjectLinkBasicFields layout", () => {
  it("lets branch selectors auto-fit without overlapping or wasting wide space", () => {
    const className = projectLinkOnboardingBranchGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,13rem),1fr)");
    expect(className).toContain("min-w-0");
    expect(className).not.toContain("grid-cols-1");
    expect(className).not.toContain("sm:grid-cols-2");
  });
});
