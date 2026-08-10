import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLink } from "./api";
import {
  ACTIVE_PROJECT_LINK_LS_KEY,
  adoDiscoverySignature,
  applyAzureDevOpsRemoteSuggestion,
  applyAdoDiscoveryToProjectLinkInput,
  isTemporaryProjectLink,
  loadStoredActiveProjectLinkId,
  pickRecommendedPipeline,
  resolveActiveProjectLink,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
  shouldRefreshGeneratedProjectLinkName,
} from "./projectLinks";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickRecommendedPipeline", () => {
  it("prefers repo-specific CI pipelines over release pipelines", () => {
    const selected = pickRecommendedPipeline([
      {
        id: "1",
        name: "web-app release deploy",
        description: "\\release",
        url: "",
      },
      {
        id: "2",
        name: "web-app CI validation",
        description: "\\.azure-pipelines",
        url: "",
      },
      {
        id: "3",
        name: "shared build",
        description: "\\shared",
        url: "",
      },
    ], {
      repoPath: "C:\\work\\web-app",
      adoRepoName: "web-app",
      adoProject: "Platform",
    });

    expect(selected).toMatchObject({ id: "2", name: "web-app CI validation" });
  });

  it("returns the only pipeline when discovery has one result", () => {
    const selected = pickRecommendedPipeline([
      { id: "42", name: "Only pipeline", description: "", url: "" },
    ], {});

    expect(selected).toMatchObject({ id: "42" });
  });

  it("prefers the pipeline whose discovery metadata matches the selected repository", () => {
    const selected = pickRecommendedPipeline([
      {
        id: "108",
        name: "TeBS-ClaimBot",
        description: "\\ · repo:TeBS-ClaimBot · type:TfsGit · yaml:/azure-pipelines.yml",
        url: "",
      },
      {
        id: "117",
        name: "ClaimBot_API",
        description: "\\ · repo:ClaimBot_API · type:TfsGit · yaml:/azure-pipelines.yml",
        url: "",
      },
    ], {
      repoPath: "C:\\work\\ClaimBot_API",
      adoRepoName: "ClaimBot_API",
      adoProject: "TeBS-ClaimBot",
    });

    expect(selected).toMatchObject({ id: "117", name: "ClaimBot_API" });
  });
});

describe("ADO Project Link discovery state", () => {
  it("refreshes generated Project Link names but preserves user names", () => {
    expect(shouldRefreshGeneratedProjectLinkName("Project link", "")).toBe(true);
    expect(shouldRefreshGeneratedProjectLinkName("OldRepo link", "C:\\work\\OldRepo")).toBe(true);
    expect(shouldRefreshGeneratedProjectLinkName("My custom link", "C:\\work\\OldRepo")).toBe(false);
  });

  it("applies an ADO remote suggestion over the default organization URL", () => {
    const next = applyAzureDevOpsRemoteSuggestion({
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "",
      adoRepoName: "",
    } as ProjectLink, {
      remoteName: "origin",
      remoteUrl: "https://dev.azure.com/example/Claims/_git/claimbot_api",
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "claimbot_api",
    });

    expect(next).toMatchObject({
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "claimbot_api",
    });
  });

  it("keeps user-entered ADO fields when applying a remote suggestion", () => {
    const next = applyAzureDevOpsRemoteSuggestion({
      adoOrgUrl: "https://custom.visualstudio.com/",
      adoProject: "ManualProject",
      adoRepoName: "ManualRepo",
    } as ProjectLink, {
      remoteName: "origin",
      remoteUrl: "https://dev.azure.com/example/Claims/_git/claimbot_api",
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "claimbot_api",
    });

    expect(next).toMatchObject({
      adoOrgUrl: "https://custom.visualstudio.com/",
      adoProject: "ManualProject",
      adoRepoName: "ManualRepo",
    });
  });

  it("builds a stable trimmed discovery signature", () => {
    expect(adoDiscoverySignature("repositories", {
      adoOrgUrl: " https://dev.azure.com/demo ",
      adoProject: " Project ",
      adoRepoName: " Repo ",
    } as ProjectLink)).toBe(JSON.stringify({
      kind: "repositories",
      org: "https://dev.azure.com/demo",
      project: "Project",
      repo: "Repo",
    }));
  });

  it("resets repo field when a different ADO project is selected", () => {
    const next = applyAdoDiscoveryToProjectLinkInput({
      adoProject: "Old",
      adoRepoName: "repo",
    } as ProjectLink, "projects", {
      id: "project-1",
      name: "New",
      description: "",
      url: "",
    });

    expect(next).toMatchObject({
      adoProject: "New",
      adoRepoName: "",
    });
  });

  it("does not apply a discovered pipeline to the form (V2 Project Links never persist pipeline fields)", () => {
    const next = applyAdoDiscoveryToProjectLinkInput({
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "claimbot_api",
    } as ProjectLink, "pipelines", {
      id: "117",
      name: "ClaimBot_API",
      description: "",
      url: "https://dev.azure.com/example/Claims/_build?definitionId=117",
    });

    expect(next).toMatchObject({
      adoOrgUrl: "https://dev.azure.com/example/",
      adoProject: "Claims",
      adoRepoName: "claimbot_api",
    });
    expect(next.adoPipelineId ?? "").toBe("");
    expect(next.adoPipelineName ?? "").toBe("");
  });
});

