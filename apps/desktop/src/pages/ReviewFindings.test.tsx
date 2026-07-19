import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  loadStoredReviewActivityPanelOpen,
  REVIEW_ACTIVITY_PANEL_STORAGE_KEY,
  ReviewQueueNoProjectLinkState,
  ReviewQueueProjectLinkResolvingState,
  reviewQueueLoadingLaneGridClass,
  reviewQueuePageShellClass,
  reviewQueueSetupChecklistGridClass,
  reviewQueueWorkspaceLayoutClass,
} from "./ReviewFindings.js";

describe("ReviewFindings layout", () => {
  it("centers the Review Queue workspace at maximized desktop widths", () => {
    const className = reviewQueuePageShellClass();

    expect(className).toContain("mx-auto");
    expect(className).toContain("max-w-[1600px]");
    expect(className).not.toContain("ml-0");
    expect(className).not.toContain("mr-auto");
  });

  it("does not reserve a right-side grid column when recent activity is collapsed", () => {
    const className = reviewQueueWorkspaceLayoutClass(false);

    expect(className).toContain("flex");
    expect(className).not.toContain("xl:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("does not reserve a main-layout column when recent activity is expanded", () => {
    const className = reviewQueueWorkspaceLayoutClass(true);

    expect(className).toContain("flex");
    expect(className).not.toContain("xl:grid-cols");
    expect(className).not.toContain("lg:grid-cols-[minmax(0,1fr)_19rem]");
    expect(className).not.toContain("lg:grid-cols");
    expect(className).not.toContain("2xl:grid-cols");
  });

  it("uses compact wrapping lanes for loading and auto-fit setup guidance", () => {
    const loadingClassName = reviewQueueLoadingLaneGridClass();
    const setupClassName = reviewQueueSetupChecklistGridClass();

    expect(loadingClassName).toContain("flex-wrap");
    expect(loadingClassName).toContain("gap-1.5");
    expect(loadingClassName).not.toContain("auto-fit");
    expect(loadingClassName).not.toContain("sm:grid-cols-2");
    expect(loadingClassName).not.toContain("lg:grid-cols-4");

    expect(setupClassName).toContain("auto-fit");
    expect(setupClassName).toContain("minmax(min(100%,10rem),1fr)");
    expect(setupClassName).not.toContain("sm:grid-cols-3");
  });

  it("keeps recent activity collapsed by default, ignoring the legacy always-open key", () => {
    const storage = {
      getItem: (key: string) => {
        if (key === "mergepilot_review_activity_panel_open") return "true";
        return null;
      },
    };

    expect(loadStoredReviewActivityPanelOpen(storage)).toBe(false);
  });

  it("restores the recent activity panel only from the v2 explicit preference", () => {
    const storage = {
      getItem: (key: string) => key === REVIEW_ACTIVITY_PANEL_STORAGE_KEY ? "true" : null,
    };

    expect(loadStoredReviewActivityPanelOpen(storage)).toBe(true);
  });
});

describe("ReviewQueueNoProjectLinkState", () => {
  it("guides setup without showing empty queue dashboard language", () => {
    const html = renderToStaticMarkup(<ReviewQueueNoProjectLinkState />);

    expect(html).toContain("No Project Link available");
    expect(html).toContain("Create a Project Link with Azure DevOps mapping");
    expect(html).toContain("Open Project Links");
    expect(html).not.toContain("No review decisions found");
    expect(html).not.toContain("Recent activity");
  });
});

describe("ReviewQueueProjectLinkResolvingState", () => {
  it("does not show queue dashboard language while Project Links are still resolving", () => {
    const html = renderToStaticMarkup(<ReviewQueueProjectLinkResolvingState />);

    expect(html).toContain("Loading Project Links");
    expect(html).toContain("Checking repository mappings");
    expect(html).not.toContain("Auto-approved");
    expect(html).not.toContain("Needs human review");
    expect(html).not.toContain("Recent activity");
    expect(html).not.toContain("No review decisions found");
  });
});
