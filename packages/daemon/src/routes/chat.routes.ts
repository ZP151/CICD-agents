import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  LLMClient,
  type Settings,
} from "@mergepilot/core";
import {
  getChatIndexStatus,
  refreshChatIndex,
} from "@mergepilot/core/chatContext";
import type { ChatSessionManager, InlineLlmConfig, InlineProjectLink } from "../chatSession.js";
import { createChatSseWriter, isTerminalChatEvent } from "./chatSse.js";

const LlmConfigSchema = z.object({
  llmProvider: z.enum(["azure", "openai"]).optional(),
  azureEndpoint: z.string().optional(),
  azureApiKey: z.string().optional(),
  azureDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
}).optional();

const InlineProjectLinkSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoPipelineId: z.string().default(""),
  adoPipelineName: z.string().default(""),
  adoMcpEnabled: z.coerce.boolean().default(false),
  adoMcpCommand: z.string().default(""),
  adoMcpAuthentication: z.string().default(""),
  adoMcpDomains: z.string().default("repositories,pipelines,work-items"),
  projectTemplate: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
  ignoredGlobs: z.array(z.string()).default([]),
}).optional();

const ChatStartSchema = z.object({
  message: z.string().min(1),
  repoPath: z.string().default(process.cwd()),
  sessionId: z.string().optional(),
  projectLinkId: z.string().optional(),
  llmConfig: LlmConfigSchema,
  projectLink: InlineProjectLinkSchema,
});

const ChatIndexSchema = z.object({
  repoPath: z.string().default(process.cwd()),
  llmConfig: LlmConfigSchema,
  projectLink: InlineProjectLinkSchema,
});

const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const ChatSessionMetadataSchema = z.object({
  title: z.string().max(140).nullable().optional(),
  pinned: z.boolean().optional(),
}).refine((value) => "title" in value || "pinned" in value, {
  message: "At least one metadata field is required",
});
interface ChatRouteDependencies {
  settings: Settings;
  chatSessions: ChatSessionManager;
  buildInlineLlmSettings: (override?: InlineLlmConfig) => Settings;
  envSourceLabel: () => string;
}

function inlineProjectLinkToIndexProjectLink(projectLink?: InlineProjectLink) {
  if (!projectLink) return undefined;
  return {
    buildCommand: projectLink.buildCommand,
    testCommand: projectLink.testCommand,
    targetBranch: projectLink.targetBranch || projectLink.defaultBranch,
    pipelineName: projectLink.adoPipelineName,
    ignoredGlobs: projectLink.ignoredGlobs,
  };
}

function inlineProjectLinkFromPayload(payload: {
  projectLink?: InlineProjectLink;
}): InlineProjectLink | undefined {
  return payload.projectLink;
}

export function projectLinkIdFromChatPayload(payload: {
  projectLinkId?: string;
}): string | undefined {
  return payload.projectLinkId;
}

function explainChatSseError(
  err: unknown,
  settings: Settings,
  envSourceLabel: () => string,
): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/deployment.*does not exist|deployment.*not found/i.test(message)) {
    return [
      "Azure OpenAI deployment not found.",
      `Daemon env source: ${envSourceLabel()}.`,
      `Deployment: ${settings.azureOpenAiChatDeployment || "(missing)"}.`,
      "Open Settings and set the chat deployment to an existing Azure OpenAI deployment, then restart the daemon.",
    ].join(" ");
  }
  return message;
}

export function registerChatRoutes(
  app: FastifyInstance,
  { settings, chatSessions, buildInlineLlmSettings, envSourceLabel }: ChatRouteDependencies,
): void {
  app.post("/chat/index-status", async (req, reply) => {
    const parsed = ChatIndexSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return getChatIndexStatus(parsed.data.repoPath);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/chat/index-refresh", async (req, reply) => {
    const parsed = ChatIndexSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const effectiveSettings = buildInlineLlmSettings(parsed.data.llmConfig);
      const llm = new LLMClient(effectiveSettings);
      const refresh = await refreshChatIndex({
        repoPath: parsed.data.repoPath,
        llm,
        projectLink: inlineProjectLinkToIndexProjectLink(inlineProjectLinkFromPayload(parsed.data)),
      });
      const status = getChatIndexStatus(parsed.data.repoPath);
      return { ok: true, refresh, status };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/chat", async (req, reply) => {
    const parsed = ChatStartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { message, repoPath, sessionId: existingId, llmConfig } = parsed.data;
    const projectLinkId = projectLinkIdFromChatPayload(parsed.data);
    const projectLink = inlineProjectLinkFromPayload(parsed.data);
    const sessionId = existingId ?? chatSessions.createSession(repoPath, projectLinkId);
    const sseWriter = createChatSseWriter(reply, sessionId);

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.run(sessionId, message, repoPath, projectLinkId, llmConfig, projectLink)) {
            sseWriter.sendChatEvent(event);
            if (isTerminalChatEvent(event)) {
              sseWriter.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          sseWriter.send("error", {
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
          });
        }
        sseWriter.end();
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

  app.post("/chat/:sessionId/confirm-action", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });

    const sessionId = parsed.data.sessionId;
    const sseWriter = createChatSseWriter(reply);

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            sseWriter.sendChatEvent(event);
            if (isTerminalChatEvent(event)) {
              sseWriter.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          sseWriter.send("error", {
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
          });
        }
        sseWriter.end();
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

  app.get("/chat/history", async () => chatSessions.listRecent(30));

  app.patch("/chat/:sessionId/metadata", async (req, reply) => {
    const parsedParam = SessionIdParam.safeParse(req.params);
    if (!parsedParam.success) return reply.code(400).send({ error: "invalid sessionId" });
    const parsedBody = ChatSessionMetadataSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.flatten() });
    const updated = await chatSessions.updateMetadata(parsedParam.data.sessionId, parsedBody.data);
    if (!updated) return reply.code(404).send({ error: "session not found" });
    return updated;
  });

  app.delete("/chat/:sessionId", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const deleted = await chatSessions.deleteSession(parsed.data.sessionId);
    if (!deleted) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  app.get("/chat/:sessionId/messages", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return chatSessions.getBubbles(parsed.data.sessionId);
  });

  app.get("/chat/:sessionId/state", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return { workflowState: await chatSessions.getWorkflowState(parsed.data.sessionId) };
  });
}
