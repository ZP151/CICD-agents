import type { GitStatusData } from "../toolOutputRenderers.js";

export interface GitDivergenceNotice {
  tone: "info" | "warning";
  label: string;
  blocksPush: boolean;
}

export function gitDivergenceNotice(gitStatus: GitStatusData | null): GitDivergenceNotice | null {
  const ahead = gitStatus?.ahead ?? 0;
  const behind = gitStatus?.behind ?? 0;
  if (ahead <= 0 && behind <= 0) return null;
  if (ahead > 0 && behind > 0) {
    return {
      tone: "warning",
      label: `Diverged: ${ahead} ahead, ${behind} behind`,
      blocksPush: true,
    };
  }
  if (behind > 0) {
    return {
      tone: "warning",
      label: `Behind remote by ${behind}`,
      blocksPush: true,
    };
  }
  return {
    tone: "info",
    label: `Ahead of remote by ${ahead}`,
    blocksPush: false,
  };
}

export function gitDivergenceNoticeClass(tone: GitDivergenceNotice["tone"]): string {
  return tone === "warning"
    ? "border-amber-500/35 bg-amber-500/10 text-amber-700"
    : "border-blue-500/25 bg-blue-500/10 text-blue-700";
}
