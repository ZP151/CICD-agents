import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PullRequestPageHeader,
  pullRequestHeaderControlsClass,
} from "./PullRequestPageHeader.js";

describe("PullRequestPageHeader", () => {
  it("keeps the header free of a Project Link selector; Context owns selection", () => {
    const html = renderToStaticMarkup(
      <PullRequestPageHeader
        status="active"
        selectedProjectLink={null}
        branchScope=""
        onStatusChange={() => undefined}
        onRefresh={() => undefined}
        onCreatePr={() => undefined}
      />,
    );

    expect(html).not.toContain('aria-label="Pull Requests Project Link"');
    expect(html).not.toContain("Loading Project Links...");
    expect(html).not.toContain("No Project Links");
    expect(html).not.toContain("All Project Links");
    expect(html).toContain('aria-label="Pull Requests status"');
    expect(html).toContain("Refresh");
    expect(html).toContain("Create PR");
  });

  it("uses responsive header controls for long Project Link names", () => {
    const html = renderToStaticMarkup(
      <PullRequestPageHeader
        status="active"
        selectedProjectLink={null}
        branchScope="main"
        onStatusChange={() => undefined}
        onRefresh={() => undefined}
        onCreatePr={() => undefined}
      />,
    );

    const controlsClass = pullRequestHeaderControlsClass();
    expect(controlsClass).toContain("grid-cols-1");
    expect(controlsClass).toContain("sm:grid-cols-[minmax(0,1fr)_9rem_auto]");
    expect(controlsClass).toContain("xl:w-[clamp(30rem,42vw,38rem)]");
    expect(controlsClass).not.toContain("lg:w-[clamp(30rem,42vw,38rem)]");
    expect(controlsClass).not.toContain("lg:min-w-[30rem]");
    expect(controlsClass).not.toContain("lg:max-w-[38rem]");
    expect(html).not.toContain("md:max-w-[22rem]");
    expect(html).toContain("hidden max-w-2xl");
    expect(html).toContain("xl:block");
    expect(html).not.toContain("lg:block");
    expect(html).not.toContain("sm:min-w-[14rem]");
    expect(html).toContain("sm:w-[9rem]");
    expect(html).toContain("min-h-9");
    expect(html).toContain("focus:ring-[rgb(var(--app-focus))]/35");
    expect(html).not.toContain("sm:w-[22rem]");
    expect(html).not.toContain("justify-end");
  });

  it("combines selected Project Link scope into compact hover-detail chips", () => {
    const html = renderToStaticMarkup(
      <PullRequestPageHeader
        status="active"
        selectedProjectLink={{
          id: "pl-1",
          name: "ClaimBot_API link",
          repoPath: "C:\\repos\\ClaimBot_API",
          defaultBranch: "feature/cicd-agent-20260719-responsive",
          targetBranch: "main",
          adoOrgUrl: "https://tebssg.visualstudio.com/",
          adoProject: "TeBS-ClaimBot",
          adoRepoName: "ClaimBot_API",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "",
          projectTemplate: "",
          buildCommand: "",
          testCommand: "",
          createdAt: 1,
          updatedAt: 1,
        }}
        branchScope="feature/cicd-agent-20260719-responsive"
        onStatusChange={() => undefined}
        onRefresh={() => undefined}
        onCreatePr={() => undefined}
      />,
    );

    expect(html).toContain("TeBS-ClaimBot / ClaimBot_API");
    expect(html).toContain("feature/cicd-agent-20260719-responsive -&gt; main");
    expect(html).toContain("Default branch:");
    expect(html).toContain("PR target:");
    expect(html).not.toContain(">TeBS-ClaimBot</span><span");
    expect(html).not.toContain(">target: main</span>");
  });
});