describe("active Project Link persistence", () => {
  it("stores the active Project Link under the canonical key", () => {
    localStorage.clear();

    saveStoredActiveProjectLinkId("project-link-2");

    expect(localStorage.getItem(ACTIVE_PROJECT_LINK_LS_KEY)).toBe("project-link-2");
    expect(loadStoredActiveProjectLinkId()).toBe("project-link-2");
  });

  it("resolves a persisted Project Link before falling back to the first link", () => {
    localStorage.clear();
    saveStoredActiveProjectLinkId("project-link-2");

    const resolved = resolveActiveProjectLinkId([
      { id: "project-link-1", name: "PL 1" },
      { id: "project-link-2", name: "PL 2" },
    ] as ProjectLink[]);

    expect(resolved).toBe("project-link-2");
  });

  it("returns the Context-selected Project Link for every workspace", () => {
    const links = [
      { id: "project-link-1", name: "Outdated link" },
      { id: "project-link-2", name: "ClaimBot API" },
    ] as ProjectLink[];

    expect(resolveActiveProjectLink(links, "project-link-2")?.name).toBe("ClaimBot API");
  });

  it("defaults to the most complete saved Azure DevOps link instead of a newer local-only link", () => {
    localStorage.clear();

    const resolved = resolveActiveProjectLinkId([
      {
        id: "local-e2e",
        name: "ClaimBot API E2E",
        repoPath: "C:\\work\\ClaimBot_API",
        adoOrgUrl: "",
        adoProject: "",
        adoRepoName: "",
        adoPipelineId: "",
        updatedAt: 30,
      },
      {
        id: "claimbot-link",
        name: "ClaimBot_API link",
        repoPath: "C:\\work\\ClaimBot_API",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
        updatedAt: 10,
      },
    ] as ProjectLink[]);

    expect(resolved).toBe("claimbot-link");
  });

  it("moves stale temporary Project Link selections back to the matching saved link", () => {
    localStorage.clear();
    saveStoredActiveProjectLinkId("mp-live-link");

    const links = [
      {
        id: "mp-live-link",
        name: "mp-live-claimbot-pipeline-20260715120108",
        repoPath: "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live\\work",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "",
        updatedAt: 20,
      },
      {
        id: "claimbot-link",
        name: "ClaimBot_API link",
        repoPath: "C:\\work\\ClaimBot_API",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
        adoPipelineId: "117",
        updatedAt: 10,
      },
    ] as ProjectLink[];

    expect(isTemporaryProjectLink(links[0]!)).toBe(true);
    expect(resolveActiveProjectLinkId(links, "mp-live-link")).toBe("claimbot-link");
    expect(resolveActiveProjectLinkId(links)).toBe("claimbot-link");
  });

  it("keeps a temporary Project Link when no matching saved link exists", () => {
    const links = [
      {
        id: "mp-live-link",
        name: "mp-live-other",
        repoPath: "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live\\work",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "Other",
        adoRepoName: "Other",
      },
    ] as ProjectLink[];

    expect(resolveActiveProjectLinkId(links, "mp-live-link")).toBe("mp-live-link");
  });

  it("treats generated ClaimBot end-to-end links as temporary configuration", () => {
    const links = [
      {
        id: "e2e-link",
        name: "e2e-claimbot-pipeline-20260806163009",
        repoPath: "C:\\work\\ClaimBot_API",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
      },
      {
        id: "saved-link",
        name: "ClaimBot_API link",
        repoPath: "C:\\work\\ClaimBot_API",
        adoOrgUrl: "https://tebssg.visualstudio.com/",
        adoProject: "TeBS-ClaimBot",
        adoRepoName: "ClaimBot_API",
      },
    ] as ProjectLink[];

    expect(isTemporaryProjectLink(links[0]!)).toBe(true);
    expect(resolveActiveProjectLinkId(links, "e2e-link")).toBe("saved-link");
  });

  it("treats local mp-probe repositories as temporary validation links", () => {
    expect(isTemporaryProjectLink({
      name: "probe2 link",
      repoPath: "C:\\Users\\me\\AppData\\Local\\Temp\\mp-probe2-20260809-012125",
    })).toBe(true);
  });
});
