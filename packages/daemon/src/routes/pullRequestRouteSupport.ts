import type { FastifyReply } from "fastify";
import type { getAzureDevOpsAuth } from "@mergepilot/core";
import { adoAuthDiagnosticFromError, type Settings } from "@mergepilot/core";
import { z } from "zod";
import type { InlineLlmConfig } from "../chatSession.js";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";

export const LlmConfigSchema = z
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

export const InlineProjectLinkSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    repoPath: z.string().default(""),
    defaultBranch: z.string().default("main"),
    targetBranch: z.string().default("main"),
    adoOrgUrl: z.string().default(""),
    adoProject: z.string().default(""),
    adoRepoName: z.string().default(""),
    adoPat: z.string().default(""),
    // Pipeline identity is live for PR pipeline-run attachment and pipeline
    // target resolution; only MCP command/auth and template snapshot fields
    // were removed as dead in Phase 3.
    adoPipelineId: z.string().default(""),
    adoPipelineName: z.string().default(""),
    adoMcpEnabled: z.coerce.boolean().default(false),
    adoMcpDomains: z.string().default("repositories,pipelines,work-items"),
    buildCommand: z.string().default(""),
    testCommand: z.string().default(""),
    ignoredGlobs: z.array(z.string()).default([]),
  })
  .optional();

export const ProjectLinkIdParam = z.object({ id: z.string().min(1) });

export const ProjectLinkPullRequestParam = z.object({
  id: z.string().min(1),
  pullRequestId: z.coerce.number().int().positive(),
});

export const ProjectLinkPayloadSchema = z
  .object({
    projectLink: InlineProjectLinkSchema,
  })
  .default({});

export const ProjectLinkPrInsightPreviewBodySchema = z
  .object({
    llmConfig: LlmConfigSchema,
    projectLink: InlineProjectLinkSchema,
  })
  .default({});

export type AdoAuth = Awaited<ReturnType<typeof getAzureDevOpsAuth>>;
export type PullRequestProjectLink = NonNullable<
  Awaited<ReturnType<ProjectLinkStoreAdapter["getProjectLinkForRequest"]>>
>;

export interface PullRequestRouteDependencies {
  projectLinkStore: ProjectLinkStoreAdapter;
  buildReviewLlmSettings(override?: InlineLlmConfig): Settings;
}

export type InlineProjectLinkPayload = {
  projectLink?: z.infer<typeof InlineProjectLinkSchema>;
};

export function inlineProjectLinkFromPayload(payload: InlineProjectLinkPayload) {
  return payload.projectLink;
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

export function assertAdoProjectLink(
  projectLink: PullRequestProjectLink,
  reply: FastifyReply,
): boolean {
  if (projectLink.adoOrgUrl && projectLink.adoProject && projectLink.adoRepoName) return true;
  reply.code(400).send({ error: "ado_project_link_incomplete" });
  return false;
}

export function parsePullRequestStatus(
  query: Record<string, unknown>,
): "active" | "completed" | "abandoned" | "all" {
  const statusParam = typeof query["status"] === "string" ? String(query["status"]) : "active";
  return ["active", "completed", "abandoned", "all"].includes(statusParam)
    ? (statusParam as "active" | "completed" | "abandoned" | "all")
    : "active";
}
