import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles/settings-layout.css",
);

describe("settings layout stylesheet", () => {
  it("uses a bounded workbench layout for long model and cloud configuration fields", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("width: min(100%, 88rem)");
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr))");
    expect(css).toContain("minmax(12rem, min(42cqw, 22rem))");
    expect(css).toContain("container-type: inline-size");
    expect(css).not.toContain("width: min(100%, 72rem)");
    expect(css).not.toContain("width: min(100%, 64rem)");
    expect(css).not.toContain("minmax(14rem, min(38vw, 28rem))");
    expect(css).not.toContain("minmax(18rem, min(42vw, 32rem))");
  });

  it("leaves enough bottom scroll room for fixed app chrome", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("padding: 0.5rem 0 7.5rem");
  });

  it("keeps settings rows compact enough for maximized desktop review", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("margin-top: 1.5rem");
    expect(css).toContain(".settings-grid .settings-section");
    expect(css).toContain("margin-top: 0");
    expect(css).toContain("padding: 0.875rem 1rem");
    expect(css).not.toContain("margin-top: 2rem");
    expect(css).not.toContain("padding: 1rem 1.125rem");
  });

  it("keeps row controls bounded inside the settings panel", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain(".settings-row-control > *");
    expect(css).toContain("max-width: 100%");
  });

  it("stacks settings rows without forcing every action control to stretch", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".settings-row");
    expect(css).toContain("grid-template-columns: 1fr");
    expect(css).toContain("justify-content: flex-start");
    expect(css).not.toContain("justify-content: stretch");
  });

  it("stacks settings rows from the settings-list container width, not only viewport width", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("@container (max-width: 34rem)");
    expect(css).toContain(".settings-list");
    expect(css).toContain("container-type: inline-size");
    expect(css).not.toContain("@container (max-width: 44rem)");
  });
});
