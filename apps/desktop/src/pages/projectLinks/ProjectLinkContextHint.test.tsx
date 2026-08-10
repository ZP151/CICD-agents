import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLink } from "../../api.js";
import {
  ProjectLinkContextHint,
  projectLinkContextText,
  projectLinkContextTitle,
} from "./ProjectLinkContextHint.js";

const projectLink: ProjectLink = {
  id: "claimbot-link",
  name: "ClaimBot API",
  repoPath: "C:\\repos\\ClaimBot_API",
  defaultBranch: "feature/review-flow",
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

describe("ProjectLinkContextHint", () => {
  it("condenses connection and branch scope into one low-chrome context line", () => {
    expect(projectLinkContextText(projectLink)).toBe(
      "TeBS-ClaimBot / ClaimBot_API · feature/review-flow -> main",
    );
    expect(projectLinkContextTitle(projectLink)).toContain("Default branch: feature/review-flow");

    const html = renderToStaticMarkup(<ProjectLinkContextHint projectLink={projectLink} />);
    expect(html).toContain("TeBS-ClaimBot / ClaimBot_API · feature/review-flow -&gt; main");
    expect(html).toContain("truncate text-xs");
    expect(html).not.toContain("rounded-full");
  });

  it("keeps an incomplete connection actionable without exposing a raw mapping code", () => {
    expect(projectLinkContextText({ ...projectLink, adoProject: "", adoRepoName: "" })).toBe(
      "Connection needs setup · feature/review-flow -> main",
    );
  });

  it("labels an unconfigured PR target instead of implying main", () => {
    const unconfigured = { ...projectLink, defaultBranch: "", targetBranch: "" };

    expect(projectLinkContextText(unconfigured)).toBe(
      "TeBS-ClaimBot / ClaimBot_API · target: not set",
    );
    expect(projectLinkContextTitle(unconfigured)).toContain("PR target: not set");
  });
});
