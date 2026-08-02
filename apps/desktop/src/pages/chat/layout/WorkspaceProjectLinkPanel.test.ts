import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectLink } from "../../../api.js";
import {
  WorkspaceProjectLinkPanel,
  workspaceProjectLinkActionsGridClass,
} from "./WorkspaceProjectLinkPanel.js";

const projectLink: ProjectLink = {
  id: "claimbot",
  name: "ClaimBot API",
  createdAt: 0,
  updatedAt: 0,
  repoPath: "C:\\repo\\claimbot",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://dev.azure.com/example",
  adoProject: "ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "",
  adoPipelineId: "12",
  adoPipelineName: "Build",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

describe("WorkspaceProjectLinkPanel layout", () => {
  it("uses an auto-fit action grid for compact environment panels", () => {
    const className = workspaceProjectLinkActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
  });

  it("uses the shared control language without verbose mouse-only descriptions", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProjectLinkPanel, {
        repoName: "claimbot",
        repoPath: projectLink.repoPath,
        projectLinks: [projectLink],
        activeProjectLink: projectLink,
        activeProjectLinkId: projectLink.id,
        adoReady: true,
        branchName: "main",
        busy: false,
        onProjectLinkSelect: () => undefined,
        runAction: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Workspace Project Link"');
    expect(html).toContain('aria-label="Check pull request policy evaluations"');
    expect(html).toContain('aria-label="Prepare approval before triggering the configured Azure DevOps pipeline"');
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain("Inspect the latest active pull request insight");
    expect(html).not.toContain("Inspect Azure DevOps pipeline readiness for this project link");
  });
});
