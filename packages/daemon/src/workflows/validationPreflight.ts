import type { PendingToolAction } from "@mergepilot/core";
import { deriveValidationCommand } from "./validationCommandDerivation.js";

export type ValidationKind = "test" | "build";
export type ValidationPreflight = Extract<NonNullable<PendingToolAction["preflight"]>, { kind: "validation" }>;

export interface ValidationPayload {
  repoPath: string;
  sessionId?: string;
  validationScript?: string;
  projectLink?: {
    buildCommand?: string;
    testCommand?: string;
  };
}

interface ValidationArtifact {
  artifactId?: string;
  artifactType?: string;
  status?: string;
  content?: string;
}

interface ValidationBubble {
  role: string;
  artifacts?: ValidationArtifact[];
}

export interface ValidationBubbleReader {
  getBubbles(sessionId: string): Promise<ValidationBubble[]>;
}

export function changedFilesFromGitOutputs(diffNameOnly: string, statusText: string): string[] {
  const files = new Set<string>();
  for (const line of diffNameOnly.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }
  for (const line of statusText.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("## ")) continue;
    const rawPath = trimmed.slice(3).trim();
    if (!rawPath) continue;
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
    files.add(path.replace(/^"|"$/g, ""));
  }
  return Array.from(files);
}

export async function focusedValidationPreflightFromSession(
  bubbles: ValidationBubbleReader,
  payload: ValidationPayload,
  kind: ValidationKind,
  changedFiles: string[],
): Promise<ValidationPreflight | undefined> {
  if (!payload.sessionId) return undefined;
  const history = await bubbles.getBubbles(payload.sessionId).catch(() => []);
  const artifact = [...history]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((item) =>
      item.status === "error" &&
      item.artifactType === "markdown" &&
      item.artifactId?.startsWith(`validation-${kind}-failed-`)
    );
  const command = extractValidationCandidateRerunCommand(artifact?.content ?? "");
  if (!command) return undefined;
  const changedSummary = changedFiles.length > 0
    ? ` Changed files considered: ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? ", ..." : ""}.`
    : " No unstaged working-tree file list was detected.";
  return {
    kind: "validation",
    status: "ready",
    validationKind: kind,
    command,
    commandSource: "artifact",
    changedFiles: changedFiles.slice(0, 20),
    changedFileCount: changedFiles.length,
    selectionReason: `selected from the latest ${kind} failure artifact candidate rerun`,
    summary: `Validation command selected from latest ${kind} failure artifact: ${command}. Focused rerun candidate from previous validation failure.${changedSummary}`,
  };
}

export function validationPreflightFromPayload(
  payload: ValidationPayload,
  kind: ValidationKind,
  changedFiles: string[],
): ValidationPreflight {
  const override = String(payload.validationScript ?? "").trim();
  const projectLink = payload.projectLink;
  const configured = String(kind === "build" ? projectLink?.buildCommand ?? "" : projectLink?.testCommand ?? "").trim();
  const derived = !override && !configured
    ? deriveValidationCommand(payload.repoPath, kind, changedFiles)
    : undefined;
  const fallback = kind === "build" ? "npm run build" : "npm test";
  const command = override || configured || derived?.command || fallback;
  const commandSource = override ? "override" : configured ? "project_link" : derived ? "derived" : "default";
  const status = commandSource === "default" ? "default_command" : "ready";
  const fileSummary = changedFiles.length > 0
    ? ` Changed files considered: ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? ", ..." : ""}.`
    : " No unstaged working-tree file list was detected; using command-level validation.";
  const sourceSummary = derived?.sourceSummary ? ` ${derived.sourceSummary}.` : "";
  const selectionReason = derived?.sourceSummary
    ?? (override ? "selected from the explicit validation override"
      : configured ? "selected from the Project Link validation command"
        : "selected from the default validation command");
  return {
    kind: "validation",
    status,
    validationKind: kind,
    command,
    commandSource,
    changedFiles: changedFiles.slice(0, 20),
    changedFileCount: changedFiles.length,
    selectedScript: derived?.selectedScript,
    packageFilters: derived?.packageFilters,
    packageRoots: derived?.packageRoots,
    selectionReason,
    summary: `Validation command selected from ${commandSource}: ${command}.${sourceSummary}${fileSummary}`,
  };
}

function extractValidationCandidateRerunCommand(content: string): string {
  const line = content
    .split(/\r?\n/)
    .find((entry) => /^-\s*Candidate rerun:/i.test(entry.trim()));
  if (!line) return "";
  const code = line.match(/`([^`]+)`/);
  if (code?.[1]?.trim()) return code[1].trim();
  return line.replace(/^-\s*Candidate rerun:\s*/i, "").split(",")[0]?.trim() ?? "";
}
