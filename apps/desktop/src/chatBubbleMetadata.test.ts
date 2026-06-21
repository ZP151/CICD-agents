import { describe, expect, it } from "vitest";
import {
  assistantBubbleMetaFromUnknown,
  mergeAssistantBubbleMeta,
  mergeAssistantMetadataIntoLatestBubble,
} from "./chatBubbles.js";

describe("assistant bubble metadata", () => {
  it("normalizes planner metadata chunks into assistant bubble metadata", () => {
    expect(
      assistantBubbleMetaFromUnknown({
        risk_level: "medium",
        finalization_mode: "agent_final",
        actions_taken: ["git_status", ""],
        suggestions: ["Review diff"],
        sources: [
          {
            type: "source_document",
            source_id: "doc-1",
            title: "Git tools",
            file: "packages/core/src/tools/git.ts",
            line: 42,
            snippet: "git_diff",
          },
          {
            type: "source_url",
            title: "AI SDK",
            url: "https://ai-sdk.dev",
            domain: "ai-sdk.dev",
          },
          {
            type: "source_url",
            title: "",
            url: "https://ignored.invalid",
          },
        ],
        artifacts: [
          {
            type: "artifact",
            artifact_id: "validation-build-failed-abc",
            title: "Build failure report",
            artifact_type: "markdown",
            status: "error",
            content: "# Build Failure Report",
          },
        ],
      }),
    ).toEqual({
      riskLevel: "medium",
      finalizationMode: "agent_final",
      actionsTaken: ["git_status"],
      suggestions: ["Review diff"],
      sources: [
        {
          type: "source_document",
          sourceId: "doc-1",
          title: "Git tools",
          file: "packages/core/src/tools/git.ts",
          line: undefined,
          snippet: "git_diff",
        },
        {
          type: "source_url",
          sourceId: undefined,
          title: "AI SDK",
          url: "https://ai-sdk.dev",
          domain: "ai-sdk.dev",
          snippet: undefined,
        },
      ],
      artifacts: [
        {
          type: "artifact",
          artifactId: "validation-build-failed-abc",
          title: "Build failure report",
          artifactType: "markdown",
          status: "error",
          content: "# Build Failure Report",
        },
      ],
      timestamp: undefined,
    });
  });

  it("merges metadata chunks into the latest assistant bubble without duplicating sources", () => {
    const result = mergeAssistantMetadataIntoLatestBubble(
      [
        {
          id: "a1",
          kind: "assistant",
          text: "Reviewed changes.",
          parts: [
            { type: "markdown", markdown: "Reviewed changes." },
            {
              type: "source_document",
              sourceId: "doc-1",
              title: "Existing source",
              file: "src/existing.ts",
            },
          ],
          streaming: false,
          meta: {
            riskLevel: "low",
            actionsTaken: ["git_status"],
            sources: [
              {
                type: "source_document",
                sourceId: "doc-1",
                title: "Existing source",
                file: "src/existing.ts",
              },
            ],
          },
        },
        { id: "tool", kind: "tool" },
      ],
      {
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
        sources: [
          {
            type: "source_document",
            sourceId: "doc-1",
            title: "Existing source",
            file: "src/existing.ts",
          },
          {
            type: "source_url",
            sourceId: "url-1",
            title: "External reference",
            url: "https://example.com/reference",
          },
        ],
        artifacts: [
          {
            type: "artifact",
            artifactId: "validation-test-failed-123",
            title: "Test failure report",
            artifactType: "markdown",
            status: "error",
          },
        ],
      },
    );

    expect(result[0]).toMatchObject({
      id: "a1",
      kind: "assistant",
      meta: {
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
      },
    });
    expect(result[0]?.parts).toEqual([
      { type: "markdown", markdown: "Reviewed changes." },
      {
        type: "source_document",
        sourceId: "doc-1",
        title: "Existing source",
        file: "src/existing.ts",
      },
      {
        type: "source_url",
        sourceId: "url-1",
        title: "External reference",
        url: "https://example.com/reference",
        domain: undefined,
        snippet: undefined,
      },
      {
        type: "artifact",
        artifactId: "validation-test-failed-123",
        title: "Test failure report",
        artifactType: "markdown",
        status: "error",
      },
      {
        type: "metadata",
        riskLevel: "medium",
        actionsTaken: ["git_status", "git_diff"],
        suggestions: ["Stage selected files"],
      },
    ]);
    expect(result[1]).toEqual({ id: "tool", kind: "tool" });
  });

  it("merges assistant metadata lists and source identities", () => {
    expect(
      mergeAssistantBubbleMeta(
        {
          actionsTaken: ["git_status"],
          suggestions: ["Review"],
          sources: [{ type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts" }],
        },
        {
          actionsTaken: ["git_status", "git_diff"],
          suggestions: ["Review", "Stage"],
          sources: [
            { type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts" },
            { type: "source_document", title: "B", file: "b.ts", line: 12 },
          ],
        },
      ),
    ).toEqual({
      actionsTaken: ["git_status", "git_diff"],
      suggestions: ["Review", "Stage"],
      sources: [
        { type: "source_document", sourceId: "doc-1", title: "A", file: "a.ts", line: undefined },
        { type: "source_document", title: "B", file: "b.ts", line: 12 },
      ],
    });
  });

  it("deduplicates document sources with single-line and ranged title suffixes", () => {
    expect(
      mergeAssistantBubbleMeta(
        {
          sources: [{
            type: "source_document",
            title: "ClaimController.cs:42",
            snippet: "first",
          }],
        },
        {
          sources: [{
            type: "source_document",
            title: "ClaimController.cs:42-58",
            snippet: "second",
          }],
        },
      )?.sources,
    ).toEqual([{
      type: "source_document",
      title: "ClaimController.cs",
      line: 42,
      snippet: "first\n\nsecond",
    }]);
  });
});
