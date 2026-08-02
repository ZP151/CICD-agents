import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles/settings-layout.css",
);

describe("settings layout stylesheet", () => {
  it("keeps the Settings page bounded while its rows come from shared workbench primitives", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("width: min(100%, 88rem)");
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 34rem), 1fr))");
    expect(css).not.toContain("width: min(100%, 72rem)");
    expect(css).not.toContain("width: min(100%, 64rem)");
    expect(css).not.toContain(".settings-row");
    expect(css).not.toContain(".settings-list");
  });

  it("leaves enough bottom scroll room for fixed app chrome", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("padding: 0.5rem 0 7.5rem");
  });

});
