import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  LLMClient,
  streamActionNarrative,
  type ChatEvent,
  type Settings,
} from "@mergepilot/core";
import { getChatIndexStatus, refreshChatIndex } from "@mergepilot/core/chatContext";
import type { ChatSessionManager, InlineLlmConfig, InlineProjectLink } from "../chatSession.js";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";
import { createChatRuntimeSetup, type ChatRuntimeSetup } from "../chatRuntimeSetup.js";
import { messageWithImageNames } from "../chatSessionRun.js";
import { createChatSseWriter, isTerminalChatEvent } from "./chatSse.js";

const MAX_CHAT_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const CHAT_IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/;
const OPENING_NARRATIVE_DEADLINE_MS = 15_000;

const LlmConfigSchema = z
  .object({
    llmProvider: z.enum(["azure", "openai"]).optional(),
    azureEndpoint: z.string().optional(),
    azureApiKey: z.string().optional(),
  azureDeployment: z.string().optional(),
  azureNarrativeDeployment: z.string().optional(),
    azureApiVersion: z.string().optional(),
    openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  openaiNarrativeModel: z.string().optional(),
  })
  .optional();

const InlineProjectLinkObjectSchema = z.object({
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
});

const InlineProjectLinkSchema = InlineProjectLinkObjectSchema.nullable()
  .optional()
  .transform((value) => value ?? undefined);

const OptionalSessionIdSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);

const ChatImageAttachmentSchema = z
  .object({
    name: z.string().min(1).max(160),
    mimeType: z.string().regex(/^image\//),
    dataUrl: z.string().regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,/),
  })
  .superRefine((value, ctx) => {
    const match = value.dataUrl.match(CHAT_IMAGE_DATA_URL_PATTERN);
    if (!match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image attachment must be a base64 image data URL",
        path: ["dataUrl"],
      });
      return;
    }

    const dataUrlMimeType = match[1] ?? "";
    const base64Payload = match[2] ?? "";
    if (dataUrlMimeType.toLowerCase() !== value.mimeType.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image attachment MIME type must match data URL",
        path: ["mimeType"],
      });
    }

    const normalizedPayload = base64Payload.replace(/\s/g, "");
    const padding = normalizedPayload.endsWith("==") ? 2 : normalizedPayload.endsWith("=") ? 1 : 0;
    const decodedBytes = Math.max(0, Math.floor((normalizedPayload.length * 3) / 4) - padding);
    if (decodedBytes > MAX_CHAT_IMAGE_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image attachment must be 4 MB or smaller",
        path: ["dataUrl"],
      });
    }
  });

const ChatStartSchema = z
  .object({
    message: z.string().default(""),
    repoPath: z.string().default(process.cwd()),
    sessionId: OptionalSessionIdSchema,
    clientTurnId: z.string().min(1).max(160).optional(),
    projectLinkId: z.string().optional(),
    llmConfig: LlmConfigSchema,
    projectLink: InlineProjectLinkSchema,
    imageAttachments: z.array(ChatImageAttachmentSchema).max(3).default([]),
  })
  .refine((value) => value.message.trim().length > 0 || value.imageAttachments.length > 0, {
    message: "message or image attachment is required",
  });

const ChatIndexSchema = z.object({
  repoPath: z.string().default(process.cwd()),
  llmConfig: LlmConfigSchema,
  projectLink: InlineProjectLinkSchema,
});

