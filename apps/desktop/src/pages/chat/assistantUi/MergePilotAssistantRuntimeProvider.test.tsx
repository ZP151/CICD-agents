import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MergePilotAssistantRuntimeProvider } from "./MergePilotAssistantRuntimeProvider.js";

describe("MergePilotAssistantRuntimeProvider", () => {
  it("keeps existing children renderable while publishing the transcript to assistant-ui", () => {
    const html = renderToStaticMarkup(
      <MergePilotAssistantRuntimeProvider
        bubbles={[{ id: "user-1", kind: "user", text: "Review this pull request" }]}
      >
        <section data-testid="existing-chat-renderer">Existing message renderer</section>
      </MergePilotAssistantRuntimeProvider>,
    );

    expect(html).toContain('data-testid="existing-chat-renderer"');
    expect(html).toContain("Existing message renderer");
  });
});
