import { describe, expect, it } from "vitest";
import {
  projectLinkFormActionsClass,
  projectLinkFormSectionsClass,
} from "./ProjectLinkForm.js";

describe("ProjectLinkForm layout", () => {
  it("uses a wide-desktop two-column form while stacking on medium widths", () => {
    const className = projectLinkFormSectionsClass();

    expect(className).toContain("grid");
    expect(className).toContain("min-w-0");
    expect(className).toContain("gap-5");
    expect(className).toContain("xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]");
    expect(className).not.toContain("lg:grid-cols");
    expect(className).not.toContain("grid-cols-2");
  });

  it("allows Save and Cancel actions to wrap on narrow forms", () => {
    const className = projectLinkFormActionsClass();

    expect(className).toContain("flex-wrap");
    expect(className).toContain("gap-3");
    expect(className).not.toContain("justify-end");
  });
});
