import type { ChatWorkflowActionResult } from "../../api.js";
import type { DiffStats } from "./layout/workspacePanel.types.js";
import { parseGitDiff, parseGitStatus, type GitStatusData } from "./toolOutputRenderers.js";

/** Short-lived, non-conversational Git facts shown in Context. */
export interface WorkspaceContextSnapshot {
  currentBranch?: string;
  gitStatus?: GitStatusData;
  branchList?: string[];
  diffStats?: DiffStats;
}

export function workspaceContextSnapshotFromResult(
  result: Pick<ChatWorkflowActionResult, "tools">,
): WorkspaceContextSnapshot {
  const snapshot: WorkspaceContextSnapshot = {};

  for (const tool of result.tools) {
    if (!tool.ok) continue;
    const stdout = tool.stdout.trim();
    if (tool.name === "git_current_branch") {
      if (stdout) snapshot.currentBranch = stdout.split(/\r?\n/)[0]?.trim();
      continue;
    }
    if (tool.name === "git_status") {
      const status = parseGitStatus(tool.stdout);
      snapshot.gitStatus = status;
      if (status.branch) snapshot.currentBranch = status.branch;
      continue;
    }
    if (tool.name === "git_branch_list") {
      snapshot.branchList = stdout
        .split(/\r?\n/)
        .map((branch) => branch.replace(/^\*\s*/, "").trim())
        .filter(Boolean);
      continue;
    }
    if (tool.name === "git_diff") {
      const files = parseGitDiff(tool.stdout);
      snapshot.diffStats = {
        files: files.length,
        added: files.reduce((sum, file) => sum + file.added, 0),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
      };
    }
  }

  return snapshot;
}

export function mergeWorkspaceContextSnapshot(
  current: WorkspaceContextSnapshot | null,
  next: WorkspaceContextSnapshot,
): WorkspaceContextSnapshot {
  return { ...current, ...next };
}
