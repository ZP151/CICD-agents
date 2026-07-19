import { useCallback, useEffect, useRef, useState } from "react";
import {
  discoverAdoProjectLinkOptions,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type ProjectLinkInput,
} from "../../api.js";
import {
  adoDiscoverySignature,
  applyAdoDiscoveryToProjectLinkInput,
  applyAzureDevOpsRemoteSuggestion,
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
  pickRecommendedPipeline,
  withoutProjectLinkFallbacks,
} from "../../projectLinks.js";

export function useProjectLinkFormRuntime(initial: ProjectLinkInput) {
  const [form, setForm] = useState<ProjectLinkInput>(initial);
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryAutoRef = useRef<Partial<Record<AdoDiscoveryKind, string>>>({});

  const set =
    <K extends keyof ProjectLinkInput>(key: K) =>
    (value: ProjectLinkInput[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const loadBranches = useCallback(async (repoPath: string) => {
    if (!repoPath.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    const trimmedPath = repoPath.trim();
    const [branchNames, remote] = await Promise.all([
      fetchGitBranches(trimmedPath),
      fetchAzureDevOpsRemoteSuggestion(trimmedPath),
    ]);
    setBranches(branchNames);
    setBranchLoading(false);
    setBranchError(branchNames.length === 0);
    if (remote) {
      setForm((current) => applyAzureDevOpsRemoteSuggestion(current, remote));
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!form.repoPath.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    debounceRef.current = setTimeout(() => {
      void loadBranches(form.repoPath);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  const runDiscovery = useCallback(async (
    kind: AdoDiscoveryKind,
    mode: "manual" | "auto" = "manual",
  ) => {
    const signature = adoDiscoverySignature(kind, form);
    if (mode === "auto" && discoveryAutoRef.current[kind] === signature) return;
    if (mode === "auto") discoveryAutoRef.current[kind] = signature;
    setDiscovering(kind);
    setDiscoveryError(null);
    try {
      const result = await discoverAdoProjectLinkOptions(kind, withoutProjectLinkFallbacks(form));
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
    if (!form.adoOrgUrl.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("projects", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [form.adoOrgUrl, runDiscovery]);

  useEffect(() => {
    if (!form.adoOrgUrl.trim() || !form.adoProject.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("repositories", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [form.adoOrgUrl, form.adoProject, runDiscovery]);

  useEffect(() => {
    if (!form.adoOrgUrl.trim() || !form.adoProject.trim() || !form.adoRepoName.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("pipelines", "auto");
    }, 650);
    return () => clearTimeout(timer);
  }, [form.adoOrgUrl, form.adoProject, form.adoRepoName, runDiscovery]);

  const setManualProject = useCallback((value: string) => {
    setDiscoveryError(null);
    setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
    setForm((current) => ({
      ...current,
      adoProject: value,
      adoRepoName: current.adoProject === value ? current.adoRepoName : "",
    }));
  }, []);

  const setManualRepository = useCallback((value: string) => {
    setDiscoveryError(null);
    setDiscovered((current) => ({ ...current, pipelines: [] }));
    setForm((current) => ({
      ...current,
      adoRepoName: value,
    }));
  }, []);

  const setManualPipeline = useCallback((value: string) => {
    setDiscoveryError(null);
    setForm((current) => ({
      ...current,
      adoPipelineId: current.adoPipelineName === value ? current.adoPipelineId : "",
      adoPipelineName: value,
    }));
  }, []);

  const repoInputClass = `w-full rounded-lg border px-3 py-2 text-sm text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] bg-[rgb(var(--app-surface-raised))] outline-none transition ${
    !branchLoading && branches.length > 0
      ? "border-[rgb(var(--app-success-border))] focus:border-[rgb(var(--app-success))]"
      : branchError && form.repoPath
        ? "border-[rgb(var(--app-warning-border))] focus:border-[rgb(var(--app-warning))]"
        : "border-[rgb(var(--app-border))] focus:border-[rgb(var(--app-accent))]"
  }`;

  return {
    form,
    set,
    branches,
    branchLoading,
    branchError,
    repoInputClass,
    loadBranches,
    discovering,
    discoveryError,
    discovered,
    applyDiscovery,
    runDiscovery,
    setManualProject,
    setManualRepository,
    setManualPipeline,
  };
}
