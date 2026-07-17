import type { PullRequestInsightPreview, ReviewRunResult } from "./api.js";
import { parseSortableDate } from "./safeDate.js";

export const PR_INSIGHT_ARTIFACTS_LS_KEY = "mergepilot_pr_insight_artifacts_v1";
const MAX_PR_INSIGHT_ARTIFACTS = 100;

export type PrInsightArtifactKind = "insight_preview" | "review_run";

export interface PrInsightArtifact {
  id: string;
  projectLinkId: string;
  repository: string;
  pullRequestId: number;
  title: string;
  kind: PrInsightArtifactKind;
  at: string;
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  decisionQueue?: ReviewRunResult["decisionQueue"];
  decisionRiskLevel?: ReviewRunResult["decisionRiskLevel"];
  contextConfidence?: ReviewRunResult["contextConfidence"] | "";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals?: PullRequestInsightPreview["signals"];
  iterationId?: number;
  sourceCommit?: string;
  findingCount?: number;
  discardedFindingCount?: number;
  tokensIn: number;
  tokensOut: number;
}

type PrInsightArtifactStore = PrInsightArtifact[];
type ProjectLinkIdentityInput = { projectLinkId?: string };

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function prInsightArtifactProjectLinkId(input: ProjectLinkIdentityInput): string {
  return input.projectLinkId || "";
}

function artifactId(
  input: ProjectLinkIdentityInput & Pick<PrInsightArtifact, "repository" | "pullRequestId" | "kind">,
  at: string,
): string {
  return `${prInsightArtifactProjectLinkId(input)}/${input.repository}/${input.pullRequestId}/${input.kind}/${encodeURIComponent(at)}`;
}

