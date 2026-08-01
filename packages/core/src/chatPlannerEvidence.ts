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
  const additions = evidence
    .filter((entry) => entry.ok && entry.output?.trim())
    .map(publicFactForTool)
    .filter((fact): fact is string => Boolean(fact))
    .filter((fact) => !responseContainsFact(response, fact));
  if (additions.length === 0) return response;
  return `${response.trimEnd()}\n\nEvidence collected:\n${additions.map((fact) => `- ${fact}`).join("\n")}`;
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
