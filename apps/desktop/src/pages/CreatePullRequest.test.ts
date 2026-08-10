import { describe, expect, it } from "vitest";
import {
  DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES,
  buildPullRequestPlanningHandoff,
} from "./CreatePullRequest.js";

describe("buildPullRequestPlanningHandoff", () => {
  it("does not hard-code main before inspecting the configured target branch", () => {
    expect(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES).toMatchObject({
      sourceBranch: "",
      targetBranch: "",
      title: "",
    });
  });

  it("starts a read-only readiness review without requiring branch or title preferences", () => {
    const handoff = buildPullRequestPlanningHandoff({
      projectLinkId: "project-link-1",
      repoPath: "C:/repo",
      sourceBranch: "",
      targetBranch: "",
      title: "",
      description: "",
      workItemId: "",
    });

    expect(handoff).toMatchObject({
      projectLinkId: "project-link-1",
      repoPath: "C:/repo",
      source: "pull-request-planning",
      statusText: "Starting pull request readiness review",
      autoSubmit: true,
    });
    expect(handoff.message).toContain("the current branch");
    expect(handoff.message).toContain("the configured target branch");
    expect(handoff.message).toContain("local working tree, branch tracking, remote target");
    expect(handoff.message).toContain("wait for my confirmation before creating anything");
  });

  it("keeps optional PR preferences as planning hints", () => {
    const handoff = buildPullRequestPlanningHandoff({
      projectLinkId: "project-link-1",
      repoPath: "C:/repo",
      sourceBranch: "feature/refactor",
      targetBranch: "main",
      title: "Refactor workspace actions",
      description: "Keep approvals explicit.",
      workItemId: "7913",
    });

    expect(handoff.message).toContain("feature/refactor");
    expect(handoff.message).toContain("main");
    expect(handoff.message).toContain("Refactor workspace actions");
    expect(handoff.message).toContain("Link work item #7913 if it is valid.");
  });
});
