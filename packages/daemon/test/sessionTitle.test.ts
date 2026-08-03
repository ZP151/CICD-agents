import { describe, expect, it } from "vitest";
import { shouldAutoTitle, sessionTitleFromFirstGoal } from "../src/sessionTitle.js";
import type { ChatMessage } from "@mergepilot/core";

function user(content: string): ChatMessage {
  return { role: "user", content, timestamp: 1 };
}

describe("sessionTitleFromFirstGoal (MP-005/RA-017)", () => {
  it("uses the first real user message as the title source", () => {
    const messages = [
      { role: "assistant" as const, content: "Welcome", timestamp: 0 },
      user("Review the current branch changes"),
      user("Ignore that, list open PRs instead"),
    ];

    expect(sessionTitleFromFirstGoal(messages)).toBe("Review the current branch changes");
  });

  it("never uses assistant conclusions or workflow-internal text", () => {
    const messages = [
      { role: "assistant" as const, content: "Verified facts: branch is main", timestamp: 0 },
      { role: "user" as const, content: "WORKFLOW STEP COMPLETED: git_status(ok)", timestamp: 1 },
      user("Summarize the pipeline failures"),
    ];

    expect(sessionTitleFromFirstGoal(messages)).toBe("Summarize the pipeline failures");
  });

  it("strips image attachment markers and fenced code from titles", () => {
    const messages = [user("[image: screenshot.png]\nExplain this error:\n```\nError: timeout\n```")];

    expect(sessionTitleFromFirstGoal(messages)).toBe("Explain this error:");
  });

  it("truncates long goals with an ellipsis", () => {
    const messages = [user("Please review all of the changed files in this branch and tell me about the riskiest changes with respect to security, performance and reliability")];

    const title = sessionTitleFromFirstGoal(messages)!;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("redacts secret-like values before persistence (RA-020)", () => {
    const messages = [user("Check the deploy with PAT=abcdef1234567890 and token=xyz7890abc1234")];

    const title = sessionTitleFromFirstGoal(messages)!;
    expect(title).not.toContain("abcdef1234567890");
    expect(title).not.toContain("xyz7890abc1234");
  });

  it("returns undefined for internal-only sessions", () => {
    expect(sessionTitleFromFirstGoal([
      { role: "user" as const, content: "WORKFLOW STEP COMPLETED: git_status(ok)", timestamp: 1 },
    ])).toBeUndefined();
  });
});

describe("shouldAutoTitle (MP-005/RA-019)", () => {
  it("auto-titles untitled and legacy sessions", () => {
    expect(shouldAutoTitle({})).toBe(true);
    expect(shouldAutoTitle({ title: "legacy preview", titleSource: undefined })).toBe(true);
  });

  it("never overwrites a manual rename", () => {
    expect(shouldAutoTitle({ title: "My custom title", titleSource: "user" })).toBe(false);
  });

  it("re-enables auto title after the user clears it", () => {
    expect(shouldAutoTitle({ title: undefined, titleSource: undefined })).toBe(true);
  });
});
