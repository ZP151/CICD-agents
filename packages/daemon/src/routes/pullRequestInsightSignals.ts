import type {
  listAzureBuilds,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
} from "@mergepilot/core";
import type { loadPullRequestContext } from "./pullRequestInsight.js";

export function buildPrReadinessSignalMetadata(args: {
  builds: Awaited<ReturnType<typeof listAzureBuilds>>;
  policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
  threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
  workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
}) {
  const buildBlockers = args.builds
    .filter((build) => /failed|canceled/i.test(build.result))
    .slice(0, 10)
    .map((build) => ({
      id: build.id,
      buildNumber: build.buildNumber,
      definitionName: build.definitionName,
      status: build.status,
      result: build.result,
      url: build.url,
    }));
  const policyBlockers = args.policies
    .filter((policy) => /failed|rejected|error/i.test(policy.status))
    .slice(0, 10)
    .map((policy) => ({
      id: policy.id,
      name: policy.displayName || policy.typeName || `policy ${policy.configurationId}`,
      typeName: policy.typeName,
      status: policy.status,
      isBlocking: policy.isBlocking,
    }));
  const activeThreads = args.threads
    .filter((thread) => thread.comments.length > 0 && String(thread.status) !== "2")
    .slice(0, 10)
    .map((thread) => ({
      id: thread.id,
      status: thread.status,
      author: thread.comments[0]?.author?.displayName ?? "",
      firstComment: compactInlineText(thread.comments[0]?.content ?? "", 160),
    }));
  const linkedWorkItems = args.workItems.slice(0, 20).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    state: item.state,
    url: item.url,
  }));
  return {
    failedPolicyCount: policyBlockers.length,
    buildBlockers,
    policyBlockers,
    activeThreads,
    linkedWorkItems,
  };
}

export function heuristicPrInsight(args: {
  title: string;
  description: string;
  fileCount: number;
  threadCount: number;
  unresolvedThreadCount: number;
  failedBuildCount: number;
  changedPaths: string[];
}): string {
  const lines: string[] = [];
  lines.push(
    `PR insight for "${args.title || "untitled PR"}": ${args.fileCount} changed file(s), ${args.threadCount} thread(s), and ${args.failedBuildCount} failed build(s).`,
  );
  if (args.unresolvedThreadCount > 0)
    lines.push(`${args.unresolvedThreadCount} thread(s) may need attention before merge.`);
  if (args.failedBuildCount > 0)
    lines.push(
      "Pipeline history includes failed or canceled builds; inspect the latest run before approving.",
    );
  if (args.changedPaths.length > 0)
    lines.push(
      `Touched areas: ${args.changedPaths.slice(0, 8).join(", ")}${args.changedPaths.length > 8 ? ", ..." : ""}.`,
    );
  if (args.description)
    lines.push("The PR description is available and should be checked against the changed files.");
  return lines.join("\n");
}

export function buildPrInsightSignals(args: {
  description: string;
  fileCount: number;
  threadCount: number;
  unresolvedThreadCount: number;
  failedBuildCount: number;
  workItemCount: number;
  changedPaths: string[];
}) {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  if (args.failedBuildCount > 0) blocking.push(`${args.failedBuildCount} failed/canceled build(s)`);
  if (args.unresolvedThreadCount > 0)
    warnings.push(`${args.unresolvedThreadCount} active thread(s)`);
  if (args.fileCount >= 20) {
    warnings.push(`large PR: ${args.fileCount} changed file(s)`);
  } else if (args.fileCount >= 10) {
    info.push(`medium-sized PR: ${args.fileCount} changed file(s)`);
  }
  if (!args.description.trim()) warnings.push("missing PR description");
  if (args.workItemCount === 0) info.push("no linked work items");
  const touched = args.changedPaths.map((path) => path.toLowerCase());
  if (
    touched.some(
      (path) => path.includes("auth") || path.includes("security") || path.includes("permission"),
    )
  ) {
    warnings.push("security/auth-sensitive files changed");
  }
  if (
    touched.some(
      (path) => path.includes("migration") || path.includes("schema") || path.endsWith(".sql"),
    )
  ) {
    warnings.push("database/schema files changed");
  }
  const readiness =
    blocking.length > 0 ? "blocked" : warnings.length > 0 ? "needs_attention" : "ready";
  return {
    readiness,
    risks: [...blocking, ...warnings],
    categories: { blocking, warnings, info },
  };
}

export function buildPrInsightPrompt(args: {
  pullRequest: Awaited<ReturnType<typeof loadPullRequestContext>>["pullRequest"];
  changes: Awaited<ReturnType<typeof loadPullRequestContext>>["changes"];
  builds: Awaited<ReturnType<typeof loadPullRequestContext>>["builds"];
  policies: Awaited<ReturnType<typeof loadPullRequestContext>>["policies"];
  workItems: Awaited<ReturnType<typeof loadPullRequestContext>>["workItems"];
  changedPaths: string[];
  threadCount: number;
  unresolvedThreadCount: number;
  failedBuildCount: number;
  failedPolicyCount: number;
}): string {
  return [
    `PR #${args.pullRequest.id}: ${args.pullRequest.title}`,
    `Description: ${args.pullRequest.description || "(none)"}`,
    `Source: ${args.pullRequest.sourceBranch} -> ${args.pullRequest.targetBranch}`,
    `Files (${args.changes.fileCount}): ${args.changedPaths.slice(0, 30).join(", ") || "(none)"}`,
    `Threads: ${args.threadCount}, likely active: ${args.unresolvedThreadCount}`,
    `Builds: ${args.builds.length}, failed/canceled: ${args.failedBuildCount}`,
    `Policies: ${args.policies.length}, failed/error: ${args.failedPolicyCount}`,
    `Work items: ${args.workItems.map((item) => `#${item.id} ${item.title}`.trim()).join(", ") || args.pullRequest.workItemRefs.map((item) => item.id).join(", ") || "(none)"}`,
    "",
    "Write a concise PR insight summary for a developer. Include risk signals, readiness, and next checks. Do not invent code details.",
  ].join("\n");
}

function compactInlineText(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
