import { describe, expect, it } from "vitest";
import type { SuggestionReply } from "../../components/conversation/SuggestionReplyBar.js";
import { suggestionReplyExecutionMode } from "./useChatSuggestionRuntime.js";

describe("suggestionReplyExecutionMode", () => {
  it("routes workspace suggestions through the formal prompt path", () => {
    const suggestion: SuggestionReply = {
      id: "review",
      label: "Review my changes",
      message: "Review my changes",
      action: { kind: "workspace_action", action: "inspect_changes" },
    };

    expect(suggestionReplyExecutionMode(suggestion)).toBe("prompt");
  });

  it("keeps explicit Project Link configuration edits on their dedicated path", () => {
    const suggestion: SuggestionReply = {
      id: "pipeline-link",
      label: "Save pipeline",
      message: "Save pipeline",
      action: { kind: "project_link_update", update: { adoPipelineId: "42" } },
    };

    expect(suggestionReplyExecutionMode(suggestion)).toBe("project_link_update");
  });
});
