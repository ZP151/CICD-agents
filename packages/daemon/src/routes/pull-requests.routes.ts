import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getAzureDevOpsAuth,
  listAzurePullRequests,
} from "@mergepilot/core";
import { buildPullRequestInsightPreview, loadPullRequestContext } from "./pullRequestInsight.js";
import {
  assertAdoProjectLink,
  inlineProjectLinkFromPayload,
  parsePullRequestStatus,
  ProjectLinkIdParam,
  ProjectLinkPayloadSchema,
  ProjectLinkPrInsightPreviewBodySchema,
  ProjectLinkPullRequestParam,
  sendAdoDiagnostic,
  type AdoAuth,
  type PullRequestRouteDependencies,
} from "./pullRequestRouteSupport.js";

function registerPullRequestRouteSet(
  app: FastifyInstance,
  prefix: "/project-links",
  { projectLinkStore, buildReviewLlmSettings }: PullRequestRouteDependencies,
): void {
  const pullRequestsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ProjectLinkIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ProjectLinkPayloadSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });
    const status = parsePullRequestStatus(req.query as Record<string, unknown>);

    const projectLink = await projectLinkStore.getProjectLinkForRequest(
      parsed.data.id,
      inlineProjectLinkFromPayload(parsedBody.data),
    );
    if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
    if (!assertAdoProjectLink(projectLink, reply)) return;

    const adoAuth = await getAzureDevOpsAuth(projectLink.adoPat);
    const prs = await listAzurePullRequests({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repository: projectLink.adoRepoName,
      auth: adoAuth,
      status,
      top: 50,
    });
    return {
      pullRequests: prs.map((pr) => ({
        ...pr,
      })),
    };
  };
  app.get(`${prefix}/:id/pull-requests`, pullRequestsHandler);
  app.post(`${prefix}/:id/pull-requests`, pullRequestsHandler);

  const pullRequestContextHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ProjectLinkPullRequestParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ProjectLinkPayloadSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const projectLink = await projectLinkStore.getProjectLinkForRequest(
      parsed.data.id,
      inlineProjectLinkFromPayload(parsedBody.data),
    );
    if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
    if (!assertAdoProjectLink(projectLink, reply)) return;

    let adoAuth: AdoAuth;
    try {
      adoAuth = await getAzureDevOpsAuth(projectLink.adoPat);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, projectLink.adoPat ? "pat" : "oauth");
    }

    try {
      return {
        source: "internal" as const,
        ...await loadPullRequestContext({
          projectLink,
          pullRequestId: parsed.data.pullRequestId,
          adoAuth,
        }),
      };
    } catch (err) {
      return sendAdoDiagnostic(reply, err, adoAuth.mode);
    }
  };
  app.get(`${prefix}/:id/pull-requests/:pullRequestId/context`, pullRequestContextHandler);
  app.post(`${prefix}/:id/pull-requests/:pullRequestId/context`, pullRequestContextHandler);

  app.post(`${prefix}/:id/pull-requests/:pullRequestId/insight-preview`, async (req, reply) => {
    const parsed = ProjectLinkPullRequestParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const parsedBody = ProjectLinkPrInsightPreviewBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });

    const projectLink = await projectLinkStore.getProjectLinkForRequest(
      parsed.data.id,
      inlineProjectLinkFromPayload(parsedBody.data),
    );
    if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
    if (!assertAdoProjectLink(projectLink, reply)) return;

    let adoAuth: AdoAuth;
    try {
      adoAuth = await getAzureDevOpsAuth(projectLink.adoPat);
    } catch (err) {
      return sendAdoDiagnostic(reply, err, projectLink.adoPat ? "pat" : "oauth");
    }

    try {
      return await buildPullRequestInsightPreview({
        projectLink,
        pullRequestId: parsed.data.pullRequestId,
        adoAuth,
        llmConfig: parsedBody.data.llmConfig,
        buildReviewLlmSettings,
      });
    } catch (err) {
      return sendAdoDiagnostic(reply, err, adoAuth.mode);
    }
  });
}

export function registerPullRequestRoutes(
  app: FastifyInstance,
  dependencies: PullRequestRouteDependencies,
): void {
  registerPullRequestRouteSet(app, "/project-links", dependencies);
}
