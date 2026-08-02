import { isTemporaryProjectLink } from "../../projectLinks.js";

export interface ProjectLinkedActivity {
  projectLinkId?: string | null;
  projectLinkName?: string | null;
  repoPath?: string | null;
}

/**
 * Live-test and one-off workspace links create useful diagnostics, but they
 * should not crowd the history a developer opens to understand real work.
 * Prefer the persisted link identity, then fall back to its displayed context
 * so stale activity remains classifiable after a temporary link is deleted.
 */
export function isTemporaryActivity(
  item: ProjectLinkedActivity,
  temporaryProjectLinkIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    (item.projectLinkId && temporaryProjectLinkIds.has(item.projectLinkId)) ||
      isTemporaryProjectLink({
        name: item.projectLinkName ?? "",
        repoPath: item.repoPath ?? "",
      }),
  );
}

export function partitionActivity<T extends ProjectLinkedActivity>(
  items: readonly T[],
  temporaryProjectLinkIds: ReadonlySet<string>,
): { primary: T[]; temporary: T[] } {
  return items.reduce<{ primary: T[]; temporary: T[] }>(
    (groups, item) => {
      groups[isTemporaryActivity(item, temporaryProjectLinkIds) ? "temporary" : "primary"].push(item);
      return groups;
    },
    { primary: [], temporary: [] },
  );
}
