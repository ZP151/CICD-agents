import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { buildCloudContext } from "@mergepilot/core";
import {
  adoAuthDiagnosticFromError,
  getAzureDevOpsAuth,
  getAzurePullRequestById,
  listAzurePullRequestThreads,
  type AzureBuildSummary,
  type Settings,
} from "@mergepilot/core";
import type { InlineLlmConfig, InlineProjectLink } from "../chatSession.js";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";

export const ProjectLinkIdParam = z.object({ id: z.string().min(1) });

const LlmConfigSchema = z
  .object({
    llmProvider: z.enum(["azure", "openai"]).optional(),
    azureEndpoint: z.string().optional(),
    azureApiKey: z.string().optional(),
    azureDeployment: z.string().optional(),
    azureApiVersion: z.string().optional(),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().optional(),
  })
  .optional();

const InlineProjectLinkSchema = z
  .object({
    adoOrgUrl: z.string().default(""),
    adoProject: z.string().default(""),
    adoRepoName: z.string().default(""),
    adoPat: z.string().default(""),
    targetBranch: z.string().default("main"),
  })
  .passthrough()
  .optional();

export const ReviewRunSchema = z.object({
  pullRequestId: z.coerce.number().int().positive(),
  targetBranch: z.string().default(""),
  llmConfig: LlmConfigSchema,
  projectLink: InlineProjectLinkSchema,
});

export interface ReviewRunRouteDependencies {
  settings: Settings;
  projectLinkStore: ProjectLinkStoreAdapter;
  buildReviewLlmSettings: (override?: InlineLlmConfig) => Settings;
}

export interface ReviewRunProjectLink {
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  adoPat: string;
  targetBranch: string;
}

export function sendAdoDiagnostic(reply: FastifyReply, err: unknown, authMode?: "oauth" | "pat") {
  const diagnostic = adoAuthDiagnosticFromError(err, authMode);
  return reply.code(diagnostic.status === "oauth_unavailable" ? 401 : 400).send({
    source: "internal" as const,
    error: diagnostic.message,
    authStatus: diagnostic.status,
    authMode: diagnostic.authMode,
    authMessage: diagnostic.message,
    retryable: diagnostic.retryable,
  });
}

export function readinessFromDecision(
  queue: "auto_approved" | "needs_human_review" | "blocked" | "watching",
) {
  if (queue === "auto_approved") return "ready" as const;
  if (queue === "blocked") return "blocked" as const;
  return "needs_attention" as const;
}

export function categoriesFromReviewFindings(
  findings: Array<{ severity: string; category: string; file: string; line: number }>,
) {
  const format = (finding: { category: string; file: string; line: number }) =>
    `${finding.category}: ${finding.file}:${finding.line}`;
  return {
    blocking: findings.filter((finding) => finding.severity === "blocking").map(format),
    warnings: findings.filter((finding) => finding.severity === "warning").map(format),
    info: findings.filter((finding) => finding.severity === "info").map(format),
  };
}

export function inlineProjectLinkFromReviewRunPayload(payload: z.infer<typeof ReviewRunSchema>) {
  return payload.projectLink;
}

export async function resolveReviewRunProjectLink(
  projectLinkStore: ProjectLinkStoreAdapter,
  projectLinkId: string,
  inlineProjectLink?: InlineProjectLink,
): Promise<ReviewRunProjectLink | null> {
  const stored = await projectLinkStore.getProjectLinkForRequest(projectLinkId, inlineProjectLink);
  if (!stored) return null;
  return {
    adoOrgUrl: stored.adoOrgUrl,
    adoProject: stored.adoProject,
    adoRepoName: stored.adoRepoName,
    adoPat: stored.adoPat,
    targetBranch: stored.targetBranch,
  };
}

export async function enrichBundleWithPrSignals(args: {
  projectLink: ReviewRunProjectLink;
  repository: string;
  pullRequestId: number;
  bundle: Awaited<ReturnType<typeof buildCloudContext>>;
}) {
  const { projectLink, repository, pullRequestId } = args;
  const adoAuth = await getAzureDevOpsAuth(projectLink.adoPat);
  const pullRequest = await getAzurePullRequestById({
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    repository,
    pullRequestId,
    auth: adoAuth,
    includeWorkItemRefs: true,
  });
  const [threads] = await Promise.all([
    listAzurePullRequestThreads({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository,
      pullRequestId,
      auth: adoAuth,
      top: 100,
    }),
  ]);
  const builds: AzureBuildSummary[] = [];
  const latestBuild = builds[0];
  return {
    ...args.bundle,
    pullRequest: {
      title: pullRequest.title,
      description: pullRequest.description,
      status: pullRequest.status,
      isDraft: pullRequest.isDraft,
      sourceBranch: pullRequest.sourceBranch,
      targetBranch: pullRequest.targetBranch,
      createdBy: pullRequest.createdBy,
      workItemIds: pullRequest.workItemRefs.map((item) => item.id),
      reviewerCount: pullRequest.reviewerCount,
      voteSummary: pullRequest.voteSummary,
      threadCount: threads.filter((thread) => thread.comments.length > 0).length,
      activeThreadCount: threads.filter(
        (thread) => thread.comments.length > 0 && String(thread.status) !== "2",
      ).length,
      failedBuildCount: builds.filter(
        (build) => build.result === "failed" || build.result === "canceled",
      ).length,
      latestBuildResult: latestBuild?.result ?? "",
      latestBuildStatus: latestBuild?.status ?? "",
    },
  };
}
