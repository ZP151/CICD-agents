import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationPartRenderer } from "./ConversationPartRenderer.js";
import type { ConversationPart } from "../../chatBubbles.js";

describe("ConversationPartRenderer", () => {
  it("renders markdown, tool call, and approval parts", () => {
    const parts: ConversationPart[] = [
      { type: "markdown", markdown: "Review complete." },
      {
        type: "tool_call",
        toolCallId: "tool-1",
        toolName: "git_diff",
        state: "result",
        summary: "2 files changed",
      },
      {
        type: "tool_approval",
        approvalId: "approval-1",
        toolName: "git_add",
        description: "Stage selected files",
        args: { paths: ["src/app.ts"] },
        riskLevel: "medium",
      },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain("Review complete.");
    expect(html).toContain("git_diff");
    expect(html).toContain("2 files changed");
    expect(html).toContain("Approval required");
    expect(html).toContain("Stage selected files");
  });

  it("renders source and artifact parts without exposing metadata parts", () => {
    const parts: ConversationPart[] = [
      {
        type: "source_document",
        sourceId: "source-1",
        title: "Chat.tsx",
        file: "apps/desktop/src/pages/Chat.tsx",
        line: 451,
        snippet: "function ExecutionLog",
      },
      {
        type: "source_url",
        sourceId: "source-2",
        title: "assistant-ui ToolGroup",
        url: "https://www.assistant-ui.com/docs/ui/tool-group",
        domain: "assistant-ui.com",
      },
      {
        type: "artifact",
        artifactId: "artifact-1",
        title: "Architecture diagram",
        artifactType: "mermaid",
        status: "ready",
      },
      { type: "metadata", riskLevel: "low", suggestions: ["hidden metadata"] },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain("Chat.tsx");
    expect(html).toContain("Sources");
    expect(html).toContain("1 file");
    expect(html).toContain("assistant-ui ToolGroup");
    expect(html).toContain("<button");
    expect(html).toContain("Architecture diagram");
    expect(html).toContain("Result artifact");
    expect(html).toContain("Diagram");
    expect(html).toContain("Ready");
    expect(html).not.toContain("hidden metadata");
  });

  it("renders a ready Mermaid artifact as a compact diagram result card", () => {
    const parts: ConversationPart[] = [
      {
        type: "artifact",
        artifactId: "artifact-diagram",
        title: "Project architecture",
        artifactType: "mermaid",
        status: "ready",
      },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain('data-artifact-id="artifact-diagram"');
    expect(html).toContain("Result artifact");
    expect(html).toContain("Project architecture");
    expect(html).toContain("Diagram");
    expect(html).toContain("Ready");
    expect(html).toContain("A diagram result is available in the Result workspace.");
  });

  it("renders a streaming markdown artifact without pretending the workspace is open", () => {
    const parts: ConversationPart[] = [
      {
        type: "artifact",
        artifactId: "artifact-report",
        title: "PR insight report",
        artifactType: "markdown",
        status: "streaming",
      },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain("PR insight report");
    expect(html).toContain("Report");
    expect(html).toContain("Streaming");
    expect(html).toContain("The agent is still building this result.");
    expect(html).toContain("Available as a Result workspace artifact when this conversation is interactive.");
    expect(html).not.toContain("<button");
  });

  it("renders an error text artifact with recovery context", () => {
    const parts: ConversationPart[] = [
      {
        type: "artifact",
        artifactId: "artifact-error",
        title: "Review summary",
        artifactType: "text",
        status: "error",
      },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain("Review summary");
    expect(html).toContain("Text");
    expect(html).toContain("Error");
    expect(html).toContain("The result failed to finish.");
  });

  it("renders artifact cards as selectable when a selection handler is provided", () => {
    const parts: ConversationPart[] = [
      {
        type: "artifact",
        artifactId: "artifact-selected",
        title: "Architecture workspace",
        artifactType: "mermaid",
        status: "ready",
      },
    ];

    const html = renderToStaticMarkup(
      <ConversationPartRenderer
        parts={parts}
        selectedArtifactId="artifact-selected"
        onArtifactSelect={() => undefined}
      />,
    );

    expect(html).toContain("<button");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Open artifact workspace for Architecture workspace");
    expect(html).toContain('data-artifact-id="artifact-selected"');
  });

  it("renders source mentions as inline clickable references", () => {
    const parts: ConversationPart[] = [
      { type: "markdown", markdown: "- **ClaimController:** handles claims.\n- CommonFunctions supports helpers.\n- AI SDK sources document streaming." },
      {
        type: "source_document",
        sourceId: "source-1",
        title: "ClaimController.cs:42",
        file: "BotToSharePoint/Controllers/ClaimController.cs",
        line: 42,
        snippet: "@@ -40,5 +42,8 @@",
      },
      {
        type: "source_document",
        sourceId: "source-2",
        title: "CommonFunctions.cs:12",
        file: "BotToSharePoint/Common/CommonFunctions.cs",
        line: 12,
      },
      {
        type: "source_url",
        sourceId: "source-3",
        title: "AI SDK sources",
        url: "https://ai-sdk.dev/docs/ai-sdk-ui/chatbot",
        domain: "ai-sdk.dev",
      },
    ];

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={parts} />);

    expect(html).toContain('data-source-reference-id="source-1"');
    expect(html).toContain('data-source-reference-id="source-2"');
    expect(html).toContain('data-source-reference-id="source-3"');
    expect(html).toContain("ClaimController");
    expect(html).toContain("CommonFunctions");
    expect(html).toContain("AI SDK sources");
    expect(html).not.toContain("Refs");
    expect(html).not.toContain("2 files");
    expect(html).not.toContain("1 link");
    expect(html).not.toContain("@@ -40,5 +42,8 @@");
  });

  it("renders GFM markdown with headings, lists, tables, links, inline code, and code fences", () => {
    const markdown = [
      "## Review",
      "",
      "- Check `git status`",
      "- Inspect [changes](https://example.com/diff)",
      "",
      "| File | Risk |",
      "| --- | --- |",
      "| Chat.tsx | medium |",
      "",
      "```ts",
      "const ok = true;",
      "```",
    ].join("\n");

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={[{ type: "markdown", markdown }]} />);

    expect(html).toContain("<h2");
    expect(html).toContain("Review");
    expect(html).toContain("<ul");
    expect(html).toContain("git status");
    expect(html).toContain('href="https://example.com/diff"');
    expect(html).toContain("<table");
    expect(html).toContain("Chat.tsx");
    expect(html).toContain("const ok = true;");
    expect(html).toContain("Copy");
  });

  it("renders streaming assistant text as markdown before text-end", () => {
    const markdown = [
      "## Architecture",
      "",
      "1. API layer uses `Controllers`.",
      "2. Service layer handles SharePoint integration.",
      "",
      "```ts",
      "const streaming = true;",
    ].join("\n");

    const html = renderToStaticMarkup(
      <ConversationPartRenderer parts={[{ type: "markdown", markdown }]} streaming />,
    );

    expect(html).toContain('data-streaming="true"');
    expect(html).toContain("<h2");
    expect(html).toContain("Architecture");
    expect(html).toContain("<ol");
    expect(html).toContain("Controllers");
    expect(html).toContain("const streaming = true;");
    expect(html).toContain("Copy");
    expect(html).not.toContain("conversation-streaming-text");
  });

  it("sanitizes unsafe markdown html", () => {
    const markdown = "before<script>alert('x')</script><img src=x onerror=alert(1)>after";

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={[{ type: "markdown", markdown }]} />);

    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });

  it("renders long code blocks with collapsed controls", () => {
    const code = Array.from({ length: 35 }, (_, index) => `const line${index + 1} = ${index + 1};`).join("\n");

    const html = renderToStaticMarkup(
      <ConversationPartRenderer parts={[{ type: "code", code, language: "ts", title: "long.ts" }]} />,
    );

    expect(html).toContain("long.ts");
    expect(html).toContain("TS");
    expect(html).toContain("Expand");
    expect(html).toContain("Showing first 28 lines");
    expect(html).toContain("const line28 = 28;");
    expect(html).not.toContain("const line35 = 35;");
  });

  it("renders short code blocks without collapsed controls", () => {
    const html = renderToStaticMarkup(
      <ConversationPartRenderer parts={[{ type: "code", code: "Write-Host 'ok'", language: "ps1" }]} />,
    );

    expect(html).toContain("PS1");
    expect(html).toContain("Write-Host");
    expect(html).toContain("Copy");
    expect(html).not.toContain("Expand");
  });

  it("renders an unterminated streaming code fence as a code block", () => {
    const markdown = ["Here is the current implementation:", "", "```ts", "const streaming = true;"].join("\n");

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={[{ type: "markdown", markdown }]} />);

    expect(html).toContain("Here is the current implementation");
    expect(html).toContain("TS");
    expect(html).toContain("const streaming = true;");
    expect(html).toContain("Copy");
  });

  it("keeps appended markdown stable when a streaming fence is later closed", () => {
    const partialMarkdown = ["```ts", "const value = 1;"].join("\n");
    const completeMarkdown = ["```ts", "const value = 1;", "```", "", "Done."].join("\n");

    const partialHtml = renderToStaticMarkup(
      <ConversationPartRenderer parts={[{ type: "markdown", markdown: partialMarkdown }]} />,
    );
    const completeHtml = renderToStaticMarkup(
      <ConversationPartRenderer parts={[{ type: "markdown", markdown: completeMarkdown }]} />,
    );

    expect(partialHtml).toContain("const value = 1;");
    expect(completeHtml).toContain("const value = 1;");
    expect(completeHtml).toContain("Done.");
    expect(completeHtml.match(/const value = 1;/g)).toHaveLength(1);
  });

  it("renders an unterminated tilde fence as a code block", () => {
    const markdown = ["~~~powershell", "Write-Host 'streaming'"].join("\n");

    const html = renderToStaticMarkup(<ConversationPartRenderer parts={[{ type: "markdown", markdown }]} />);

    expect(html).toContain("POWERSHELL");
    expect(html).toContain("Write-Host");
    expect(html).toContain("Copy");
  });
});
