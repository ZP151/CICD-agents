import { describe, expect, it } from "vitest";
import { taskViewerProjectLinksCacheKey } from "./taskViewerActivityLoaders.js";

describe("taskViewerActivityLoaders", () => {
  it("keys Activity Project Link data by mapping fields, not only id", () => {
    const base = {
      id: "pl-1",
      name: "ClaimBot_API link",
      repoPath: "C:\\repos\\ClaimBot_API",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      defaultBranch: "feature/a",
      targetBranch: "main",
      updatedAt: 1,
    };

    expect(taskViewerProjectLinksCacheKey([base])).not.toBe(
      taskViewerProjectLinksCacheKey([{ ...base, adoRepoName: "OtherRepo" }]),
    );
    expect(taskViewerProjectLinksCacheKey([base])).not.toBe(
      taskViewerProjectLinksCacheKey([{ ...base, defaultBranch: "feature/b" }]),
    );
    expect(taskViewerProjectLinksCacheKey([base, { ...base, id: "pl-2" }])).toBe(
      taskViewerProjectLinksCacheKey([{ ...base, id: "pl-2" }, base]),
    );
  });
});
