import { describe, expect, it, vi } from "vitest";
import type { ProjectLink } from "../../api.js";
import {
  readInitialActiveProjectLinkId,
  repoPathForProjectLink,
} from "./useActiveProjectLinkRuntime.js";

vi.mock("../../projectLinks.js", () => ({
  loadStoredActiveProjectLinkId: vi.fn(() => "stored-project-link"),
  resolveActiveProjectLinkId: vi.fn(),
  saveStoredActiveProjectLinkId: vi.fn(),
}));

function projectLink(id: string, repoPath = ""): ProjectLink {
  return {
    id,
    name: id,
    repoPath,
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: "",
    adoProject: "",
    adoRepoName: "",
    adoPipelineId: "",
    adoPipelineName: "",
    adoPat: "",
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
}

describe("active project link runtime helpers", () => {
  it("prefers draft active Project Link id before stored Project Link id", () => {
    expect(readInitialActiveProjectLinkId("draft-project-link")).toBe("draft-project-link");
    expect(readInitialActiveProjectLinkId(null)).toBe("stored-project-link");
  });

  it("finds a selected project link repo path", () => {
    const projectLinks = [
      projectLink("a", "C:\\a"),
      projectLink("b", "  C:\\b  "),
      projectLink("empty"),
    ];

    expect(repoPathForProjectLink(projectLinks, "b")).toBe("C:\\b");
    expect(repoPathForProjectLink(projectLinks, "empty")).toBeNull();
    expect(repoPathForProjectLink(projectLinks, "missing")).toBeNull();
    expect(repoPathForProjectLink(projectLinks, null)).toBeNull();
  });
});
