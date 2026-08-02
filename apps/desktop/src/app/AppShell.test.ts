import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  appShellFrameClass,
  appShellGroupLabelClass,
  appShellNavLabelClass,
  appShellNavLinkClass,
  appShellSidebarClass,
  FullLayout,
  PageLoadingFallback,
  pageShellContentClass,
  pageShellFadeClass,
  preloadWorkspaceRouteModules,
  routeErrorBoundaryResetKey,
  RouteErrorFallback,
  workspaceRouteFallbackTarget,
} from "./AppShell.js";

describe("AppShell route preloading", () => {
  it("preloads all workspace route modules", async () => {
    const loaders = [
      vi.fn(async () => ({ default: "PullRequests" })),
      vi.fn(async () => ({ default: "ReviewQueue" })),
      vi.fn(async () => ({ default: "Pipelines" })),
    ];

    await preloadWorkspaceRouteModules(loaders);

    expect(loaders.map((loader) => loader.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it("keeps Suspense fallback available when a preload fails", async () => {
    const loaders = [
      vi.fn(async () => ({ default: "PullRequests" })),
      vi.fn(async () => {
        throw new Error("chunk unavailable");
      }),
    ];

    await expect(preloadWorkspaceRouteModules(loaders)).resolves.toBeUndefined();
    expect(loaders.map((loader) => loader.mock.calls.length)).toEqual([1, 1]);
  });
});

describe("AppShell route fallbacks", () => {
  it("keeps stale workspace URLs from rendering a blank page", () => {
    expect(workspaceRouteFallbackTarget("/review")).toBe("/findings");
    expect(workspaceRouteFallbackTarget("/review/")).toBe("/findings");
    expect(workspaceRouteFallbackTarget("/review-queue")).toBe("/findings");
    expect(workspaceRouteFallbackTarget("/pull-requests")).toBe("/pulls");
    expect(workspaceRouteFallbackTarget("/tasks")).toBe("/activity");
  });

  it("returns users to Chat for unknown workspace routes", () => {
    expect(workspaceRouteFallbackTarget("/unknown")).toBe("/chat");
    expect(workspaceRouteFallbackTarget("/")).toBe("/chat");
  });
});

describe("AppShell route recovery", () => {
  it("resets route errors from path state rather than HashRouter's stable location key", () => {
    expect(routeErrorBoundaryResetKey({
      pathname: "/activity",
      search: "",
      hash: "",
    })).toBe("/activity");
    expect(routeErrorBoundaryResetKey({
      pathname: "/settings",
      search: "?tab=model",
      hash: "#advanced",
    })).toBe("/settings?tab=model#advanced");
  });

  it("renders a recoverable page fallback instead of a blank workspace", () => {
    const html = renderToStaticMarkup(
      createElement(RouteErrorFallback, {
        error: new Error("connections.filter is not a function"),
      }),
    );

    expect(html).toContain("Page recovery");
    expect(html).toContain("This workspace page needs a refresh");
    expect(html).toContain("Refresh page");
    expect(html).toContain("Back to Chat");
    expect(html).toContain("Technical detail");
    expect(html).toContain("connections.filter is not a function");
  });
});

describe("AppShell route loading", () => {
  it("renders a quiet workspace skeleton while a page chunk is loading", () => {
    const html = renderToStaticMarkup(createElement(PageLoadingFallback));

    expect(html).toContain("Preparing workspace");
    expect(html).toContain("Loading this page and its local context.");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Loading workspace content");
    expect(html).toContain("workbench-skeleton-block");
  });
});

describe("AppShell themed layout classes", () => {
  it("uses responsive page padding and preserves scroll mode", () => {
    expect(pageShellContentClass(true)).toContain("px-4");
    expect(pageShellContentClass(true)).toContain("sm:px-6");
    expect(pageShellContentClass(true)).toContain("overflow-auto");
    expect(pageShellContentClass(false)).toContain("overflow-hidden");
  });

  it("uses app theme tokens instead of hardcoded dark shell colors", () => {
    const classes = [
      pageShellFadeClass(),
      appShellFrameClass(),
      appShellSidebarClass(),
      appShellGroupLabelClass(),
      appShellNavLinkClass(true),
      appShellNavLinkClass(false),
    ].join(" ");

    expect(classes).toContain("--app-bg");
    expect(classes).toContain("--app-text");
    expect(classes).toContain("--app-border");
    expect(classes).not.toMatch(/zinc-\d+/);
  });

  it("collapses the workspace navigation into an icon rail on narrow windows", () => {
    expect(appShellSidebarClass()).toContain("app-shell-sidebar");
    expect(appShellGroupLabelClass()).toContain("app-shell-group-label");
    expect(appShellNavLinkClass(false)).toContain("app-shell-nav-link");
    expect(appShellNavLabelClass()).toContain("app-shell-nav-label");
  });

  it("keeps active and inactive navigation visually distinct", () => {
    expect(appShellNavLinkClass(true)).toContain("--app-sidebar-active");
    expect(appShellNavLinkClass(false)).toContain("hover:bg");
    expect(appShellNavLinkClass(false)).toContain("--app-sidebar-muted");
  });
});

describe("AppShell workspace routes", () => {
  it("renders Activity inside a scrollable page shell for narrow responsive layouts", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const html = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ["/activity"] }, createElement(FullLayout)),
      );

      expect(html).toContain("overflow-auto");
      expect(html).toContain("app-shell-nav-icon");
      expect(html).toContain("app-shell-nav-link");
      expect(html).not.toContain("({ isActive })");
    } finally {
      consoleError.mockRestore();
    }
  });
});
