import { describe, expect, it } from "vitest";
import { getProjectTemplate, loadProjectTemplates } from "../src/projectTemplates.js";

describe("project templates", () => {
  it("loads bundled project templates and includes default", () => {
    const ps = loadProjectTemplates();
    expect(ps["default"]).toBeDefined();
    expect(ps["python-api"]).toBeDefined();
    expect(ps["python-api"]!.test.command).toMatch(/^pytest/);
  });

  it("falls back to default for unknown project template names", () => {
    const p = getProjectTemplate("not-a-real-template");
    expect(p.name).toBe("default");
  });

  it("dotnet project template has a build command and csharp language", () => {
    const p = getProjectTemplate("dotnet-api");
    expect(p.build.command).toMatch(/^dotnet build/);
    expect(p.languages).toContain("csharp");
  });
});
