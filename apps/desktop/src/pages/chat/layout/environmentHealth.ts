/**
 * Environment health state machine (MP-007, RA-025..RA-028).
 *
 * One typed snapshot answers "what is the environment, is it safe, what can I
 * do next": `not configured / checking / ready / degraded / blocked`. Every
 * non-ready state carries a reason and a repair action; recoverable items are
 * never just red text.
 */

export type EnvironmentHealthState = "not_configured" | "checking" | "ready" | "degraded" | "blocked";

export interface EnvironmentHealthCheck {
  key: string;
  label: string;
  state: "ok" | "missing" | "error";
  reason?: string;
  repair?: string;
}

export interface EnvironmentHealthSnapshot {
  state: EnvironmentHealthState;
  /** One primary next action per snapshot; the rest live in the panels. */
  primaryAction: string;
  reason: string;
  checks: EnvironmentHealthCheck[];
}

export interface EnvironmentHealthInput {
  repoPath: string;
  busy: boolean;
  gitKnown: boolean;
  adoReady: boolean;
  projectLinkCount: number;
  blockedReason?: string;
}

export function environmentHealth(input: EnvironmentHealthInput): EnvironmentHealthSnapshot {
  const checks: EnvironmentHealthCheck[] = [];
  const hasRepoPath = Boolean(input.repoPath.trim());

  checks.push({
    key: "repository",
    label: "Local repository",
    state: hasRepoPath ? "ok" : "missing",
    reason: hasRepoPath ? undefined : "No local repository is selected.",
    repair: hasRepoPath ? undefined : "Choose a repository folder above.",
  });
  checks.push({
    key: "git_state",
    label: "Git state",
    state: input.gitKnown ? "ok" : "missing",
    reason: input.gitKnown ? undefined : "Branch and change state have not been checked yet.",
    repair: input.gitKnown ? undefined : "Run a quick environment inspection.",
  });
  checks.push({
    key: "project_link",
    label: "Project Link",
    state: input.adoReady ? "ok" : "missing",
    reason: input.adoReady ? undefined : "No Azure DevOps Project Link is connected for this workspace.",
    repair: input.adoReady ? undefined : "Link a Project or open Project Links.",
  });

  if (!hasRepoPath) {
    return {
      state: "not_configured",
      primaryAction: "Choose a repository",
      reason: "Pick a local repository folder to start.",
      checks,
    };
  }
  if (input.busy) {
    return {
      state: "checking",
      primaryAction: "Checking…",
      reason: "Refreshing repository and Azure DevOps state.",
      checks,
    };
  }
  if (input.blockedReason) {
    return {
      state: "blocked",
      primaryAction: "Resolve the blocked step",
      reason: input.blockedReason,
      checks: [
        ...checks,
        {
          key: "workflow",
          label: "Workflow",
          state: "error",
          reason: input.blockedReason,
          repair: "Resolve the pending step or start a new action.",
        },
      ],
    };
  }
  const missing = checks.filter((check) => check.state !== "ok");
  if (missing.length === 0) {
    return {
      state: "ready",
      primaryAction: "Re-check",
      reason: "Repository, git state and Project Link are ready.",
      checks,
    };
  }
  return {
    state: "degraded",
    primaryAction: missing[0]!.repair ?? "Re-check",
    reason: missing.map((check) => check.reason).filter(Boolean).join(" "),
    checks,
  };
}
