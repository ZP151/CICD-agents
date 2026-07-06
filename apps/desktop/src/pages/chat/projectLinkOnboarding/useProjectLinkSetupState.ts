import { useCallback, useEffect, useRef, useState } from "react";
import {
  discoverAdoProjectLinkOptions,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type ProjectLink,
  type ProjectLinkInput,
} from "../../../api.js";
import {
  DEFAULT_ADO_ORG_URL,
  adoDiscoverySignature,
  applyAzureDevOpsRemoteSuggestion,
  applyAdoDiscoveryToProjectLinkInput,
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
  pickRecommendedPipeline,
  projectLinkNameFromRepo,
  shouldRefreshGeneratedProjectLinkName,
  withoutProjectLinkFallbacks,
} from "../../../projectLinks.js";

export const EMPTY_PROJECT_LINK: ProjectLinkInput = {
  name: "",
  repoPath: "",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoProject: "",
  adoRepoName: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoPat: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

export interface UseProjectLinkSetupStateArgs {
  repoPath: string;
  onCreated: (projectLink: ProjectLink) => void;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
}

export function useProjectLinkSetupState({
  repoPath,
  onCreated,
  createProjectLink,
}: UseProjectLinkSetupStateArgs) {
  const [form, setForm] = useState<ProjectLinkInput>(() => ({
    ...EMPTY_PROJECT_LINK,
    name: projectLinkNameFromRepo(repoPath),
    repoPath,
  }));
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState(false);
  const [discovering, setDiscovering] = useState<AdoDiscoveryKind | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>({
    projects: [],
    repositories: [],
    pipelines: [],
  });
  const branchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryAutoRef = useRef<Partial<Record<AdoDiscoveryKind, string>>>({});

  useEffect(() => {
    setForm((current) => ({
      ...current,
      repoPath: current.repoPath || repoPath,
      name: current.name === "Project link" && repoPath ? projectLinkNameFromRepo(repoPath) : current.name,
    }));
  }, [repoPath]);

  const setField = <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => {
    setForm((current) => {
      if (key === "repoPath" && typeof value === "string") {
        return {
          ...current,
          repoPath: value,
          name: shouldRefreshGeneratedProjectLinkName(current.name, current.repoPath)
            ? projectLinkNameFromRepo(value)
            : current.name,
        };
      }
      return { ...current, [key]: value };
    });
  };

  const loadBranches = useCallback(async (path: string) => {
    if (!path.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    const trimmedPath = path.trim();
    const [detected, remote] = await Promise.all([
      fetchGitBranches(trimmedPath),
      fetchAzureDevOpsRemoteSuggestion(trimmedPath),
    ]);
    setBranches(detected);
    setBranchLoading(false);
    setBranchError(detected.length === 0);
    if (detected.length > 0) {
      setForm((current) => {
        const preferred = preferredBranch(detected, current.defaultBranch);
        const target = detected.includes(current.targetBranch) ? current.targetBranch : preferred;
        return { ...current, defaultBranch: preferred, targetBranch: target };
      });
    }
    if (remote) {
      setForm((current) => applyAzureDevOpsRemoteSuggestion(current, remote));
    }
  }, []);

  useEffect(() => {
    if (branchDebounceRef.current) clearTimeout(branchDebounceRef.current);
    if (!form.repoPath.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    branchDebounceRef.current = setTimeout(() => {
      void loadBranches(form.repoPath);
    }, 700);
    return () => {
      if (branchDebounceRef.current) clearTimeout(branchDebounceRef.current);
    };
  }, [form.repoPath, loadBranches]);

  const applyDiscovery = useCallback((kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => {
    setDiscoveryError(null);
    if (kind === "projects") {
      setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
      setForm((current) => applyAdoDiscoveryToProjectLinkInput(current, kind, option));
    } else if (kind === "repositories") {
      setDiscovered((current) => ({ ...current, pipelines: [] }));
      setForm((current) => applyAdoDiscoveryToProjectLinkInput(current, kind, option));
    } else if (kind === "pipelines") {
      setForm((current) => applyAdoDiscoveryToProjectLinkInput(current, kind, option));
    }
  }, []);

  const runDiscovery = useCallback(async (kind: AdoDiscoveryKind, mode: "manual" | "auto" = "manual") => {
    const signature = adoDiscoverySignature(kind, form);
    if (mode === "auto" && discoveryAutoRef.current[kind] === signature) return;
    if (mode === "auto") discoveryAutoRef.current[kind] = signature;
    setDiscovering(kind);
    setDiscoveryError(null);
    try {
      const result = await discoverAdoProjectLinkOptions(kind, {
        ...withoutProjectLinkFallbacks(form),
      });
      setDiscovered((current) => ({ ...current, [kind]: result.items }));
      if (result.items.length === 1) applyDiscovery(kind, result.items[0]!);
      if (kind === "pipelines" && result.items.length > 1) {
        const recommended = pickRecommendedPipeline(result.items, {
          repoPath: form.repoPath,
          adoRepoName: form.adoRepoName,
          adoProject: form.adoProject,
        });
        if (recommended) applyDiscovery(kind, recommended);
      }
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(null);
    }
  }, [applyDiscovery, form]);

  useEffect(() => {
    if (!advanced || !form.adoOrgUrl.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("projects", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [advanced, form.adoOrgUrl, runDiscovery]);

  useEffect(() => {
    if (!advanced || !form.adoOrgUrl.trim() || !form.adoProject.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("repositories", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [advanced, form.adoOrgUrl, form.adoProject, runDiscovery]);

  useEffect(() => {
    if (!advanced || !form.adoOrgUrl.trim() || !form.adoProject.trim() || !form.adoRepoName.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("pipelines", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [advanced, form.adoOrgUrl, form.adoProject, form.adoRepoName, runDiscovery]);

  const canSave = form.name.trim().length > 0 && form.repoPath.trim().length > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createProjectLink(withoutProjectLinkFallbacks({
        ...form,
        name: form.name.trim(),
        repoPath: form.repoPath.trim(),
        defaultBranch: form.defaultBranch.trim() || "main",
        targetBranch: form.targetBranch.trim() || form.defaultBranch.trim() || "main",
      }));
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return {
    advanced,
    applyDiscovery,
    branchError,
    branchLoading,
    branches,
    canSave,
    discovered,
    discovering,
    discoveryError,
    error,
    form,
    loadBranches,
    save,
    saving,
    setAdvanced,
    setDiscovered,
    setDiscoveryError,
    setField,
    setForm,
    runDiscovery,
  };
}

function preferredBranch(branches: string[], currentBranch: string): string {
  if (branches.includes(currentBranch)) return currentBranch;
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return branches[0] ?? currentBranch;
}
