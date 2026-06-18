import path from "node:path";
import {
  runCommand,
  type PendingToolAction,
} from "@mergepilot/core";

export interface GitRecoveryOperation {
  phase: string;
  label: string;
  displayName: string;
}

export function isGitRecoveryTool(tool: string): boolean {
  return ["git_rebase", "git_merge", "git_cherry_pick", "git_revert"].includes(tool);
}

export function gitRecoveryOperationFromTool(tool: string): GitRecoveryOperation | null {
  if (tool === "git_rebase") return { phase: "rebase", label: "Rebase", displayName: "rebase" };
  if (tool === "git_merge") return { phase: "merge", label: "Merge", displayName: "merge" };
  if (tool === "git_cherry_pick") return { phase: "cherry_pick", label: "Cherry-pick", displayName: "cherry-pick" };
  if (tool === "git_revert") return { phase: "revert", label: "Revert", displayName: "revert" };
  return null;
}

export function gitRecoveryOperationFromPhase(phase: string): GitRecoveryOperation | null {
  if (phase === "rebase") return { phase: "rebase", label: "Rebase", displayName: "rebase" };
  if (phase === "merge") return { phase: "merge", label: "Merge", displayName: "merge" };
  if (phase === "cherry_pick") return { phase: "cherry_pick", label: "Cherry-pick", displayName: "cherry-pick" };
  if (phase === "revert") return { phase: "revert", label: "Revert", displayName: "revert" };
  return null;
}

export async function generateCommitMessageForRepo(repoPath: string): Promise<string> {
  const diffProbe = await runCommand(["git", "diff", "--cached", "--name-status"], {
    cwd: repoPath,
    allowed: ["git"],
    timeoutSec: 10,
  });
  if (diffProbe.returncode !== 0) return "chore: update project files";
  const entries = parseNameStatus(diffProbe.stdout ?? "");
  if (entries.length === 0) return "chore: update project files";

  const types = entries.map((entry) => commitTypeForPath(entry.path));
  const type = types.every((candidate) => candidate === types[0]) ? types[0] : "chore";
  if (entries.length === 1) {
    const entry = entries[0]!;
    return `${type}: ${commitVerbForStatus(entry.status)} ${commitSubjectForPath(entry.path)}`;
  }
  return `${type}: update ${entries.length} files`;
}

export async function pushReadinessForRepo(repoPath: string): Promise<PendingToolAction["readiness"]> {
  const upstreamProbe = await runCommand(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    cwd: repoPath,
    allowed: ["git"],
    timeoutSec: 10,
  });
  const upstream = upstreamProbe.returncode === 0 ? (upstreamProbe.stdout ?? "").trim() : "";
  if (!upstream) {
    return {
      kind: "push",
      status: "no_upstream",
      summary: "No upstream branch is configured; this push will set upstream on origin.",
    };
  }

  const divergenceProbe = await runCommand(["git", "rev-list", "--left-right", "--count", `${upstream}...HEAD`], {
    cwd: repoPath,
    allowed: ["git"],
    timeoutSec: 10,
  });
  if (divergenceProbe.returncode !== 0) {
    return {
      kind: "push",
      status: "unknown",
      upstream,
      summary: `Upstream is ${upstream}, but ahead/behind status could not be determined.`,
    };
  }
  const [behindRaw, aheadRaw] = (divergenceProbe.stdout ?? "").trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? "0", 10) || 0;
  const ahead = Number.parseInt(aheadRaw ?? "0", 10) || 0;
  const status =
    behind > 0 && ahead > 0 ? "diverged"
      : behind > 0 ? "behind"
        : ahead > 0 ? "ahead"
          : "up_to_date";
  const summary =
    status === "diverged"
      ? `Branch has diverged from ${upstream}: ahead ${ahead}, behind ${behind}. Consider pull/rebase before pushing.`
      : status === "behind"
        ? `Branch is behind ${upstream} by ${behind} commit${behind === 1 ? "" : "s"}. Push may fail until you pull or rebase.`
        : status === "ahead"
          ? `Branch is ahead of ${upstream} by ${ahead} commit${ahead === 1 ? "" : "s"}.`
          : `Branch is up to date with ${upstream}.`;
  return {
    kind: "push",
    status,
    upstream,
    ahead,
    behind,
    summary,
  };
}

function parseNameStatus(output: string): Array<{ status: string; path: string }> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/).filter(Boolean);
      const status = (parts[0] ?? "M").slice(0, 1);
      const filePath = parts.length >= 3 ? parts[2]! : parts[1] ?? "";
      return { status, path: filePath };
    })
    .filter((entry) => entry.path);
}

function commitTypeForPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.startsWith("docs/") || normalized.endsWith(".md") || normalized.endsWith(".mdx")) return "docs";
  if (normalized.includes(".test.") || normalized.includes(".spec.") || normalized.startsWith("test/") || normalized.includes("/test/")) return "test";
  if (normalized.startsWith(".github/workflows/") || normalized.includes("/workflows/")) return "ci";
  if (normalized.endsWith("package.json") || normalized.endsWith("pnpm-lock.yaml") || normalized.endsWith("package-lock.json")) return "build";
  return "chore";
}

function commitVerbForStatus(status: string): string {
  if (status === "A") return "add";
  if (status === "D") return "remove";
  if (status === "R") return "rename";
  return "update";
}

function commitSubjectForPath(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() || "project files";
}
