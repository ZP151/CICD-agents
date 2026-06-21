import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatAssistantMetaPanel } from "./ChatAssistantMetaPanel.js";

describe("ChatAssistantMetaPanel", () => {
  it("does not render plain metadata suggestions as transcript action lines", () => {
    const html = renderToStaticMarkup(
      <ChatAssistantMetaPanel
        meta={{
          suggestions: [
            "Run unit tests to verify error handling changes.",
            "Repository context: semantic index used.",
          ],
        }}
      />,
    );

    expect(html).toBe("");
  });

  it("keeps saved PR insight source metadata available", () => {
    const html = renderToStaticMarkup(
      <ChatAssistantMetaPanel
        meta={{
          suggestions: [
            "Used saved PR AI insight artifact artifact-123 for PR #42 (summary, 2026-06-19).",
          ],
        }}
      />,
    );

    expect(html).toContain("Saved PR insight source");
    expect(html).toContain("artifact-123");
    expect(html).toContain("PR #42");
  });
});
