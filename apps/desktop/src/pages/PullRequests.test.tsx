import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PullRequestEmptyState,
  PullRequestLoadingSkeleton,
  PullRequestProjectLinkResolvingState,
  pullRequestLoadingMetaGridClass,
  pullRequestRecovery,
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

  it("uses an auto-fit grid for the loading metadata", () => {
    const loadingClassName = pullRequestLoadingMetaGridClass();

    expect(loadingClassName).toContain("auto-fit");
    expect(loadingClassName).toContain("minmax(min(100%,9.5rem),1fr)");
    expect(loadingClassName).not.toContain("sm:grid-cols-3");
  });
});

describe("PullRequestEmptyState", () => {
  it("turns a raw project-link error into a compact, actionable recovery state", () => {
    const html = renderToStaticMarkup(
      <PullRequestEmptyState
        mode="error"
        hasProjectLinks
        message="ado_project_link_incomplete"
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("Complete this Project Link");
    expect(html).toContain("Azure DevOps organization, project, repository, and branch scope");
    expect(html).toContain("Open Project Links");
    expect(html).toContain("href=\"#/project-links\"");
    expect(html).toContain("Technical detail");
    expect(html).toContain("ado_project_link_incomplete");
    expect(html).not.toContain("Microsoft sign-in");
    expect(html).not.toContain("Repository permissions");
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

describe("pullRequestRecovery", () => {
  it("keeps credential and permission recovery concise", () => {
    expect(pullRequestRecovery("401 unauthorized", true)).toMatchObject({
      title: "Azure DevOps sign-in needs attention",
      primaryAction: "Try again",
    });
    expect(pullRequestRecovery("403 forbidden", true)).toMatchObject({
      title: "Azure DevOps access is missing",
      primaryAction: "Try again",
    });
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