function loadStore(): PrInsightArtifactStore {
  try {
    const target = storage();
    if (!target) return [];
    const raw = target.getItem(PR_INSIGHT_ARTIFACTS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PrInsightArtifactStore : [];
  } catch {
    return [];
  }
}

function saveStore(store: PrInsightArtifactStore): void {
  storage()?.setItem(PR_INSIGHT_ARTIFACTS_LS_KEY, JSON.stringify(store.slice(0, MAX_PR_INSIGHT_ARTIFACTS)));
}

export function listPrInsightArtifacts(projectLinkId?: string): PrInsightArtifact[] {
  const targetProjectLinkId = projectLinkId?.trim() ?? "";
  return loadStore()
    .filter((artifact) => !targetProjectLinkId || prInsightArtifactProjectLinkId(artifact) === targetProjectLinkId)
    .sort((a, b) => parseSortableDate(b.at) - parseSortableDate(a.at));
}

export function latestPrInsightArtifact(args: {
  projectLinkId?: string;
  repository: string;
  pullRequestId: number;
}): PrInsightArtifact | null {
  const artifacts = listPrInsightArtifacts(prInsightArtifactProjectLinkId(args))
    .filter((artifact) => artifact.repository === args.repository && artifact.pullRequestId === args.pullRequestId);
  return artifacts[0] ?? null;
}

export function savePrInsightPreviewArtifact(args: {
  projectLinkId?: string;
  repository: string;
  pullRequestId: number;
  title: string;
  result: PullRequestInsightPreview;
  at?: string;
}): PrInsightArtifact {
  const at = args.at ?? new Date().toISOString();
  const projectLinkId = prInsightArtifactProjectLinkId(args);
  const artifact: PrInsightArtifact = {
    id: artifactId({ ...args, kind: "insight_preview" }, at),
    projectLinkId,
    repository: args.repository,
    pullRequestId: args.pullRequestId,
    title: args.title,
    kind: "insight_preview",
    at,
    summary: args.result.summary,
    readiness: args.result.readiness,
    risks: args.result.risks,
    categories: args.result.categories,
    signals: args.result.signals,
    tokensIn: args.result.tokensIn,
    tokensOut: args.result.tokensOut,
  };
  const next = [artifact, ...loadStore().filter((item) => item.id !== artifact.id)]
    .slice(0, MAX_PR_INSIGHT_ARTIFACTS);
  saveStore(next);
  return artifact;
}

export function savePrReviewRunArtifact(args: {
  projectLinkId?: string;
  repository: string;
  pullRequestId: number;
  title: string;
  result: ReviewRunResult;
  at?: string;
}): PrInsightArtifact {
  const at = args.at ?? args.result.lastRunAt ?? new Date().toISOString();
  const projectLinkId = prInsightArtifactProjectLinkId(args);
  const artifact: PrInsightArtifact = {
    id: artifactId({ ...args, kind: "review_run" }, at),
    projectLinkId,
    repository: args.repository,
    pullRequestId: args.pullRequestId,
    title: args.title,
    kind: "review_run",
    at,
    summary: args.result.summary,
    readiness: args.result.readiness,
    decisionQueue: args.result.decisionQueue,
    decisionRiskLevel: args.result.decisionRiskLevel,
    contextConfidence: args.result.contextConfidence,
    risks: [
      ...(args.result.categories?.blocking ?? []),
      ...(args.result.categories?.warnings ?? []),
      ...(args.result.categories?.info ?? []),
    ],
    categories: args.result.categories,
    iterationId: args.result.iterationId,
    sourceCommit: args.result.sourceCommit,
    findingCount: args.result.findingCount,
    discardedFindingCount: args.result.discardedFindings?.length ?? 0,
    tokensIn: args.result.tokensIn,
    tokensOut: args.result.tokensOut,
  };
  const next = [artifact, ...loadStore().filter((item) => item.id !== artifact.id)]
    .slice(0, MAX_PR_INSIGHT_ARTIFACTS);
  saveStore(next);
  return artifact;
}

export function clearPrInsightArtifacts(): void {
  storage()?.removeItem(PR_INSIGHT_ARTIFACTS_LS_KEY);
}

export interface PrInsightArtifactComparison {
  previewId: string;
  reviewId: string;
  readinessChanged: boolean;
  previewReadiness?: PrInsightArtifact["readiness"];
  reviewReadiness?: PrInsightArtifact["readiness"];
  addedRisks: string[];
  resolvedRisks: string[];
  findingCountDelta: number | null;
  tokenDelta: number;
}

export function comparePrInsightArtifacts(
  preview: PrInsightArtifact | null | undefined,
  review: PrInsightArtifact | null | undefined,
): PrInsightArtifactComparison | null {
  if (!preview || !review) return null;
  if (preview.kind !== "insight_preview" || review.kind !== "review_run") return null;
  if (prInsightArtifactProjectLinkId(preview) !== prInsightArtifactProjectLinkId(review)) return null;
  if (preview.repository !== review.repository) return null;
  if (preview.pullRequestId !== review.pullRequestId) return null;

  const previewRisks = new Set(preview.risks);
  const reviewRisks = new Set(review.risks);
  const addedRisks = review.risks.filter((risk) => !previewRisks.has(risk));
  const resolvedRisks = preview.risks.filter((risk) => !reviewRisks.has(risk));
  return {
    previewId: preview.id,
    reviewId: review.id,
    readinessChanged: preview.readiness !== review.readiness,
    previewReadiness: preview.readiness,
    reviewReadiness: review.readiness,
    addedRisks,
    resolvedRisks,
    findingCountDelta: typeof review.findingCount === "number" && typeof preview.findingCount === "number"
      ? review.findingCount - preview.findingCount
      : null,
    tokenDelta: (review.tokensIn + review.tokensOut) - (preview.tokensIn + preview.tokensOut),
  };
}

export interface PrInsightArtifactFreshness {
  state: "fresh" | "stale" | "unknown";
  reasons: Array<"missing_baseline" | "iteration_changed" | "source_commit_changed">;
  label: string;
}

export function prInsightArtifactFreshness(
  artifact: Pick<PrInsightArtifact, "iterationId" | "sourceCommit"> | null | undefined,
  current: { iterationId?: number; sourceCommit?: string } | null | undefined,
): PrInsightArtifactFreshness {
  if (!artifact?.iterationId && !artifact?.sourceCommit) {
    return {
      state: "unknown",
      reasons: ["missing_baseline"],
      label: "freshness not available: no saved PR baseline",
    };
  }
  if (!current?.iterationId && !current?.sourceCommit) {
    return {
      state: "unknown",
      reasons: [],
      label: "freshness not available: current PR baseline unavailable",
    };
  }

  const reasons: PrInsightArtifactFreshness["reasons"] = [];
  if (
    typeof artifact.iterationId === "number" &&
    typeof current.iterationId === "number" &&
    artifact.iterationId !== current.iterationId
  ) {
    reasons.push("iteration_changed");
  }
  if (
    artifact.sourceCommit &&
    current.sourceCommit &&
    artifact.sourceCommit !== current.sourceCommit
  ) {
    reasons.push("source_commit_changed");
  }

  if (reasons.length > 0) {
    return {
      state: "stale",
      reasons,
      label: "stale: PR changed since saved AI insight",
    };
  }
  return {
    state: "fresh",
    reasons: [],
    label: "fresh: matches current PR baseline",
  };
}
