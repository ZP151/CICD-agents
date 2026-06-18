import type { PendingToolAction } from "@mergepilot/core";
import type { GitWorkflowProbeResult } from "./gitProbes.js";

export function pushReadinessFromTools(
  tools: GitWorkflowProbeResult["tools"],
): PendingToolAction["readiness"] | undefined {
  const upstreamProbe = tools.find((tool) => tool.name === "git_upstream");
  if (!upstreamProbe) return undefined;
  const upstream = upstreamProbe.ok ? upstreamProbe.stdout.trim() : "";
  if (!upstream) {
    return {
      kind: "push",
      status: "no_upstream",
      summary: "No upstream branch is configured; this push will set upstream on origin.",
    };
  }

  const divergenceProbe = tools.find((tool) => tool.name === "git_divergence");
  if (!divergenceProbe?.ok) {
    return {
      kind: "push",
      status: "unknown",
      upstream,
      summary: `Upstream is ${upstream}, but ahead/behind status could not be determined.`,
    };
  }
  const [behindRaw, aheadRaw] = divergenceProbe.stdout.trim().split(/\s+/);
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
