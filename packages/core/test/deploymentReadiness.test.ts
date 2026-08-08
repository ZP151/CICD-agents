import { describe, expect, it } from "vitest";
import { buildDeploymentReadiness, lastGoodComparison, type DeploymentReadinessInput } from "../src/index.js";

const env = { kind: "environment" as const, projectLinkId: "pl-1", environmentId: 5 };
const build = (id: number) => ({ kind: "build" as const, projectLinkId: "pl-1", definitionId: 117, buildId: id });
const commit = (sha: string) => ({ kind: "commit" as const, projectLinkId: "pl-1", repositoryId: "repo-1", commitId: sha });

function input(overrides: Partial<DeploymentReadinessInput> = {}): DeploymentReadinessInput {
  return {
    environment: env,
    commits: [],
    workItems: [],
    pullRequests: [],
    builds: [build(1)],
    tests: [],
    checks: [],
    approvals: [],
    openIncidents: [],
    unreadEvidence: [],
    ...overrides,
  };
}

describe("deployment readiness", () => {
  it("reports ready when everything passes", () => {
    const readiness = buildDeploymentReadiness(input({
      builds: [build(10)],
      checks: [{ name: "Smoke", status: "passed" }],
      approvals: [{ name: "Owner", status: "approved" }],
    }));
    expect(readiness.recommendation).toBe("ready");
  });

  it("waits on pending approvals or checks", () => {
    expect(buildDeploymentReadiness(input({ approvals: [{ name: "Owner", status: "pending" }] })).recommendation).toBe("wait");
    expect(buildDeploymentReadiness(input({ checks: [{ name: "Smoke", status: "pending" }] })).recommendation).toBe("wait");
  });

  it("rejects on failed checks, rejected approvals, or open incidents", () => {
    expect(buildDeploymentReadiness(input({ checks: [{ name: "Smoke", status: "failed" }] })).recommendation).toBe("reject");
    expect(buildDeploymentReadiness(input({ approvals: [{ name: "Owner", status: "rejected" }] })).recommendation).toBe("reject");
    expect(buildDeploymentReadiness(input({ openIncidents: [commit("x")] })).recommendation).toBe("reject");
  });

  it("never claims readiness when required evidence cannot be read", () => {
    const readiness = buildDeploymentReadiness(input({ unreadEvidence: ["approval history inaccessible"] }));
    expect(readiness.recommendation).toBe("insufficient_evidence");
    expect(readiness.missingEvidence).toContain("approval history inaccessible");
  });

  it("compares pending against last-good commits", () => {
    const comparison = lastGoodComparison({
      pendingCommits: [commit("a"), commit("b")],
      lastGoodCommits: [commit("b"), commit("c")],
    });
    expect(comparison.newCommits.map((c) => c.commitId)).toEqual(["a"]);
    expect(comparison.revertedCommits.map((c) => c.commitId)).toEqual(["c"]);
  });
});
