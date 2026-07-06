import { describe, expect, it } from "vitest";
import { CHAT_FINAL_TOOL_NAME, ChatPlanner } from "../src/chatPlanner.js";
import { evaluateAiInsightAnswer } from "../src/aiInsightQuality.js";
import {
  createToolExecutor,
  fakeToolCallLlm,
} from "./chatPlannerTestDoubles.js";

const expectation = {
  requiredFiles: [
    "BotToSharePoint/Controllers/ClaimController.cs",
    "BotToSharePoint/Web.config",
  ],
  requiredCategories: ["correctness", "security", "config", "tests", "deployment"] as const,
  reviewOnly: true,
};

describe("ChatPlanner AI insight answer quality gate", () => {
  it("scores the final Chat answer emitted by planner finalization", async () => {
    const result = await runFinalizedPlanner([
      "Correctness risk in BotToSharePoint/Controllers/ClaimController.cs:",
      "removing ModelState validation and changing exception handling to `throw ex` can alter",
      "invalid-claim behavior and damage stack traces.",
      "",
      "Security/config risk in BotToSharePoint/Web.config: AzureOpenAIApiKey belongs in Key Vault",
      "or local secret configuration, not as a committed real value.",
      "",
      "Tests: add invalid-payload and exception-path regression tests.",
      "Deployment: run the ClaimBot_API pipeline/build because Web.config changes affect package output.",
    ].join("\n"));

    const quality = evaluateAiInsightAnswer(result.response, expectation);

    expect(result.approvalProposal).toBeUndefined();
    expect(quality.passed).toBe(true);
    expect(quality.score).toBe(1);
  });

  it("fails the quality gate for guarded but vague review-only final answers", async () => {
    const result = await runFinalizedPlanner(
      "I found changes in ClaimController.cs and Web.config. Would you like me to stage these changes for a commit?",
    );

    const quality = evaluateAiInsightAnswer(result.response, expectation);

    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).not.toContain("Would you like me to stage");
    expect(quality.passed).toBe(false);
    expect(quality.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "category:security", passed: false }),
        expect.objectContaining({ id: "category:tests", passed: false }),
        expect.objectContaining({ id: "category:deployment", passed: false }),
      ]),
    );
  });
});

async function runFinalizedPlanner(response: string) {
  const planner = new ChatPlanner(
    fakeToolCallLlm(CHAT_FINAL_TOOL_NAME, {
      response,
      risk_level: "low",
      actions_taken: ["git_status", "git_diff"],
      suggestions: [],
      approval_proposal: {
        tool: "git_add",
        args: {},
        description: "Stage all changes",
        nextHint: "commit",
      },
    }),
    createToolExecutor(),
    { maxSteps: 1 },
  );
  const events = [];
  for await (const event of planner.run("Review my changes. Do not stage, commit, or push.", [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return done.result;
}
