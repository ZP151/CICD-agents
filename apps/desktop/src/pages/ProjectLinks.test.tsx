import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProjectLinksEmpty,
  ProjectLinksLoading,
  ProjectLinksList,
  partitionProjectLinks,
  projectLinkFormShellClass,
  projectLinksHeaderClass,
  projectLinksGridClass,
  projectLinksListShellClass,
  projectLinksTemporarySectionClass,
} from "./ProjectLinks.js";
import { withoutProjectLinkFallbacks } from "../projectLinks.js";
import type { ProjectLink } from "../api.js";
import {
  ProjectLinkCard,
  compactProjectLinkName,
  compactProjectLinkAdoScope,
  compactProjectLinkBranchScope,
  compactProjectLinkRepoLabel,
  projectLinkConnectionState,
} from "./projectLinks/ProjectLinkCard.js";

describe("ProjectLinks layout", () => {
  it("uses wider workbench containers instead of a narrow fixed column", () => {
    expect(projectLinkFormShellClass()).toContain("max-w-5xl");
    expect(projectLinksListShellClass()).toContain("max-w-7xl");
    expect(projectLinkFormShellClass()).not.toContain("max-w-3xl");
    expect(projectLinkFormShellClass()).not.toContain("max-w-xl");
    expect(projectLinksListShellClass()).not.toContain("max-w-xl");
    expect(projectLinksListShellClass()).not.toContain("max-w-5xl");
  });

  it("uses a responsive card grid for saved Project Links", () => {
    const className = projectLinksGridClass();

    expect(className).toContain("grid");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,22rem),1fr)");
    expect(className).not.toContain("xl:grid-cols-2");
  });

  it("stacks the list header actions on narrow windows", () => {
    const className = projectLinksHeaderClass();

    expect(className).toContain("flex-col");
    expect(className).toContain("sm:flex-row");
    expect(className).toContain("sm:justify-between");
    expect(className).not.toContain("items-start justify-between");
  });

  it("uses an action-oriented setup empty state", () => {
    const html = renderToStaticMarkup(<ProjectLinksEmpty onCreate={() => undefined} />);

    expect(html).toContain("Connect a project");
    expect(html).toContain("Link a local repository and Azure DevOps");
    expect(html).toContain('aria-label="Connect a project"');
    expect(html).toContain('type="button"');
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain(">Connect project</button>");
    expect(html).not.toContain("Setup needs");
    expect(html).not.toContain("lg:justify-between");
    expect(html).not.toContain("sm:grid-cols-3");
    expect(html).not.toContain("Create your first Project Link");
  });

  it("uses a calm loading card instead of a floating page spinner", () => {
    const html = renderToStaticMarkup(<ProjectLinksLoading />);

    expect(html).toContain("Loading Project Links");
    expect(html).toContain("Checking saved repository mappings");
    expect(html).toContain("Loading Project Links");
    expect(html).not.toContain("animate-spin");
  });

  it("keeps Project Link card actions responsive and inside the card", () => {
    const repoPath = "C:\\Users\\15492\\Develop\\ClaimBot_API";
    const html = renderToStaticMarkup(
      <ProjectLinkCard
        projectLink={{
          id: "project-link-1",
          name: "A very long Project Link name that should not push actions outside",
          repoPath,
          defaultBranch: "feature/cicd-agent-20260719-responsive",
          targetBranch: "main",
          adoOrgUrl: "https://tebssg.visualstudio.com/",
          adoProject: "TeBS-ClaimBot",
          adoRepoName: "ClaimBot_API",
          adoPat: "",
          adoPipelineId: "117",
          adoPipelineName: "ClaimBot_API",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "",
          projectTemplate: "",
          buildCommand: "",
          testCommand: "",
          createdAt: 0,
          updatedAt: 0,
        }}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(html).toContain("flex-col");
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("flex-1");
    expect(html).toContain("flex min-w-0 max-w-full flex-wrap");
    expect(html).toContain(">ClaimBot_API<");
    expect(html).toContain("TeBS-ClaimBot / ClaimBot_API");
    expect(html).toContain("Connected");
    expect(html).toContain("feature/cicd-agent-20260719-responsive -&gt; main");
    expect(html).toContain("A very long Project Link name that shou...");
    expect(html).toContain("title=\"A very long Project Link name that should not push actions outside\"");
    expect(html).toContain(`title="${repoPath}"`);
    expect(html).toContain("truncate font-mono text-xs");
    expect(html).toContain("min-w-0 max-w-full truncate text-xs");
    expect(html).toContain("aria-label=\"Edit A very long Project Link name");
    expect(html).toContain("aria-label=\"Delete A very long Project Link name");
    expect(html).toContain("h-10 w-10");
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).not.toContain(">https://tebssg.visualstudio.com/<");
    expect(html).not.toContain(">C:\\Users\\15492\\Develop\\ClaimBot_API<");
    expect(html).not.toContain("justify-between rounded-xl");
    expect(html).toContain("border border-transparent");
    expect(html).not.toContain("bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-xs");
    expect(html).not.toContain(">Edit</button>");
    expect(html).not.toContain(">Delete</button>");
  });

  it("summarizes Project Link card details while preserving full values in titles", () => {
    expect(compactProjectLinkName("mp-live-claimbot-pipeline-20260716181319")).toBe(
      "mp live claimbot pipeline · 1319",
    );
    expect(compactProjectLinkName("ClaimBot_API link")).toBe("ClaimBot_API link");
    expect(compactProjectLinkName("")).toBe("Untitled Project Link");
    expect(compactProjectLinkRepoLabel("C:\\Users\\15492\\Develop\\ClaimBot_API")).toBe("ClaimBot_API");
    expect(compactProjectLinkRepoLabel("/Users/me/work/MergePilot")).toBe("MergePilot");
    expect(compactProjectLinkAdoScope({
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
    })).toBe("TeBS-ClaimBot / ClaimBot_API");
    expect(compactProjectLinkBranchScope({
      defaultBranch: "feature/work",
      targetBranch: "main",
    })).toBe("feature/work -> main");
    expect(projectLinkConnectionState({
      repoPath: "C:\\repo",
      adoOrgUrl: "https://dev.azure.com/demo",
      adoProject: "Demo",
      adoRepoName: "repo",
    }).label).toBe("Connected");
    expect(projectLinkConnectionState({
      repoPath: "C:\\repo",
      adoOrgUrl: "",
      adoProject: "",
      adoRepoName: "",
    }).label).toBe("Local only");
    expect(projectLinkConnectionState({
      repoPath: "",
      adoOrgUrl: "",
      adoProject: "",
      adoRepoName: "",
    }).label).toBe("Setup needed");
  });

  it("keeps generated live links out of the primary connection list", () => {
    const links = [
      {
        id: "saved-link",
        name: "ClaimBot_API link",
        repoPath: "C:\\work\\ClaimBot_API",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
      },
      {
        id: "temporary-link",
        name: "mp-live-claimbot-pipeline-20260716181319",
        repoPath: "C:\\Users\\me\\AppData\\Local\\Temp\\mergepilot-live\\ClaimBot_API",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
      },
    ] as ProjectLink[];
    const groups = partitionProjectLinks(links);
    const html = renderToStaticMarkup(
      <ProjectLinksList projectLinks={links} onEdit={() => undefined} onDelete={() => undefined} />,
    );

    expect(groups.saved.map((link) => link.id)).toEqual(["saved-link"]);
    expect(groups.temporary.map((link) => link.id)).toEqual(["temporary-link"]);
    expect(html).toContain("ClaimBot_API link");
    expect(html).toContain("Temporary links");
    expect(html).toContain(">1<");
    expect(projectLinksTemporarySectionClass()).toContain("border-t");
  });

  it("preserves the managed MCP selection but clears legacy executable and credential fields", () => {
    const safe = withoutProjectLinkFallbacks({
      name: "ADO",
      repoPath: "C:\\repo",
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo",
      adoProject: "Demo",
      adoRepoName: "repo",
      adoPat: "secret",
      adoPipelineId: "1",
      adoPipelineName: "CI",
      adoMcpEnabled: true,
      adoMcpCommand: "untrusted-command",
      adoMcpAuthentication: "pat",
      adoMcpDomains: "repositories,pull-requests",
      projectTemplate: "",
      buildCommand: "",
      testCommand: "",
    });

    expect(safe).toMatchObject({
      adoPat: "",
      adoMcpEnabled: true,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "repositories,pull-requests",
    });
  });
});
