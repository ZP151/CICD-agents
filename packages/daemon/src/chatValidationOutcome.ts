import crypto from "node:crypto";
import {
  type ChatPlannerResult,
  type ChatWorkflowState,
  type PendingToolAction,
} from "@mergepilot/core";
import {
  extractValidationFailureSignals,
  fencedText,
  validationFailureSignalsMarkdown,
} from "./validationFailureSignals.js";

export interface StructuredDoneAfterConfirmedAction {
  currentStep: string;
  workflowKind: NonNullable<ChatWorkflowState["workflowKind"]>;
  workflowPhase: string;
  result: ChatPlannerResult;
}

export function validationDoneAfterConfirmedAction(
  action: PendingToolAction,
  toolResult: unknown,
): StructuredDoneAfterConfirmedAction {
  const result = typeof toolResult === "object" && toolResult !== null ? toolResult as Record<string, unknown> : {};
  const returncode = Number(result["returncode"] ?? 1);
  const kind = action.workflow?.phase === "build" ? "build" : "test";
  const passed = returncode === 0;
  const command = String(action.args["command"] ?? result["command"] ?? "").trim();
  const failureExcerpt = String(result["failure_excerpt"] ?? "").trim();
  const artifact = validationResultArtifact(kind, passed, command, result, action);
  return {
    currentStep: passed ? `${kind === "build" ? "Build" : "Tests"} passed` : `${kind === "build" ? "Build" : "Tests"} failed`,
    workflowKind: "ci",
    workflowPhase: passed ? `${kind}_passed` : `${kind}_failed`,
    result: {
      response: passed
        ? `${kind === "build" ? "Build" : "Tests"} passed${command ? `: ${command}` : ""}.`
        : [
            `${kind === "build" ? "Build" : "Tests"} failed${command ? `: ${command}` : ""}.`,
            failureExcerpt ? `Key output:\n${failureExcerpt}` : "Check the tool output, fix the failing area, then rerun validation.",
          ].join("\n"),
      finalizationMode: "none",
      riskLevel: passed ? "low" : "medium",
      actionsTaken: [passed ? `${kind} passed` : `${kind} failed`],
      suggestions: passed
        ? ["Review changes", "Prepare commit", "Create pull request"]
        : ["Inspect failing output", "Review changed files", "Rerun validation"],
      artifacts: artifact ? [artifact] : undefined,
      toolCallsMade: [{ name: action.tool, args: action.args, ok: passed }],
      usedLlm: false,
    },
  };
}

function validationResultArtifact(
  kind: "test" | "build",
  passed: boolean,
  command: string,
  result: Record<string, unknown>,
  action: PendingToolAction,
): NonNullable<ChatPlannerResult["artifacts"]>[number] | undefined {
  if (passed) return undefined;
  const returncode = Number(result["returncode"] ?? 1);
  const durationMs = Number(result["duration_ms"] ?? 0);
  const summary = String(result["summary"] ?? "").trim();
  const failureExcerpt = String(result["failure_excerpt"] ?? "").trim();
  const stdout = String(result["stdout"] ?? "").trim();
  const stderr = String(result["stderr"] ?? "").trim();
  const signals = extractValidationFailureSignals(
    [failureExcerpt, stdout, stderr].filter(Boolean).join("\n"),
    command,
  );
  const preflight = action.preflight?.kind === "validation" ? action.preflight : undefined;
  const content = [
    `# ${kind === "build" ? "Build" : "Test"} Failure Report`,
    "",
    `- Command: \`${command || "not available"}\``,
    `- Exit code: ${Number.isFinite(returncode) ? returncode : 1}`,
    durationMs > 0 ? `- Duration: ${durationMs} ms` : "",
    preflight?.commandSource ? `- Command source: ${preflight.commandSource}` : "",
    preflight?.selectedScript ? `- Script: \`${preflight.selectedScript}\`` : "",
    preflight?.packageFilters?.length ? `- Package filters: ${preflight.packageFilters.map((item) => `\`${item}\``).join(", ")}` : "",
    preflight?.packageRoots?.length ? `- Package roots: ${preflight.packageRoots.map((item) => `\`${item}\``).join(", ")}` : "",
    preflight?.changedFileCount !== undefined ? `- Changed files considered: ${preflight.changedFileCount}` : "",
    summary ? `- Summary: ${summary}` : "",
    validationFailureSignalsMarkdown(signals),
    "",
    "## Key Output",
    "",
    failureExcerpt ? fencedText(failureExcerpt) : "_No failure excerpt was captured._",
    stdout ? ["", "## stdout", "", fencedText(truncateStr(stdout, 8000))].join("\n") : "",
    stderr ? ["", "## stderr", "", fencedText(truncateStr(stderr, 8000))].join("\n") : "",
  ].filter(Boolean).join("\n");
  const hash = crypto
    .createHash("sha1")
    .update(`${kind}\0${command}\0${returncode}\0${failureExcerpt}`)
    .digest("hex")
    .slice(0, 12);
  return {
    type: "artifact",
    artifactId: `validation-${kind}-failed-${hash}`,
    title: `${kind === "build" ? "Build" : "Test"} failure report`,
    artifactType: "markdown",
    status: "error",
    content,
  };
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}
