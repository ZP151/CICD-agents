import { describe, expect, it } from "vitest";
import type { ConversationSourcePart } from "../../../chatBubbles.js";
import {
  collectConversationSources,
} from "./conversationArtifacts.js";
import {
  pruneOpenSourcesForConversation,
  refreshOpenSourcesFromConversation,
} from "./useArtifactWorkspace.js";

function source(file: string, snippet?: string): ConversationSourcePart {
  return {
    type: "source_document",
    sourceId: file,
    title: file,
    file,
    snippet,
  };
}

describe("useArtifactWorkspace source tab helpers", () => {
  it("collects ranged source titles as the same file tab", () => {
    const sources = collectConversationSources([{
      id: "assistant-1",
      kind: "assistant",
      text: "Reviewed ClaimController.",
      meta: {
        sources: [
          {
            type: "source_document",
            title: "ClaimController.cs:42",
            snippet: "first",
          },
          {
            type: "source_document",
            title: "ClaimController.cs:42-58",
            snippet: "second",
          },
        ],
      },
    }]);

    expect(sources).toEqual([{
      type: "source_document",
      sourceId: "document-claimcontroller.cs",
      title: "ClaimController.cs",
      file: undefined,
      line: 42,
      snippet: "first\n\nsecond",
    }]);
  });

  it("removes open tabs that no longer exist in the active conversation", () => {
    const current = [
      source("src/old.ts"),
      source("src/current.ts"),
    ];

    expect(pruneOpenSourcesForConversation(current, [source("src/current.ts")])).toEqual([
      source("src/current.ts"),
    ]);
  });

  it("clears all open tabs when the active conversation has no sources", () => {
    expect(pruneOpenSourcesForConversation([source("src/old.ts")], [])).toEqual([]);
  });

  it("refreshes open tabs from the latest conversation source metadata", () => {
    const current = [source("src/current.ts", "old snippet")];
    const refreshed = refreshOpenSourcesFromConversation(current, [
      source("src/current.ts", "new snippet"),
    ]);

    expect(refreshed).toEqual([source("src/current.ts", "new snippet")]);
  });
});
