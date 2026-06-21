import nodeFs from "node:fs";
import nodePath from "node:path";

export interface GitProbeResult {
  name: string;
  command: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  returncode: number;
}

export type GitOperationPhase = "normal" | "rebase" | "merge" | "cherry_pick" | "revert";

export interface GitOperationState {
  status: "normal" | "in_progress" | "conflicted";
  phase: GitOperationPhase;
  conflictFiles: string[];
  summary: string;
}

export function gitOperationStateFromTools(
  repoPath: string,
  statusText: string,
  tools: GitProbeResult[],
): GitOperationState {
  const conflictFiles = conflictFilesFromStatus(statusText);
  const gitDirProbe = tools.find((tool) => tool.name === "git_dir" && tool.ok);
  const gitDir = resolveGitDir(repoPath, gitDirProbe?.stdout ?? "");
  const phase = gitDir ? gitOperationPhaseFromGitDir(gitDir) : "normal";
  const phaseLabel = gitOperationPhaseLabel(phase);

  if (conflictFiles.length > 0) {
    const prefix = phase === "normal"
      ? "Git has unresolved index conflicts"
      : `Git is in ${phaseLabel} with unresolved conflicts`;
    return {
      status: "conflicted",
      phase,
      conflictFiles,
      summary: `${prefix}: ${conflictFiles.slice(0, 8).join(", ")}${conflictFiles.length > 8 ? ", ..." : ""}.`,
    };
  }

  if (phase !== "normal") {
    return {
      status: "in_progress",
      phase,
      conflictFiles: [],
      summary: `Git has an in-progress ${phaseLabel}. Continue, abort, or skip that operation before starting a different Git workflow.`,
    };
  }

  return {
    status: "normal",
    phase: "normal",
    conflictFiles: [],
    summary: "No merge, rebase, cherry-pick, or revert operation is in progress.",
  };
}

export function gitOperationBlockForAction(
  action: string,
  state: GitOperationState,
): { workflowPhase: string; summary: string } | undefined {
  if (state.status === "normal") return undefined;
  if (action === "inspect_environment" || action === "inspect_changes" || action === "refresh_branch") return undefined;
  if (!["checkout_branch", "create_branch", "sync_branch_rebase", "push_branch", "prepare_commit", "create_pr"].includes(action)) return undefined;

  const phase = state.phase === "normal" ? "git" : gitOperationPhaseLabel(state.phase);
  const workflowPhase = state.status === "conflicted"
    ? `${state.phase === "normal" ? "git" : state.phase}_conflict`
    : `${state.phase}_in_progress`;
  const recovery =
    state.phase === "rebase"
      ? "Resolve conflicts, stage only the resolved conflict files, then continue/abort/skip the rebase."
      : state.phase === "merge"
        ? "Resolve conflicts, stage only the resolved conflict files, then finish or abort the merge."
        : `Finish or abort the ${phase} operation before starting another Git workflow.`;
  return {
    workflowPhase,
    summary: `${state.summary} ${recovery}`,
  };
}

export function dirtyWorkingTreeSummary(statusText: string): string {
  const changes = statusText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("## "));
  if (changes.length === 0) return "";
  return `Working tree has ${changes.length} pending change${changes.length === 1 ? "" : "s"}; Git may block the operation or carry changes into the target branch.`;
}

export function gitOperationPhaseLabel(phase: GitOperationPhase): string {
  if (phase === "cherry_pick") return "cherry-pick";
  return phase;
}

function resolveGitDir(repoPath: string, rawGitDir: string): string {
  const gitDir = rawGitDir.trim();
  if (!gitDir) return "";
  return nodePath.isAbsolute(gitDir) ? gitDir : nodePath.resolve(repoPath, gitDir);
}

function gitOperationPhaseFromGitDir(gitDir: string): GitOperationPhase {
  if (nodeFs.existsSync(nodePath.join(gitDir, "rebase-merge")) || nodeFs.existsSync(nodePath.join(gitDir, "rebase-apply"))) return "rebase";
  if (nodeFs.existsSync(nodePath.join(gitDir, "MERGE_HEAD"))) return "merge";
  if (nodeFs.existsSync(nodePath.join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry_pick";
  if (nodeFs.existsSync(nodePath.join(gitDir, "REVERT_HEAD"))) return "revert";
  return "normal";
}

function conflictFilesFromStatus(statusText: string): string[] {
  const unmergedCodes = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  return statusText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("## "))
    .filter((line) => unmergedCodes.has(line.slice(0, 2)))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}
