import type { FastifyInstance } from "fastify";
import type {
  TaskQueue,
  TaskView,
} from "@mergepilot/core";
import { TaskIdParam } from "../schemas.js";

interface TaskRoutesDependencies {
  queue: TaskQueue;
}

function sendTaskEvent(raw: { write: (chunk: string) => void }, event: string, payload: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function registerTaskRoutes(app: FastifyInstance, { queue }: TaskRoutesDependencies): void {
  app.get("/tasks", async () => queue.list(50));

  app.get("/tasks/:taskId", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const view = queue.get(parsed.data.taskId);
    if (!view) return reply.code(404).send({ error: "task not found" });
    return view as TaskView;
  });

  app.get("/tasks/:taskId/events", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const taskId = parsed.data.taskId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const view = queue.get(taskId);
    if (!view) {
      sendTaskEvent(reply.raw, "error", { error: "task not found" });
      reply.raw.end();
      return;
    }

    for (const step of view.steps) sendTaskEvent(reply.raw, "step", step);
    sendTaskEvent(reply.raw, "status", view.status);

    if (view.status === "succeeded" || view.status === "failed" || view.status === "cancelled") {
      sendTaskEvent(reply.raw, "done", { status: view.status, result: view.result, error: view.error });
      reply.raw.end();
      return;
    }

    const emitter = queue.emitterFor(taskId);
    if (!emitter) {
      reply.raw.end();
      return;
    }
    const onStep = (step: unknown) => sendTaskEvent(reply.raw, "step", step);
    const onStatus = (status: unknown) => sendTaskEvent(reply.raw, "status", status);
    const onDone = (status: unknown) => {
      sendTaskEvent(reply.raw, "done", status);
      cleanup();
      reply.raw.end();
    };
    const cleanup = (): void => {
      emitter.off("step", onStep);
      emitter.off("status", onStatus);
      emitter.off("done", onDone);
    };
    emitter.on("step", onStep);
    emitter.on("status", onStatus);
    emitter.on("done", onDone);
    req.raw.on("close", () => {
      cleanup();
    });
  });
}
