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
  // These are user-facing facts, not a replay of the commands. The command
  // group already lives inside the collapsed Working transcript, so avoid
  // resurrecting an "evidence collected" activity log below the conclusion.
  return `${conclusion.trimEnd()}\n\nVerified facts:\n${additions.map((fact) => `- ${fact}`).join("\n")}`;
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
  const conclusionIndex = lines.findIndex(isConclusionHeading);
  if (conclusionIndex < 0) return response;

  const leading = lines.slice(0, conclusionIndex).filter((line) => line.trim());
  const conclusion = conclusionIndex > 0 && leading.length > 0 && isRepeatedExecutionPreamble(leading)
    ? lines.slice(conclusionIndex)
    : lines;
  // "Collected evidence and result" is still a replay-oriented heading. The
  // transcript has the collection; the final should begin with the outcome.
  if (/^(?:#{1,6}\s*)?collected evidence(?:\s+and\s+result)?\b/i.test(normalizePreambleLine(conclusion[0] ?? ""))) {
    conclusion[0] = "Findings:";
  }
  return removeToolSyntaxFromFinal(removeUnrequestedNextActions(removeEmbeddedExecutionReplay(conclusion))).join("\n").trimStart();
}

function isConclusionHeading(line: string): boolean {
  return /^(?:#{1,6}\s*)?(?:findings?|results?|conclusion|summary|collected evidence(?:\s+and\s+result)?)\b[^\n]*:/i.test(line.trim());
}

function removeUnrequestedNextActions(lines: string[]): string[] {
  // A follow-up menu is neither a requested finding nor a conclusion. It
  // also makes the final look like a second planning phase after the Working
  // transcript has been sealed. Keep factual notes (for example read-only
  // confirmation) but remove only explicit unrequested action offers.
  return lines.filter((line) => !/\b(?:next steps? I can run|I can (?:run|show|prepare)|requires your approval)\b/i.test(line));
}

function removeEmbeddedExecutionReplay(lines: string[]): string[] {
  // Some finalizers state the findings first and then append an evidence/tool
  // ledger. That ordering is still wrong for this UI: Working owns the ledger
  // while Final owns the conclusion. Drop a replay heading and its bullets,
  // then resume at the next ordinary conclusion line.
  let skippingReplayItems = false;
  return lines.filter((line) => {
    const normalized = normalizePreambleLine(line);
    if (isExecutionReplayHeading(normalized)) {
      skippingReplayItems = true;
      return false;
    }
    if (skippingReplayItems && (!normalized || /^(?:[-*•]|\d+[.)])\s/.test(normalized))) return false;
    skippingReplayItems = false;
    return true;
  });
}

function isExecutionReplayHeading(line: string): boolean {
  return /^(?:#{1,6}\s*)?(?:planned evidence|evidence (?:needed|collected)|collected evidence|read-only (?:commands?|checks?)|(?:commands?|checks?) run)\b/i.test(line);
}

function isRepeatedExecutionPreamble(lines: string[]): boolean {
  // The model may preface its conclusion with an innocuous prose sentence
  // ("I collected three read-only evidence items") followed by the very tool
  // list the user can already expand in Working. Treat it like the older
  // plan-shaped preamble, but only when a later Findings/Results heading has
  // positively identified a distinct conclusion.
  const normalized = lines.map(normalizePreambleLine);
  const hasActivitySignal = normalized.some((line) => /\b(?:planned evidence|evidence (?:needed|collected)|read-only (?:commands?|checks?)|(?:commands?|checks?) run|collect(?:ed)? .*\bevidence)\b/i.test(line));
  return hasActivitySignal && normalized.every((line) => isExecutionPlanLine(line));
}

function isExecutionPlanLine(line: string): boolean {
  const normalized = normalizePreambleLine(line);
  return /^(?:#{1,6}\s*)?(?:planned evidence|evidence needed(?: before)?|before checks|plan)\b/i.test(normalized)
    || /^(?:#{1,6}\s*)?(?:evidence collected|read-only (?:commands?|checks?)|(?:commands?|checks?) run|i (?:will |did )?collect(?:ed)? .*\bevidence)\b/i.test(normalized)
    || /^(?:[-*•]|\d+[.)])\s/.test(normalized);
}

function normalizePreambleLine(line: string): string {
  return line.trim().replace(/^["']+|["']+$/g, "");
}

function removeToolSyntaxFromFinal(lines: string[]): string[] {
  // The final carries facts, while executable syntax belongs to the expandable
  // command card. Restrict this to the public built-in Git labels used by the
  // branch/status/commit answers, so user prose and source snippets are not
  // broadly rewritten.
  return lines.map((line) => line
    .replace(/\s*\((?:git_current_branch|git_status(?:\s+--[\w-]+)*(?:\s+with\s+[^)]*)?|git_log(?:\s+[-\w=]+)*|git\s+(?:status|log|branch)(?:\s+--[\w-]+)*)\)/gi, "")
    .replace(/\b(?:git_current_branch|git_status(?:\s+--[\w-]+)*|git_log(?:\s+[-\w=]+)*|git\s+(?:status|log|branch)(?:\s+--[\w-]+)*)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:;,.])/g, "$1"));
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
