import type { ContextBundle } from "./contextBuilder.js";

export const PIPELINE_SYSTEM_PROMPT = `You are the Pipeline Agent for an internal CI/CD assistant.
You work on a local code index of a developer's repository and have access to
tools for inspecting code, running tests/builds, and interacting with Azure
DevOps. Decide which tools to call and stop as soon as you have enough
information to produce a final answer.

Always return your final answer as a JSON object with these fields:
  title            : short pull request title (<=80 chars)
  summary          : markdown PR description, with sections "What" and "Why"
                     and a short "Risks" bullet list
  risk_level       : one of "low", "medium", "high"
  reasoning        : 2-4 sentence justification of risk_level
  next_actions     : optional list of strings for follow-up

Do not invent file paths or symbols that are not present in the context. If
the diff is empty, return a short summary that explains why.`;

export function parsePlannerFinalJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const end = trimmed.lastIndexOf("```");
    if (end > 3) {
      const inner = trimmed.slice(trimmed.indexOf("\n") + 1, end).trim();
      try {
        const obj = JSON.parse(inner);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return obj as Record<string, unknown>;
        }
      } catch {
        // Fall through to raw JSON extraction.
      }
    }
  }
  const open = trimmed.indexOf("{");
  const close = trimmed.lastIndexOf("}");
  if (open !== -1 && close !== -1 && close > open) {
    try {
      const obj = JSON.parse(trimmed.slice(open, close + 1));
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function firstPlannerLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s) return s.slice(0, 80);
  }
  return "";
}

export function truncatePlannerText(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 20) + "...(truncated)...";
}

export function buildPlannerOfflineSummary(bundle: ContextBundle): { title: string; summary: string } {
  const first = bundle.changedFiles[0];
  if (!first) {
    return { title: "No changes", summary: "There are no file changes against the target branch." };
  }
  const added = bundle.changedFiles.filter((f) => f.status === "added").length;
  const modified = bundle.changedFiles.filter((f) => f.status === "modified").length;
  const deleted = bundle.changedFiles.filter((f) => f.status === "deleted").length;
  const additions = bundle.changedFiles.reduce((s, f) => s + f.additions, 0);
  const deletions = bundle.changedFiles.reduce((s, f) => s + f.deletions, 0);
  let title = `Update ${first.path}`;
  if (bundle.changedFiles.length > 1) {
    title = `Update ${bundle.changedFiles.length} files including ${first.path}`;
  }
  title = title.slice(0, 80);
  const lines = [
    "## What",
    `- ${bundle.changedFiles.length} file(s) changed (${added} added, ${modified} modified, ${deleted} deleted)`,
    `- +${additions} / -${deletions} lines`,
    "",
    "## Why",
    "_Automatically generated; LLM unavailable. Edit before merging._",
    "",
    "## Risks",
    "- Review the diff manually.",
  ];
  if (bundle.affectedSymbols.length > 0) {
    lines.push("", "## Affected symbols");
    for (const s of bundle.affectedSymbols.slice(0, 20)) lines.push(`- ${s}`);
  }
  return { title, summary: lines.join("\n") };
}
