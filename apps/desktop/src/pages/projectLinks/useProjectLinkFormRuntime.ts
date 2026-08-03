import { useCallback, useEffect, useRef, useState } from "react";
import {
  discoverAdoProjectLinkOptions,
  type AdoDiscoveryAuthStatus,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type ProjectLinkInput,
} from "../../api.js";
import { enableAzureDevOpsOAuth, AzureDevOpsOAuthError } from "../../api/auth.js";
import { AdoDiscoveryError } from "../../api/projectLinks.js";
import {
  adoDiscoverySignature,
  applyAdoDiscoveryToProjectLinkInput,
  applyAzureDevOpsRemoteSuggestion,
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
  pickRecommendedPipeline,
  withoutProjectLinkFallbacks,
} from "../../projectLinks.js";
import {
  ADO_OAUTH_RECOVERY_IDLE,
  adoOauthRecoveryAuthorized,
  adoOauthRecoveryDeclined,
  adoOauthRecoveryFailed,
  adoOauthRecoverySettled,
  adoOauthRecoveryStart,
  adoRecoveryMessageForOAuthError,
  type AdoOauthRecoveryState,
} from "./adoOauthRecovery.js";

export interface AdoDiscoveryFailure {
  kind: AdoDiscoveryKind;
  message: string;
  authStatus?: AdoDiscoveryAuthStatus;
  authMode?: "oauth" | "pat";
  retryable: boolean;
}

export function useProjectLinkFormRuntime(initial: ProjectLinkInput) {
  const [form, setForm] = useState<ProjectLinkInput>(initial);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState(false);
  const [discovering, setDiscovering] = useState<AdoDiscoveryKind | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryFailure, setDiscoveryFailure] = useState<AdoDiscoveryFailure | null>(null);
  const [recovery, setRecovery] = useState<AdoOauthRecoveryState>(ADO_OAUTH_RECOVERY_IDLE);
  const [discovered, setDiscovered] = useState<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>({
    projects: [],
    repositories: [],
    pipelines: [],
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryAutoRef = useRef<Partial<Record<AdoDiscoveryKind, string>>>({});
  const recoveryRef = useRef<AdoOauthRecoveryState>(ADO_OAUTH_RECOVERY_IDLE);

  const updateRecovery = useCallback((next: AdoOauthRecoveryState) => {
    recoveryRef.current = next;
    setRecovery(next);
  }, []);

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
    setDiscoveryFailure(null);
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
    setDiscoveryFailure(null);
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
      const message = err instanceof Error ? err.message : String(err);
      setDiscoveryError(message);
      if (err instanceof AdoDiscoveryError) {
        setDiscoveryFailure({
          kind,
          message,
          authStatus: err.authStatus,
          authMode: err.authMode,
          retryable: err.retryable,
        });
      } else {
        setDiscoveryFailure({ kind, message, retryable: false });
      }
    } finally {
      setDiscovering(null);
      // The one-shot OAuth recovery retry settled; return to idle so the
      // user can start a fresh attempt if the retried discovery also failed.
      updateRecovery(adoOauthRecoverySettled());
    }
  }, [applyDiscovery, form, updateRecovery]);

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

  /**
   * User-triggered inline OAuth recovery (MP-001). Never called from a
   * typing/debounce path: the browser only opens on an explicit click.
   * Success retries the original discovery kind exactly once.
   */
  const recoverOAuthAccess = useCallback(async (kind: AdoDiscoveryKind) => {
    const current = recoveryRef.current;
    if (current.phase === "authorizing" || current.phase === "retrying_discovery") return;
    updateRecovery(adoOauthRecoveryStart(current, kind));
    try {
      await enableAzureDevOpsOAuth();
      updateRecovery(adoOauthRecoveryAuthorized(recoveryRef.current));
      await runDiscovery(kind, "manual");
    } catch (err) {
      if (err instanceof AzureDevOpsOAuthError) {
        const message = adoRecoveryMessageForOAuthError(err);
        updateRecovery(
          err.authStatus === "user_declined"
            ? adoOauthRecoveryDeclined(recoveryRef.current, message)
            : adoOauthRecoveryFailed(recoveryRef.current, message),
        );
      } else {
        updateRecovery(
          adoOauthRecoveryFailed(
            recoveryRef.current,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    }
  }, [runDiscovery, updateRecovery]);

  const setManualProject = useCallback((value: string) => {
    setDiscoveryError(null);
    setDiscoveryFailure(null);
    setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
    setForm((current) => ({
      ...current,
      adoProject: value,
      adoRepoName: current.adoProject === value ? current.adoRepoName : "",
    }));
  }, []);

  const setManualRepository = useCallback((value: string) => {
    setDiscoveryError(null);
    setDiscoveryFailure(null);
    setDiscovered((current) => ({ ...current, pipelines: [] }));
    setForm((current) => ({
      ...current,
      adoRepoName: value,
    }));
  }, []);

  const setManualPipeline = useCallback((value: string) => {
    setDiscoveryError(null);
    setDiscoveryFailure(null);
    setForm((current) => ({
      ...current,
      adoPipelineId: current.adoPipelineName === value ? current.adoPipelineId : "",
      adoPipelineName: value,
    }));
  }, []);

  // The shared text input owns base surface, spacing and focus feedback. This
  // hook only supplies the repository-specific validation colour.
  const repoInputClass = `${
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
    discoveryFailure,
    recovery,
    recoverOAuthAccess,
    discovered,
    applyDiscovery,
    runDiscovery,
    setManualProject,
    setManualRepository,
    setManualPipeline,
  };
}
