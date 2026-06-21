import { describe, expect, it } from "vitest";
import type { GitStatusData } from "../toolOutputRenderers.js";
import { gitDivergenceNotice } from "./gitDivergenceNotice.js";

function status(overrides: Partial<GitStatusData>): GitStatusData {
  return {
    branch: "main",
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    deleted: [],
    ...overrides,
  };
}

describe("gitDivergenceNotice", () => {
  it("returns no notice for an up-to-date branch", () => {
    expect(gitDivergenceNotice(status({}))).toBeNull();
  });

  it("summarizes branches that are behind remote", () => {
    expect(gitDivergenceNotice(status({ behind: 2 }))).toEqual({
      tone: "warning",
      label: "Behind remote by 2",
      blocksPush: true,
    });
  });

  it("summarizes branches that are ahead of remote", () => {
    expect(gitDivergenceNotice(status({ ahead: 1 }))).toEqual({
      tone: "info",
      label: "Ahead of remote by 1",
      blocksPush: false,
    });
  });

  it("summarizes diverged branches", () => {
    expect(gitDivergenceNotice(status({ ahead: 3, behind: 4 }))).toEqual({
      tone: "warning",
      label: "Diverged: 3 ahead, 4 behind",
      blocksPush: true,
    });
  });
});
