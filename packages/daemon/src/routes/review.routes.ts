import type { FastifyInstance } from "fastify";
import {
  getLocalPrInsightArtifact,
  getProjectLink,
  listLocalPrInsightArtifacts,
  summarizePrInsightArtifactHistory,
  upsertLocalPrInsightArtifact,
} from "@mergepilot/core";
import { PrInsightArtifactSchema } from "./review.schemas.js";
import {
  localProjectLinkRepository,
  PROJECT_LINK_NOT_FOUND,
  PROJECT_LINK_REPOSITORY_MISSING,
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
  { settings }: ReviewRouteDependencies,
): void {
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
}

export function registerReviewRoutes(
  app: FastifyInstance,
  dependencies: ReviewRouteDependencies,
): void {
  registerReviewRouteSet(app, "/project-links", dependencies);
}
