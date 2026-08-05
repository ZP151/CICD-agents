import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLinkInput } from "../../api.js";
import { ProjectLinkWorkspaceSection } from "./ProjectLinkWorkspaceSection.js";

const baseForm: ProjectLinkInput = {
  name: "example link",
  repoPath: "C:\\repo\\example",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://example-org.visualstudio.com/",
  adoProject: "example-project",
  adoRepoName: "example-repo",
  adoPipelineId: "",
  adoPipelineName: "",
  adoPat: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

describe("ProjectLinkWorkspaceSection layout", () => {
  it("renders the identity fields without branch selectors (V2: branches are read-only)", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkWorkspaceSection
        form={baseForm}
        set={() => () => undefined}
        branches={["main", "develop"]}
        branchLoading={false}
        branchError={false}
        repoInputClass=""
        onReloadBranches={() => undefined}
      />,
    );

    expect(html).toContain("Project Link name");
    expect(html).toContain("Repo path");
    expect(html).toContain("2 branches");
    expect(html).not.toContain("Default branch");
    expect(html).not.toContain("Target branch (PRs)");
  });
});
