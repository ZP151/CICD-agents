import type { FastifyInstance } from "fastify";
import {
  appendLocalReviewOperation,
  getLocalPrInsightArtifact,
  getProjectLink,
  isAzureAuthenticationRequiredError,
  listLocalPrInsightArtifacts,
  listLocalReviewHistory,
  listLocalReviewOperations,
  listReviewQueueItems,
  summarizePrInsightArtifactHistory,
  upsertLocalPrInsightArtifact,
  upsertLocalReviewHistory,
  type ReviewOperationKind,
} from "@mergepilot/core";
import {
  PrInsightArtifactSchema,
  ReviewHistoryUpsertSchema,
  ReviewOperationSchema,
} from "./review.schemas.js";
import { registerReviewDispositionRoutes } from "./review-disposition.routes.js";
import {
  cloudPreferredProjectLink,
  localProjectLinkRepository,
  PROJECT_LINK_NOT_FOUND,
  PROJECT_LINK_REPOSITORY_MISSING,
  reviewHistoryRecord,
  type ReviewRouteDependencies,
} from "./reviewRouteSupport.js";
import { z } from "zod";

const ProjectLinkIdParam = z.object({ id: z.string().min(1) });
const PrInsightQuerySchema = z.object({
  pullRequestId: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
const PrInsightArtifactQuerySchema = z.object({
  artifactId: z.string().min(1),
});

function registerReviewRouteSet(
  app: FastifyInstance,
  prefix: "/project-links",
  { settings, projectLinkStore }: ReviewRouteDependencies,
): void {
  app.get(`${prefix}/:id/review-queue`, async (req, reply) => {
    const parsed = ProjectLinkIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const projectLink = await cloudPreferredProjectLink(settings, projectLinkStore, parsed.data.id, {
      throwOnAzureAuthFailure: true,
    });
    if (!projectLink) return reply.code(404).send({ error: PROJECT_LINK_NOT_FOUND });
    if (!settings.azureStorageAccount) {
      const items = listLocalReviewHistory({
        dataDir: settings.dataDir,
        repository: projectLink.adoRepoName,
        limit: 100,
      });
      return { items, configured: false, storage: "local" as const };
    }
    try {
      const items = await listReviewQueueItems({
        storageAccount: settings.azureStorageAccount,
        repository: projectLink.adoRepoName,
        limit: 100,
      });
      return { items, configured: true };
    } catch (err) {
      if (isAzureAuthenticationRequiredError(err)) throw err;
      return { items: [], configured: true, error: "Azure storage unavailable. Try again later." };
    }
  });

  app.post(`${prefix}/:id/review-history`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewHistoryUpsertSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const resolved = localProjectLinkRepository(settings, parsedId.data.id);
    if ("error" in resolved) return reply.code(resolved.error === PROJECT_LINK_NOT_FOUND ? 404 : 400).send({ error: resolved.error });
    if (settings.azureStorageAccount) {
      return reply.code(400).send({
        error: "cloud_configured",
        message: "Use the cloud Review Agent to persist history when Azure Table Storage is configured.",
      });
    }

    const saved = upsertLocalReviewHistory(
      settings.dataDir,
      reviewHistoryRecord(resolved.repository, parsedBody.data),
    );
    return { ok: true, record: saved, storage: "local" as const };
  });

  app.get(`${prefix}/:id/review-operations`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });

    const resolved = localProjectLinkRepository(settings, parsedId.data.id);
    if ("error" in resolved) return reply.code(resolved.error === PROJECT_LINK_NOT_FOUND ? 404 : 400).send({ error: resolved.error });
    return {
      items: listLocalReviewOperations({
        dataDir: settings.dataDir,
        repository: resolved.repository,
        limit: 50,
      }),
      storage: "local" as const,
    };
  });

  app.post(`${prefix}/:id/review-operations`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ReviewOperationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const resolved = localProjectLinkRepository(settings, parsedId.data.id);
    if ("error" in resolved) return reply.code(resolved.error === PROJECT_LINK_NOT_FOUND ? 404 : 400).send({ error: resolved.error });
    const saved = appendLocalReviewOperation(settings.dataDir, {
      kind: parsedBody.data.kind as ReviewOperationKind,
      at: parsedBody.data.at,
      repository: resolved.repository,
      pullRequestId: parsedBody.data.pullRequestId,
      actor: parsedBody.data.actor,
      label: parsedBody.data.label,
      ok: parsedBody.data.ok,
      details: parsedBody.data.details,
    });
    return { ok: true, record: saved, storage: "local" as const };
  });

  app.get(`${prefix}/:id/pr-insights`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const query = PrInsightQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const resolved = localProjectLinkRepository(settings, parsedId.data.id);
    if ("error" in resolved) return reply.code(resolved.error === PROJECT_LINK_NOT_FOUND ? 404 : 400).send({ error: resolved.error });
    const items = listLocalPrInsightArtifacts({
      dataDir: settings.dataDir,
      projectLinkId: parsedId.data.id,
      repository: resolved.repository,
      pullRequestId: query.data.pullRequestId,
      limit: query.data.limit,
    });
    return {
      items,
      history: summarizePrInsightArtifactHistory(items),
      storage: "local" as const,
    };
  });

  app.get(`${prefix}/:id/pr-insights/artifact`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const query = PrInsightArtifactQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() });

    const projectLink = getProjectLink(settings.dataDir, parsedId.data.id);
    if (!projectLink) return reply.code(404).send({ error: PROJECT_LINK_NOT_FOUND });
    const record = getLocalPrInsightArtifact({
      dataDir: settings.dataDir,
      projectLinkId: parsedId.data.id,
      artifactId: query.data.artifactId,
    });
    if (!record) return reply.code(404).send({ error: "artifact not found" });
    return { record, storage: "local" as const };
  });

  app.post(`${prefix}/:id/pr-insights`, async (req, reply) => {
    const parsedId = ProjectLinkIdParam.safeParse(req.params);
    if (!parsedId.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = PrInsightArtifactSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const projectLink = getProjectLink(settings.dataDir, parsedId.data.id);
    if (!projectLink) return reply.code(404).send({ error: PROJECT_LINK_NOT_FOUND });
    const repository = parsedBody.data.repository.trim() || projectLink.adoRepoName.trim();
    if (!repository) return reply.code(400).send({ error: PROJECT_LINK_REPOSITORY_MISSING });

    const saved = upsertLocalPrInsightArtifact(settings.dataDir, {
      projectLinkId: parsedId.data.id,
      repository,
      pullRequestId: parsedBody.data.pullRequestId,
      title: parsedBody.data.title,
      kind: parsedBody.data.kind,
      at: parsedBody.data.at,
      summary: parsedBody.data.summary,
      readiness: parsedBody.data.readiness,
      decisionQueue: parsedBody.data.decisionQueue,
      decisionRiskLevel: parsedBody.data.decisionRiskLevel,
      contextConfidence: parsedBody.data.contextConfidence,
      risks: parsedBody.data.risks,
      categories: parsedBody.data.categories,
      signals: parsedBody.data.signals,
      iterationId: parsedBody.data.iterationId,
      sourceCommit: parsedBody.data.sourceCommit,
      findingCount: parsedBody.data.findingCount,
      discardedFindingCount: parsedBody.data.discardedFindingCount,
      tokensIn: parsedBody.data.tokensIn,
      tokensOut: parsedBody.data.tokensOut,
    });
    return { ok: true, record: saved, storage: "local" as const };
  });

  registerReviewDispositionRoutes(app, prefix, { settings, projectLinkStore });
}

export function registerReviewRoutes(
  app: FastifyInstance,
  dependencies: ReviewRouteDependencies,
): void {
  registerReviewRouteSet(app, "/project-links", dependencies);
}
