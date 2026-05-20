import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import nodeFs from "node:fs";
import nodeOs from "node:os";

// Resolve .env in priority order:
//   1. CICD_AGENT_ENV_FILE env var (explicit override)
//   2. ~/.cicd-agent/.env  (production / after installer)
//   3. <cwd>/.env          (docker / manual)
//   4. monorepo root       (development)
(function loadEnv() {
  const candidates = [
    process.env.CICD_AGENT_ENV_FILE,
    nodePath.join(nodeOs.homedir(), ".cicd-agent", ".env"),
    nodePath.join(process.cwd(), ".env"),
    // Development: walk up from packages/daemon/src to repo root
    (() => {
      try {
        return nodePath.resolve(fileURLToPath(import.meta.url), "../../../../.env");
      } catch {
        return null;
      }
    })(),
  ].filter((p): p is string => typeof p === "string");

  for (const p of candidates) {
    if (nodeFs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
})();
import Fastify, { type FastifyInstance } from "fastify";
import {
  getSettings,
  runPipelineTask,
  TaskQueue,
  type TaskRunner,
  type TaskView,
  listWorkspaceProfiles,
  getWorkspaceProfile,
  createWorkspaceProfile,
  updateWorkspaceProfile,
  deleteWorkspaceProfile,
  type WorkspaceProfileInput,
} from "@cicd-agent/core";
import { SubmitPipelineSchema, TaskIdParam } from "./schemas.js";
import { ChatSessionManager, type InlineLlmConfig, type InlineProfile } from "./chatSession.js";
import { z } from "zod";

export interface BuildAppOptions {
  /** Override the task runner. Defaults to runPipelineTask. */
  runner?: TaskRunner;
}

// Inline LLM config sent from the frontend Settings page (localStorage).
// All fields are optional — missing ones fall back to env / .env defaults.
const LlmConfigSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey:    z.string().optional(),
  openaiModel:     z.string().optional(),
}).optional();

// Inline profile data sent from the frontend Profiles page (localStorage).
// Skips the daemon-side DB lookup entirely.
const InlineProfileSchema = z.object({
  id:              z.string().optional(),
  name:            z.string().optional(),
  repoPath:        z.string().default(""),
  defaultBranch:   z.string().default("main"),
  targetBranch:    z.string().default("main"),
  adoOrgUrl:       z.string().default(""),
  adoProject:      z.string().default(""),
  adoRepoName:     z.string().default(""),
  adoPat:          z.string().default(""),
  adoPipelineId:   z.string().default(""),
  adoPipelineName: z.string().default(""),
  templateProfile: z.string().default(""),
  buildCommand:    z.string().default(""),
  testCommand:     z.string().default(""),
}).optional();


