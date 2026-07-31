import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection.js";

describe("AppearanceSettingsSection", () => {
  it("offers the three fixed visual modes", () => {
    const html = renderToStaticMarkup(
      <AppearanceSettingsSection
        theme="standard"
        onThemeChange={() => undefined}
      />,
    );

    expect(html).toContain("Standard keeps blue and soft violet cues");
    expect(html).toContain("Standard");
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

    expect(html).toContain("Standard keeps blue and soft violet cues");
    expect(html).not.toContain("Resolved:");
  });
});
