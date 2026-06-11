import fs from "node:fs";
import path from "node:path";

export type PrInsightArtifactKind = "insight_preview" | "review_run";

export interface PrInsightArtifactRecord {
  id: string;
  profileId: string;
  repository: string;
  pullRequestId: number;
  title: string;
  kind: PrInsightArtifactKind;
  at: string;
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  decisionQueue?: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel?: "low" | "medium" | "high";
  contextConfidence?: "high" | "medium" | "low" | "";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals?: {
    fileCount: number;
    threadCount: number;
    failedBuildCount: number;
    workItemCount: number;
  };
  iterationId?: number;
  sourceCommit?: string;
  findingCount?: number;
  discardedFindingCount?: number;
  tokensIn: number;
  tokensOut: number;
}

type PrInsightArtifactStore = PrInsightArtifactRecord[];

const MAX_PR_INSIGHT_ARTIFACTS = 500;

export function prInsightArtifactsStorePath(dataDir: string): string {
  return path.join(dataDir, "pr-insight-artifacts.json");
}

function artifactId(
  input: Pick<PrInsightArtifactRecord, "profileId" | "repository" | "pullRequestId" | "kind">,
  at: string,
): string {
  return `${input.profileId}/${input.repository}/${input.pullRequestId}/${input.kind}/${encodeURIComponent(at)}`;
}

function loadStore(dataDir: string): PrInsightArtifactStore {
  const p = prInsightArtifactsStorePath(dataDir);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed as PrInsightArtifactStore : [];
  } catch {
    return [];
  }
}

function saveStore(dataDir: string, store: PrInsightArtifactStore): void {
  const p = prInsightArtifactsStorePath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store.slice(0, MAX_PR_INSIGHT_ARTIFACTS), null, 2), "utf8");
}

export function upsertLocalPrInsightArtifact(
  dataDir: string,
  artifact: Omit<PrInsightArtifactRecord, "id" | "at"> & {
    id?: string;
    at?: string;
  },
): PrInsightArtifactRecord {
  const at = artifact.at ?? new Date().toISOString();
  const saved: PrInsightArtifactRecord = {
    ...artifact,
    id: artifact.id ?? artifactId(artifact, at),
    at,
  };
  const next = [saved, ...loadStore(dataDir).filter((item) => item.id !== saved.id)]
    .slice(0, MAX_PR_INSIGHT_ARTIFACTS);
  saveStore(dataDir, next);
  return saved;
}

export function listLocalPrInsightArtifacts(args: {
  dataDir: string;
  profileId?: string;
  repository?: string;
  pullRequestId?: number;
  limit?: number;
}): PrInsightArtifactRecord[] {
  const profileId = args.profileId?.trim() ?? "";
  const repository = args.repository?.trim() ?? "";
  const events = loadStore(args.dataDir)
    .filter((artifact) => !profileId || artifact.profileId === profileId)
    .filter((artifact) => !repository || artifact.repository === repository)
    .filter((artifact) => args.pullRequestId === undefined || artifact.pullRequestId === args.pullRequestId)
    .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
  if (args.limit && args.limit > 0) return events.slice(0, args.limit);
  return events;
}
