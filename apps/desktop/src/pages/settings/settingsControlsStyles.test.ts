import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles/settings-controls.css",
);

describe("settings controls stylesheet", () => {
  it("only stretches compound controls on narrow workbench widths", () => {
    const css = readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".settings-segmented");
    expect(css).toContain(".settings-inline-status");
    expect(css).toContain(".settings-account");
    expect(css).toContain(".settings-account-summary");
    expect(css).toContain(".settings-account-summary-chips");
    expect(css).toContain(".settings-runtime-summary");
    expect(css).toContain("repeat(auto-fit, minmax(min(100%, 8rem), 1fr))");
    expect(css).toContain(".settings-advanced-meta");
    expect(css).toContain(".settings-action-stack");
    expect(css).toContain(".settings-action-row");
    expect(css).toContain(".settings-feedback-line");
    expect(css).toContain(".settings-input-wrap,\n.settings-input {\n  min-width: 0;");
    expect(css).toContain(".settings-input-wrap {\n  display: block;");
    expect(css).toContain("width: min(100%, 12rem)");
    expect(css).toContain("@container (max-width: 44rem)");
    expect(css).toContain("text-align: left");
    expect(css).toContain(".settings-model-badge-list");
    expect(css).toContain(".settings-model-badge");
    expect(css).toContain("max-width: min(100%, 18rem)");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).not.toContain(".settings-text-button {\n    width: 100%");
    expect(css).not.toContain(".settings-action-button {\n    width: 100%");
    expect(css).not.toContain("min-width: 12rem;");
  });
});
