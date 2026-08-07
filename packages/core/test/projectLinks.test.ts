import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createProjectLink,
  getProjectLink,
  legacyFreeProjectLinkInput,
  updateProjectLink,
} from "../src/projectLinks.js";
import type { ProjectLinkInput } from "../src/projectLinks.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-project-links-"));
}

const legacyInput = {
  name: "ClaimBot_API link",
  repoPath: "C:/repo",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://tebssg.visualstudio.com/",
  adoProject: "TeBS-ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "",
  adoPipelineId: "117",
  adoPipelineName: "ClaimBot_API",
  adoMcpEnabled: true,
  adoMcpCommand: "mcp",
  adoMcpAuthentication: "token",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "node-web",
  buildCommand: "npm run build",
  testCommand: "npm test",
} satisfies ProjectLinkInput;

describe("Project Link V2 stable identity (GAP-01/02)", () => {
  it("legacyFreeProjectLinkInput drops every legacy field from an input", () => {
    const stripped = legacyFreeProjectLinkInput(legacyInput);

    expect(stripped).toMatchObject({
      name: "ClaimBot_API link",
      repoPath: "C:/repo",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPat: "",
    });
    for (const legacy of [
      "defaultBranch",
      "targetBranch",
      "adoPipelineId",
      "adoPipelineName",
      "adoMcpEnabled",
      "adoMcpCommand",
      "adoMcpAuthentication",
      "adoMcpDomains",
      "projectTemplate",
      "buildCommand",
      "testCommand",
    ]) {
      expect(stripped).not.toHaveProperty(legacy);
    }
  });

  it("createProjectLink never persists legacy fields even when they are provided", () => {
    const dataDir = tempDataDir();
    const created = createProjectLink(dataDir, legacyInput);

    expect(created.adoPipelineId).toBe("");
    expect(created.adoPipelineName).toBe("");
    expect(created.defaultBranch).toBe("");
    expect(created.adoMcpEnabled).toBe(false);
    expect(created.adoMcpDomains).toBe("");

    // The raw store file must not contain the legacy values at all.
    const raw = fs.readFileSync(path.join(dataDir, "project-links.json"), "utf8");
    expect(raw).not.toContain("adoPipelineId");
    expect(raw).not.toContain("117");
    expect(raw).not.toContain("adoMcpEnabled");

    const reread = getProjectLink(dataDir, created.id);
    expect(reread?.adoPipelineId).toBe("");
    expect(reread?.adoPipelineName).toBe("");
  });

  it("updateProjectLink drops legacy fields from the input but keeps persisted ones read-only", () => {
    const dataDir = tempDataDir();
    const created = createProjectLink(dataDir, legacyInput);

    // Simulate a historical record that still has a persisted pipeline field,
    // then update only the stable identity.
    const updated = updateProjectLink(dataDir, created.id, { repoPath: "C:/repo-v2" });
    expect(updated?.repoPath).toBe("C:/repo-v2");
    expect(updated?.adoPipelineId).toBe("");

    // Updating with legacy fields must not re-write them.
    const again = updateProjectLink(dataDir, created.id, { adoPipelineId: "999", name: "Renamed" });
    expect(again?.name).toBe("Renamed");
    expect(again?.adoPipelineId).toBe("");
    const raw = fs.readFileSync(path.join(dataDir, "project-links.json"), "utf8");
    expect(raw).not.toContain("999");
  });
});
