import { describe, expect, it } from "vitest";
import { highlightCodeHtml } from "./codeHighlight.js";

describe("highlightCodeHtml", () => {
  it("uses theme-aware syntax classes instead of fixed Tailwind colors", () => {
    const html = highlightCodeHtml("const value = 42; const name = 'ok'; // note", "typescript");

    expect(html).toContain("syntax-token-keyword");
    expect(html).toContain("syntax-token-string");
    expect(html).toContain("syntax-token-number");
    expect(html).toContain("syntax-token-comment");
    expect(html).not.toContain("text-sky-300");
    expect(html).not.toContain("text-amber-300");
    expect(html).not.toContain("text-emerald-300");
    expect(html).not.toContain("text-slate-500");
  });
});