const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const ConfirmActionBodySchema = z.object({
  turnId: z.string().min(1).optional(),
  startedAt: z.number().finite().positive().optional(),
  lastSequence: z.number().int().min(0).optional(),
});
const ChatSessionMetadataSchema = z
  .object({
    title: z.string().max(140).nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => "title" in value || "pinned" in value, {
    message: "At least one metadata field is required",
  });
interface ChatRouteDependencies {
  settings: Settings;
  chatSessions: ChatSessionManager;
  buildInlineLlmSettings: (override?: InlineLlmConfig) => Settings;
  envSourceLabel: () => string;
  projectLinkStore?: Pick<ProjectLinkStoreAdapter, "getProjectLinkForRequest">;
}

function inlineProjectLinkToIndexProjectLink(projectLink?: InlineProjectLink) {
  if (!projectLink) return undefined;
  return {
    buildCommand: projectLink.buildCommand,
    testCommand: projectLink.testCommand,
    targetBranch: projectLink.targetBranch || projectLink.defaultBranch,
    ignoredGlobs: projectLink.ignoredGlobs,
  };
}

function inlineProjectLinkFromPayload(payload: {
  projectLink?: InlineProjectLink;
}): InlineProjectLink | undefined {
  return payload.projectLink;
}

async function resolveProjectLinkForChat(
  projectLinkId: string | undefined,
  inlineProjectLink: InlineProjectLink | undefined,
  projectLinkStore: Pick<ProjectLinkStoreAdapter, "getProjectLinkForRequest"> | undefined,
): Promise<InlineProjectLink | undefined> {
  if (!projectLinkId || !projectLinkStore) return inlineProjectLink;
  const storedProjectLink = await projectLinkStore.getProjectLinkForRequest(
    projectLinkId,
    inlineProjectLink,
  );
  return storedProjectLink ?? inlineProjectLink;
}

export function projectLinkIdFromChatPayload(payload: {
  projectLinkId?: string;
}): string | undefined {
  return payload.projectLinkId;
}

export function explainChatSseError(
  err: unknown,
  settings: Settings,
  envSourceLabel: () => string,
): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/deployment.*does not exist|deployment.*not found|(?:^|\s)404\s+resource not found|resource not found/i.test(message)) {
    return [
      "Azure OpenAI endpoint or deployment was not found.",
      `Daemon env source: ${envSourceLabel()}.`,
      `Deployment: ${settings.azureOpenAiChatDeployment || "(missing)"}.`,
      "Open Settings, verify the Azure endpoint and chat deployment, then restart the daemon.",
    ].join(" ");
  }
  return message;
}

