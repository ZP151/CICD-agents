import { describe, expect, it } from "vitest";
import { evaluateAiInsightAnswer } from "../src/aiInsightQuality.js";

const seededExpectation = {
  requiredFiles: [
    "BotToSharePoint/Controllers/ClaimController.cs",
    "BotToSharePoint/Web.config",
  ],
  requiredCategories: ["correctness", "security", "config", "tests", "deployment"] as const,
  reviewOnly: true,
};

describe("AI insight answer quality evaluator", () => {
  it("accepts a grounded local change review with risk categories and no write escalation", () => {
    const result = evaluateAiInsightAnswer(
      [
        "The highest correctness risk is in BotToSharePoint/Controllers/ClaimController.cs:",
        "removing ModelState validation and replacing the exception path with `throw ex` can change",
        "request behavior and erase useful stack trace evidence.",
        "",
        "Security/config risk: BotToSharePoint/Web.config now introduces AzureOpenAIApiKey.",
        "Keep that value in Key Vault or local secret configuration rather than committing a real API key.",
        "",
        "Tests: add regression coverage for invalid claim payloads and exception propagation.",
        "Deployment: run the ClaimBot_API build/pipeline because Web.config changes can affect package output.",
      ].join("\n"),
      seededExpectation,
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("rejects vague summaries that miss categories or ask for a write action", () => {
    const result = evaluateAiInsightAnswer(
      [
        "I found changes in ClaimController.cs and Web.config.",
        "The files look mostly fine.",
        "Would you like me to stage these changes for a commit?",
      ].join("\n"),
      seededExpectation,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(1);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "category:security", passed: false }),
        expect.objectContaining({ id: "category:tests", passed: false }),
        expect.objectContaining({ id: "category:deployment", passed: false }),
        expect.objectContaining({ id: "scope:review-only", passed: false }),
      ]),
    );
  });

  it("checks required business evidence that is not a source file path", () => {
    const result = evaluateAiInsightAnswer(
      [
        "Pipeline #117 recent failed run evidence:",
        "Run #4665 failed in MSBuild while executing Microsoft.Web.Publishing.targets.",
        "This is a CI/deployment blocker, so keep the workflow read-only unless the user asks to rerun it.",
      ].join("\n"),
      {
        requiredFiles: [],
        requiredEvidence: ["Pipeline #117", "#4665", "MSBuild", "Microsoft.Web.Publishing.targets"],
        requiredCategories: ["deployment"],
        reviewOnly: true,
      },
    );

    expect(result.passed).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "evidence:Pipeline #117", passed: true }),
        expect.objectContaining({ id: "evidence:#4665", passed: true }),
        expect.objectContaining({ id: "category:deployment", passed: true }),
        expect.objectContaining({ id: "scope:review-only", passed: true }),
      ]),
    );
  });
});
