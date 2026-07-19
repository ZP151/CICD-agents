import { describe, expect, it } from "vitest";
import { workspaceGitRecoveryActionsGridClass } from "./WorkspaceGitRecoveryPanel.js";

describe("WorkspaceGitRecoveryPanel layout", () => {
  it("does not force recovery actions into fixed two or three column grids", () => {
    const className = workspaceGitRecoveryActionsGridClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,5.75rem),1fr)");
    expect(className).not.toContain("grid-cols-2");
    expect(className).not.toContain("grid-cols-3");
  });
});
