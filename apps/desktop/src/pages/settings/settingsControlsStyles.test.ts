import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles/settings-controls.css",
);

describe("settings controls stylesheet", () => {
  it("keeps only Settings-specific responsive layout after shared controls migrate", () => {
    const css = readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".settings-inline-status");
    expect(css).toContain(".settings-account");
    expect(css).toContain(".settings-account-summary");
    expect(css).toContain(".settings-account-summary-chips");
    expect(css).toContain("justify-content: flex-start");
    expect(css).toContain(".settings-action-stack");
    expect(css).toContain(".settings-action-row");
    expect(css).toContain(".settings-feedback-line");
    expect(css).toContain("@container (max-width: 44rem)");
    expect(css).toContain("text-align: left");
    expect(css).toContain(".settings-model-badge-list");
    expect(css).toContain(".settings-model-badge");
    expect(css).toContain("max-width: min(100%, 18rem)");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).not.toContain(".settings-segmented");
    expect(css).not.toContain(".settings-input");
    expect(css).not.toContain(".settings-toggle");
    expect(css).not.toContain(".settings-runtime-summary");
    expect(css).not.toContain(".settings-advanced-meta");
    expect(css).not.toContain("min-width: 12rem;");
  });
});
