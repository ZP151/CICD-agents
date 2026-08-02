import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserFooter } from "./UserFooter.js";

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
  it("keeps the sidebar footer to a full-size avatar control", () => {
    const html = renderToStaticMarkup(<UserFooter />);

    expect(html).toContain("Signed in as Zhou Ping (Zhou.Ping@totalebizsolutions.com)");
    expect(html).not.toContain("<p ");
    expect(html).toContain('aria-label="Account: Zhou Ping"');
    expect(html).not.toContain('title="Zhou Ping (Zhou.Ping@totalebizsolutions.com)"');
    expect(html).toContain("h-9 w-9");
    expect(html).toContain("app-shell-account-footer");
    expect(html).toContain("justify-start");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("group-hover/account:block");
    expect(html).not.toContain("h-3 w-3 shrink-0");
  });
});
