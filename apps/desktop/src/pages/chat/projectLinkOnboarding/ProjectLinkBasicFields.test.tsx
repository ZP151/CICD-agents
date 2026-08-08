import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLinkInput } from "../../../api.js";
import { ProjectLinkBasicFields } from "./ProjectLinkBasicFields.js";

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

describe("ProjectLinkBasicFields layout", () => {
  it("renders identity fields without branch selectors (V2: branches are read-only)", () => {
    const html = renderToStaticMarkup(
      <ProjectLinkBasicFields
        branches={["main", "develop"]}
        branchError={false}
        branchLoading={false}
        form={baseForm}
        loadBranches={() => Promise.resolve()}
        setField={() => () => undefined}
      />,
    );

    expect(html).toContain("Link name");
    expect(html).toContain("Local repository path");
    expect(html).toContain("2 branches found");
    expect(html).not.toContain("Default branch");
    expect(html).not.toContain("PR target branch");
  });
});
