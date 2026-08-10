import { describe, expect, it } from "vitest";
import { translateIntent } from "@mergepilot/core";

describe("AI git intent - canned scenarios", () => {
  it("scenario 1: requires a target branch before proposing a PR for work item 1234", () => {
    const plan = translateIntent("create a branch and PR for work item 1234");
    expect(plan.intent).toBe("create-pr");
    const tools = plan.steps.map((s) => s.tool);
    expect(tools).toEqual(["git_status"]);
    expect(plan.notes).toContain("target branch");
    expect(tools).not.toContain("git_create_branch");
    expect(tools).not.toContain("ado_create_pr");
    expect(tools).not.toContain("ado_link_work_item");
  });

  it("scenario 2: summarize my staged changes", () => {
    const plan = translateIntent("summarize my staged changes");
    expect(plan.intent).toBe("summarize-changes");
    const tools = plan.steps.map((s) => s.tool);
    expect(tools).toContain("git_diff");
    expect(tools).toContain("git_status");
  });

  it("scenario 3: what tests should I run for the files I touched", () => {
    const plan = translateIntent("what tests should I run for the files I touched?");
    expect(plan.intent).toBe("suggest-tests");
    const tools = plan.steps.map((s) => s.tool);
    expect(tools).toContain("git_diff");
  });
});
