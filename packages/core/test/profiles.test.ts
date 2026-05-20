import { describe, expect, it } from "vitest";
import { getProfile, loadProfiles } from "../src/profiles.js";

describe("profiles", () => {
  it("loads bundled profiles and includes default", () => {
    const ps = loadProfiles();
    expect(ps["default"]).toBeDefined();
    expect(ps["python-api"]).toBeDefined();
    expect(ps["python-api"]!.test.command).toMatch(/^pytest/);
  });

  it("falls back to default for unknown profile names", () => {
    const p = getProfile("not-a-real-profile");
    expect(p.name).toBe("default");
  });

  it("dotnet profile has a build command and csharp language", () => {
    const p = getProfile("dotnet-api");
    expect(p.build.command).toMatch(/^dotnet build/);
    expect(p.languages).toContain("csharp");
  });
});
