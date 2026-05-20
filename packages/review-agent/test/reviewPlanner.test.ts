import { describe, expect, it } from "vitest";
import { bundleToReviewPrompt, REVIEW_SYSTEM_PROMPT } from "../src/reviewPlanner.js";
import type { CloudContextBundle } from "../src/cloudContext.js";

const BUNDLE: CloudContextBundle = {
  prId: 7,
  iterationId: 1,
  files: [
    {
      path: "src/app.ts",
      changeType: "edit",
      content: "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    },
  ],
  relatedSnippets: [],
};

describe("review prompt", () => {
  it("includes file headers and numbered lines", () => {
    const prompt = bundleToReviewPrompt(BUNDLE, ["camelCase only"]);
    expect(prompt).toContain("PR 7");
    expect(prompt).toContain("src/app.ts (edit)");
    expect(prompt).toContain("1: export function add");
    expect(prompt).toContain("camelCase only");
  });

  it("includes the strict JSON schema instruction", () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"findings\"");
    expect(REVIEW_SYSTEM_PROMPT).toContain("\"severity\"");
  });
});
