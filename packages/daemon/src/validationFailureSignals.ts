export interface ValidationFailureSignals {
  framework?: "vitest" | "jest" | "pytest" | "dotnet" | "generic";
  files: string[];
  tests: string[];
  diagnostics: string[];
  suggestedCommands: string[];
}

export function extractValidationFailureSignals(text: string, command = ""): ValidationFailureSignals {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const normalizedCommand = command.toLowerCase();
  const lines = normalizedText
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const files = uniqueStrings([
    ...matches(normalizedText, /\b(?:FAIL|Failed|FAILED|Error|ERROR)\s+([A-Za-z]:)?([^\s:()]+?\.(?:test|spec)\.[jt]sx?)\b/g)
      .map((parts) => `${parts[1] ?? ""}${parts[2] ?? ""}`),
    ...matches(normalizedText, /\b([^\s:()]+?\.(?:test|spec)\.[jt]sx?)\b/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\b(?:FAILED|ERROR)\s+([^\s:()]+?\.py)(?:::([^\s]+))?/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\b([^\s:()]+?\.py)::([^\s]+)\b/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\b([^\s:()]+?\.csproj)\b/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\b([^\s:()]+?\.cs)\((\d+),(\d+)\)/g).map((parts) => parts[1] ?? ""),
  ].map(cleanFailureToken).filter(Boolean));
  const tests = uniqueStrings([
    ...matches(normalizedText, /\b([^\s:()]+?\.py::[^\s]+)\b/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\bTest Name\s*:?\s*([A-Za-z0-9_.<>-]+)\b/g).map((parts) => parts[1] ?? ""),
    ...matches(normalizedText, /\b([A-Za-z0-9_.<>-]+)[ \t]+(?:Failed|FAILED)\b/g).map((parts) => parts[1] ?? ""),
  ].map(cleanFailureToken).filter(Boolean));
  const diagnostics = uniqueStrings(lines.filter((line) =>
    /\b(assert|expected|received|traceback|exception|error|failed|failure|CS\d{4}|NETSDK\d+)\b/i.test(line),
  ).slice(0, 8));

  const framework = inferValidationFramework(normalizedText, normalizedCommand, files);
  return {
    framework,
    files,
    tests,
    diagnostics,
    suggestedCommands: validationRerunCommands(framework, command, files, tests),
  };
}

export function validationFailureSignalsMarkdown(signals: ValidationFailureSignals): string {
  if (!signals.framework && signals.files.length === 0 && signals.tests.length === 0 && signals.suggestedCommands.length === 0) {
    return "";
  }
  return [
    "",
    "## Recovery Signals",
    signals.framework ? `- Framework: ${signals.framework}` : "",
    signals.files.length ? `- Failing files: ${signals.files.map((file) => `\`${file}\``).join(", ")}` : "",
    signals.tests.length ? `- Failing tests: ${signals.tests.map((test) => `\`${test}\``).join(", ")}` : "",
    signals.suggestedCommands.length ? `- Candidate rerun: ${signals.suggestedCommands.map((cmd) => `\`${cmd}\``).join(", ")}` : "",
    signals.diagnostics.length ? `- Diagnostics: ${signals.diagnostics.slice(0, 3).join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

export function fencedText(text: string): string {
  const fence = text.includes("```") ? "~~~~" : "```";
  return `${fence}\n${text}\n${fence}`;
}

function inferValidationFramework(
  text: string,
  command: string,
  files: string[],
): ValidationFailureSignals["framework"] {
  const lower = `${command}\n${text}`.toLowerCase();
  if (/\bpytest\b|\.py::|^failed\s+.*\.py/im.test(lower)) return "pytest";
  if (/\bdotnet\b|\.csproj\b|\bcs\d{4}\b|\bnetsdk\d+/i.test(lower)) return "dotnet";
  if (/\bjest\b/.test(lower)) return "jest";
  if (/\bvitest\b|\bvi\.|\.test\.[jt]sx?\b|\.spec\.[jt]sx?\b/.test(lower)) return "vitest";
  if (files.some((file) => /\.(test|spec)\.[jt]sx?$/.test(file))) return "vitest";
  return files.length || text.trim() ? "generic" : undefined;
}

function validationRerunCommands(
  framework: ValidationFailureSignals["framework"],
  command: string,
  files: string[],
  tests: string[],
): string[] {
  const trimmed = command.trim();
  if (!trimmed) return [];
  const firstFile = files[0];
  const firstTest = tests[0];
  if (framework === "pytest") {
    if (firstTest?.includes(".py::")) return [`pytest ${firstTest}`];
    if (firstFile?.endsWith(".py")) return [`pytest ${firstFile}`];
  }
  if (framework === "dotnet") {
    const firstDotnetTest = tests.find((test) => !/\.(?:csproj|cs|py|tsx?|jsx?)$/i.test(test));
    if (firstDotnetTest) return [`${trimmed} --filter FullyQualifiedName~${firstDotnetTest}`];
    if (firstFile?.endsWith(".csproj")) return [`dotnet test ${firstFile}`];
  }
  if ((framework === "vitest" || framework === "jest") && firstFile) {
    const separator = /\bnpm(?:\.cmd)?\s+run\b/i.test(trimmed) && !/\s--\s/.test(trimmed) ? " --" : "";
    return [`${trimmed}${separator} ${firstFile}`];
  }
  return firstFile ? [`Focus rerun on ${firstFile}`] : [];
}

function matches(text: string, pattern: RegExp): RegExpMatchArray[] {
  return Array.from(text.matchAll(pattern));
}

function cleanFailureToken(value: string): string {
  return value.replace(/^[('"`]+|[),.'"`]+$/g, "").replace(/\\/g, "/").trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 8);
}
