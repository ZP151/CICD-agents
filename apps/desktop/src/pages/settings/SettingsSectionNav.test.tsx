import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSectionNav, settingsSectionLinks } from "./SettingsSectionNav.js";

describe("SettingsSectionNav", () => {
  it("keeps the settings categories available as in-page anchors", () => {
    const html = renderToStaticMarkup(
      <SettingsSectionNav
        activeSection="settings-account"
        onSectionChange={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Settings sections"');
    expect(settingsSectionLinks.map((section) => section.label)).toEqual([
      "Appearance",
      "System",
      "Account",
      "Additional Models",
      "Capabilities",
      "Diagnostics",
    ]);
    for (const section of settingsSectionLinks) {
      expect(html).toContain(`>${section.label}</button>`);
    }
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("href=");
  });
});
