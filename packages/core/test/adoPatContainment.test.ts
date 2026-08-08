import { afterEach, describe, expect, it } from "vitest";
import { getKeyringPat, setPatProvider } from "../src/ado/auth.js";
import {
  entityToProjectLink,
  projectLinkToEntity,
} from "../src/store/tableProjectLinkStore.js";
import type { ProjectLink } from "../src/projectLinks.js";

// ADR-0005 (Phase 4 4a-1): stores never hold the PAT value. The entity
// mappers and the keyring seam are the two persistence boundaries that must
// stay credential-free by construction.

afterEach(() => {
  setPatProvider(async () => {
    throw new Error("no keyring in tests");
  });
});

describe("ADO PAT containment (4a-1)", () => {
  describe("keyring seam", () => {
    it("getKeyringPat returns the provider value", async () => {
      setPatProvider(async () => "keyring-pat-value");
      expect(await getKeyringPat()).toBe("keyring-pat-value");
    });

    it("getKeyringPat returns an empty string when the provider is unavailable", async () => {
      setPatProvider(async () => {
        throw new Error("keyring unavailable");
      });
      expect(await getKeyringPat()).toBe("");
    });
  });

  describe("Table entity mappers", () => {
    const projectLink: ProjectLink = {
      id: "link-1",
      name: "ClaimBot_API link",
      repoPath: "C:/repo",
      defaultBranch: "",
      targetBranch: "",
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS-ClaimBot",
      adoRepoName: "ClaimBot_API",
      adoPat: "secret-pat-123",
      adoPipelineId: "",
      adoPipelineName: "",
      adoMcpEnabled: false,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "",
      projectTemplate: "",
      buildCommand: "",
      testCommand: "",
    };

    it("projectLinkToEntity persists the empty placeholder, never the value", () => {
      const entity = projectLinkToEntity("user-1", projectLink);
      expect(entity.adoPat).toBe("");
      expect(JSON.stringify(entity)).not.toContain("secret-pat-123");
    });

    it("entityToProjectLink never resurrects a stored value", () => {
      const entity = {
        partitionKey: "user-1",
        rowKey: "link-1",
        name: "ClaimBot_API link",
        repoPath: "C:/repo",
        defaultBranch: "",
        targetBranch: "",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        // Legacy entity predating 4a-1 may still carry a stored value.
        adoPat: "stored-legacy-pat",
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "",
        projectTemplate: "",
        buildCommand: "",
        testCommand: "",
      };
      const restored = entityToProjectLink(entity);
      expect(restored.adoPat).toBe("");
      expect(JSON.stringify(restored)).not.toContain("stored-legacy-pat");
    });

    it("round trip loses the credential by construction", () => {
      const entity = projectLinkToEntity("user-1", projectLink);
      const restored = entityToProjectLink(entity);
      expect(restored.adoPat).toBe("");
      expect(restored.name).toBe("ClaimBot_API link");
      expect(restored.adoRepoName).toBe("ClaimBot_API");
    });
  });
});
