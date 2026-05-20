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

  if (lower.includes("summarize") && lower.includes("change")) {
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

  if (lower.match(/branch|pr|pull request|raise|open/)) {
    const branchName = workItem ? `feature/wi-${workItem}` : `feature/${slugify(text)}`;
    const steps: PlannedStep[] = [
      { tool: "git_current_branch", args: {}, note: "check current branch" },
      { tool: "git_create_branch", args: { name: branchName }, note: "create feature branch" },
      { tool: "git_push", args: { branch: branchName }, note: "push to origin" },
      {
        tool: "ado_create_pr",
        args: {
          source_branch: branchName,
          target_branch: "main",
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
