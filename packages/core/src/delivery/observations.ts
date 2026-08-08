/**
 * Delivery observations (event ingestion model).
 *
 * Sources: explicit user refresh, ADO Service Hooks, local Git changes,
 * recovery polling. Hook delivery is at-least-once: event ids and artifact
 * revisions are deduplicated, and hook payloads are hints — the runtime
 * re-reads the artifact before making a decision.
 */
import type { ArtifactRef } from "./artifactRef.js";

export type ObservationSource = "service_hook" | "poll" | "user" | "local_git";

export interface DeliveryObservationEvent {
  id: string;
  projectLinkId: string;
  artifact: ArtifactRef;
  eventType: string;
  observedAt: number;
  source: ObservationSource;
  correlationId?: string;
}

/** A canonical, immutable snapshot of one artifact at one observation. */
export interface ArtifactSnapshot {
  ref: ArtifactRef;
  projectLinkId: string;
  observedAt: number;
  source: ObservationSource;
  fields: Record<string, unknown>;
  relations: string[];
  /** Evidence URL when the observation came from an ADO link. */
  evidenceUrl?: string;
}

export function snapshotKey(ref: ArtifactRef): string {
  switch (ref.kind) {
    case "work_item":
      return `wi:${ref.projectLinkId}:${ref.id}`;
    case "branch":
      return `branch:${ref.projectLinkId}:${ref.repositoryId}:${ref.name}`;
    case "commit":
      return `commit:${ref.projectLinkId}:${ref.repositoryId}:${ref.commitId}`;
    case "pull_request":
      return `pr:${ref.projectLinkId}:${ref.repositoryId}:${ref.id}`;
    case "build":
      return `build:${ref.projectLinkId}:${ref.definitionId}:${ref.buildId}`;
    case "test_result":
      return `test:${ref.projectLinkId}:${ref.runId}:${ref.resultId}`;
    case "environment":
      return `env:${ref.projectLinkId}:${ref.environmentId}`;
    case "deployment":
      return `deploy:${ref.projectLinkId}:${ref.environmentId}:${ref.deploymentId}`;
    case "git_workspace":
      return `ws:${ref.projectLinkId}:${ref.repoPath}`;
    case "git_commit":
      return `commit:${ref.projectLinkId}:${ref.repoPath}`;
    case "git_branch":
      return `branch:${ref.projectLinkId}:${ref.repoPath}:${ref.name}`;
    case "git_remote":
      return `remote:${ref.projectLinkId}:${ref.repoPath}:${ref.remote}:${ref.branch}`;
    case "git_remote_refs":
      return `remote-refs:${ref.projectLinkId}:${ref.repoPath}:${ref.remote}`;
  }
}