const ChatStartSchema = z.object({
  message:   z.string().min(1),
  repoPath:  z.string().default(process.cwd()),
  sessionId: z.string().optional(),
  profileId: z.string().optional(),  // kept for backwards compat; ignored when profile is provided
  llmConfig: LlmConfigSchema,        // inline LLM config from localStorage Settings
  profile:   InlineProfileSchema,    // inline profile data from localStorage Profiles
});
const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const ProfileIdParam = z.object({ id: z.string().min(1) });
const ProfileBodySchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoPipelineId: z.string().default(""),
  adoPipelineName: z.string().default(""),
  templateProfile: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
});

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const settings = getSettings();
  const app = Fastify({
    logger: { level: settings.runtimeLogLevel.toLowerCase() },
  });
  // Allow cross-origin requests from the Tauri/Vite frontend
  app.addHook("onSend", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");
  });
  app.options("*", async (_req, reply) => reply.code(204).send());

  const queue = new TaskQueue(opts.runner ?? runPipelineTask);
  queue.start();
  const chatSessions = new ChatSessionManager();
  const startedAt = Date.now();

  app.addHook("onClose", async () => {
    await queue.stop();
  });

  app.get("/healthz", async () => ({
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSec: (Date.now() - startedAt) / 1000,
    llmConfigured: settings.llmConfigured,
  }));

  app.post("/tasks/submit-pipeline", async (req, reply) => {
    const parsed = SubmitPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const taskId = queue.submit("submit-pipeline", parsed.data);
    return reply.code(202).send({ taskId, status: "queued" });
  });

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
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "task not found" })}\n\n`);
      reply.raw.end();
      return;
    }

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Replay existing steps.
    for (const step of view.steps) send("step", step);
    send("status", view.status);

    if (view.status === "succeeded" || view.status === "failed" || view.status === "cancelled") {
      send("done", { status: view.status, result: view.result, error: view.error });
      reply.raw.end();
      return;
    }

    const em = queue.emitterFor(taskId);
    if (!em) {
      reply.raw.end();
      return;
    }
    const onStep = (s: unknown) => send("step", s);
    const onStatus = (s: unknown) => send("status", s);
    const onDone = (s: unknown) => {
      send("done", s);
      cleanup();
      reply.raw.end();
    };
    const cleanup = (): void => {
      em.off("step", onStep);
      em.off("status", onStatus);
      em.off("done", onDone);
    };
    em.on("step", onStep);
    em.on("status", onStatus);
    em.on("done", onDone);
    req.raw.on("close", () => {
      cleanup();
    });
  });

  // ── Workspace profile endpoints ──────────────────────────────────────────────

  app.get("/profiles", async () => listWorkspaceProfiles(settings.dataDir));

  app.get("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    return profile;
  });

  app.post("/profiles", async (req, reply) => {
    const parsed = ProfileBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const profile = createWorkspaceProfile(settings.dataDir, parsed.data as WorkspaceProfileInput);
    return reply.code(201).send(profile);
  });

  app.put("/profiles/:id", async (req, reply) => {
    const paramParsed = ProfileIdParam.safeParse(req.params);
    if (!paramParsed.success) return reply.code(400).send({ error: "invalid id" });
    const bodyParsed = ProfileBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });
    const updated = updateWorkspaceProfile(settings.dataDir, paramParsed.data.id, bodyParsed.data);
    if (!updated) return reply.code(404).send({ error: "profile not found" });
    return updated;
  });

  app.delete("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const ok = deleteWorkspaceProfile(settings.dataDir, parsed.data.id);
    if (!ok) return reply.code(404).send({ error: "profile not found" });
    return { ok: true };
  });

  // ── Chat endpoints ───────────────────────────────────────────────────────────

  app.post("/chat", async (req, reply) => {
    const parsed = ChatStartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { message, repoPath, sessionId: existingId, profileId, llmConfig, profile } = parsed.data;
    const sessionId = existingId ?? chatSessions.createSession(repoPath, profileId);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.setHeader("X-Chat-Session-Id", sessionId);
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Always send the sessionId first so the client can store it
    send("session", { sessionId });

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.run(sessionId, message, repoPath, profileId, llmConfig, profile)) {
            send(event.type, event);
            if (
              event.type === "done" ||
              event.type === "error" ||
              event.type === "cancelled"
            ) {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/confirm", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const ok = chatSessions.confirm(parsed.data.sessionId, true);
    if (!ok) return reply.code(404).send({ error: "no pending confirmation for this session" });
    return { ok: true };
  });

  // Dedicated confirm-action endpoint: directly executes the stored pendingAction
  // and streams tool + LLM continuation events back (same SSE format as /chat).
  app.post("/chat/:sessionId/confirm-action", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });

    const sessionId = parsed.data.sessionId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            send(event.type, event);
            if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/cancel", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    chatSessions.cancel(parsed.data.sessionId);
    return { ok: true };
  });

  app.get("/chat/history", async (_req, reply) => {
    return chatSessions.listRecent(30);
  });

  app.get("/chat/:sessionId/messages", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return chatSessions.getBubbles(parsed.data.sessionId);
  });

  app.post("/shutdown", async () => {
    setTimeout(() => {
      process.exit(0);
    }, 250);
    return { ok: true, message: "shutting down" };
  });

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const settings = getSettings();
  const app = await buildApp();
  await app.listen({ host: settings.runtimeHost, port: settings.runtimePort });
  return app;
}
