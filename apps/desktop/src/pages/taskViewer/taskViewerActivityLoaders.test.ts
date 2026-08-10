import { describe, expect, it } from "vitest";
import {
  shouldFetchRemotePrInsightActivity,
  taskViewerProjectLinksCacheKey,
} from "./taskViewerActivityLoaders.js";

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

  it("keeps temporary-link evidence local instead of fanning out remote requests", () => {
    expect(shouldFetchRemotePrInsightActivity({
      name: "mp-live-pr-review-20260810",
      repoPath: "C:\\Users\\me\\AppData\\Local\\Temp\\MergePilot-run",
      adoRepoName: "ClaimBot_API",
    })).toBe(false);
    expect(shouldFetchRemotePrInsightActivity({
      name: "ClaimBot_API link",
      repoPath: "C:\\repos\\ClaimBot_API",
      adoRepoName: "ClaimBot_API",
    })).toBe(true);
    expect(shouldFetchRemotePrInsightActivity({
      name: "Local-only link",
      repoPath: "C:\\repos\\local-only",
      adoRepoName: "",
    })).toBe(false);
  });
});
