import type { ChatMessage, ChatPlannerResult } from "./chatPlannerTypes.js";
import type { PublicToolEvidence } from "./chatPlannerEvidence.js";
import { isConfirmationMessage } from "./chatPlannerAffirmation.js";

export function prohibitsStaging(message: string, history: ChatMessage[]): boolean {
  const scope = userScopeText(message, history);
  return /\b(?:do not|don't|dont)\s+(?:stage|staging|git add)(?:\s+(?:anything|all|everything))?(?=\s*(?:[,.;]|$|or\s+(?:commit|push|merge|checkout|switch)))/i.test(scope) ||
    /\bwithout\s+(?:staging|stage|git add)\b/i.test(scope) ||
    /\bno\s+(?:staging|stage|git add)\b/i.test(scope);
}

export function prohibitedWriteGuidance(
  toolName: string,
  message: string,
  history: ChatMessage[],
): string {
  if (toolName !== "git_add" || !prohibitsStaging(message, history)) return "";
  return "The user explicitly prohibited staging. Do not call git_add or propose it. Inspect git_status and git_diff with staged=true; if no staged changes are present, explain that and stop without requesting approval.";
}

export function noStagedChangesEvidence(evidence: PublicToolEvidence[]): boolean {
  const status = evidence.find((entry) => entry.ok && entry.name === "git_status");
  const stagedDiff = evidence.find(
    (entry) => entry.ok && entry.name === "git_diff" &&
      (entry.args?.staged === true || entry.args?.cached === true),
  );
  if (!status || !stagedDiff) return false;

  const hasStagedStatus = (status.output ?? "")
    .split(/\r?\n/)
    .some((line) => !line.startsWith("##") && line.length >= 2 && line[0] !== " " && line[0] !== "?");
  return !hasStagedStatus && !(stagedDiff.output ?? "").trim();
}

export function guardApprovalProposal(
  result: ChatPlannerResult,
  message: string,
  history: ChatMessage[],
): ChatPlannerResult {
  const proposal = result.approvalProposal;
  if (!proposal) return result;

  const proposalStages = proposal.tool === "git_add" ||
    (proposal.tool === "git_commit" && proposal.args.all === true);
  if (prohibitsStaging(message, history) && proposalStages) {
    return {
      ...result,
      response: "No staged changes were verified, and you explicitly asked me not to stage anything. I will not request staging or create a commit.",
      riskLevel: "low",
      suggestions: [],
      approvalProposal: undefined,
    };
  }

  const asksToStageAndCommit = /\b(?:stage|staging|git add)\b[\s\S]*\bcommit\b|\bcommit\b[\s\S]*\b(?:stage|staging|git add)\b/i.test(message);
  if (proposal.tool === "git_commit" && proposal.args.all === true && asksToStageAndCommit) {
    const messageArg = String(proposal.args.message ?? "").trim();
    return {
      ...result,
      approvalProposal: {
        ...proposal,
        tool: "git_add",
        args: { all: true },
        description: "Stage all current changes for commit.",
        nextHint: messageArg ? `commit staged changes with message: ${messageArg}` : proposal.nextHint,
      },
    };
  }

  return result;
}

export function requiredChangeInspectionGuidance(
  toolName: string,
  args: Record<string, unknown>,
  message: string,
  history: ChatMessage[],
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
): string {
  if (!["git_add", "git_commit", "git_push"].includes(toolName)) return "";
  const lower = userScopeText(message, history).toLowerCase();
  if (!/\b(change|changes|stage|commit|push|review|diff|working tree|workspace)\b/.test(lower)) return "";

  const executed = new Set(toolCallsMade.filter((call) => call.ok).map((call) => call.name));
  const hasStatus = executed.has("git_status");
  const hasDiff = executed.has("git_diff") || executed.has("git_show");

  if (toolName === "git_add" && (!hasStatus || !hasDiff)) {
    const hasPaths = Array.isArray(args["paths"]) && args["paths"].length > 0;
    return hasPaths
      ? "Inspect current changes with git_status and git_diff before requesting approval to stage selected paths."
      : "Inspect current changes with git_status and git_diff, then propose git_add with exact paths or explain why all changed paths should be staged.";
  }

  const hasStagedDiff = toolCallsMade.some((call) =>
    call.ok && call.name === "git_diff" && (call.args.staged === true || call.args.cached === true),
  );
  if (toolName === "git_commit" && prohibitsStaging(message, history) && (!hasStatus || !hasStagedDiff)) {
    return "Verify staged content with git_status and git_diff staged=true before requesting approval to commit.";
  }

  const confirmedContinuation = isConfirmationMessage(message);
  if (toolName === "git_commit" && !prohibitsStaging(message, history) && !executed.has("git_add") &&
      !(confirmedContinuation && historyMentionsExecuted(history, "git_add"))) {
    return "Verify staged content with git_status and git_diff staged=true before requesting approval to commit.";
  }

  if (toolName === "git_push" && !executed.has("git_commit") &&
      !(confirmedContinuation && historyMentionsExecuted(history, "git_commit"))) {
    return "Do not push until the requested commit has been created; inspect current branch/status and propose the commit step first.";
  }

  return "";
}

/**
 * Repository indexing is useful context, but it cannot establish a mutable
 * Git fact such as the active branch or current working-tree state. Keep an
 * agent from returning an indexed-project summary when the user explicitly
 * asked for that live evidence.
 */
export function requiredRepositoryStateEvidenceGuidance(
  toolName: string,
  message: string,
  history: ChatMessage[],
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
): string {
  if (toolName !== "repo_refresh_index") return "";
  const scope = userScopeText(message, history).toLowerCase();
  const asksForLiveState = /\b(?:working[-\s]?tree|uncommitted|current branch|branch status|git status|local changes|changed files)\b/.test(scope);
  if (!asksForLiveState) return "";
  const hasDirectGitEvidence = toolCallsMade.some((call) => call.ok && [
    "git_status",
    "git_current_branch",
    "git_diff",
    "git_show",
  ].includes(call.name));
  if (hasDirectGitEvidence) return "";
  return "The user asked for live Git state. Run git_status (and git_current_branch or git_diff when needed) before repo_refresh_index; indexing alone does not establish the current working tree or branch.";
}

export function outOfScopeWriteMessage(
  toolName: string,
  message: string,
  history: ChatMessage[],
): string {
  const reviewOnlyMessage = reviewOnlyWriteMessage(toolName, message);
  if (reviewOnlyMessage) return reviewOnlyMessage;

  const scope = userScopeText(message, history).toLowerCase();
  if (toolName === "ado_create_pr" && !/\b(pr|pull request)\b/.test(scope)) {
    return "The requested workflow scope does not include creating a pull request. I will stop at the requested Git workflow boundary unless you explicitly ask me to create a PR.";
  }
  if (/work_item|workitem/.test(toolName) && !/\b(work item|workitem|user story|task|bug|link)\b/.test(scope)) {
    return "The requested workflow scope does not include linking work items, and no work item was explicitly selected. I will not link a work item unless you ask for it and provide or select the work item.";
  }
  if (toolName === "ado_trigger_pipeline" && !/\b(pipeline|build|run ci|trigger)\b/.test(scope)) {
    return "The requested workflow scope does not include triggering a pipeline. I will not run the pipeline unless you explicitly ask for it.";
  }
  return "";
}

export function guardReviewOnlyFinalResult(
  result: ChatPlannerResult,
  message: string,
): ChatPlannerResult {
  if (!isReviewOnlyChangeRequest(message)) return result;
  return {
    ...result,
    response: stripReviewOnlyWriteFollowups(result.response),
    suggestions: filterReviewOnlySuggestions(result.suggestions),
    approvalProposal: undefined,
  };
}

export function isReviewOnlyChangeRequest(message: string): boolean {
  if (isExplicitReadOnlyRequest(message)) return true;
  const lower = message.toLowerCase();
  const asksForReview = /\b(review my changes|what changed|inspect diff|review changes|assess changed files|analy[sz]e changed files|changed files|diff|risk before commit|current changes)\b/.test(lower);
  if (!asksForReview) return false;
  const writeIntentText = stripNegatedWriteIntents(lower);
  return !/\b(stage|stage all|stage selected|git add|commit|commit these|commit all|commit my|make a commit|prepare commit|push|publish|create pr|create a pr|open pull request|pull request|run tests?|build)\b/.test(writeIntentText);
}

/**
 * MergePilot's default interaction contract is English. This intentionally
 * narrow, explicit safety boundary lets planners use registered read-only
 * tools but never propose an approval-gated action for a read-only turn.
 */
export function isExplicitReadOnlyRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const hasReadOnlyBoundary = /\b(?:read[-\s]?only|only\s+(?:inspect|review|check)|do not\s+(?:modify|change|write|stage|commit|push|merge|pull|rebase|checkout|switch|stash|restore|delete)|without\s+(?:modifying|changing|writing))\b/.test(lower);
  if (!hasReadOnlyBoundary) return false;

  // A negative clause can limit one operation without invalidating a
  // different, explicitly requested mutation. For example, "pull origin
  // main with rebase; do not push" must allow the approval-gated pull while
  // still preventing the later push. Remove the negated operations first,
  // then see whether a positive mutable action remains in scope.
  const requestedChanges = stripNegatedWriteIntents(lower).replace(/\bpull\s+request\b/g, "");
  return !/\b(?:stage|git add|commit|push|publish|create pr|open pull request|pull\b(?!\s+request)|rebase|merge|checkout|switch|stash|restore|delete|tag|discard|revert|reset|clean|remove|cherry[ -]?pick)\b/.test(requestedChanges);
}