export function registerChatRoutes(
  app: FastifyInstance,
  {
    settings,
    chatSessions,
    buildInlineLlmSettings,
    envSourceLabel,
    projectLinkStore,
  }: ChatRouteDependencies,
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

    const { imageAttachments, message, repoPath, sessionId: existingId, llmConfig, clientTurnId } = parsed.data;
    const projectLinkId = projectLinkIdFromChatPayload(parsed.data);
    const inlineProjectLink = inlineProjectLinkFromPayload(parsed.data);
    const sessionId = existingId ?? chatSessions.createSession(repoPath, projectLinkId);
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sseWriter = createChatSseWriter(reply, sessionId, (event) => chatSessions.appendTurnTimelineEvent(sessionId, event));
    // A model/provider failure is still a real Turn. Start durable user-input
    // persistence now, but do not await filesystem/cloud latency before the
    // first narration request. It is awaited before the planner reads history
    // so the normal execution path cannot duplicate this message.
    const persistUserTurn = chatSessions.appendUserTurn(
      sessionId,
      messageWithImageNames(message, imageAttachments),
      repoPath,
    );
    // Confirm the Turn immediately. The public action narrative begins before
    // planning or executing any action. This is a real behavioural boundary:
    // buffering a command event until after a narrative only changes what the
    // user sees; it does not stop the command from already having run.
    sseWriter.startTurn(turnId, undefined, clientTurnId);
    let active = true;
    let openingNarrativeVisible = false;
    // A slow provider is surfaced only as a transport diagnostic after a
    // meaningful delay. It is never substituted with canned agent prose.
    const waitingForModelTimer = setTimeout(() => {
      if (active && !openingNarrativeVisible) sseWriter.sendWaitingForModel();
    }, 5_000);
    // The two concurrent streams deliberately use separate transport clients.
    // Azure can otherwise serialize the opening stream behind a long-lived
    // tool-planning request on one SDK client, defeating the early narrative.
    const turnLlm = new LLMClient(buildInlineLlmSettings(llmConfig));
    const narrativeLlm = new LLMClient(buildInlineLlmSettings(llmConfig));
    const projectLinkPromise = inlineProjectLink
      ? Promise.resolve(inlineProjectLink)
      : resolveProjectLinkForChat(projectLinkId, inlineProjectLink, projectLinkStore);
    // Tool and connector initialisation is independent from the opening
    // narrative. Start it in the background now, but do not await it before
    // the first model token. This is the only prewarm work allowed ahead of
    // the public action narrative; context/history still wait for the normal
    // bounded continuation path below.
    const prewarmedRuntime = projectLinkPromise.then((projectLink) => createChatRuntimeSetup({
      repoPath: (projectLink?.repoPath?.trim() || repoPath.trim()) || ".",
      llmConfig,
      inlineProjectLink: projectLink,
      projectLinkId,
      chatMessage: message,
      llm: turnLlm,
    }));
    let prewarmedRuntimeClaimed = false;
    const disposeUnusedPrewarmedRuntime = (): void => {
      if (prewarmedRuntimeClaimed) return;
      void prewarmedRuntime.then((runtime: ChatRuntimeSetup) => runtime.close()).catch(() => undefined);
    };
    return new Promise<void>((resolve) => {
      (async () => {
        try {
          let openingNarrativeError: unknown;
          let openingNarrativeText = "";
          const openingNarrative = (async () => {
            for await (const event of streamActionNarrative(narrativeLlm, {
              request: message,
              blockId: "opening",
              selectedProject: Boolean(inlineProjectLink || projectLinkId),
            })) {
              // Do not buffer genuine model text until the model completes a
              // sentence. The opening is the first public response to the
              // user, so every useful delta must reach the desktop as soon as
              // it arrives. Session/tool events remain buffered below until
              // this narration completes, preserving narrative → action.
              if (!active) return;
              if (event.type === "work_statement") {
                openingNarrativeVisible = true;
                openingNarrativeText = event.text;
                clearTimeout(waitingForModelTimer);
              }
              sseWriter.sendChatEvent(event);
            }
          })().catch((err) => { openingNarrativeError = err; });
          // The first public response is itself model-authored. Wait only for
          // this intentionally tiny stream, then hand that exact narrative to
          // the planner as prior assistant context. Tool/MCP setup and Project
          // Link resolution have been warming in parallel, but the planner is
          // deliberately not allowed to execute an action before this point.
          const openingCompleted = await settlesWithin(openingNarrative, OPENING_NARRATIVE_DEADLINE_MS);
          if (!openingCompleted) {
            throw new Error("The model did not begin an action narrative within 15 seconds.");
          }
          if (openingNarrativeError) throw openingNarrativeError;
          if (!active) return;

          // Desktop sends the selected Project Link inline with the request.
          // The fallback remains for older clients that send only an id.
          const projectLink = inlineProjectLink ?? await projectLinkPromise;
          prewarmedRuntimeClaimed = true;
          await persistUserTurn;
          for await (const event of chatSessions.run(
            sessionId,
            message,
            repoPath,
            projectLinkId,
            llmConfig,
            projectLink,
            imageAttachments,
            turnLlm,
            openingNarrativeText || undefined,
            prewarmedRuntime,
            false,
            true,
            true,
          )) {
            if (!active) return;
            if (event.type === "work_statement") {
              openingNarrativeVisible = true;
              clearTimeout(waitingForModelTimer);
            }
            sseWriter.sendChatEvent(event);
            if (isTerminalChatEvent(event)) {
              active = false;
              sseWriter.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          clearTimeout(waitingForModelTimer);
          active = false;
          chatSessions.cancel(sessionId);
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
          });
        }
        disposeUnusedPrewarmedRuntime();
        active = false;
        clearTimeout(waitingForModelTimer);
        sseWriter.end();
        resolve();
      })();

      // `IncomingMessage.close` also fires after a normal POST body has been
      // consumed. Treating it as a disconnect cancelled the SSE Turn before
      // its first model delta could be written. Only an aborted request or an
      // unfinished response closing is a real client disconnect.
      const cancelDisconnectedTurn = () => {
        if (!active) return;
        active = false;
        clearTimeout(waitingForModelTimer);
        chatSessions.cancel(sessionId);
        disposeUnusedPrewarmedRuntime();
        resolve();
      };
      req.raw.once("aborted", cancelDisconnectedTurn);
      reply.raw.once("close", () => {
        if (!reply.raw.writableEnded) cancelDisconnectedTurn();
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
    const body = ConfirmActionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "invalid confirmation continuation" });

    const sessionId = parsed.data.sessionId;
    const sseWriter = createChatSseWriter(reply, sessionId, (event) => chatSessions.appendTurnTimelineEvent(sessionId, event));
    if (body.data.turnId) {
      sseWriter.resumeTurn(body.data.turnId, {
        startedAt: body.data.startedAt,
        lastSequence: body.data.lastSequence,
      });
    } else {
      // API callers that created a workflow outside chat have no prior Turn
      // to resume. Give the approval execution its own canonical envelope;
      // normal desktop approval continuations always use the original turnId.
      sseWriter.startTurn(`turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    }

    let continuationActive = true;
    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            sseWriter.sendChatEvent(event);
            if (isTerminalChatEvent(event)) {
              continuationActive = false;
              sseWriter.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
          });
        }
        sseWriter.end();
        resolve();
      })();

      const cancelDisconnectedContinuation = () => {
        if (!continuationActive) return;
        continuationActive = false;
        chatSessions.cancel(sessionId);
        resolve();
      };
      req.raw.once("aborted", cancelDisconnectedContinuation);
      reply.raw.once("close", () => {
        if (!reply.raw.writableEnded) cancelDisconnectedContinuation();
      });
    });
  });

  app.post("/chat/:sessionId/decline-action", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const body = ConfirmActionBodySchema.safeParse(req.body ?? {});
    if (!body.success || !body.data.turnId || !body.data.startedAt) {
      return reply.code(400).send({ error: "a Turn continuation is required to decline an action" });
    }

    const sessionId = parsed.data.sessionId;
    const sseWriter = createChatSseWriter(reply, sessionId, (event) => chatSessions.appendTurnTimelineEvent(sessionId, event));
    sseWriter.resumeTurn(body.data.turnId, {
      startedAt: body.data.startedAt,
      lastSequence: body.data.lastSequence,
      statement: "Approval declined; closing this turn without running the action.",
    });

    let continuationActive = true;
    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.declineAction(sessionId)) {
            sseWriter.sendChatEvent(event);
            if (isTerminalChatEvent(event)) {
              continuationActive = false;
              sseWriter.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
          });
        }
        continuationActive = false;
        sseWriter.end();
        resolve();
      })();

      const cancelDisconnectedContinuation = () => {
        if (!continuationActive) return;
        continuationActive = false;
        chatSessions.cancel(sessionId);
        resolve();
      };
      req.raw.once("aborted", cancelDisconnectedContinuation);
      reply.raw.once("close", () => {
        if (!reply.raw.writableEnded) cancelDisconnectedContinuation();
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
    const sessionId = parsed.data.sessionId;
    const [bubbles, timelineEvents] = await Promise.all([
      chatSessions.getBubbles(sessionId),
      chatSessions.getTurnTimelineEvents(sessionId),
    ]);
    return { bubbles, timelineEvents };
  });

  app.get("/chat/:sessionId/state", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return { workflowState: await chatSessions.getWorkflowState(parsed.data.sessionId) };
  });
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
