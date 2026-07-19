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
    ? "border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))]"
    : "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]";
}
