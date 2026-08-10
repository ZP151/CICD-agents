import type { Tool } from "./executor.js";

export interface PlannedStep {
  tool: string;
  args: Record<string, unknown>;
  note: string;
}

export interface IntentPlan {
  intent: string;
  steps: PlannedStep[];
  notes: string;
}

// Deterministic offline translator. The LLM-driven path (gitIntentTool)
// returns the same shape but lets the planner customise step args.
export function translateIntent(text: string): IntentPlan {
  const lower = text.toLowerCase().trim();

  const branchMatch = lower.match(/(?:branch|pr)[^0-9]*([0-9]{2,})/);
  const workItem = branchMatch ? Number(branchMatch[1]) : null;
  const explicitBranch = extractBranchName(text);
  const path = extractPath(text);

  if (lower.match(/summari[sz]e|review|inspect|what'?s changed|what changed/) && lower.match(/change|diff|working tree|staged/)) {
    return {
      intent: "summarize-changes",
      notes: "describe what's staged or recently modified",
      steps: [
        { tool: "git_status", args: {}, note: "see what's modified" },
        { tool: "git_diff", args: { name_only: true }, note: "list changed files" },
        { tool: "git_diff", args: {}, note: "full diff for summary" },
      ],
    };
  }

  if (lower.match(/stash|shelve/) && !lower.match(/rebase|merge|autostash|auto stash/)) {
    return {
      intent: "stash-changes",
      notes: "stash current working-tree changes before switching context",
      steps: [
        { tool: "git_status", args: {}, note: "inspect changes before stashing" },
        { tool: "git_stash", args: { action: "push" }, note: "stash local changes" },
      ],
    };
  }

  if (lower.match(/restore|discard|revert file|checkout file/) && path) {
    return {
      intent: "restore-path",
      notes: "restore a specific path after checking local status",
      steps: [
        { tool: "git_status", args: {}, note: "inspect working tree before restore" },
        { tool: "git_restore", args: { paths: [path], staged: lower.includes("staged") || lower.includes("index") }, note: "restore requested path" },
      ],
    };
  }

  if (lower.match(/fetch|compare|behind|ahead|upstream|remote state/)) {
    const target = extractCompareTarget(text) ?? explicitBranch ?? "origin/main";
    return {
      intent: "compare-with-remote",
      notes: "fetch remotes and compare the current branch with a target ref",
      steps: [
        { tool: "git_fetch", args: {}, note: "refresh remote refs" },
        { tool: "git_status", args: { short: true, branch: true }, note: "inspect local tracking state" },
        { tool: "git_merge_base", args: { left: target, right: "HEAD" }, note: "find common ancestor" },
        { tool: "git_diff", args: { target_branch: target, stat: true }, note: "summarize branch diff" },
      ],
    };
  }

  if (lower.match(/pull|update (my )?branch|get latest/)) {
    return {
      intent: "pull-latest",
      notes: "pull remote changes into the current branch after checking status",
      steps: [
        { tool: "git_status", args: { short: true, branch: true }, note: "ensure the working tree state is known" },
        { tool: "git_pull", args: { rebase: lower.includes("rebase"), ffOnly: lower.includes("ff-only") || lower.includes("fast-forward") }, note: "pull latest changes" },
      ],
    };
  }

  if (lower.match(/rebase/)) {
    if (!explicitBranch) {
      return targetBranchRequiredPlan("rebase-branch", "rebase");
    }
    return {
      intent: "rebase-branch",
      notes: "rebase the current branch onto a requested target",
      steps: [
        { tool: "git_status", args: { short: true, branch: true }, note: "inspect dirty state before rebase" },
        { tool: "git_rebase", args: { onto: explicitBranch, autostash: lower.includes("autostash") || lower.includes("auto stash") }, note: "rebase current branch" },
      ],
    };
  }

  if (lower.match(/merge/)) {
    if (!explicitBranch) {
      return targetBranchRequiredPlan("merge-branch", "merge");
    }
    return {
      intent: "merge-branch",
      notes: "merge the requested ref after checking working-tree state",
      steps: [
        { tool: "git_status", args: { short: true, branch: true }, note: "inspect dirty state before merge" },
        { tool: "git_merge", args: { ref: explicitBranch, ffOnly: lower.includes("ff-only") || lower.includes("fast-forward") }, note: "merge requested ref" },
      ],
    };
  }

  if (lower.match(/switch|checkout/) && explicitBranch) {
    return {
      intent: "switch-branch",
      notes: "switch to an existing branch after checking local changes",
      steps: [
        { tool: "git_status", args: { short: true, branch: true }, note: "check for local changes before switching" },
        { tool: "git_switch", args: { branch: explicitBranch }, note: "switch branch" },
      ],
    };
  }

  if (lower.match(/test|pytest|vitest|dotnet test/)) {
    return {
      intent: "suggest-tests",
      notes: "find tests likely affected by recent changes",
      steps: [
        { tool: "git_diff", args: { name_only: true }, note: "list changed files" },
        { tool: "git_status", args: {}, note: "double-check staged set" },
      ],
    };
  }

  if (lower.match(/commit|amend/) && !lower.match(/\bpr\b|pull request|raise|open/)) {
    return {
      intent: "commit-changes",
      notes: "review and commit the requested change set",
      steps: [
        { tool: "git_status", args: { short: true, branch: true }, note: "inspect current staged and unstaged changes" },
        { tool: "git_diff", args: { stat: true }, note: "summarize unstaged change scope" },
        { tool: "git_add", args: {}, note: "stage changes after user approval" },
        { tool: "git_commit", args: { message: (text.trim() || "Update project").slice(0, 80), amend: lower.includes("amend") }, note: "create commit" },
      ],
    };
  }

  if (lower.match(/push|publish/) && !lower.match(/\bpr\b|pull request|raise|open/)) {
    return {
      intent: "push-branch",
      notes: "push the current branch to the configured remote",
      steps: [
        { tool: "git_current_branch", args: {}, note: "identify branch to push" },
        { tool: "git_status", args: { short: true, branch: true }, note: "inspect branch state before push" },
        { tool: "git_push", args: { branch: explicitBranch ?? "<current_branch>" }, note: "push branch" },
      ],
    };
  }

  if (lower.match(/branch|pr|pull request|raise|open/)) {
    const targetBranch = extractPullRequestTarget(text);
    if (!targetBranch) {
      return targetBranchRequiredPlan("create-pr", "create a pull request");
    }
    const branchName = extractPullRequestSource(text) ?? explicitBranch ?? (workItem ? `feature/wi-${workItem}` : `feature/${slugify(text)}`);
    const steps: PlannedStep[] = [
      { tool: "git_current_branch", args: {}, note: "check current branch" },
      { tool: "git_create_branch", args: { name: branchName }, note: "create feature branch" },
      { tool: "git_push", args: { branch: branchName }, note: "push to origin" },
      {
        tool: "ado_create_pr",
        args: {
          source_branch: branchName,
          target_branch: targetBranch,
          title: workItem ? `Work item ${workItem}` : (text.trim() || "Automated PR").slice(0, 80),
          description: workItem
            ? `Work Item: AB#${workItem}\n\n${text.trim()}`
            : text.trim(),
        },
        note: "open the PR",
      },
    ];
    if (workItem) {
      steps.push({
        tool: "ado_link_work_item",
        args: { work_item_id: workItem, pull_request_id: "<pr_id_from_previous_step>" },
        note: "link work item",
      });
    }
    return { intent: "create-pr", notes: "open a PR for the staged changes", steps };
  }

  return {
    intent: "inspect",
    notes: "fallback: inspect status and recent log",
    steps: [
      { tool: "git_status", args: {}, note: "what's modified" },
      { tool: "git_log", args: { limit: 10 }, note: "recent commits" },
    ],
  };
}

function extractBranchName(text: string): string | null {
  const match = text.match(/\b(?:checkout|switch to|onto|merge|rebase(?: onto)?|push)\s+([A-Za-z0-9._/@-]+)/i);
  return cleanBranchMatch(match?.[1]);
}

function extractCompareTarget(text: string): string | null {
  const match = text.match(/\b(?:with|against|to)\s+([A-Za-z0-9._/@-]+)/i);
  if (!match?.[1]) return null;
  const value = match[1].replace(/[.,;:!?]+$/, "");
  return value.length > 0 ? value : null;
}

function extractPullRequestSource(text: string): string | null {
  const match = text.match(/\b(?:from|for\s+branch)\s+([A-Za-z0-9._/@-]+)/i);
  return cleanBranchMatch(match?.[1]);
}

function extractPullRequestTarget(text: string): string | null {
  const match = text.match(/\b(?:into|to|target(?:\s+branch)?|base(?:\s+branch)?)\s+([A-Za-z0-9._/@-]+)/i);
  return cleanBranchMatch(match?.[1]);
}

function cleanBranchMatch(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[.,;:!?]+$/, "");
  if (new Set(["the", "current", "latest", "changes", "change", "branch"]).has(cleaned.toLowerCase())) return null;
  return cleaned.length > 0 ? cleaned : null;
}

