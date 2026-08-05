import { getProjectLink, type Settings } from "@mergepilot/core";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";

export const PROJECT_LINK_NOT_FOUND = "project_link_not_found";
export const PROJECT_LINK_REPOSITORY_MISSING = "project_link_repository_missing";

export interface ReviewRouteDependencies {
  settings: Settings;
  projectLinkStore: ProjectLinkStoreAdapter;
}

export function localProjectLinkRepository(settings: Settings, projectLinkId: string) {
  const projectLink = getProjectLink(settings.dataDir, projectLinkId);
  if (!projectLink) return { error: PROJECT_LINK_NOT_FOUND };
  const repository = projectLink.adoRepoName.trim();
  if (!repository) return { error: PROJECT_LINK_REPOSITORY_MISSING };
  return { projectLink, repository };
}
