import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectLink } from "../../api.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../../projectLinks.js";

interface UseActiveProjectLinkRuntimeOptions {
  availableProjectLinks: ProjectLink[];
  initialActiveProjectLinkId?: string | null;
  repoPath: string;
  setRepoPath: (repoPath: string) => void;
  focusComposer?: () => void;
}

export function readInitialActiveProjectLinkId(initialActiveProjectLinkId?: string | null): string | null {
  return initialActiveProjectLinkId ?? (loadStoredActiveProjectLinkId() || null);
}

export function repoPathForProjectLink(
  projectLinks: ProjectLink[],
  projectLinkId: string | null,
): string | null {
  if (!projectLinkId) return null;
  return projectLinks.find((projectLink) => projectLink.id === projectLinkId)?.repoPath?.trim() || null;
}

export function useActiveProjectLinkRuntime({
  availableProjectLinks,
  initialActiveProjectLinkId,
  repoPath,
  setRepoPath,
  focusComposer,
}: UseActiveProjectLinkRuntimeOptions) {
  const [activeProjectLinkId, setActiveProjectLinkId] = useState<string | null>(
    () => readInitialActiveProjectLinkId(initialActiveProjectLinkId),
  );

  const activeProjectLink = useMemo(
    () => availableProjectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null,
    [availableProjectLinks, activeProjectLinkId],
  );

  useEffect(() => {
    if (availableProjectLinks.length === 0) return;
    setActiveProjectLinkId((current) => resolveActiveProjectLinkId(availableProjectLinks, current) || null);
  }, [availableProjectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(activeProjectLinkId);
  }, [activeProjectLinkId]);

  useEffect(() => {
    if (repoPath) return;
    const linkRepoPath = repoPathForProjectLink(availableProjectLinks, activeProjectLinkId);
    if (linkRepoPath) setRepoPath(linkRepoPath);
  }, [activeProjectLinkId, availableProjectLinks, repoPath, setRepoPath]);

  const selectProjectLink = useCallback((projectLinkOrId: ProjectLink | string | null) => {
    const projectLink = typeof projectLinkOrId === "string"
      ? availableProjectLinks.find((item) => item.id === projectLinkOrId) ?? null
      : projectLinkOrId;
    const nextId = typeof projectLinkOrId === "string" ? projectLinkOrId || null : projectLink?.id ?? null;
    setActiveProjectLinkId(nextId);
    if (projectLink?.repoPath) setRepoPath(projectLink.repoPath);
    focusComposer?.();
  }, [availableProjectLinks, focusComposer, setRepoPath]);

  return {
    activeProjectLinkId,
    setActiveProjectLinkId,
    activeProjectLink,
    selectProjectLink,
  };
}
