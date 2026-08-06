import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logger } from "@mergepilot/core";
import {
  LLMClient,
  streamActionNarrative,
  turnFailureFromError,
  type ChatEvent,
  type ChatEventFailure,
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

/**
 * Time-to-first-visible-token budget for the opening narrative. The narrative
 * is the first public content of a turn, so a slow narrator must not abort the
 * whole turn: source-live E2E on a loaded dev machine measured first-token
 * latencies beyond 15s several times per run, each killing the turn ("chat
 * turn failed" in the daemon log). 60s is the default headroom; constrained
 * environments can tighten it via MERGEPILOT_OPENING_NARRATIVE_DEADLINE_MS.
 */
const OPENING_NARRATIVE_DEADLINE_MS = (() => {
  const configured = Number(process.env["MERGEPILOT_OPENING_NARRATIVE_DEADLINE_MS"] ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
})();

/**
 * A single-producer / single-consumer bridge for planner events. It lets the
 * main agent perform pure preparation while the low-latency narrator streams,
 * without allowing the route to publish a later planner event ahead of that
 * opening narrative.
 */
class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private closed = false;
  private failure: unknown;
  private wake: (() => void) | undefined;

  push(value: T): void {
    if (this.closed) return;
    this.values.push(value);
    this.wake?.();
    this.wake = undefined;
  }

  close(): void {
    this.closed = true;
    this.wake?.();
    this.wake = undefined;
  }

  fail(error: unknown): void {
    this.failure = error;
    this.close();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const value = this.values.shift();
      if (value !== undefined) {
        yield value;
        continue;
      }
      if (this.failure) throw this.failure;
      if (this.closed) return;
      await new Promise<void>((resolve) => { this.wake = resolve; });
    }
  }
}

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

// V2 inline Project Links carry only the stable identity mapping; the legacy
// fields are read-only (migration reads) and are never persisted from API
// payloads. They remain readable on stored links and on session history.
const InlineProjectLinkObjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  repoPath: z.string().default(""),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  ignoredGlobs: z.array(z.string()).default([]),
});

const InlineProjectLinkSchema = InlineProjectLinkObjectSchema.nullable()
  .optional()
  .transform((value) => value ?? undefined);

type ParsedInlineProjectLink = z.infer<typeof InlineProjectLinkObjectSchema>;

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

