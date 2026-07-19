import { describe, expect, it } from "vitest";
import {
  languageFromSourcePath,
  sourceBadgeTone,
  sourceTypeLabel,
} from "./sourcePreviewLanguage.js";

describe("source preview language helpers", () => {
  it("maps common repository files to CodeMirror languages", () => {
    expect(languageFromSourcePath("scripts/build.ps1")).toBe("powershell");
    expect(languageFromSourcePath("scripts/install.sh")).toBe("shell");
    expect(languageFromSourcePath("Dockerfile")).toBe("dockerfile");
    expect(languageFromSourcePath("src/main.rs")).toBe("rust");
    expect(languageFromSourcePath("src/server.go")).toBe("go");
    expect(languageFromSourcePath("patches/fix.diff")).toBe("diff");
    expect(languageFromSourcePath("config/app.toml")).toBe("toml");
  });

  it("maps .NET and MSBuild files to useful preview languages", () => {
    expect(languageFromSourcePath("ClaimsBot.sln")).toBe("text");
    expect(languageFromSourcePath("BotToSharePoint/BotToSharePoint.csproj")).toBe("xml");
    expect(languageFromSourcePath("BotToSharePoint/Web.config")).toBe("xml");
    expect(languageFromSourcePath("Directory.Build.props")).toBe("xml");
    expect(languageFromSourcePath("Views/Home/Index.cshtml")).toBe("html");
    expect(languageFromSourcePath("Components/App.razor")).toBe("html");
    expect(languageFromSourcePath("Resources/Labels.resx")).toBe("xml");
  });

  it("renders concise tab badges for language families", () => {
    expect(sourceTypeLabel("scripts/build.ps1")).toBe("PS");
    expect(sourceTypeLabel("Dockerfile")).toBe("DOCK");
    expect(sourceTypeLabel("src/main.rs")).toBe("RS");
    expect(sourceTypeLabel("README.md")).toBe("MD");
  });

  it("renders specific badges for .NET project files", () => {
    expect(sourceTypeLabel("ClaimsBot.sln")).toBe("SLN");
    expect(sourceTypeLabel("BotToSharePoint/BotToSharePoint.csproj")).toBe("CSPJ");
    expect(sourceTypeLabel("Directory.Build.targets")).toBe("MSB");
    expect(sourceTypeLabel("Views/Home/Index.cshtml")).toBe("RAZR");
    expect(sourceTypeLabel("BotToSharePoint/Web.config")).toBe("CFG");
    expect(sourceTypeLabel("Resources/Labels.resx")).toBe("RESX");
    expect(sourceTypeLabel("src/LegacyModule.vb")).toBe("VB");
    expect(sourceTypeLabel("src/Program.fs")).toBe("F#");
  });

  it("uses a stable neutral badge for shell-like operational files", () => {
    expect(sourceBadgeTone("PS")).toContain("--app-text-subtle");
    expect(sourceBadgeTone("DOCK")).toContain("--app-text-subtle");
    expect(sourceBadgeTone("DIFF")).toContain("--app-text-subtle");
    expect(sourceBadgeTone("PS")).not.toContain("slate");
  });

  it("uses stable tones for .NET-specific badges", () => {
    expect(sourceBadgeTone("CSPJ")).toContain("--app-text-muted");
    expect(sourceBadgeTone("SLN")).toContain("--app-text-muted");
    expect(sourceBadgeTone("RAZR")).toContain("--app-text");
    expect(sourceBadgeTone("CFG")).toContain("--app-success");
    expect(sourceBadgeTone("CSPJ")).not.toContain("indigo");
    expect(sourceBadgeTone("RAZR")).not.toContain("violet");
    expect(sourceBadgeTone("CFG")).not.toContain("emerald");
  });
});
