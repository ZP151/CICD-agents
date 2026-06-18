import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationPartRenderer } from "./ConversationPartRenderer.js";

describe("ConversationPartRenderer markdown and code parts", () => {
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
