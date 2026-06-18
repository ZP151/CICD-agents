import { describe, expect, it } from "vitest";
import { buildSubmitPipelinePayload } from "../src/submitPipelinePayload.js";

describe("submit pipeline payload", () => {
  it("omits blank project template values so repo-local Project Link config can apply", () => {
    expect(buildSubmitPipelinePayload({
      repoPath: "C:/repo",
      projectTemplate: " ",
    })).not.toHaveProperty("projectTemplate");
  });

  it("uses the explicit project template when present", () => {
    expect(buildSubmitPipelinePayload({
      repoPath: "C:/repo",
      projectTemplate: " node-web ",
    }).projectTemplate).toBe("node-web");
  });

  it("normalizes optional text fields to null when blank", () => {
    const payload = buildSubmitPipelinePayload({
      repoPath: "C:/repo",
      targetBranch: " ",
      workItem: "",
      title: "\t",
    });
    expect(payload.targetBranch).toBeNull();
    expect(payload.workItem).toBeNull();
    expect(payload.title).toBeNull();
  });

  it("preserves explicit no-pr intent", () => {
    expect(buildSubmitPipelinePayload({
      repoPath: "C:/repo",
      autoCreatePr: false,
    }).autoCreatePr).toBe(false);
  });
});
