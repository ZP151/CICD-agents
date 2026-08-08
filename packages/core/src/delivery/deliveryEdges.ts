/**
 * Delivery relationships between canonical artifacts.
 *
 * An inferred edge must never be serialized as an ADO fact: its `source`
 * stays `derived` and it is recomputed when inputs change. ADO/Git edges are
 * recorded facts with evidence URLs.
 */
import type { ArtifactRef } from "./artifactRef.js";
import { snapshotKey } from "./observations.js";

export type DeliveryEdgeKind =
  | "implements"
  | "parent_of"
  | "depends_on"
  | "contains_commit"
  | "proposed_by"
  | "validated_by"
  | "reviewed_by"
  | "built_by"
  | "tested_by"
  | "deployed_by"
  | "deployed_to"
  | "caused_by"
  | "followed_up_by";

export type DeliveryEdgeSource = "ado" | "git" | "derived";

export interface DeliveryEdge {
  from: ArtifactRef;
  to: ArtifactRef;
  kind: DeliveryEdgeKind;
  source: DeliveryEdgeSource;
  observedAt: number;
  evidenceUrl?: string;
  /** Present only for derived edges. */
  confidence?: number;
}

export function edgeKey(from: ArtifactRef, to: ArtifactRef, kind: DeliveryEdgeKind): string {
  return `${snapshotKey(from)}|${kind}|${snapshotKey(to)}`;
}

/** Immutable observation edge: recorded from ADO/Git, never recomputed away. */
export function factEdge(
  from: ArtifactRef,
  to: ArtifactRef,
  kind: DeliveryEdgeKind,
  observedAt: number,
  evidenceUrl?: string,
): DeliveryEdge {
  return { from, to, kind, source: "ado", observedAt, evidenceUrl };
}

/** Inferred edge: recomputed when inputs change, never persisted as ADO fact. */
export function derivedEdge(
  from: ArtifactRef,
  to: ArtifactRef,
  kind: DeliveryEdgeKind,
  observedAt: number,
  confidence: number,
): DeliveryEdge {
  return { from, to, kind, source: "derived", observedAt, confidence };
}
