import {
  fetchProjectLinkPrInsightArtifactsWithHistory,
  type PrInsightArtifactHistoryMeta,
  type PrInsightArtifactRecord,
  type ProjectLink,
} from "../../api.js";
import {
  listPrInsightArtifacts,
} from "../../prInsightArtifacts.js";
import { isTemporaryProjectLink } from "../../projectLinks.js";
import { parseIsoTimestamp } from "./activityPresentation.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";

export function taskViewerProjectLinksCacheKey(
  projectLinks: Array<{
    id: string;
    name?: string;
    repoPath?: string;
    defaultBranch?: string;
    targetBranch?: string;
    adoOrgUrl?: string;
    adoProject?: string;
    adoRepoName?: string;
    updatedAt?: number;
  }>,
): string {
  const normalizeBranch = (value: string | undefined) =>
    (value ?? "").trim().replace(/^refs\/heads\//, "").toLowerCase();
  return projectLinks
    .map((projectLink) => [
      projectLink.id,
      projectLink.name ?? "",
      projectLink.repoPath ?? "",
      projectLink.adoOrgUrl ?? "",
      projectLink.adoProject ?? "",
      projectLink.adoRepoName ?? "",
      normalizeBranch(projectLink.defaultBranch),
      normalizeBranch(projectLink.targetBranch),
      String(projectLink.updatedAt ?? ""),
    ].join("\u001f"))
    .sort((a, b) => a.localeCompare(b))
    .join("\u001e");
}

export async function loadPrInsightActivity(projectLinks: ProjectLink[]): Promise<{
  items: PrInsightActivityItem[];
  history: PrInsightArtifactHistoryMeta[];
}> {
  const nested = await Promise.all(
    projectLinks.map(async (projectLink) => {
      const localItems = listPrInsightArtifacts(projectLink.id);
      // Temporary links are test/run artifacts. Activity keeps their locally saved
      // evidence in the collapsed history section, but must not fan out remote
      // requests for every stale temporary mapping when this page opens.
      const result = shouldFetchRemotePrInsightActivity(projectLink)
        ? await fetchProjectLinkPrInsightArtifactsWithHistory(projectLink.id).catch(() => ({
          items: localItems as PrInsightArtifactRecord[],
          history: [],
        }))
        : { items: [], history: [] };
      return {
        items: [...result.items, ...localItems]
          .sort((a, b) => parseIsoTimestamp(b.at) - parseIsoTimestamp(a.at))
          .filter(
            (item, index, all) =>
              all.findIndex((candidate) => candidate.id === item.id) === index,
          )
          .map((item) => ({
            ...item,
            projectLinkName: projectLink.name,
            repoPath: projectLink.repoPath || ".",
          })),
        history: result.history,
      };
    }),
  );
  return {
    items: nested
      .flatMap((entry) => entry.items)
      .sort((a, b) => parseIsoTimestamp(b.at) - parseIsoTimestamp(a.at))
      .slice(0, 50),
    history: nested.flatMap((entry) => entry.history),
  };
}

export function shouldFetchRemotePrInsightActivity(
  projectLink: Pick<ProjectLink, "name" | "repoPath" | "adoRepoName">,
): boolean {
  return !isTemporaryProjectLink(projectLink) && Boolean(projectLink.adoRepoName.trim());
}
