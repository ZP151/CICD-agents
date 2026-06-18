import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectRepoKind,
  suggestProjectTemplateFor,
  writeProjectLinkFile,
} from "../src/init.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-init-"));
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

  it("maps kinds to project template names", () => {
    expect(suggestProjectTemplateFor("python")).toBe("python-api");
    expect(suggestProjectTemplateFor("dotnet")).toBe("dotnet-api");
    expect(suggestProjectTemplateFor("node")).toBe("node-web");
    expect(suggestProjectTemplateFor("unknown")).toBe("default");
  });

  it("writes .mergepilot/project-link.yaml", () => {
    const dir = tempDir();
    const out = writeProjectLinkFile({
      repoPath: dir,
      projectTemplate: "python-api",
      organization: "contoso",
      project: "demo",
      repository: "demo-api",
      targetBranch: "main",
    });
    expect(fs.existsSync(out.configPath)).toBe(true);
    const text = fs.readFileSync(out.configPath, "utf8");
    expect(text).toContain("python-api");
    expect(text).toContain("contoso");
    expect(path.basename(out.configPath)).toBe("project-link.yaml");
  });

  it("does not write legacy profile config files", () => {
    const dir = tempDir();
    writeProjectLinkFile({
      repoPath: dir,
      projectTemplate: "python-api",
    });
  });
});
