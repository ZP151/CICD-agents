import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveValidationCommand } from "../src/workflows/validationCommandDerivation.js";

function tempRepo(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("validationCommandDerivation", () => {
  it("derives a package validation command from changed ownership", () => {
    const repo = tempRepo("mergepilot-validation-command-single-");
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.writeFileSync(path.join(repo, "packages", "core", "package.json"), JSON.stringify({
      name: "@demo/core",
      scripts: { test: "vitest run" },
    }), "utf8");
    fs.writeFileSync(path.join(repo, "packages", "core", "src.test.ts"), "test('demo', () => {});\n", "utf8");

    expect(deriveValidationCommand(repo, "test", ["packages/core/src.test.ts"])).toMatchObject({
      command: "npm --prefix packages/core run test",
      selectedScript: "test",
      packageRoots: ["packages/core"],
    });
  });

  it("derives a multi-package pnpm wrapper command", () => {
    const repo = tempRepo("mergepilot-validation-command-multi-");
    fs.mkdirSync(path.join(repo, "packages", "core"), { recursive: true });
    fs.mkdirSync(path.join(repo, "apps", "desktop"), { recursive: true });
    fs.mkdirSync(path.join(repo, "scripts", "windows"), { recursive: true });
    fs.writeFileSync(path.join(repo, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n  - apps/*\n", "utf8");
    fs.writeFileSync(path.join(repo, "scripts", "windows", "pnpm-project.ps1"), "# wrapper\n", "utf8");
    fs.writeFileSync(path.join(repo, "packages", "core", "package.json"), JSON.stringify({
      name: "@demo/core",
      scripts: { build: "tsc" },
    }), "utf8");
    fs.writeFileSync(path.join(repo, "apps", "desktop", "package.json"), JSON.stringify({
      name: "@demo/desktop",
      scripts: { build: "vite build" },
    }), "utf8");
    fs.writeFileSync(path.join(repo, "packages", "core", "src.ts"), "export {};\n", "utf8");
    fs.writeFileSync(path.join(repo, "apps", "desktop", "main.ts"), "export {};\n", "utf8");

    expect(deriveValidationCommand(repo, "build", ["apps/desktop/main.ts", "packages/core/src.ts"])).toMatchObject({
      command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/desktop --filter @demo/core build",
      selectedScript: "build",
      packageFilters: ["@demo/desktop", "@demo/core"],
      packageRoots: ["apps/desktop", "packages/core"],
    });
  });
});
