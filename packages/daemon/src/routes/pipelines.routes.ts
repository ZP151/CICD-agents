import type { FastifyInstance } from "fastify";
import {
  createPipelineConnection,
  deletePipelineConnection,
  getPipelineConnection,
  listPipelineConnections,
  LLMClient,
  updatePipelineConnection,
  type Settings,
  type TaskQueue,
} from "@mergepilot/core";
import { SubmitPipelineSchema } from "../schemas.js";
import { z } from "zod";
import { buildEffectiveLlmSettings } from "../llmSettings.js";

interface PipelineRouteDependencies {
  queue: TaskQueue;
  settings: Settings;
}

const PipelineConnectionBodySchema = z.object({
  projectLinkId: z.string().min(1),
  pipelineId: z.string().min(1),
  pipelineName: z.string().default(""),
  purpose: z.enum(["ci", "pr-validation", "release", "deployment", "other"]).default("ci"),
  isDefault: z.coerce.boolean().default(true),
});

const PipelineConnectionIdParam = z.object({ id: z.string().min(1) });

const PipelineAnalysisSchema = z.object({
  pipelineId: z.string().min(1),
  pipelineName: z.string().default(""),
  project: z.string().default(""),
  repository: z.string().default(""),
  summary: z.string().default(""),
  localAnalysis: z.string().default(""),
  runs: z.array(z.record(z.unknown())).default([]),
  artifacts: z.array(z.record(z.unknown())).default([]),
  llmConfig: z.record(z.unknown()).optional(),
});

export function registerPipelineRoutes(
  app: FastifyInstance,
  { queue, settings }: PipelineRouteDependencies,
): void {
  app.post("/tasks/submit-pipeline", async (req, reply) => {
    const parsed = SubmitPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const taskId = queue.submit("submit-pipeline", parsed.data);
    return reply.code(202).send({ taskId, status: "queued" });
  });

  app.get("/pipeline-connections", async (req) => {
    const query = req.query as { projectLinkId?: string };
    return listPipelineConnections(settings.dataDir, query.projectLinkId);
  });

  app.get("/pipeline-connections/:id", async (req, reply) => {
    const parsed = PipelineConnectionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const connection = getPipelineConnection(settings.dataDir, parsed.data.id);
    if (!connection) return reply.code(404).send({ error: "Pipeline connection not found" });
    return connection;
  });

  app.post("/pipeline-connections", async (req, reply) => {
    const parsed = PipelineConnectionBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return reply.code(201).send(createPipelineConnection(settings.dataDir, parsed.data));
  });

  app.put("/pipeline-connections/:id", async (req, reply) => {
    const paramParsed = PipelineConnectionIdParam.safeParse(req.params);
    if (!paramParsed.success) return reply.code(400).send({ error: "invalid id" });
    const bodyParsed = PipelineConnectionBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });
    const updated = updatePipelineConnection(settings.dataDir, paramParsed.data.id, bodyParsed.data);
    if (!updated) return reply.code(404).send({ error: "Pipeline connection not found" });
    return updated;
  });

  app.delete("/pipeline-connections/:id", async (req, reply) => {
    const parsed = PipelineConnectionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const ok = deletePipelineConnection(settings.dataDir, parsed.data.id);
    if (!ok) return reply.code(404).send({ error: "Pipeline connection not found" });
    return { ok: true };
  });

  app.post("/pipelines/analyze", async (req, reply) => {
    const parsed = PipelineAnalysisSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const llm = new LLMClient(buildEffectiveLlmSettings(body.llmConfig as never));
    if (!llm.configured) {
      return { source: "heuristic" as const, analysis: body.localAnalysis };
    }
    try {
      const result = await llm.chat({
        temperature: 0.1,
        maxTokens: 700,
        messages: [
          {
            role: "system",
            content: [
              "You analyze Azure Pipeline run evidence for a DevOps assistant.",
              "Do not request tools or approvals. Use only the provided JSON evidence.",
              "Return concise plain text with: Status, Risk, Evidence, Likely cause if failed, Next action.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              pipeline: {
                id: body.pipelineId,
                name: body.pipelineName,
                project: body.project,
                repository: body.repository,
              },
              summary: body.summary,
              localAnalysis: body.localAnalysis,
              runs: body.runs,
              artifacts: body.artifacts,
            }).slice(0, 18000),
          },
        ],
      });
      return { source: "llm" as const, analysis: result.content.trim() || body.localAnalysis };
    } catch (err) {
      return reply.code(200).send({
        source: "heuristic" as const,
        analysis: body.localAnalysis,
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
