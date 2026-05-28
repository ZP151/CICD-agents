import { describe, expect, it } from "vitest";
import { toolCapabilities, toolCapabilityPrompt } from "../src/tools/capabilities.js";
import { gitTools } from "../src/tools/git.js";

describe("tool capability registry", () => {
  it("derives risk and required args from registered git tools", () => {
    const caps = toolCapabilities(gitTools());
    expect(caps.find((cap) => cap.name === "git_status")?.riskLevel).toBe("low");
    expect(caps.find((cap) => cap.name === "git_status")?.readOnly).toBe(true);
    expect(caps.find((cap) => cap.name === "git_fetch")?.riskLevel).toBe("low");
    expect(caps.find((cap) => cap.name === "git_merge_base")?.readOnly).toBe(true);
    expect(caps.find((cap) => cap.name === "git_show")?.readOnly).toBe(true);
    expect(caps.find((cap) => cap.name === "git_restore")?.riskLevel).toBe("medium");
    expect(caps.find((cap) => cap.name === "git_pull")?.riskLevel).toBe("medium");
    expect(caps.find((cap) => cap.name === "git_rebase")?.riskLevel).toBe("high");
    expect(caps.find((cap) => cap.name === "git_commit")?.riskLevel).toBe("medium");
    expect(caps.find((cap) => cap.name === "git_commit")?.requiresApproval).toBe(true);
    expect(caps.find((cap) => cap.name === "git_push")?.riskLevel).toBe("high");
    expect(caps.find((cap) => cap.name === "git_push")?.category).toBe("git");
    expect(caps.find((cap) => cap.name === "git_commit")?.required).toEqual(["message"]);
  });

  it("renders a prompt from actual tool registrations", () => {
    const prompt = toolCapabilityPrompt(gitTools());
    expect(prompt).toContain("Available tool capabilities");
    expect(prompt).toContain("approval_proposal.tool");
    expect(prompt).toContain("git_branch_list");
    expect(prompt).toContain("git_fetch");
    expect(prompt).toContain("git_merge_base");
    expect(prompt).toContain("git_rebase");
    expect(prompt).toContain("git_restore");
    expect(prompt).toContain("git_stash");
    expect(prompt).toContain("[git; high; approval-required; required: branch]");
  });
});
