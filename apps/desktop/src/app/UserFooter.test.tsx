import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserFooter, userFooterHoverCardClass } from "./UserFooter.js";

const authState = vi.hoisted(() => ({
  user: {
    authenticated: true,
    name: "Zhou Ping",
    upn: "Zhou.Ping@totalebizsolutions.com",
  },
  save: vi.fn(),
  refresh: vi.fn(async () => ({
    authenticated: true,
    name: "Zhou Ping",
    upn: "Zhou.Ping@totalebizsolutions.com",
  })),
}));

vi.mock("./authContext.js", () => ({
  useAuth: () => authState,
}));

describe("UserFooter", () => {
  it("keeps personal account details out of the default sidebar label", () => {
    const html = renderToStaticMarkup(<UserFooter />);

    expect(html).toContain("Signed in as Zhou Ping (Zhou.Ping@totalebizsolutions.com)");
    expect(html).not.toContain("<p ");
    expect(html).toContain('title="Zhou Ping (Zhou.Ping@totalebizsolutions.com)"');
    expect(html).toContain("group-hover/account:block");
    expect(html).not.toContain(">Signed in</p>");
  });

  it("shows account details only through hover or menu affordances", () => {
    const className = userFooterHoverCardClass();

    expect(className).toContain("hidden");
    expect(className).toContain("group-hover/account:block");
    expect(className).toContain("group-focus-visible/account:block");
    expect(className).toContain("absolute");
  });
});
