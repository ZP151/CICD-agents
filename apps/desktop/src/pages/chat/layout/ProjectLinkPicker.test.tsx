import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLink } from "../../../api.js";
import { filterProjectLinks, ProjectLinkPicker, selectableProjectLinks } from "./ProjectLinkPicker.js";

const links: ProjectLink[] = [
  {
    id: "claimbot-api",
    name: "ClaimBot API",
    createdAt: 0,
    updatedAt: 0,
    repoPath: "C:\\repo\\claimbot",
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: "",
    adoProject: "",
    adoRepoName: "",
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
  },
  {
    id: "live-merge",
    name: "mp-live-merge-conflict-20260806195650",
    createdAt: 0,
    updatedAt: 0,
    repoPath: "C:\\repo\\merge",
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: "",
    adoProject: "",
    adoRepoName: "",
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
  },
];

describe("ProjectLinkPicker", () => {
  it("filters case-insensitively without forcing long names to wrap", () => {
    expect(filterProjectLinks(links, "CLAIM")).toEqual([links[0]]);
    expect(filterProjectLinks(links, "")).toEqual(links);
  });

  it("keeps generated live links out of Context when saved configuration exists", () => {
    expect(selectableProjectLinks(links)).toEqual([links[0]]);
  });

  it("keeps temporary links selectable only when they are the sole available context", () => {
    expect(selectableProjectLinks([links[1]!])).toEqual([links[1]]);
  });

  it("keeps the selected name bounded and exposes an accessible picker trigger", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkPicker projectLinks={links} value="live-merge" onChange={() => undefined} />,
    );

    expect(html).toContain('aria-label="Workspace Project Link"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("truncate");
    expect(html).toContain("max-[900px]:min-h-9");
  });

  it("can require a concrete Project Link for scoped workspaces", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkPicker projectLinks={links} value="live-merge" onChange={() => undefined} allowEmpty={false} />,
    );

    expect(html).not.toContain("No Project Link</span>");
  });
});
