import { describe, expect, it } from "vitest";
import { environmentHealth } from "./environmentHealth.js";

const base = { repoPath: "C:\\repo\\example", busy: false, gitKnown: true, adoReady: true, projectLinkCount: 1 };

describe("environmentHealth (MP-007/RA-025..RA-028)", () => {
  it("reports not_configured before a repository is selected", () => {
    const health = environmentHealth({ ...base, repoPath: "" });

    expect(health.state).toBe("not_configured");
    expect(health.primaryAction).toBe("Choose a repository");
    expect(health.checks.find((check) => check.key === "repository")?.repair).toBeTruthy();
  });

  it("reports checking while a check is running", () => {
    const health = environmentHealth({ ...base, busy: true });

    expect(health.state).toBe("checking");
  });

  it("reports ready when repository, git state and Project Link are all available", () => {
    const health = environmentHealth(base);

    expect(health.state).toBe("ready");
    expect(health.primaryAction).toBe("Re-check");
    expect(health.checks.every((check) => check.state === "ok")).toBe(true);
  });

  it("degrades with a reason and repair when the Project Link is missing", () => {
    const health = environmentHealth({ ...base, adoReady: false, projectLinkCount: 0 });

    expect(health.state).toBe("degraded");
    expect(health.reason).toContain("Project Link");
    expect(health.primaryAction).toContain("Link a Project");
  });

  it("keeps other ready items out of the blocked/degraded blame", () => {
    const health = environmentHealth({ ...base, gitKnown: false });

    expect(health.state).toBe("degraded");
    const gitCheck = health.checks.find((check) => check.key === "git_state");
    expect(gitCheck?.state).toBe("missing");
    expect(health.checks.find((check) => check.key === "repository")?.state).toBe("ok");
  });

  it("blocks with the workflow reason and repair when a step is blocked", () => {
    const health = environmentHealth({ ...base, blockedReason: "Rebase in progress" });

    expect(health.state).toBe("blocked");
    expect(health.reason).toContain("Rebase in progress");
    expect(health.checks.find((check) => check.key === "workflow")?.state).toBe("error");
  });
});
