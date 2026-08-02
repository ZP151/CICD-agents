import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PipelineDetailPanel,
  PipelineEmptyState,
  PipelineLoadingSkeleton,
  pipelineContentState,
  pipelineEmptyStateClass,
  pipelineHeaderDescriptionClass,
  pipelineHeaderControlsClass,
  pipelineProjectFilterFallbackLabel,
  pipelineRecovery,
  pipelineRowsGridClass,
  pipelineShouldShowTopLevelError,
  pipelineShouldShowStatusFilters,
  pipelinesPageShellClass,
  pipelineWorkspaceGridClass,
} from "./Pipelines.js";
import { pipelineStatusFiltersGridClass } from "./pipelines/PipelineStatusFilters.js";
import type { PipelineRow } from "./pipelines/pipelineTypes.js";

const row: PipelineRow = {
  projectLinkId: "pl-1",
  projectLinkName: "ClaimBot_API link",
  source: "saved",
  repoPath: "C:\\repos\\ClaimBot_API",
  repository: "ClaimBot_API",
  project: "TeBS-ClaimBot",
  orgUrl: "https://tebssg.visualstudio.com/",
  pipelineId: "117",
  pipelineName: "ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  latestRun: undefined,
  relatedPullRequests: [],
};

describe("Pipelines layout", () => {
  it("centers the Pipelines workspace at maximized desktop widths", () => {
    const className = pipelinesPageShellClass();

    expect(className).toContain("gap-3");
    expect(className).not.toContain("gap-4");
    expect(className).not.toContain("ml-0");
    expect(className).not.toContain("mr-auto");
  });

  it("keeps explanatory header copy out of smaller workbench layouts", () => {
    const className = pipelineHeaderDescriptionClass();

    expect(className).toContain("hidden");
    expect(className).toContain("xl:block");
    expect(className).toContain("max-w-2xl");
    expect(className).not.toContain("lg:block");
    expect(className).not.toContain("sm:block");
  });

  it("uses responsive header controls instead of a single nowrap flex group", () => {
    const className = pipelineHeaderControlsClass();

    expect(className).toContain("grid-cols-1");
    expect(className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(className).toContain("xl:w-[clamp(18rem,30vw,32rem)]");
    expect(className).not.toContain("lg:w-[clamp(18rem,30vw,32rem)]");
    expect(className).not.toContain("lg:min-w-[18rem]");
    expect(className).not.toContain("lg:max-w-[32rem]");
    expect(className).not.toContain("flex items-center");
  });

  it("uses compact wrapping status filters instead of dashboard cards", () => {
    const className = pipelineStatusFiltersGridClass();

    expect(className).toContain("flex");
    expect(className).toContain("flex-wrap");
    expect(className).toContain("gap-1.5");
    expect(className).not.toContain("grid");
    expect(className).not.toContain("minmax");
    expect(className).not.toContain("sm:grid-cols-3");
    expect(className).not.toContain("xl:grid-cols-6");
  });
});

describe("PipelineDetailPanel", () => {
  it("renders run evidence statuses with the full semantic tone", () => {
    const html = renderToStaticMarkup(
      <PipelineDetailPanel
        row={row}
        state={{
          phase: "done",
          result: {
            ok: true,
            action: "inspect_pipeline",
            repoPath: row.repoPath,
            summary: "Pipeline inspected.",
            workflowState: { status: "done", currentStep: "", completedTools: [] },
            tools: [],
          },
          runs: [
            {
              id: 4680,
              name: "20260705.1",
              state: "completed",
              result: "succeeded",
              createdDate: "2026-07-05T01:00:00.000Z",
              finishedDate: "2026-07-05T01:02:00.000Z",
              sourceBranch: "refs/heads/main",
              url: "https://tebssg.visualstudio.com/build/4680?definitionId=117",
            },
          ],
        }}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Run evidence");
    expect(html).toContain("20260705.1");
    expect(html).toContain("Succeeded");
    expect(html).toContain("text-[rgb(var(--app-success))]");
    expect(html).toContain("ring-[rgb(var(--app-success-border))]");
    expect(html).toContain("overflow-y-auto");
  });
});

describe("PipelineEmptyState", () => {
  it("keeps refreshing discovery narrower than the full empty state", () => {
    expect(pipelineEmptyStateClass("refreshing")).toContain("max-w-xl");
    expect(pipelineEmptyStateClass("refreshing")).not.toContain("max-w-4xl");
    expect(pipelineEmptyStateClass("empty")).toContain("max-w-4xl");
  });

  it("renders a compact action-oriented no-pipelines state", () => {
    const html = renderToStaticMarkup(
      <PipelineEmptyState
        mode="empty"
        hasProjectLinks
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("No pipelines discovered yet");
    expect(html).toContain("Check the Project Link mapping");
    expect(html).toContain("Refresh discovery");
    expect(html).not.toContain("flex-1 items-center justify-center");
  });

  it("links to Project Links when there is no Project Link mapping", () => {
    const html = renderToStaticMarkup(
      <PipelineEmptyState
        mode="empty"
        hasProjectLinks={false}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("No Project Links available");
    expect(html).toContain("Open Project Links");
    expect(html).toContain("href=\"#/project-links\"");
    expect(html).not.toContain("Refresh discovery");
  });

  it("turns mapping failures into a compact Project Link recovery", () => {
    const html = renderToStaticMarkup(
      <PipelineEmptyState
        mode="empty"
        hasProjectLinks
        error="ado_project_link_incomplete"
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("Complete this Project Link");
    expect(html).toContain("Azure DevOps organization, project, repository, and branch scope");
    expect(html).toContain("Open Project Links");
    expect(html).toContain("Technical detail");
    expect(html).toContain("ado_project_link_incomplete");
    expect(html).not.toContain("Latest error:");
  });
});

describe("pipelineRecovery", () => {
  it("keeps credential and permission recovery concise", () => {
    expect(pipelineRecovery("401 unauthorized", true)).toMatchObject({
      title: "Azure DevOps sign-in needs attention",
      primaryAction: "Try again",
    });
    expect(pipelineRecovery("403 forbidden", true)).toMatchObject({
      title: "Azure DevOps access is missing",
      primaryAction: "Try again",
    });
  });
});

describe("PipelineLoadingSkeleton", () => {
  it("keeps first-load pipeline discovery compact and readable", () => {
    const html = renderToStaticMarkup(<PipelineLoadingSkeleton />);

    expect(html).toContain("Loading pipelines");
    expect(html).toContain("Azure DevOps pipeline definitions");
    expect(html).toContain("Discovery running");
    expect(html).toContain("aria-live=\"polite\"");
    expect(html).not.toContain("Pipeline loading placeholders");
    expect(html.match(/animate-pulse/g) ?? []).toHaveLength(1);
  });
});

describe("pipelineContentState", () => {
  it("keeps the empty state hidden while discovery is refreshing with no rows", () => {
    expect(
      pipelineContentState({
        firstLoad: false,
        rowCount: 0,
        discovering: true,
      }),
    ).toBe("refreshing-empty");
  });

  it("keeps existing rows visible during background discovery refreshes", () => {
    expect(
      pipelineContentState({
        firstLoad: false,
        rowCount: 2,
        discovering: true,
      }),
    ).toBe("rows");
  });

  it("shows the real empty state only after discovery is idle", () => {
    expect(
      pipelineContentState({
        firstLoad: false,
        rowCount: 0,
        discovering: false,
      }),
    ).toBe("empty");
  });
});

describe("pipelineShouldShowTopLevelError", () => {
  it("shows the page-level error only when cached pipeline rows remain visible", () => {
    expect(pipelineShouldShowTopLevelError("Failed to fetch", "rows")).toBe(true);
    expect(pipelineShouldShowTopLevelError("Failed to fetch", "empty")).toBe(false);
    expect(pipelineShouldShowTopLevelError("Failed to fetch", "refreshing-empty")).toBe(false);
    expect(pipelineShouldShowTopLevelError(null, "rows")).toBe(false);
  });
});

describe("pipelineShouldShowStatusFilters", () => {
  it("hides all-zero dashboard filters when there are no Project Links and no rows", () => {
    expect(pipelineShouldShowStatusFilters({
      hasProjectLinks: false,
      rowCount: 0,
    })).toBe(false);
  });

  it("hides dashboard filters during first-load discovery even when Project Link context exists", () => {
    expect(pipelineShouldShowStatusFilters({
      hasProjectLinks: true,
      rowCount: 0,
      contentState: "loading",
    })).toBe(false);
    expect(pipelineShouldShowStatusFilters({
      hasProjectLinks: true,
      rowCount: 0,
      contentState: "refreshing-empty",
    })).toBe(false);
  });

  it("keeps filters visible once Project Link context or cached rows exist", () => {
    expect(pipelineShouldShowStatusFilters({
      hasProjectLinks: true,
      rowCount: 0,
    })).toBe(true);
    expect(pipelineShouldShowStatusFilters({
      hasProjectLinks: false,
      rowCount: 1,
    })).toBe(true);
  });
});

describe("pipelineRowsGridClass", () => {
  it("uses a wide-screen two-column threshold without forcing columns", () => {
    expect(pipelineRowsGridClass(false)).toContain(
      "grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))]",
    );
    expect(pipelineRowsGridClass(false)).not.toContain("xl:grid-cols-2");
    expect(pipelineRowsGridClass(false)).not.toContain("34rem");
    expect(pipelineRowsGridClass(true)).toContain("auto-fit");
  });
});

describe("pipelineWorkspaceGridClass", () => {
  it("does not reserve a main-layout column for the analysis drawer", () => {
    expect(pipelineWorkspaceGridClass(false)).toBe("");
    expect(pipelineWorkspaceGridClass(true)).toBe("");
    expect(pipelineWorkspaceGridClass(true)).not.toContain("lg:grid-cols");
    expect(pipelineWorkspaceGridClass(true)).not.toContain("2xl:grid-cols");
    expect(pipelineWorkspaceGridClass(true)).not.toContain("grid-cols-[minmax(0,1fr)_22rem]");
  });
});

describe("pipelineProjectFilterFallbackLabel", () => {
  it("distinguishes loading, missing Project Links, and missing ADO projects", () => {
    expect(
      pipelineProjectFilterFallbackLabel({
        projectLinksLoading: true,
        hasProjectLinks: false,
      }),
    ).toBe("Loading projects...");
    expect(
      pipelineProjectFilterFallbackLabel({
        projectLinksLoading: false,
        hasProjectLinks: false,
      }),
    ).toBe("No Project Links");
    expect(
      pipelineProjectFilterFallbackLabel({
        projectLinksLoading: false,
        hasProjectLinks: true,
      }),
    ).toBe("No ADO projects");
  });
});
