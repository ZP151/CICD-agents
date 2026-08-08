/**
 * Deployment readiness bundle (Cycle 05).
 *
 * Pure assembly of environment facts into a readiness decision. The product
 * never claims readiness when required evidence cannot be read; missing
 * evidence is reported. Production approval and rollback require critical
 * confirmation at the action layer.
 */
import type { ArtifactRef } from "./artifactRef.js";

export interface DeploymentReadiness {
  environment: ArtifactRef & { kind: "environment" };
  pendingDeployment?: ArtifactRef & { kind: "deployment" };
  currentDeployment?: ArtifactRef & { kind: "deployment" };
  lastGoodDeployment?: ArtifactRef & { kind: "deployment" };
  commits: ArtifactRef[];
  workItems: ArtifactRef[];
  pullRequests: ArtifactRef[];
  builds: ArtifactRef[];
  tests: Array<{ name: string; status: string }>;
  checks: Array<{ name: string; status: "passed" | "failed" | "pending" | "unknown"; owner?: string }>;
  approvals: Array<{ name: string; status: "approved" | "pending" | "rejected"; owner?: string }>;
  openIncidents: ArtifactRef[];
  missingEvidence: string[];
  recommendation: "ready" | "wait" | "reject" | "insufficient_evidence";
}

export interface DeploymentReadinessInput {
  environment: ArtifactRef & { kind: "environment" };
  pendingDeployment?: ArtifactRef & { kind: "deployment" };
  currentDeployment?: ArtifactRef & { kind: "deployment" };
  lastGoodDeployment?: ArtifactRef & { kind: "deployment" };
  commits: ArtifactRef[];
  workItems: ArtifactRef[];
  pullRequests: ArtifactRef[];
  builds: Array<ArtifactRef & { kind: "build" }>;
  tests: Array<{ name: string; status: string }>;
  checks: Array<{ name: string; status: "passed" | "failed" | "pending" | "unknown"; owner?: string }>;
  approvals: Array<{ name: string; status: "approved" | "pending" | "rejected"; owner?: string }>;
  openIncidents: ArtifactRef[];
  /** Evidence that could not be read (permission, API gap). */
  unreadEvidence: string[];
}

export function buildDeploymentReadiness(input: DeploymentReadinessInput): DeploymentReadiness {
  const missingEvidence = [...input.unreadEvidence];

  // If required evidence cannot be read, never claim readiness.
  if (missingEvidence.length > 0) {
    return {
      environment: input.environment,
      pendingDeployment: input.pendingDeployment,
      currentDeployment: input.currentDeployment,
      lastGoodDeployment: input.lastGoodDeployment,
      commits: input.commits,
      workItems: input.workItems,
      pullRequests: input.pullRequests,
      builds: input.builds,
      tests: input.tests,
      checks: input.checks,
      approvals: input.approvals,
      openIncidents: input.openIncidents,
      missingEvidence,
      recommendation: "insufficient_evidence",
    };
  }

  const failedChecks = input.checks.filter((check) => check.status === "failed");
  const rejectedApprovals = input.approvals.filter((approval) => approval.status === "rejected");
  const pendingApprovals = input.approvals.filter((approval) => approval.status === "pending");

  if (input.openIncidents.length > 0) {
    return {
      environment: input.environment,
      pendingDeployment: input.pendingDeployment,
      currentDeployment: input.currentDeployment,
      lastGoodDeployment: input.lastGoodDeployment,
      commits: input.commits,
      workItems: input.workItems,
      pullRequests: input.pullRequests,
      builds: input.builds,
      tests: input.tests,
      checks: input.checks,
      approvals: input.approvals,
      openIncidents: input.openIncidents,
      missingEvidence: [],
      recommendation: "reject",
    };
  }

  if (failedChecks.length > 0 || rejectedApprovals.length > 0) {
    return {
      environment: input.environment,
      pendingDeployment: input.pendingDeployment,
      currentDeployment: input.currentDeployment,
      lastGoodDeployment: input.lastGoodDeployment,
      commits: input.commits,
      workItems: input.workItems,
      pullRequests: input.pullRequests,
      builds: input.builds,
      tests: input.tests,
      checks: input.checks,
      approvals: input.approvals,
      openIncidents: input.openIncidents,
      missingEvidence: [],
      recommendation: "reject",
    };
  }

  if (
    pendingApprovals.length > 0
    || input.checks.some((check) => check.status === "pending")
    || input.builds.length === 0
  ) {
    return {
      environment: input.environment,
      pendingDeployment: input.pendingDeployment,
      currentDeployment: input.currentDeployment,
      lastGoodDeployment: input.lastGoodDeployment,
      commits: input.commits,
      workItems: input.workItems,
      pullRequests: input.pullRequests,
      builds: input.builds,
      tests: input.tests,
      checks: input.checks,
      approvals: input.approvals,
      openIncidents: input.openIncidents,
      missingEvidence: [],
      recommendation: "wait",
    };
  }

  return {
    environment: input.environment,
    pendingDeployment: input.pendingDeployment,
    currentDeployment: input.currentDeployment,
    lastGoodDeployment: input.lastGoodDeployment,
    commits: input.commits,
    workItems: input.workItems,
    pullRequests: input.pullRequests,
    builds: input.builds,
    tests: input.tests,
    checks: input.checks,
    approvals: input.approvals,
    openIncidents: input.openIncidents,
    missingEvidence: [],
    recommendation: "ready",
  };
}

/** Compare pending against last-good: what will change in the environment. */
export function lastGoodComparison(input: {
  pendingCommits: Array<ArtifactRef & { kind: "commit" }>;
  lastGoodCommits: Array<ArtifactRef & { kind: "commit" }>;
}): { newCommits: Array<ArtifactRef & { kind: "commit" }>; revertedCommits: Array<ArtifactRef & { kind: "commit" }> } {
  const pendingKeys = new Set(input.pendingCommits.map((commit) => commit.commitId));
  const goodKeys = new Set(input.lastGoodCommits.map((commit) => commit.commitId));
  return {
    newCommits: input.pendingCommits.filter((commit) => !goodKeys.has(commit.commitId)),
    revertedCommits: input.lastGoodCommits.filter((commit) => !pendingKeys.has(commit.commitId)),
  };
}
