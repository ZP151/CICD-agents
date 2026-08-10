import type { FastifyInstance } from "fastify";
import {
  ActionVerifier,
  AdoActionTransport,
  buildDeploymentReadiness,
  deliveryTelemetry,
  classifyEvidenceCoverage,
  detectWorkItemDrift,
  listAzureDeployments,
  listAzureEnvironmentApprovals,
  listAzureEnvironments,
  queryAzureWorkItems,
  classifyFailure,
  DeliveryActionExecutor,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  failureSignatureFor,
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  getAzureDevOpsAuth,
  isArtifactRef,
  listAzureBuilds,
  redactLogText,
  SqliteDeliveryActionStore,
  type ArtifactRef,
} from "@mergepilot/core";
import { z } from "zod";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";

const ArtifactRefSchema = z.custom<ArtifactRef>(isArtifactRef, {
  message: "invalid ArtifactRef: must include a known kind and projectLinkId",
});

function plainWorkItemText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
  return text || undefined;
}

/** The Work workspace is an assigned-work view, never a production fixture feed. */
export const WORK_ITEMS_QUERY =
  "SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.IterationPath], [System.Description], [Microsoft.VSTS.Common.AcceptanceCriteria] " +
  "FROM WorkItems WHERE [System.AssignedTo] = @me " +
  "AND [System.State] <> 'Closed' AND [System.State] <> 'Done' ORDER BY [System.ChangedDate] DESC";

const VerificationPredicateSchema = z.object({
  artifact: ArtifactRefSchema,
  condition: z.enum(["exists", "not_exists", "field_eq", "relation_present", "revision_gt", "run_visible", "comment_contains"]),
  field: z.string().optional(),
  expected: z.unknown().optional(),
  correlation: z.string().optional(),
  expectedRevision: z.number().optional(),
});

const ProposeActionSchema = z.object({
  turnId: z.string().min(1),
  projectLinkId: z.string().min(1),
  kind: z.string().min(1),
  target: ArtifactRefSchema,
  basedOn: z.array(ArtifactRefSchema).default([]),
  payload: z.unknown().default({}),
  risk: z.enum(["low", "medium", "high", "critical"]),
  reason: z.string().min(1),
  expectedResult: z.array(VerificationPredicateSchema).default([]),
  idempotencyKey: z.string().min(1),
  expiresAt: z.number().int().positive(),
  forceApproval: z.boolean().optional(),
});

export interface DeliveryWritesState {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
}

export interface DeliveryRoutesOptions {
  projectLinkStore: ProjectLinkStoreAdapter;
  /** Global read-only kill switch state shared with the desktop. */
  writes: DeliveryWritesState;
}

