import { describe, expect, it } from "vitest";
import { pickRecommendedPipeline } from "./projectLinks";

describe("pickRecommendedPipeline", () => {
  it("prefers repo-specific CI pipelines over release pipelines", () => {
    const selected = pickRecommendedPipeline([
      {
        id: "1",
        name: "web-app release deploy",
        description: "\\release",
        url: "",
      },
      {
        id: "2",
        name: "web-app CI validation",
        description: "\\.azure-pipelines",
        url: "",
      },
      {
        id: "3",
        name: "shared build",
        description: "\\shared",
        url: "",
      },
    ], {
      repoPath: "C:\\work\\web-app",
      adoRepoName: "web-app",
      adoProject: "Platform",
    });

    expect(selected).toMatchObject({ id: "2", name: "web-app CI validation" });
  });

  it("returns the only pipeline when discovery has one result", () => {
    const selected = pickRecommendedPipeline([
      { id: "42", name: "Only pipeline", description: "", url: "" },
    ], {});

    expect(selected).toMatchObject({ id: "42" });
  });
});