function targetBranchRequiredPlan(intent: string, operation: string): IntentPlan {
  return {
    intent,
    notes: `A target branch is required before I can ${operation}; ask the user to specify it.`,
    steps: [
      { tool: "git_status", args: { short: true, branch: true }, note: "inspect current branch while waiting for a target" },
    ],
  };
}

function extractPath(text: string): string | null {
  const quoted = text.match(/["'`]([^"'`]+\.[A-Za-z0-9]+)["'`]/);
  if (quoted?.[1]) return quoted[1];
  const pathLike = text.match(/\b([A-Za-z0-9_.@/-]+\.[A-Za-z0-9]+)\b/);
  return pathLike?.[1] ?? null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    || "ai-change";
}

export function gitIntentTool(): Tool {
  return {
    name: "git_intent_translator",
    description:
      "Translate a free-form natural-language git intent into a planned sequence of " +
      "tool calls (without executing them). Use this when the user asks 'create a PR for...', " +
      "'summarize my staged changes', or 'what tests should I run for the files I touched?'.",
    parameters: {
      type: "object",
      required: ["intent"],
      properties: {
        intent: { type: "string", description: "user request, e.g. 'create a branch and PR for work item 1234'" },
      },
    },
    handler: async (_ctx, payload) => {
      const text = String(payload["intent"] ?? "");
      return translateIntent(text) as unknown as Record<string, unknown>;
    },
  };
}
