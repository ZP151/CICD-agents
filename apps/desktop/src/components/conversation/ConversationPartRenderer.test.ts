import { describe, expect, it } from "vitest";
import { cleanAssistantTranscriptMarkdown } from "./ConversationPartRenderer.js";

describe("cleanAssistantTranscriptMarkdown", () => {
  it("removes empty final sections from persisted assistant messages", () => {
    const result = cleanAssistantTranscriptMarkdown([
      "The working tree has two modified files.",
      "",
      "Findings:",
      "",
      "Risks and quick checks:",
      "",
      "Recommended next steps (you can tell me which to run):",
      "",
      "If you want a deeper review, I can display the diffs.",
      "",
      "Verified facts:",
      "- Active branch: `main`.",
    ].join("\n"));

    expect(result).toBe([
      "The working tree has two modified files.",
      "",
      "Verified facts:",
      "- Active branch: `main`.",
    ].join("\n"));
  });
});
