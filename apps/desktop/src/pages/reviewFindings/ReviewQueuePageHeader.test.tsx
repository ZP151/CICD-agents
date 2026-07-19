import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewQueuePageHeader, reviewQueueHeaderControlsClass } from "./ReviewQueuePageHeader.js";

describe("ReviewQueuePageHeader", () => {
  const longProjectLink = {
    id: "pl-live-long",
    name: "mp-live-claimbot-pipeline-20260716181319",
    repoPath: "C:\\repos\\ClaimBot_API",
    defaultBranch: "feature/cicd-agent-20260716181319",
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
  };

  it("bounds long Project Link names in the header selector", () => {
    const html = renderToStaticMarkup(
      <ReviewQueuePageHeader
        projectLinks={[longProjectLink]}
        projectLinksLoading={false}
        projectLinkId="pl-live-long"
        selectedProjectLink={null}
        onProjectLinkChange={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("truncate");
    expect(html).toContain("mp live claimbot pipeline · 1319");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(html).toContain("xl:w-[clamp(24rem,36vw,36rem)]");
    expect(html).toContain("xl:flex-row");
    expect(html).toContain("hidden max-w-2xl");
    expect(html).toContain("xl:block");
    expect(html).not.toContain("lg:block");
    expect(html).not.toContain("lg:w-[clamp(24rem,36vw,36rem)]");
    expect(html).not.toContain("lg:flex-row");
    expect(html).not.toContain("lg:min-w-[24rem]");
    expect(html).not.toContain("lg:max-w-[36rem]");
    expect(html).not.toContain("sm:w-[22rem]");
    expect(html).not.toContain("max-w-[22rem]");
  });

  it("shows compact Project Link scope chips with full details on hover", () => {
    const html = renderToStaticMarkup(
      <ReviewQueuePageHeader
        projectLinks={[longProjectLink]}
        projectLinksLoading={false}
        projectLinkId="pl-live-long"
        selectedProjectLink={longProjectLink}
        onProjectLinkChange={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(html).toContain("TeBS-ClaimBot / ClaimBot_API");
    expect(html).toContain("feature/cicd-agent-20260716181319 -&gt; main");
    expect(html).toContain("https://tebssg.visualstudio.com/ / TeBS-ClaimBot / ClaimBot_API");
    expect(html).toContain(
      "Default branch: feature/cicd-agent-20260716181319; PR target: main",
    );
    expect(html).not.toContain(">TeBS-ClaimBot</span><span");
    expect(html).not.toContain(">ClaimBot_API</span><span");
    expect(html).not.toContain(">target: main</span>");
  });

  it("uses a responsive control grid instead of wrapped fixed-width controls", () => {
    const className = reviewQueueHeaderControlsClass();

    expect(className).toContain("grid-cols-1");
    expect(className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(className).toContain("xl:w-[clamp(24rem,36vw,36rem)]");
    expect(className).not.toContain("lg:w-[clamp(24rem,36vw,36rem)]");
    expect(className).not.toContain("lg:min-w-[24rem]");
    expect(className).not.toContain("lg:max-w-[36rem]");
  });
});
