import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection.js";

describe("AppearanceSettingsSection", () => {
  it("offers only fixed visual modes", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettingsSection
        theme="light"
        onThemeChange={() => undefined}
      />,
    );

    expect(html).toContain("Choose a fixed visual mode for MergePilot.");
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).not.toContain("System");
    expect(html).not.toContain("Resolved:");
  });

  it("keeps fixed themes concise", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettingsSection
        theme="dark"
        onThemeChange={() => undefined}
      />,
    );

    expect(html).toContain("Choose a fixed visual mode for MergePilot.");
    expect(html).not.toContain("Resolved:");
  });
});
