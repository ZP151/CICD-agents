/**
 * Canonical artifact identities (delivery graph).
 *
 * Revision is part of identity for an analysis result. A new revision does
 * not erase historical evidence; it invalidates actions based on the old
 * revision. See docs/product/delivery-graph-and-action-runtime.md.
 */

export type ArtifactRef =
  | { kind: "work_item"; projectLinkId: string; id: number; revision: number }
  | { kind: "branch"; projectLinkId: string; repositoryId: string; name: string; objectId: string }
  | { kind: "commit"; projectLinkId: string; repositoryId: string; commitId: string }
  | { kind: "pull_request"; projectLinkId: string; repositoryId: string; id: number; sourceCommit: string; iterationId: number }
  | { kind: "build"; projectLinkId: string; definitionId: number; buildId: number }
  | { kind: "test_result"; projectLinkId: string; runId: number; resultId: number }
  | { kind: "environment"; projectLinkId: string; environmentId: number }
  | { kind: "deployment"; projectLinkId: string; environmentId: number; deploymentId: number };

/** Stable identity of an artifact, independent of its revision. */
export function artifactStableKey(ref: ArtifactRef): string {
  switch (ref.kind) {
    case "work_item":
      return `work_item:${ref.projectLinkId}:${ref.id}`;
    case "branch":
      return `branch:${ref.projectLinkId}:${ref.repositoryId}:${ref.name}`;
    case "commit":
      return `commit:${ref.projectLinkId}:${ref.repositoryId}:${ref.commitId}`;
    case "pull_request":
      return `pull_request:${ref.projectLinkId}:${ref.repositoryId}:${ref.id}`;
    case "build":
      return `build:${ref.projectLinkId}:${ref.definitionId}:${ref.buildId}`;
    case "test_result":
      return `test_result:${ref.projectLinkId}:${ref.runId}:${ref.resultId}`;
    case "environment":
      return `environment:${ref.projectLinkId}:${ref.environmentId}`;
    case "deployment":
      return `deployment:${ref.projectLinkId}:${ref.environmentId}:${ref.deploymentId}`;
  }
}

/** The revision component of an artifact, used for staleness checks. */
export function artifactRevision(ref: ArtifactRef): number | string | undefined {
  switch (ref.kind) {
    case "work_item":
      return ref.revision;
    case "branch":
      return ref.objectId;
    case "commit":
      return ref.commitId;
    case "pull_request":
      return ref.sourceCommit;
    case "build":
      return ref.buildId;
    case "test_result":
      return ref.resultId;
    case "environment":
      return ref.environmentId;
    case "deployment":
      return ref.deploymentId;
  }
}

/** True when the two refs point at the same artifact and same revision. */
export function sameArtifactRevision(left: ArtifactRef, right: ArtifactRef): boolean {
  return artifactStableKey(left) === artifactStableKey(right)
    && artifactRevision(left) === artifactRevision(right);
}

export function isArtifactRef(value: unknown): value is ArtifactRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const kinds: ArtifactRef["kind"][] = [
    "work_item", "branch", "commit", "pull_request", "build",
    "test_result", "environment", "deployment",
  ];
  return kinds.includes(candidate["kind"] as ArtifactRef["kind"])
    && typeof candidate["projectLinkId"] === "string";
}
