import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../styles/settings-layout.css",
);

describe("settings layout stylesheet", () => {
  it("uses a compact in-page navigation alongside one readable settings column", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("width: min(100%, 88rem)");
    expect(css).toContain("grid-template-columns: 10.5rem minmax(0, 1fr)");
    expect(css).toContain("width: min(100%, 68rem)");
    expect(css).toContain("position: sticky");
    expect(css).toContain("overflow-x: auto");
    expect(css).not.toContain(".settings-row");
    expect(css).not.toContain(".settings-list");
  });

  it("leaves enough bottom scroll room for fixed app chrome", () => {
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("padding: 0.5rem 0 7.5rem");
  });

});