function stripNegatedWriteIntents(text: string): string {
  const writePhrase =
    "(?:stage|staging|stage all|stage selected|git add|commit|committing|commit these|commit all|commit my|make a commit|prepare commit|push|pushing|publish|publishing|create pr|create a pr|open pull request|pull request|pull|rebase|merge|checkout|switch|stash|restore|delete|tag|discard|revert|reset|clean|remove|cherry[ -]?pick|run tests?|build)";
  const negatedWriteList = new RegExp(
    `\\b(?:do not|don't|dont|without|no)\\s+${writePhrase}(?:\\s*,\\s*${writePhrase})*(?:\\s*,?\\s*(?:or|and)\\s*${writePhrase})?`,
    "gi",
  );
  return text.replace(negatedWriteList, "");
}

function reviewOnlyWriteMessage(toolName: string, message: string): string {
  if (!["git_add", "git_commit", "git_push"].includes(toolName)) return "";
  if (!isReviewOnlyChangeRequest(message)) return "";
  return "This is a review-only request. I will summarize the working-tree changes, risks, and validation recommendations without proposing staging, committing, or pushing unless you explicitly ask for that action.";
}

function stripWritePermissionPrompts(text: string): string {
  return text
    .replace(
      /\s*(?:Would you like me to|Do you want me to|Should I|Shall I)\s+(?:stage|commit|push|merge|pull|rebase|checkout|switch|stash|restore|delete|run|rerun|create|open|proceed|continue|apply|trigger|update|retry)\b[^?]*\?/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripReviewOnlyWriteFollowups(text: string): string {
  return stripWritePermissionPrompts(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !isWriteActionSuggestionLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function filterReviewOnlySuggestions(suggestions: string[]): string[] {
  return suggestions.filter((suggestion) => !isWriteActionText(suggestion));
}

function isWriteActionSuggestionLine(line: string): boolean {
  const match = line.match(/^\s*(?:>|›|»|-|\*)\s*(.+?)\s*$/);
  return Boolean(match?.[1]);
}

function isWriteActionText(text: string): boolean {
  return /^(stage|commit|push|merge|pull|rebase|checkout|switch|stash|restore|delete|create|open|trigger|run|rerun|proceed|continue|apply|update|retry)\b/i.test(text.trim());
}

function userScopeText(message: string, history: ChatMessage[]): string {
  const userHistory = history
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content)
    .join("\n");
  return `${userHistory}\n${message}`;
}

function historyMentionsExecuted(history: ChatMessage[], toolName: string): boolean {
  const marker = `[executed] ${toolName}`;
  const confirmedMarker = `[confirmed & executed] ${toolName}`;
  return history.some((entry) =>
    entry.role === "assistant" &&
    (entry.content.includes(marker) || entry.content.includes(confirmedMarker))
  );
}
