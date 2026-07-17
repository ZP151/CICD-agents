import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InitialsAvatar, SafeAvatar, initialsFromText } from "./avatar.js";

describe("avatar rendering", () => {
  it("derives compact initials from names and identifiers", () => {
    expect(initialsFromText("Zhou Ping")).toBe("ZP");
    expect(initialsFromText("Zhou.Ping@totalebizsolutions.com")).toBe("ZP");
    expect(initialsFromText("Zhou")).toBe("ZH");
    expect(initialsFromText("", "?")).toBe("?");
  });

  it("renders an image when Microsoft Graph avatar data is available", () => {
    const avatarDataUrl =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

    const html = renderToStaticMarkup(
      <SafeAvatar
        src={avatarDataUrl}
        label="Zhou Ping"
        imageClassName="avatar-image"
        fallbackClassName="avatar-fallback"
      />,
    );

    expect(html).toContain("<img");
    expect(html).toContain(`src="${avatarDataUrl}"`);
    expect(html).toContain('class="avatar-image"');
    expect(html).not.toContain("ZP");
  });

  it("renders initials when no avatar data is available", () => {
    const html = renderToStaticMarkup(
      <SafeAvatar
        label="Zhou Ping"
        imageClassName="avatar-image"
        fallbackClassName="avatar-fallback"
      />,
    );

    expect(html).toContain("ZP");
    expect(html).toContain('class="flex shrink-0');
    expect(html).toContain("avatar-fallback");
    expect(html).not.toContain("<img");
  });

  it("keeps the fallback accessible to static renderers", () => {
    const html = renderToStaticMarkup(<InitialsAvatar label="MergePilot User" className="h-7 w-7" />);

    expect(html).toContain("MU");
    expect(html).toContain("rounded-full");
  });
});
