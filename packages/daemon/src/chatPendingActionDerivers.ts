import {
  type PendingToolAction,
} from "@mergepilot/core";
import type { StoredBubble } from "./chatHistoryStore.js";

const ACTION_DERIVERS: Array<{
  tool: string;
  description: string;
  nextHint: string;
  buildArgs: (response: string, bubbles: StoredBubble[]) => Record<string, unknown>;
}> = [
  {
    tool: "git_add",
    description: "Stage all changes",
    nextHint: "commit staged changes",
    buildArgs: (response) => {
      const paths = extractMentionedPaths(response);
      return paths.length > 0 ? { paths } : {};
    },
  },
  {
    tool: "git_commit",
    description: "Commit staged changes",
    nextHint: "push branch",
    buildArgs: (response) => {
      const quoted = response.match(/["'`]([^"'`\n]{10,120})["'`]/)?.[1];
      const conventional = response.match(/\b(feat|fix|chore|docs|refactor|style|test|ci|build|perf)(\([^)]+\))?:\s*(.+)/i)?.[0];
      const message = quoted ?? conventional ?? "feat: update changes";
      return { message: message.trim() };
    },
  },
  {
    tool: "git_push",
    description: "Push branch to remote",
    nextHint: "done",
    buildArgs: (_response, bubbles) => ({ branch: currentBranchFromBubbles(bubbles) }),
  },
  {
    tool: "git_create_branch",
    description: "Create branch",
    nextHint: "continue workflow",
    buildArgs: (response) => ({ name: extractBranchName(response) ?? "feature/ai-change" }),
  },
  {
    tool: "git_checkout",
    description: "Switch branch or revision",
    nextHint: "continue workflow",
    buildArgs: (response) => ({ ref: extractGitRef(response) ?? "HEAD" }),
  },
  {
    tool: "git_pull",
    description: "Pull changes from remote",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const ref = extractGitRef(response);
      const lower = response.toLowerCase();
      return {
        remote: "origin",
        ...(ref ? { branch: ref.replace(/^origin\//, "") } : {}),
        rebase: lower.includes("rebase"),
        ffOnly: lower.includes("ff-only") || lower.includes("fast-forward only"),
      };
    },
  },
  {
    tool: "git_merge",
    description: "Merge branch or revision",
    nextHint: "continue workflow",
    buildArgs: (response) => ({ ref: extractGitRef(response) ?? "main" }),
  },
  {
    tool: "git_rebase",
    description: "Rebase current branch",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const lower = response.toLowerCase();
      if (/rebase\b.{0,40}\bcontinue\b|\bcontinue\b.{0,40}\brebase\b/.test(lower)) return { action: "continue" };
      if (/rebase\b.{0,40}\babort\b|\babort\b.{0,40}\brebase\b/.test(lower)) return { action: "abort" };
      if (/rebase\b.{0,40}\bskip\b|\bskip\b.{0,40}\brebase\b/.test(lower)) return { action: "skip" };
      return { onto: extractGitRef(response) ?? "main", autostash: lower.includes("autostash") };
    },
  },
  {
    tool: "git_restore",
    description: "Restore files",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const paths = extractMentionedPaths(response);
      return {
        paths,
        staged: response.toLowerCase().includes("unstage") || response.toLowerCase().includes("staged"),
      };
    },
  },
  {
    tool: "git_stash",
    description: "Stash working-tree changes",
    nextHint: "continue workflow",
    buildArgs: (response) => {
      const lower = response.toLowerCase();
      if (lower.includes("pop") || lower.includes("restore")) return { action: "pop" };
      const msg = response.match(/stash(?: message)?:\s*["'`]?([^"'`\n]{4,80})["'`]?/i)?.[1];
      return msg ? { action: "push", message: msg.trim() } : { action: "push" };
    },
  },
  {
    tool: "ado_create_pr",
    description: "Create pull request",
    nextHint: "done",
    buildArgs: (response, bubbles) => {
      const source_branch = currentBranchFromBubbles(bubbles);
      const titleMatch = response.match(/(?:title|PR title|pull request title)[:\s]+["']?([^\n"']{5,100})["']?/i);
      const title = titleMatch?.[1] ?? `Update from ${source_branch}`;
      return { source_branch, title, description: response.slice(0, 300) };
    },
  },
];

export function buildPendingAction(
  tool: string,
  response: string,
  bubbles: StoredBubble[],
): PendingToolAction {
  const deriver = ACTION_DERIVERS.find((entry) => entry.tool === tool);
  if (!deriver) {
    return { tool, args: {}, description: tool, nextHint: "continue workflow" };
  }
  return {
    tool: deriver.tool,
    args: deriver.buildArgs(response, bubbles),
    description: deriver.description,
    nextHint: deriver.nextHint,
  };
}

export function inferWriteToolFromResponse(response: string): string | undefined {
  if (/\b(create|open|raise).{0,20}\b(pull request|pr)\b/.test(response)) return "ado_create_pr";
  if (/\b(rebase)\b/.test(response)) return "git_rebase";
  if (/\bmerge\b/.test(response)) return "git_merge";
  if (/\bpull\b/.test(response) && !/\bpull request\b/.test(response)) return "git_pull";
  if (/\b(restore|discard|revert file|unstage)\b/.test(response) && extractMentionedPaths(response).length > 0) return "git_restore";
  if (/\b(stash|shelve)\b/.test(response)) return "git_stash";
  if (/\b(create).{0,20}\bbranch\b|\bnew branch\b/.test(response)) return "git_create_branch";
  if (/\b(checkout|switch).{0,20}\b(branch|to)\b/.test(response)) return "git_checkout";
  if (/\b(stage|git add|add all)\b/.test(response)) return "git_add";
  if (/\bcommit\b/.test(response)) return "git_commit";
  if (/\bpush\b/.test(response)) return "git_push";
  return undefined;
}

function currentBranchFromBubbles(bubbles: StoredBubble[]): string {
  const branchBubble = [...bubbles].reverse().find((b) => b.toolName === "git_current_branch");
  const raw = branchBubble?.toolResult;
  if (typeof raw === "object" && raw !== null && "stdout" in raw) {
    const branch = String((raw as Record<string, unknown>).stdout).trim();
    if (branch && branch !== "HEAD") return branch;
  }

  const pushBubble = [...bubbles].reverse().find(
    (b) => b.toolName === "git_push" && b.toolOk !== false && b.toolArgs,
  );
  if (pushBubble?.toolArgs && "branch" in pushBubble.toolArgs) {
    const branch = String(pushBubble.toolArgs.branch ?? "").trim();
    if (branch && branch !== "HEAD") return branch;
  }

  const switchBubble = [...bubbles].reverse().find(
    (b) => (b.toolName === "git_create_branch" || b.toolName === "git_checkout") && b.toolArgs,
  );
  if (switchBubble?.toolArgs) {
    const ref = String(switchBubble.toolArgs["name"] ?? switchBubble.toolArgs["ref"] ?? "").trim();
    if (ref && ref !== "HEAD") return ref;
  }

  return "HEAD";
}

function extractBranchName(response: string): string | undefined {
  return response.match(/\b(?:branch\s+(?:named|called)?|named|called)\s+["'`]?([A-Za-z0-9._/-]{3,80})["'`]?/i)?.[1];
}

function extractGitRef(response: string): string | undefined {
  const patterns = [
    /\b(?:checkout|switch)\s+(?:to\s+)?(?:branch\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\brebase\s+(?:onto\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\bmerge\s+(?:into\s+)?["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\bpull\s+["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\b(?:onto|into|from|to|branch|ref)\s+["'`]?([A-Za-z0-9._/-]{2,100})["'`]?/i,
    /\b(origin\/[A-Za-z0-9._/-]{2,100})\b/i,
  ];
  for (const pattern of patterns) {
    const match = response.match(pattern)?.[1];
    if (match) return match.replace(/[.,;:)]+$/, "");
  }
  return undefined;
}

function extractMentionedPaths(response: string): string[] {
  const matches = response.match(/(?:[\w.-]+\/)+[\w.-]+|[\w.-]+\.(?:tsx|ts|jsx|json|js|yaml|yml|scss|css|html|lock|md|py|cs|go|rs|java|kt|sql)/g) ?? [];
  return [...new Set(matches)].slice(0, 20);
}
