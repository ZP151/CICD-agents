export interface PublicToolEvidence {
  name: string;
  ok: boolean;
  output?: string;
}

/**
 * A model-written final remains the primary conclusion. This small guard only
 * adds facts that were actually returned by a completed public tool when the
 * model omitted them altogether. It prevents a conclusion with empty
 * headings from discarding the evidence users just watched the agent gather.
 */
export function groundFinalResponse(response: string, evidence: PublicToolEvidence[]): string {
  const conclusion = removeRepeatedExecutionPreamble(response, evidence);
  const additions = evidence
    .filter((entry) => entry.ok && entry.output?.trim())
    .map(publicFactForTool)
    .filter((fact): fact is string => Boolean(fact))
    .filter((fact) => !responseContainsFact(conclusion, fact));
  if (additions.length === 0) return conclusion;
  return `${conclusion.trimEnd()}\n\nEvidence collected:\n${additions.map((fact) => `- ${fact}`).join("\n")}`;
}

/**
 * The execution transcript has already shown the action narrative and tool
 * group. A model sometimes repeats that material as a heading plus bullets
 * before its actual conclusion (for example, "Evidence needed before
 * read-only checks"). Remove only a leading plan section when a subsequent
 * findings/result heading proves that a separate conclusion follows.
 */
function removeRepeatedExecutionPreamble(response: string, evidence: PublicToolEvidence[]): string {
  if (!evidence.some((entry) => entry.ok && entry.output?.trim())) return response;
  const lines = response.split(/\r?\n/);
  const conclusionIndex = lines.findIndex((line) => /^(?:#{1,6}\s*)?(?:findings?|results?|conclusion|summary)\b[^\n]*:/i.test(line.trim()));
  if (conclusionIndex <= 0) return response;

  const leading = lines.slice(0, conclusionIndex).filter((line) => line.trim());
  if (leading.length === 0 || !leading.every(isExecutionPlanLine)) return response;
  return lines.slice(conclusionIndex).join("\n").trimStart();
}

function isExecutionPlanLine(line: string): boolean {
  const normalized = line.trim();
  return /^(?:#{1,6}\s*)?(?:planned evidence|evidence needed(?: before)?|before checks|plan)\b/i.test(normalized)
    || /^(?:[-*•]|\d+[.)])\s/.test(normalized);
}

function publicFactForTool(entry: PublicToolEvidence): string | undefined {
  const output = entry.output?.trim();
  if (!output) return undefined;
  if (entry.name === "git_current_branch") return `Active branch: \`${singleLine(output)}\`.`;
  if (entry.name === "git_status") return workingTreeFact(output);
  if (entry.name === "git_log") return `Most recent commit: \`${singleLine(output)}\`.`;
  return undefined;
}

function workingTreeFact(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd());
  const changed = lines.filter((line) => /^\s?[MADRCU]/.test(line)).length;
  const untracked = lines.filter((line) => /^\?\?\s+/.test(line)).length;
  if (changed === 0 && untracked === 0) return "Working tree: clean.";
  const parts = [
    changed > 0 ? `${changed} modified ${changed === 1 ? "file" : "files"}` : "",
    untracked > 0 ? `${untracked} untracked ${untracked === 1 ? "file" : "files"}` : "",
  ].filter(Boolean);
  return `Working tree: ${parts.join("; ")}.`;
}

function responseContainsFact(response: string, fact: string): boolean {
  const normalizedResponse = response.toLocaleLowerCase();
  const values = fact.match(/`([^`]+)`/g)?.map((value) => value.slice(1, -1)) ?? [];
  if (values.some((value) => normalizedResponse.includes(value.toLocaleLowerCase()))) return true;
  if (fact.startsWith("Most recent commit:")) {
    const commitHash = values
      .flatMap((value) => value.match(/\b[0-9a-f]{7,40}\b/gi) ?? [])
      .at(0);
    if (commitHash && normalizedResponse.includes(commitHash.toLocaleLowerCase())) return true;
  }
  if (fact.startsWith("Working tree:")) {
    return /working tree|uncommitted|modified files?|untracked files?/.test(normalizedResponse);
  }
  return false;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}
