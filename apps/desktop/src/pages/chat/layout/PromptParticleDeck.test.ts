import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptParticleDeck } from "./PromptParticleDeck.js";

const suggestions = [
  { id: "changes", label: "Review local changes", message: "Review changes", action: { kind: "fill_composer" as const } },
  { id: "branch", label: "Check branch readiness", message: "Check branch", action: { kind: "fill_composer" as const } },
];

describe("PromptParticleDeck", () => {
  it("renders a visible, keyboard-operable contextual prompt deck", () => {
    const html = renderToStaticMarkup(createElement(PromptParticleDeck, {
      suggestions,
      onPick: () => undefined,
    }));

    expect(html).toContain("prompt-particle-deck");
    expect(html).toContain('aria-label="Suggested prompt drafts"');
    expect(html).toContain('aria-roledescription="prompt carousel"');
    expect(html).toContain("prompt-particle-deck__stage");
    expect(html).toContain("prompt-particle-deck__ring");
    expect(html).toContain('data-interaction="direct"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("Scroll or use arrow keys to browse");
    expect(html).not.toContain("Enter fills the draft");
    expect(html).not.toContain("Fill draft");
    expect(html).not.toContain("prompt-particle-deck__insert");
    expect(html).toContain('aria-label="Use prompt: Review local changes"');
    expect(html).toContain('aria-label="Use prompt: Check branch readiness"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
  });
});