export function registerDeliveryRoutes(app: FastifyInstance, options: DeliveryRoutesOptions): void {
  const { projectLinkStore, writes } = options;

  function createTransport(): AdoActionTransport {
    return new AdoActionTransport({
      resolveProjectLink: async (projectLinkId) => {
        const projectLink = await projectLinkStore.getProjectLink(projectLinkId);
        if (!projectLink) {
          throw new Error(`project link ${projectLinkId} not found`);
        }
        return {
          organization: projectLink.adoOrgUrl,
          project: projectLink.adoProject,
        };
      },
    });
  }

  function createRuntime(): DeliveryActionRuntime {
    const transport = createTransport();
    return new DeliveryActionRuntime(
      new SqliteDeliveryActionStore(),
      new DeliveryActionPolicy(),
      new DeliveryActionExecutor(transport),
      new ActionVerifier(transport),
      transport,
      { writesEnabled: () => writes.isEnabled() },
    );
  }

  app.get("/delivery/actions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await new SqliteDeliveryActionStore().get(id);
    if (!record) {
      return reply.code(404).send({ error: `no delivery action ${id}` });
    }
    return record;
  });

  app.get("/delivery/actions", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const { projectLinkId } = query;
    if (!projectLinkId) {
      return reply.code(400).send({ error: "projectLinkId query parameter is required" });
    }
    const includeTerminal = String(query.includeTerminal ?? "") === "true";
    const store = new SqliteDeliveryActionStore();
    return store.listByProjectLink(projectLinkId, { includeTerminal });
  });

  app.post("/delivery/actions", async (request, reply) => {
    const parsed = ProposeActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    try {
      const runtime = createRuntime();
      const result = await runtime.propose({
        ...parsed.data,
        payload: parsed.data.payload ?? {},
      });
      return reply.code(result.verdict.decision === "deny" ? 409 : 201).send(result.record);
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/delivery/actions/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const runtime = createRuntime();
      const result = await runtime.approve(id);
      if (result.error?.kind === "not_found") {
        return reply.code(404).send({ error: result.error.message });
      }
      return reply.code(result.record.status === "verified" ? 200 : 409).send(result.record);
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/delivery/actions/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { feedback } = (request.body ?? {}) as { feedback?: string };
    try {
      const runtime = createRuntime();
      const record = await runtime.reject(id, feedback);
      if (!record) return reply.code(404).send({ error: `no delivery action ${id}` });
      return record;
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/delivery/artifacts/:kind/:id", async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const projectLinkId = String((request.query as Record<string, string | undefined>)["projectLinkId"] ?? "");
    if (!projectLinkId) {
      return reply.code(400).send({ error: "projectLinkId query parameter is required" });
    }
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return reply.code(400).send({ error: "id must be a positive integer" });
    }
    let ref: ArtifactRef | undefined;
    if (kind === "work_item") {
      ref = { kind: "work_item", projectLinkId, id: numericId, revision: 0 };
    } else if (kind === "pull_request") {
      const repositoryId = String((request.query as Record<string, string | undefined>)["repositoryId"] ?? "");
      if (!repositoryId) return reply.code(400).send({ error: "repositoryId query parameter is required" });
      ref = { kind: "pull_request", projectLinkId, repositoryId, id: numericId, sourceCommit: "", iterationId: 1 };
    } else if (kind === "build") {
      const definitionId = Number((request.query as Record<string, string | undefined>)["definitionId"] ?? 0);
      ref = { kind: "build", projectLinkId, definitionId, buildId: numericId };
    } else {
      return reply.code(400).send({ error: `unsupported artifact kind ${kind}` });
    }
    try {
      const transport = createTransport();
      const observation = await transport.readArtifact(ref);
      if (!observation) return reply.code(404).send({ error: `artifact ${kind}/${id} not found` });
      return observation;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/delivery/evidence/:buildId", async (request, reply) => {
    const { buildId } = request.params as { buildId: string };
    const query = request.query as Record<string, string | undefined>;
    const projectLinkId = String(query["projectLinkId"] ?? "");
    const definitionId = Number(query["definitionId"] ?? 0);
    const numericBuildId = Number(buildId);
    if (!projectLinkId || !definitionId || !Number.isInteger(numericBuildId)) {
      return reply.code(400).send({ error: "projectLinkId and definitionId query parameters are required" });
    }
    try {
      const projectLink = await projectLinkStore.getProjectLink(projectLinkId);
      if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
      const organization = projectLink.adoOrgUrl;
      const project = projectLink.adoProject;
      const auth = await getAzureDevOpsAuth(projectLink.adoPat);
      const [builds, timeline] = await Promise.all([
        listAzureBuilds({ organization, project, buildIds: [numericBuildId], auth }),
        getAzureBuildTimeline({ organization, project, buildId: numericBuildId, auth }).catch(() => null),
      ]);
      const build = builds[0];
      if (!build) return reply.code(404).send({ error: `build ${buildId} not found` });
      const failedRecords = timeline?.failedRecords ?? [];
      const errorIssueMessages = (timeline?.errorIssues ?? []).map((issue) => issue.message ?? "").filter(Boolean);
      const logExcerpts: Array<{ taskName: string; excerpt: string; contentHash: string }> = [];
      const rawTexts: string[] = [...errorIssueMessages];
      for (const record of failedRecords) {
        const logId = (record as unknown as { log?: { id?: number } }).log?.id;
        if (!logId) continue;
        try {
          const excerpt = await getAzureBuildLogExcerpt({ organization, project, buildId: numericBuildId, logId, auth, maxChars: 6000 });
          const redacted = redactLogText(excerpt.excerpt ?? "");
          logExcerpts.push({ taskName: record.name, excerpt: redacted.excerpt, contentHash: redacted.contentHash });
          rawTexts.push(redacted.excerpt);
        } catch {
          // missing log access -> coverage partial
        }
      }
      const signature = failureSignatureFor(definitionId, failedRecords[0]?.name ?? "unknown", rawTexts.join("\n") || "no log");
      const classification = classifyFailure({
        taskNames: failedRecords.map((r) => r.name),
        logExcerpts: rawTexts,
        changedFiles: [],
        hasPublishedTests: false,
        cancelledByUser: build.result === "canceled",
      });
      const coverage = classifyEvidenceCoverage(
        failedRecords.map((r) => ({ taskName: r.name, result: "failed" })),
        logExcerpts,
        [],
      );
      return {
        build: {
          id: build.id,
          buildNumber: build.buildNumber,
          status: build.status,
          result: build.result,
          branch: build.sourceBranch,
          sourceVersion: build.sourceVersion,
          definitionName: build.definitionName,
        },
        timelineIssues: failedRecords.map((r) => ({ taskName: r.name, result: "failed" })),
        errorIssues: (timeline?.errorIssues ?? []).slice(0, 5).map((issue) => ({
          type: issue.type,
          message: issue.message?.slice(0, 300),
        })),
        logExcerpts: logExcerpts.map((entry) => ({ taskName: entry.taskName, excerpt: entry.excerpt.slice(0, 1_200), contentHash: entry.contentHash })),
        signature,
        classification,
        coverage,
      };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/delivery/work-items", async (request, reply) => {
    const projectLinkId = String((request.query as Record<string, string | undefined>)["projectLinkId"] ?? "");
    if (!projectLinkId) {
      return reply.code(400).send({ error: "projectLinkId query parameter is required" });
    }
    try {
      const projectLink = await projectLinkStore.getProjectLink(projectLinkId);
      if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
      if (!projectLink.adoOrgUrl.trim() || !projectLink.adoProject.trim()) {
        return reply.code(422).send({
          error: "project_link_ado_mapping_incomplete",
          message: "This Project Link needs an Azure DevOps organization and project before Work can load.",
        });
      }
      const auth = await getAzureDevOpsAuth(projectLink.adoPat);
      const items = await queryAzureWorkItems({
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        query: WORK_ITEMS_QUERY,
        top: 50,
        auth,
      });
      const workItems = items.map((item) => {
        const ref = { kind: "work_item" as const, projectLinkId, id: item.id, revision: item.revision };
        const findings = detectWorkItemDrift({
          workItem: ref,
          state: item.state,
          activeStates: ["To Do", "New", "Approved", "Active", "Committed", "In Progress", "In Review", "Resolved"],
          ageMs: Date.now() - (Date.parse(String(item.fields["System.CreatedDate"] ?? "")) || Date.now()),
          linkedPullRequests: [],
          buildResults: [],
          comments: item.comments,
          acceptanceCriteria: item.fields["System.AcceptanceCriteria"] ? String(item.fields["System.AcceptanceCriteria"]) : undefined,
          changedFiles: [],
          children: [],
          evidenceAgeMs: 86_400_000 * 7,
        });
        return {
          id: item.id,
          type: item.type,
          title: item.title,
          state: item.state,
          revision: item.revision,
          iterationPath: item.iterationPath,
          description: plainWorkItemText(item.fields["System.Description"]),
          acceptanceCriteria: plainWorkItemText(item.fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
          comments: item.comments.slice(-3),
          drift: findings.map((finding) => ({
            kind: finding.kind,
            evidence: finding.deterministicEvidence,
            followUp: finding.proposedFollowUp,
            question: finding.question ?? false,
          })),
        };
      });
      return { workItems };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/delivery/environments", async (request, reply) => {
    const projectLinkId = String((request.query as Record<string, string | undefined>)["projectLinkId"] ?? "");
    if (!projectLinkId) {
      return reply.code(400).send({ error: "projectLinkId query parameter is required" });
    }
    try {
      const projectLink = await projectLinkStore.getProjectLink(projectLinkId);
      if (!projectLink) return reply.code(404).send({ error: "project_link_not_found" });
      const auth = await getAzureDevOpsAuth(projectLink.adoPat);
      const environments = await listAzureEnvironments({
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        auth,
      });
      const rows = [];
      for (const environment of environments) {
        const [deployments, approvals] = await Promise.all([
          listAzureDeployments({
            organization: projectLink.adoOrgUrl,
            project: projectLink.adoProject,
            environmentId: environment.id,
            auth,
            top: 5,
          }),
          listAzureEnvironmentApprovals({
            organization: projectLink.adoOrgUrl,
            project: projectLink.adoProject,
            environmentId: environment.id,
            auth,
          }),
        ]);
        const lastGood = [...deployments].reverse().find((deployment) => deployment.result === "succeeded");
        const readiness = buildDeploymentReadiness({
          environment: { kind: "environment", projectLinkId, environmentId: environment.id },
          pendingDeployment: deployments.find((deployment) => deployment.status === "inProgress")
            ? { kind: "deployment", projectLinkId, environmentId: environment.id, deploymentId: deployments.find((d) => d.status === "inProgress")!.id }
            : undefined,
          lastGoodDeployment: lastGood
            ? { kind: "deployment", projectLinkId, environmentId: environment.id, deploymentId: lastGood.id }
            : undefined,
          commits: [],
          workItems: [],
          pullRequests: [],
          builds: [],
          tests: [],
          checks: [],
          approvals: approvals.map((approval) => ({ name: approval.approver ?? `approval ${approval.id}`, status: approval.status, owner: approval.approver })),
          openIncidents: [],
          unreadEvidence: [],
        });
        rows.push({
          id: environment.id,
          name: environment.name,
          description: environment.description,
          deployments: deployments.map((deployment) => ({
            id: deployment.id,
            name: deployment.name,
            status: deployment.status,
            result: deployment.result,
            requestedFor: deployment.requestedFor,
          })),
          approvals: approvals.map((approval) => ({
            id: approval.id,
            status: approval.status,
            approver: approval.approver,
            approvalType: approval.approvalType,
          })),
          readiness,
        });
      }
      return { environments: rows };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/delivery/diagnostics", async () => {
    const store = new SqliteDeliveryActionStore();
    const telemetry = await deliveryTelemetry(store);
    return {
      correlationId: `diag-${Date.now().toString(36)}`,
      generatedAt: Date.now(),
      telemetry,
      killSwitch: { writesEnabled: writes.isEnabled() },
    };
  });

  app.get("/delivery/writes-enabled", async () => ({ enabled: writes.isEnabled() }));

  app.put("/delivery/writes-enabled", async (request, reply) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    // The kill switch is process state; the desktop flips it through the same
    // endpoint. No action is ever replayed when it is re-enabled.
    writes.setEnabled(parsed.data.enabled);
    return { enabled: writes.isEnabled() };
  });
}
