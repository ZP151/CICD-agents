import { describe, expect, it } from "vitest";
import type { PendingToolAction } from "@mergepilot/core";
import {
  extractValidationFailureSignals,
  formatPipelineFailureArtifactsForChat,
  formatValidationArtifactsForChat,
  structuredDoneAfterConfirmedAction,
} from "../src/chatSession.js";

describe("chat session validation artifact recovery", () => {
  it("returns a selectable artifact for failed validation results", () => {
    const action: PendingToolAction = {
      tool: "validation_command",
      args: { command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test", kind: "test" },
      description: "Run tests",
      workflow: { kind: "ci", phase: "test" },
      preflight: {
        kind: "validation",
        status: "ready",
        validationKind: "test",
        command: ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test",
        commandSource: "derived",
        changedFileCount: 2,
        selectedScript: "test",
        packageFilters: ["@demo/app"],
        packageRoots: ["apps/app"],
        selectionReason: "Single touched package has a test script.",
        summary: "Derived package test command.",
      },
    };

    const done = structuredDoneAfterConfirmedAction(action, {
      returncode: 1,
      duration_ms: 1200,
      summary: "Validation command failed with exit code 1.",
      failure_excerpt: "FAIL src/app.test.ts\nExpected true to be false",
      stdout: "test stdout",
      stderr: "test stderr",
    });

    expect(done?.workflowKind).toBe("ci");
    expect(done?.workflowPhase).toBe("test_failed");
    expect(done?.result.artifacts).toEqual([
      expect.objectContaining({
        type: "artifact",
        title: "Test failure report",
        artifactType: "markdown",
        status: "error",
      }),
    ]);
    expect(done?.result.artifacts?.[0]?.content).toContain("# Test Failure Report");
    expect(done?.result.artifacts?.[0]?.content).toContain("Package filters: `@demo/app`");
    expect(done?.result.artifacts?.[0]?.content).toContain("## Recovery Signals");
    expect(done?.result.artifacts?.[0]?.content).toContain("Framework: vitest");
    expect(done?.result.artifacts?.[0]?.content).toContain("Candidate rerun");
    expect(done?.result.artifacts?.[0]?.content).toContain("Expected true to be false");
  });

  it("extracts Vitest failure files and focused rerun commands", () => {
    const signals = extractValidationFailureSignals(
      [
        "FAIL src/components/Widget.test.tsx > Widget > renders status",
        "AssertionError: expected true to be false",
      ].join("\n"),
      ".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test",
    );

    expect(signals.framework).toBe("vitest");
    expect(signals.files).toContain("src/components/Widget.test.tsx");
    expect(signals.suggestedCommands).toContain(".\\scripts\\windows\\pnpm-project.ps1 --filter @demo/app test src/components/Widget.test.tsx");
    expect(signals.diagnostics.some((line) => line.includes("expected true"))).toBe(true);
  });

  it("extracts pytest node ids and focused rerun commands", () => {
    const signals = extractValidationFailureSignals(
      [
        "FAILED tests/test_api.py::test_creates_pull_request - AssertionError: expected 201",
        "Traceback (most recent call last):",
      ].join("\n"),
      "pytest",
    );

    expect(signals.framework).toBe("pytest");
    expect(signals.files).toContain("tests/test_api.py");
    expect(signals.tests).toContain("tests/test_api.py::test_creates_pull_request");
    expect(signals.suggestedCommands).toContain("pytest tests/test_api.py::test_creates_pull_request");
  });

  it("extracts dotnet build diagnostics and filter hints", () => {
    const signals = extractValidationFailureSignals(
      [
        "ClaimBot.Tests.csproj",
        "ClaimControllerTests.CreateClaim Failed",
        "Controllers\\ClaimController.cs(42,13): error CS0103: The name 'claim' does not exist in the current context",
      ].join("\n"),
      "dotnet test ClaimBot.Tests.csproj",
    );

    expect(signals.framework).toBe("dotnet");
    expect(signals.files).toEqual(expect.arrayContaining(["ClaimBot.Tests.csproj", "Controllers/ClaimController.cs"]));
    expect(signals.tests).toContain("ClaimControllerTests.CreateClaim");
    expect(signals.suggestedCommands).toContain("dotnet test ClaimBot.Tests.csproj --filter FullyQualifiedName~ClaimControllerTests.CreateClaim");
    expect(signals.diagnostics.some((line) => line.includes("CS0103"))).toBe(true);
  });

  it("formats the latest validation failure artifact for recovery turns", () => {
    const prompt = formatValidationArtifactsForChat(
      [
        {
          role: "assistant",
          artifacts: [{
            type: "artifact",
            artifactId: "validation-test-failed-old",
            title: "Old test failure report",
            artifactType: "markdown",
            status: "error",
            content: "# Old Failure\nold output",
          }],
        },
        {
          role: "assistant",
          artifacts: [{
            type: "artifact",
            artifactId: "validation-test-failed-new",
            title: "Test failure report",
            artifactType: "markdown",
            status: "error",
            content: "# Test Failure Report\nFAIL src/app.test.ts",
          }],
        },
      ],
      "Analyze the latest test failure and suggest a fix.",
    );

    expect(prompt).toContain("Latest Validation Failure Artifact");
    expect(prompt).toContain("Validation Recovery Guidance");
    expect(prompt).toContain("Planner priority: use the Recovery Signals");
    expect(prompt).toContain("prefer the listed Candidate rerun command");
    expect(prompt).toContain("validation-test-failed-new");
    expect(prompt).toContain("FAIL src/app.test.ts");
    expect(prompt).not.toContain("old output");
  });

  it("injects validation artifacts for PR CI readiness turns", () => {
    const prompt = formatValidationArtifactsForChat(
      [{
        role: "assistant",
        artifacts: [{
          type: "artifact",
          artifactId: "validation-test-failed-ci",
          title: "Test failure report",
          artifactType: "markdown",
          status: "error",
          content: "# Test Failure Report\n- Candidate rerun: `npm test -- src.test.ts`",
        }],
      }],
      "Is PR #42 ready for approval, or is it blocked by CI policy and work items?",
    );

    expect(prompt).toContain("Latest Validation Failure Artifact");
    expect(prompt).toContain("PR/CI readiness requests");
    expect(prompt).toContain("policy status, linked work items");
    expect(prompt).toContain("npm test -- src.test.ts");
  });

  it("does not inject validation failure artifacts into unrelated turns", () => {
    const prompt = formatValidationArtifactsForChat(
      [{
        role: "assistant",
        artifacts: [{
          type: "artifact",
          artifactId: "validation-build-failed-abc",
          title: "Build failure report",
          artifactType: "markdown",
          status: "error",
          content: "# Build Failure Report",
        }],
      }],
      "Explain the project architecture.",
    );

    expect(prompt).toBeUndefined();
  });

  it("formats the latest pipeline failure artifact for CI recovery turns", () => {
    const prompt = formatPipelineFailureArtifactsForChat(
      [{
        role: "assistant",
        content: "Pipeline failed.",
        artifacts: [{
          type: "artifact",
          artifactId: "pipeline-12-run-77-failed",
          title: "Pipeline #12 run #77 failure",
          artifactType: "markdown",
          status: "error",
          content: [
            "# Pipeline #12 failure",
            "",
            "## Failed timeline records",
            "",
            "- npm test (Task): completed/failed - Test suite failed",
          ].join("\n"),
        }],
      }],
      "Analyze the pipeline failure and tell me whether to rerun it.",
    );

    expect(prompt).toContain("Azure Pipeline Failure Artifact");
    expect(prompt).toContain("pipeline-12-run-77-failed");
    expect(prompt).toContain("npm test");
    expect(prompt).toContain("Do not treat it as a local test failure");
  });
});
