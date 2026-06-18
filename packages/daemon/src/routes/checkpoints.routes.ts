import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  planGitCheckpointRollback,
  previewGitCheckpoint,
  type Settings,
} from "@mergepilot/core";
import type { ChatSessionManager } from "../chatSession.js";

const CheckpointIdParam = z.object({ checkpointId: z.string().min(1) });
const CheckpointPreviewQuery = z.object({
  maxDiffChars: z.coerce.number().int().min(0).max(100_000).optional(),
});

interface CheckpointRouteDependencies {
  settings: Settings;
  chatSessions: ChatSessionManager;
}

export function registerCheckpointRoutes(
  app: FastifyInstance,
  { settings, chatSessions }: CheckpointRouteDependencies,
): void {
  app.get("/chat/checkpoints", async () => chatSessions.listCheckpointActivity(50));

  app.get("/chat/checkpoints/:checkpointId/preview", async (req, reply) => {
    const parsedParam = CheckpointIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid checkpointId" });
    const parsedQuery = CheckpointPreviewQuery.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: parsedQuery.error.flatten() });
    try {
      return await previewGitCheckpoint({
        repoPath: ".",
        env: {},
        timeoutSec: 30,
        extra: { data_dir: settings.dataDir },
      }, parsedParam.data.checkpointId, parsedQuery.data.maxDiffChars ?? 12_000);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/chat/checkpoints/:checkpointId/rollback-plan", async (req, reply) => {
    const parsedParam = CheckpointIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid checkpointId" });
    try {
      return await planGitCheckpointRollback({
        repoPath: ".",
        env: {},
        timeoutSec: 30,
        extra: { data_dir: settings.dataDir },
      }, parsedParam.data.checkpointId);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
