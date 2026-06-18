import type { FastifyInstance } from "fastify";
import type { TaskQueue } from "@mergepilot/core";
import { SubmitPipelineSchema } from "../schemas.js";

interface PipelineRouteDependencies {
  queue: TaskQueue;
}

export function registerPipelineRoutes(
  app: FastifyInstance,
  { queue }: PipelineRouteDependencies,
): void {
  app.post("/tasks/submit-pipeline", async (req, reply) => {
    const parsed = SubmitPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const taskId = queue.submit("submit-pipeline", parsed.data);
    return reply.code(202).send({ taskId, status: "queued" });
  });
}
