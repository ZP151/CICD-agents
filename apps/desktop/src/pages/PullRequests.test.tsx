import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PullRequestEmptyState,
  PullRequestLoadingSkeleton,
  PullRequestProjectLinkResolvingState,
  pullRequestEmptyChecklistGridClass,
  pullRequestInsightPanelClass,
  pullRequestLoadingMetaGridClass,
  pullRequestsListGridClass,
  pullRequestsPageShellClass,
  pullRequestsWorkspaceLayoutClass,
} from "./PullRequests.js";

describe("PullRequests layout", () => {
  it("centers the Pull Requests workspace at maximized desktop widths", () => {
    const className = pullRequestsPageShellClass();

    expect(className).toContain("gap-4");
    expect(className).not.toContain("gap-5");
    expect(className).not.toContain("ml-0");
    expect(className).not.toContain("mr-auto");
  });

  it("does not reserve a main-layout column when insight is open", () => {
    expect(pullRequestsWorkspaceLayoutClass(false)).toContain("flex");
    expect(pullRequestsWorkspaceLayoutClass(false)).not.toContain("xl:grid-cols");

    const openClassName = pullRequestsWorkspaceLayoutClass(true);
    expect(openClassName).toContain("flex");
    expect(openClassName).not.toContain("xl:grid-cols");
    expect(openClassName).not.toContain("lg:grid-cols");
    expect(openClassName).not.toContain("2xl:grid-cols");
    expect(openClassName).not.toContain("grid-cols-[minmax(0,1fr)_26rem]");
  });

  it("keeps PRs in a scan-friendly continuous worklist at desktop sizes", () => {
    const className = pullRequestsListGridClass();

    expect(className).toContain("flex-col");
    expect(className).toContain("overflow-hidden");
    expect(className).toContain("rounded-xl");
    expect(className).toContain("border-[rgb(var(--app-border))]");
    expect(className).not.toContain("auto-fit");
    expect(className).not.toContain("grid-cols-1");
  });

  it("keeps the insight detail reachable as a right-side drawer at every viewport", () => {
    const className = pullRequestInsightPanelClass();

    expect(className).toContain("fixed");
    expect(className).toContain("inset-y-0");
    expect(className).toContain("right-0");
    expect(className).toContain("w-[min(30rem,calc(100vw-2rem))]");
    expect(className).toContain("overflow-y-auto");
    expect(className).toContain("shadow-2xl");
    expect(className).not.toContain("xl:sticky");
    expect(className).not.toContain("xl:w-auto");
    expect(className).not.toContain("lg:sticky");
    expect(className).not.toContain("lg:w-auto");
  });

  it("uses auto-fit grids for loading and empty transient states", () => {
    const loadingClassName = pullRequestLoadingMetaGridClass();
    const checklistClassName = pullRequestEmptyChecklistGridClass();

    expect(loadingClassName).toContain("auto-fit");
    expect(loadingClassName).toContain("minmax(min(100%,9.5rem),1fr)");
    expect(loadingClassName).not.toContain("sm:grid-cols-3");

    expect(checklistClassName).toContain("auto-fit");
    expect(checklistClassName).toContain("minmax(min(100%,10rem),1fr)");
    expect(checklistClassName).not.toContain("sm:grid-cols-3");
  });
});

describe("PullRequestEmptyState", () => {
  it("renders credential errors as a compact recovery state", () => {
    const html = renderToStaticMarkup(
      <PullRequestEmptyState
        mode="error"
        hasProjectLinks
        message="Azure credential expired or missing. Please sign in again."
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("Pull requests unavailable");
    expect(html).toContain("Azure credential expired or missing");
    expect(html).toContain("Microsoft sign-in");
    expect(html).toContain("Repository permissions");
    expect(html).toContain("Project Link branch scope");
    expect(html).toContain("Refresh");
    expect(html).toContain("auto-fit");
    expect(html).not.toContain("flex-1 items-center justify-center");
    expect(html).not.toContain("sm:grid-cols-3");
  });

  it("renders no-data guidance without using a large blank panel", () => {
    const html = renderToStaticMarkup(
      <PullRequestEmptyState
        mode="empty"
        hasProjectLinks
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("No pull requests found");
    expect(html).toContain("Try another Project Link or status filter");
    expect(html).toContain("Refresh");
    expect(html).not.toContain("flex-1 items-center justify-center");
  });

  it("guides users to create a Project Link before implying there are no PRs", () => {
    const html = renderToStaticMarkup(
      <PullRequestEmptyState
        mode="empty"
        hasProjectLinks={false}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("No Project Link available");
    expect(html).toContain("Create a Project Link with Azure DevOps mapping");
    expect(html).toContain("Open Project Links");
    expect(html).toContain("href=\"#/project-links\"");
    expect(html).not.toContain("No pull requests found");
  });
});

describe("PullRequestProjectLinkResolvingState", () => {
  it("does not show PR loading or empty-result language while Project Links resolve", () => {
    const html = renderToStaticMarkup(<PullRequestProjectLinkResolvingState />);

    expect(html).toContain("Loading Project Links");
    expect(html).toContain("Checking repository mappings");
    expect(html).not.toContain("Preparing pull requests");
    expect(html).not.toContain("No pull requests found");
    expect(html).not.toContain("Pull requests unavailable");
  });
});

describe("PullRequestLoadingSkeleton", () => {
  it("keeps the first-load state readable instead of showing anonymous blank cards", () => {
    const html = renderToStaticMarkup(<PullRequestLoadingSkeleton />);

    expect(html).toContain("Preparing pull requests");
    expect(html).toContain("Azure DevOps returns active PRs");
    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("auto-fit");
    expect(html).not.toContain("Loading pull requests");
    expect(html).not.toContain("sm:grid-cols-3");
  });
});
