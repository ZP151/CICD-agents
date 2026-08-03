import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const baseCss = fs.readFileSync(path.join(process.cwd(), "src/styles/base.css"), "utf8");
const tailwindConfig = fs.readFileSync(path.join(process.cwd(), "tailwind.config.js"), "utf8");

describe("typography tokens (MP-014/RA-068..RA-073)", () => {
  it("defines the UI stack with Windows-first and Chinese fallbacks", () => {
    expect(baseCss).toContain("--font-ui:");
    expect(baseCss).toContain('"Segoe UI Variable Text"');
    expect(baseCss).toContain('"Segoe UI"');
    expect(baseCss).toContain('"Microsoft YaHei UI"');
    expect(baseCss).toContain('"PingFang SC"');
    expect(baseCss).toContain('"Noto Sans CJK SC"');
  });

  it("defines the mono stack with Cascadia Mono and CJK fallback", () => {
    expect(baseCss).toContain("--font-mono:");
    expect(baseCss).toContain('"Cascadia Mono"');
    expect(baseCss).toContain("Consolas");
  });

  it("applies the UI token to the document body", () => {
    expect(baseCss).toContain("font-family: var(--font-ui);");
  });

  it("never loads a network font", () => {
    expect(baseCss).not.toMatch(/@font-face/);
    expect(baseCss).not.toMatch(/url\(/);
  });

  it("maps Tailwind font-sans and font-mono to the semantic tokens", () => {
    expect(tailwindConfig).toContain('sans: ["var(--font-ui)"]');
    expect(tailwindConfig).toContain('mono: ["var(--font-mono)"]');
  });
});