// V2 API payloads carry only the stable identity mapping; the legacy fields
// are read-only (migration reads). The parsed payload is widened structurally
// for downstream readers that still type them — no values are fabricated, so
// legacy reads resolve through their existing fallbacks and the narrow value
// (without legacy fields) is what gets snapshotted into session history.
function inlineProjectLinkFromPayload(payload: {
  projectLink?: ParsedInlineProjectLink;
}): InlineProjectLink | undefined {
  return payload.projectLink as unknown as InlineProjectLink | undefined;
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

/**
 * MP-011: attach a typed termination reason to the terminal SSE event instead
 * of a bare message. The kind drives the UI recovery action; the raw detail is
 * logged (redacted) rather than shown for internal failures.
 */
export function chatTurnFailure(err: unknown, phase: string): ChatEventFailure {
  const failure = turnFailureFromError(err, { phase });
  return {
    kind: failure.kind,
    retryable: failure.retryable,
    diagnosticId: failure.diagnosticId,
  };
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
    const requestReceivedAt = Date.now();
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
    sseWriter.startTurn(turnId, undefined, clientTurnId, requestReceivedAt);
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
          let releaseFirstTool: (() => void) | undefined;
          let rejectFirstTool: ((reason?: unknown) => void) | undefined;
          const firstToolGate = new Promise<void>((resolve, reject) => {
            releaseFirstTool = resolve;
            rejectFirstTool = reject;
          });
          // The narrative failure paths reject the gate and then throw their
          // own error (reported over SSE). If that rejection happens before
          // the planner reaches its first-tool gate — e.g. the planner is
          // still awaiting session persistence or project context — no handler
          // is attached yet and Node reports an unhandled rejection, which
          // kills the whole daemon. Claim the rejection immediately; the
          // planner's own await still receives it through its own handler.
          void firstToolGate.catch(() => undefined);
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

          // Start the main Turn immediately. Its context read, tool registry,
          // and first planning request are side-effect-free and no longer wait
          // behind a separate narrator deployment. ChatPlanner receives the
          // firstToolGate, so a genuine public narrative still happens before
          // any command is actually executed (not merely before it is shown).
          const plannerEvents = new AsyncEventQueue<ChatEvent>();
          void (async () => {
            try {
              await persistUserTurn;
              if (!active) return;
              const projectLink = inlineProjectLink ?? await projectLinkPromise;
              if (!active) return;
              prewarmedRuntimeClaimed = true;
              for await (const event of chatSessions.run(
                sessionId,
                message,
                repoPath,
                projectLinkId,
                llmConfig,
                projectLink,
                imageAttachments,
                turnLlm,
                undefined,
                prewarmedRuntime,
                true,
                true,
                true,
                firstToolGate,
              )) {
                if (!active) return;
                plannerEvents.push(event);
              }
            } catch (err) {
              plannerEvents.fail(err);
              return;
            } finally {
              plannerEvents.close();
            }
          })();

          // The opening response remains a real model-authored message. It
          // establishes the public action boundary, then releases any planner
          // tool that is already ready to execute.
          const openingCompleted = await settlesWithin(openingNarrative, OPENING_NARRATIVE_DEADLINE_MS);
          if (!openingCompleted) {
            const error = new Error(
              `The model did not begin an action narrative within ${OPENING_NARRATIVE_DEADLINE_MS / 1000} seconds.`,
            );
            rejectFirstTool?.(error);
            throw error;
          }
          if (openingNarrativeError) {
            rejectFirstTool?.(openingNarrativeError);
            throw openingNarrativeError;
          }
          if (narrativeLlm.configured && !openingNarrativeText.trim()) {
            // Do not execute tools behind an empty or reasoning-only opening
            // response. The Working transcript must show a genuine public
            // action narrative before evidence collection begins.
            const error = new Error("The model completed without a public action narrative. Please try again.");
            rejectFirstTool?.(error);
            throw error;
          }
          if (!active) return;

          releaseFirstTool?.();
          for await (const event of plannerEvents) {
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
          const failure = chatTurnFailure(err, "planning");
          logger().warn(
            {
              failureKind: failure.kind,
              retryable: failure.retryable,
              diagnosticId: failure.diagnosticId,
              error: err instanceof Error ? `${err.name}: ${err.message.slice(0, 400)}` : String(err),
              stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
            },
            "chat turn failed",
          );
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
            failure,
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
        // Best-effort typed terminal (MP-011): the browser may already be
        // gone, but the persisted turn timeline still records a real
        // cancellation reason instead of leaving the turn orphaned.
        if (sseWriter.hasActiveTurn()) {
          try {
            sseWriter.sendChatEvent({
              type: "cancelled",
              failure: { kind: "cancelled_by_user", retryable: false },
            });
          } catch {
            // Socket already destroyed; the desktop's local cancellation
            // keeps this client's transcript consistent.
          }
        }
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
          const failure = chatTurnFailure(err, "continuation");
          logger().warn(
            { failureKind: failure.kind, retryable: failure.retryable, diagnosticId: failure.diagnosticId },
            "chat continuation failed",
          );
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
            failure,
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
          const failure = chatTurnFailure(err, "approval-execution");
          logger().warn(
            { failureKind: failure.kind, retryable: failure.retryable, diagnosticId: failure.diagnosticId },
            "chat approval execution failed",
          );
          sseWriter.sendChatEvent({
            type: "error",
            message: explainChatSseError(err, settings, envSourceLabel),
            failure,
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
