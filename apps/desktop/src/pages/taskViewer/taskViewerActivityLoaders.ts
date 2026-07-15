import {
  fetchProjectLinkPrInsightArtifactsWithHistory,
  fetchProjectLinkReviewOperations,
  type PrInsightArtifactHistoryMeta,
  type PrInsightArtifactRecord,
  type ProjectLink,
} from "../../api.js";
import {
  listPrInsightArtifacts,
} from "../../prInsightArtifacts.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";

export async function loadReviewActivity(
  projectLinks: ProjectLink[],
): Promise<ReviewActivityItem[]> {
  const nested = await Promise.all(
    projectLinks.map(async (projectLink) => {
      const items = await fetchProjectLinkReviewOperations(projectLink.id, {
        includeLegacyFallback: false,
      });
      return items.map((item) => ({
        ...item,
        projectLinkId: projectLink.id,
        projectLinkName: projectLink.name,
      }));
    }),
  );
  return nested
    .flat()
    .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
    .slice(0, 50);
}

export async function loadPrInsightActivity(projectLinks: ProjectLink[]): Promise<{
  items: PrInsightActivityItem[];
  history: PrInsightArtifactHistoryMeta[];
}> {
  const nested = await Promise.all(
    projectLinks.map(async (projectLink) => {
      const localItems = listPrInsightArtifacts(projectLink.id);
      const result = await fetchProjectLinkPrInsightArtifactsWithHistory(projectLink.id).catch(() => ({
        items: localItems as PrInsightArtifactRecord[],
        history: [],
      }));
      return {
        items: [...result.items, ...localItems]
          .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
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
      .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
      .slice(0, 50),
    history: nested.flatMap((entry) => entry.history),
  };
}
