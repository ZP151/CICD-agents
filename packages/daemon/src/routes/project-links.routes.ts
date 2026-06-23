import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adoAuthDiagnosticFromError,
  checkAzureDevOpsTools,
  listAzureBuildDefinitions,
  listAzureProjects,
  listAzureRepositories,
  type ProjectLinkInput,
} from "@mergepilot/core";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";
import { z } from "zod";

type AdoDiscoveryKind = "projects" | "repositories" | "pipelines";

interface AdoDiscoveryOption {
  id: string;
  name: string;
  description: string;
  url: string;
}

const ProjectLinkIdParam = z.object({ id: z.string().min(1) });

const ProjectLinkBodySchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoMcpEnabled: z.coerce.boolean().default(false),
  adoMcpCommand: z.string().default(""),
  adoMcpAuthentication: z.string().default(""),
  adoMcpDomains: z.string().default("repositories,pipelines,work-items"),
  projectTemplate: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
});

const AdoDiscoverySchema = z.object({
  kind: z.enum(["projects", "repositories", "pipelines"]),
  projectLink: ProjectLinkBodySchema.partial().optional(),
});

const AdoMcpCheckSchema = z.object({
  projectLink: ProjectLinkBodySchema.partial().optional(),
});

async function discoverAdoOptions(
  kind: AdoDiscoveryKind,
  projectLink: Partial<z.infer<typeof ProjectLinkBodySchema>>,
): Promise<AdoDiscoveryOption[]> {
  const organization = projectLink.adoOrgUrl ?? "";
  const pat = projectLink.adoPat ?? "";
  if (kind === "projects") {
    return listAzureProjects({ organization, pat, top: 100 });
  }
  if (kind === "repositories") {
    if (!projectLink.adoProject) throw new Error("ado_project_required");
    return listAzureRepositories({ organization, project: projectLink.adoProject, pat, top: 100 });
  }
  if (!projectLink.adoProject) throw new Error("ado_project_required");
  return listAzureBuildDefinitions({
    organization,
    project: projectLink.adoProject,
    repositoryId: projectLink.adoRepoName || undefined,
    repositoryType: projectLink.adoRepoName ? "TfsGit" : undefined,
    pat,
    top: 100,
  });
}

function sendAdoDiagnostic(reply: FastifyReply, err: unknown, authMode?: "oauth" | "pat") {
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

function projectLinkFromDiscoveryBody(
  data: z.infer<typeof AdoDiscoverySchema> | z.infer<typeof AdoMcpCheckSchema>,
): Partial<z.infer<typeof ProjectLinkBodySchema>> {
  return data.projectLink ?? {};
}

function registerProjectLinkRouteSet(
  app: FastifyInstance,
  prefix: "/project-links",
  projectLinkStore: ProjectLinkStoreAdapter,
): void {
  app.get(prefix, async () => projectLinkStore.listProjectLinks());

  app.get(`${prefix}/:id`, async (req, reply) => {
    const parsed = ProjectLinkIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const projectLink = await projectLinkStore.getProjectLink(parsed.data.id);
    if (!projectLink) return reply.code(404).send({ error: "Project Link not found" });
    return projectLink;
  });

  app.post(prefix, async (req, reply) => {
    const parsed = ProjectLinkBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const projectLink = await projectLinkStore.createProjectLink(parsed.data as ProjectLinkInput);
    return reply.code(201).send(projectLink);
  });

  app.put(`${prefix}/:id`, async (req, reply) => {
    const paramParsed = ProjectLinkIdParam.safeParse(req.params);
    if (!paramParsed.success) return reply.code(400).send({ error: "invalid id" });
    const bodyParsed = ProjectLinkBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });
    const updated = await projectLinkStore.updateProjectLink(paramParsed.data.id, bodyParsed.data);
    if (!updated) return reply.code(404).send({ error: "Project Link not found" });
    return updated;
  });

  app.delete(`${prefix}/:id`, async (req, reply) => {
    const parsed = ProjectLinkIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const ok = await projectLinkStore.deleteProjectLink(parsed.data.id);
    if (!ok) return reply.code(404).send({ error: "Project Link not found" });
    return { ok: true };
  });

  app.post(`${prefix}/discover`, async (req, reply) => {
    const parsed = AdoDiscoverySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const projectLink = projectLinkFromDiscoveryBody(parsed.data);
    if (!projectLink.adoOrgUrl) return reply.code(400).send({ error: "ado_org_required" });
    try {
      return {
        source: "internal" as const,
        kind: parsed.data.kind,
        items: await discoverAdoOptions(parsed.data.kind, projectLink),
      };
    } catch (err) {
      return sendAdoDiagnostic(reply, err, projectLink.adoPat ? "pat" : "oauth");
    }
  });

  const checkAdoToolsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = AdoMcpCheckSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const projectLink = projectLinkFromDiscoveryBody(parsed.data);
    if (!projectLink.adoOrgUrl) return reply.code(400).send({ error: "ado_org_required" });
    try {
      return await checkAzureDevOpsTools({
        organization: projectLink.adoOrgUrl,
        pat: projectLink.adoPat,
      });
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, projectLink.adoPat ? "pat" : "oauth");
      return reply.code(400).send({
        ok: false,
        source: "internal" as const,
        authMode: diagnostic.authMode,
        authStatus: diagnostic.status,
        authMessage: diagnostic.message,
        retryable: diagnostic.retryable,
        error: diagnostic.message,
      });
    }
  };
  app.post(`${prefix}/check-ado-tools`, checkAdoToolsHandler);
  app.post(`${prefix}/check-mcp`, checkAdoToolsHandler);

  app.post(`${prefix}/migrate`, async (_req, reply) => {
    const result = await projectLinkStore.migrateLocalProjectLinksToCloud();
    if (!result.ok) {
      return reply.code(400).send({
        error: result.error,
        message: result.message,
      });
    }
    return {
      migrated: result.migrated,
      skipped: result.skipped,
      total: result.total,
    };
  });
}

export function registerProjectLinkRoutes(
  app: FastifyInstance,
  { projectLinkStore }: { projectLinkStore: ProjectLinkStoreAdapter },
): void {
  registerProjectLinkRouteSet(app, "/project-links", projectLinkStore);
}
