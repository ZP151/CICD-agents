export interface ChatCheckpointActivity {
  id: string;
  sessionId: string;
  repoPath: string;
  projectLinkId?: string;
  at: number;
  toolName: string;
  toolSummary?: string;
  toolOk?: boolean;
  checkpointId: string;
  checkpointPath: string;
  safetyCheckpointId?: string;
  safetyCheckpointPath?: string;
  targetCheckpointId?: string;
  applyMode?: string;
  restoredFiles?: string[];
}

export interface ChatCheckpointPreview {
  ok: boolean;
  checkpointId: string;
  path: string;
  createdAt: string;
  repoPath: string;
  reason: string;
  branch: string;
  head: string;
  statusLines: string[];
  files: string[];
  diffPreview: string;
  diffChars: number;
  diffTruncated: boolean;
}

export interface ChatCheckpointRollbackPlan {
  ok: boolean;
  checkpointId: string;
  repoPath: string;
  branch: string;
  head: string;
  supported: boolean;
  mode: "apply_checkpoint_patch" | "already_at_checkpoint" | "restore_tracked_to_clean_checkpoint" | "untracked_only";
  reason: string;
  checkpointFiles: string[];
  currentStatusLines: string[];
  currentTrackedPaths: string[];
  currentUntrackedPaths: string[];
  requiredCapability?: string;
  proposal: null | {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    nextHint?: string;
  };
  warnings: string[];
}
