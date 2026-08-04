import type { FastifyInstance } from "fastify";
import {
  ActionVerifier,
  AdoActionTransport,
  DeliveryActionExecutor,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  isArtifactRef,
  SqliteDeliveryActionStore,
  type ArtifactRef,
} from "@mergepilot/core";
import { z } from "zod";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";

const ArtifactRefSchema = z.custom<ArtifactRef>(isArtifactRef, {
  message: "invalid ArtifactRef: must include a known kind and projectLinkId",
});

const VerificationPredicateSchema = z.object({
  artifact: ArtifactRefSchema,
  condition: z.enum(["exists", "field_eq", "relation_present", "revision_gt", "run_visible"]),
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

  function createRuntime(): DeliveryActionRuntime {
    const transport = new AdoActionTransport({
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
