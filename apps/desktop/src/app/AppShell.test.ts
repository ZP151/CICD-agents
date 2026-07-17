import { describe, expect, it, vi } from "vitest";
import { preloadWorkspaceRouteModules } from "./AppShell.js";

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
