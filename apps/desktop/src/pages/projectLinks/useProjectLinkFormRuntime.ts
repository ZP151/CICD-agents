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
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
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
      setForm((current) => ({
        ...current,
        adoOrgUrl: current.adoOrgUrl || remote.adoOrgUrl,
        adoProject: current.adoProject || remote.adoProject,
        adoRepoName: current.adoRepoName || remote.adoRepoName,
      }));
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

  const repoInputClass = `w-full rounded-lg border px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition ${
    !branchLoading && branches.length > 0
      ? "border-emerald-600 bg-zinc-900 focus:border-emerald-500"
      : branchError && form.repoPath
        ? "border-amber-700/60 bg-zinc-900 focus:border-amber-600"
        : "border-zinc-700/60 bg-zinc-900 focus:border-zinc-600"
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
  };
}
