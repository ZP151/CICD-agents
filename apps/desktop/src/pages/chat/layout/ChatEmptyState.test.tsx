import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatEmptyState } from "./ChatEmptyState.js";
import type { ProjectLink } from "../../../api.js";

const projectLink: ProjectLink = {
  id: "pl-1",
  name: "ClaimBot_API link",
  createdAt: 1,
  updatedAt: 1,
  repoPath: "C:\\repos\\ClaimBot_API",
  defaultBranch: "main",
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
};

describe("ChatEmptyState", () => {
  it("keeps an active Project Link empty conversation free of welcome templates", () => {
    const html = renderToStaticMarkup(
      <ChatEmptyState
        repoPath={projectLink.repoPath}
        availableProjectLinks={[projectLink]}
        projectLinksLoading={false}
        activeProjectLinkId={projectLink.id}
        createProjectLink={async () => projectLink}
        selectProjectLink={() => undefined}
      />,
    );

    expect(html).toContain("Empty conversation");
    expect(html).not.toContain("Ask MergePilot anything");
    expect(html).not.toContain("Understand this project");
    expect(html).not.toContain("Review my changes");
    expect(html).not.toContain("animate-pulse");
  });
});
