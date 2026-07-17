import type {
  getAzurePullRequestById,
  listAzureBuilds,
  listAzurePullRequestChanges,
  listAzurePullRequestPolicyEvaluations,
  listAzurePullRequestThreads,
  listAzurePullRequestWorkItems,
} from "@mergepilot/core";

export function buildWorkflowPrInsight(args: {
  pullRequest: Awaited<ReturnType<typeof getAzurePullRequestById>>;
  threads: Awaited<ReturnType<typeof listAzurePullRequestThreads>>;
  changes: Awaited<ReturnType<typeof listAzurePullRequestChanges>>;
  builds: Awaited<ReturnType<typeof listAzureBuilds>>;
  workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>;
  policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>;
}) {
  const failedBuilds = args.builds.filter((build) =>
    /failed|canceled/i.test(`${build.result} ${build.status}`),
  );
  const activeThreads = args.threads.filter(
    (thread) => thread.comments.length > 0 && String(thread.status) !== "2",
  );
  const failedPolicies = args.policies.filter((policy) =>
    /failed|rejected|error/i.test(policy.status),
  );
  const pendingPolicies = args.policies.filter((policy) =>
    /queued|running|pending|notstarted/i.test(policy.status),
  );
  const changedPaths = args.changes.changes
    .map((change) => change.path || change.originalPath)
    .filter(Boolean);
  const readiness =
    failedBuilds.length > 0 || failedPolicies.some((policy) => policy.isBlocking)
      ? "blocked"
      : activeThreads.length > 0 || pendingPolicies.length > 0
        ? "needs attention"
        : "ready";
  const lines = [
    `PR #${args.pullRequest.id}: ${args.pullRequest.title}`,
    `Readiness: ${readiness}. ${args.changes.fileCount} changed file(s), ${activeThreads.length} active thread(s), ${failedBuilds.length} failed/canceled build(s), ${failedPolicies.length} failed/error policy evaluation(s), ${args.workItems.length} linked work item(s).`,
  ];
  if (changedPaths.length > 0) {
    lines.push(
      `Touched areas: ${changedPaths.slice(0, 10).join(", ")}${changedPaths.length > 10 ? ", ..." : ""}.`,
    );
  }
  if (failedBuilds.length > 0) {
    lines.push(
      `Blocking builds: ${failedBuilds.slice(0, 5).map(formatBuildReadinessSignal).join("; ")}.`,
    );
  }
  if (failedPolicies.length > 0) {
    lines.push(
      `Policy blockers: ${failedPolicies.slice(0, 5).map(formatPolicyReadinessSignal).join("; ")}.`,
    );
  }
  if (activeThreads.length > 0) {
    lines.push(
      `Active threads: ${activeThreads.slice(0, 5).map(formatThreadReadinessSignal).join("; ")}.`,
    );
  }
  if (args.workItems.length > 0) {
    lines.push(
      `Linked work items: ${args.workItems.slice(0, 5).map(formatWorkItemReadinessSignal).join("; ")}.`,
    );
  }
  if (!args.pullRequest.description.trim()) lines.push("Risk signal: PR description is empty.");
  if (args.workItems.length === 0) lines.push("Info: no linked work items were found.");
  if (pendingPolicies.length > 0)
    lines.push(`Waiting: ${pendingPolicies.length} policy evaluation(s) are pending/running.`);
  return { readiness, summary: lines.join("\n") };
}

export function summarizePolicies(
  pullRequestId: number,
  policies: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>,
): string {
  if (policies.length === 0)
    return `PR #${pullRequestId} has no policy evaluations returned by Azure DevOps.`;
  const blocking = policies.filter((policy) => policy.isBlocking);
  const failed = policies.filter((policy) => /failed|rejected|error/i.test(policy.status));
  const pending = policies.filter((policy) =>
    /queued|running|pending|notstarted/i.test(policy.status),
  );
  return [
    `PR #${pullRequestId} policy status: ${policies.length} evaluation(s).`,
    `${blocking.length} blocking, ${failed.length} failed/error, ${pending.length} pending/running.`,
    ...policies
      .slice(0, 8)
      .map(
        (policy) =>
          `- ${policy.displayName || policy.typeName || policy.configurationId}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`,
      ),
  ].join("\n");
}

export function summarizeWorkItems(
  pullRequestId: number,
  workItems: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>,
): string {
  if (workItems.length === 0) return `PR #${pullRequestId} has no linked work items.`;
  return [
    `PR #${pullRequestId} has ${workItems.length} linked work item(s).`,
    ...workItems
      .slice(0, 10)
      .map(
        (item) =>
          `- #${item.id} ${item.type}${item.state ? ` [${item.state}]` : ""}: ${item.title}`,
      ),
  ].join("\n");
}

function compactInlineText(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatBuildReadinessSignal(
  build: Awaited<ReturnType<typeof listAzureBuilds>>[number],
): string {
  const id = build.id ? `#${build.id}` : "build";
  const buildNumber =
    build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
  const definition = build.definitionName ? ` ${compactInlineText(build.definitionName, 48)}` : "";
  const result = build.result || build.status || "not available";
  return `${id}${buildNumber}${definition}: ${result}`;
}

function formatPolicyReadinessSignal(
  policy: Awaited<ReturnType<typeof listAzurePullRequestPolicyEvaluations>>[number],
): string {
  const name = policy.displayName || policy.typeName || `policy ${policy.configurationId}`;
  return `${compactInlineText(name, 72)}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`;
}

function formatThreadReadinessSignal(
  thread: Awaited<ReturnType<typeof listAzurePullRequestThreads>>[number],
): string {
  const firstComment = thread.comments[0]?.content
    ? compactInlineText(thread.comments[0].content, 80)
    : "active discussion";
  return `#${thread.id}: ${firstComment}`;
}

function formatWorkItemReadinessSignal(
  item: Awaited<ReturnType<typeof listAzurePullRequestWorkItems>>[number],
): string {
  return `#${item.id} ${item.type}${item.state ? ` [${item.state}]` : ""}: ${compactInlineText(item.title, 80)}`;
}
