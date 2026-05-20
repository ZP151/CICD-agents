import { describe, expect, it } from "vitest";
import { translateIntent } from "@cicd-agent/core";

describe("AI git intent - canned scenarios", () => {
  it("scenario 1: create a branch and PR for work item 1234", () => {
    const plan = translateIntent("create a branch and PR for work item 1234");
    expect(plan.intent).toBe("create-pr");
    const tools = plan.steps.map((s) => s.tool);
    expect(tools).toContain("git_create_branch");
    expect(tools).toContain("ado_create_pr");
    expect(tools).toContain("ado_link_work_item");
    const branchStep = plan.steps.find((s) => s.tool === "git_create_branch");
    expect(String(branchStep?.args["name"])).toContain("1234");
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
