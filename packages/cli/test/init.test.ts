import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectRepoKind, suggestProfileFor, writeProfileFile } from "../src/init.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cicd-init-"));
}

describe("init helpers", () => {
  it("detects python repos via pyproject.toml", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "pyproject.toml"), "[project]\nname='x'\n");
    expect(detectRepoKind(dir)).toBe("python");
  });

  it("detects node repos via package.json", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    expect(detectRepoKind(dir)).toBe("node");
  });

  it("detects dotnet repos via csproj", () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "App.csproj"), "<Project/>");
    expect(detectRepoKind(dir)).toBe("dotnet");
  });

  it("falls back to unknown", () => {
    const dir = tempDir();
    expect(detectRepoKind(dir)).toBe("unknown");
  });

  it("maps kinds to profile names", () => {
    expect(suggestProfileFor("python")).toBe("python-api");
    expect(suggestProfileFor("dotnet")).toBe("dotnet-api");
    expect(suggestProfileFor("node")).toBe("node-web");
    expect(suggestProfileFor("unknown")).toBe("default");
  });

  it("writes .cicd-agent/profile.yaml", () => {
    const dir = tempDir();
    const out = writeProfileFile({
      repoPath: dir,
      profile: "python-api",
      organization: "contoso",
      project: "demo",
      repository: "demo-api",
      targetBranch: "main",
    });
    expect(fs.existsSync(out.configPath)).toBe(true);
    const text = fs.readFileSync(out.configPath, "utf8");
    expect(text).toContain("python-api");
    expect(text).toContain("contoso");
  });
});
