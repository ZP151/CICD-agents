import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  LLMClient,
  type ChatPlannerResult,
  type ChatWorkflowState,
  type Settings,
} from "@mergepilot/core";
import { getChatIndexStatus, refreshChatIndex } from "@mergepilot/core/chatContext";
import type { ChatSessionManager, InlineLlmConfig, InlineProjectLink } from "../chatSession.js";
import type { ProjectLinkStoreAdapter } from "../projectLinkStore.js";
import { createChatSseWriter, isTerminalChatEvent } from "./chatSse.js";
import type { ChatWorkflowActionPayload } from "./chat-workflow.routes.js";

const MAX_CHAT_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const CHAT_IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/;

const LlmConfigSchema = z
  .object({
    llmProvider: z.enum(["azure", "openai"]).optional(),
    azureEndpoint: z.string().optional(),
    azureApiKey: z.string().optional(),
    azureDeployment: z.string().optional(),
    azureApiVersion: z.string().optional(),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().optional(),
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
  runWorkflowAction?: (payload: ChatWorkflowActionPayload) => Promise<unknown>;
}

interface WorkflowToolResult {
  name: string;
  command?: string;
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  returncode?: number;
}

interface WorkflowActionResult {
  summary?: string;
  workflowState?: ChatWorkflowState;
  tools?: WorkflowToolResult[];
  artifacts?: ChatPlannerResult["artifacts"];
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

function readonlyWorkflowFromMessage(
  message: string,
  projectLink?: InlineProjectLink,
): Pick<ChatWorkflowActionPayload, "action" | "pullRequestId" | "pipelineId"> | undefined {
  const text = message.trim();
  if (!text) return undefined;

  const lower = text.toLowerCase();
  const lowerWithoutNegativeClauses = lower.replace(/\bdo not\b[^.?!;]*/g, "");
  const hasReadIntent =
    /\b(analy[sz]e|inspect|review|summari[sz]e|check|explain|show|status|readiness|why|what'?s)\b/.test(
      lower,
    );
  const hasExplicitReadOnly = /\bread[-\s]?only\b|do not (modify|write|request approval)/.test(
    lower,
  );
  const hasWriteIntent =
    /\b(trigger|rerun|queue|start|create|update|push|commit|stage|merge|approve|link)\b/.test(
      lowerWithoutNegativeClauses,
    ) && !hasExplicitReadOnly;
  if ((!hasReadIntent && !hasExplicitReadOnly) || hasWriteIntent) return undefined;

  const prMatch = text.match(/\b(?:pr|pull\s+request)\s*#?\s*(\d+)\b/i);
  if (prMatch?.[1]) {
    return {
      action: "inspect_pr_insight",
      pullRequestId: Number(prMatch[1]),
    };
  }

  const localGitAction = readonlyLocalGitWorkflowFromMessage(lower);
  if (localGitAction) return { action: localGitAction };

  if (!projectLinkHasAdoMapping(projectLink)) return undefined;
  const pipelineMentioned = /\b(pipeline|build|ci)\b/i.test(text);
  if (!pipelineMentioned) return undefined;
  const pipelineMatch = text.match(/\b(?:pipeline|build|ci)(?:\s*(?:#|id)?)?\s*(\d+)?\b/i);
  const pipelineId = Number(pipelineMatch?.[1] ?? projectLink?.adoPipelineId ?? 0);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) return undefined;
  return {
    action: "inspect_pipeline",
    pipelineId,
  };
}

function readonlyLocalGitWorkflowFromMessage(
  lower: string,
): ChatWorkflowActionPayload["action"] | undefined {
  const mentionsStagedChanges =
    /\b(what(?:'s| is)? (?:staged|in the index|will be committed)|staged changes|staged diff|cached diff|commit scope|what will be committed|what would be committed)\b/.test(
      lower,
    );
  if (mentionsStagedChanges) return "inspect_staged_changes";

  const mentionsCurrentBranch =
    /\b(what'?s on this branch|current branch|branch status|branch state|where am i|working tree status)\b/.test(
      lower,
    );
  if (mentionsCurrentBranch) return "refresh_branch";

  const mentionsRemoteTarget =
    /\b(where will (?:this|my|the)?\s*push go|push target|remote target|show remote|configured remotes|where would (?:this|my|the)?\s*push go)\b/.test(
      lower,
    );
  if (mentionsRemoteTarget) return "inspect_remote_target";

  const mentionsCurrentChanges =
    /\b(review my changes|review changes|what changed|current changes|inspect diff|working tree changes|workspace changes|unstaged changes)\b/.test(
      lower,
    );
  if (mentionsCurrentChanges) return "inspect_changes";

  return undefined;
}

function projectLinkHasAdoMapping(projectLink?: InlineProjectLink): boolean {
  return Boolean(
    projectLink?.adoOrgUrl?.trim() &&
    projectLink.adoProject?.trim() &&
    projectLink.adoRepoName?.trim(),
  );
}

function workflowPlannerResult(summary: string, result: WorkflowActionResult): ChatPlannerResult {
  return {
    response: summary,
    riskLevel: "low",
    actionsTaken: result.workflowState?.completedTools ?? [],
    suggestions: [],
    sources: [],
    artifacts: result.artifacts,
    toolCallsMade: (result.tools ?? []).map((tool) => ({
      name: tool.name,
      args: { command: tool.command ?? tool.name },
      ok: tool.ok !== false,
    })),
    usedLlm: false,
  };
}

function workflowToolSummary(tool: WorkflowToolResult): string {
  if (tool.returncode !== undefined)
    return tool.returncode === 0 ? "Success" : `Exit code ${tool.returncode}`;
  return tool.ok === false ? "Failed" : "Success";
}

function directWorkflowRunningState(
  directWorkflow: Pick<ChatWorkflowActionPayload, "action" | "pullRequestId" | "pipelineId">,
): ChatWorkflowState {
  if (directWorkflow.action === "inspect_pr_insight") {
    return {
      status: "running",
      currentStep: `Inspecting PR #${directWorkflow.pullRequestId}`,
      completedTools: [],
      workflowKind: "pr",
      workflowPhase: "inspecting",
    };
  }
  if (directWorkflow.action === "inspect_pipeline") {
    return {
      status: "running",
      currentStep: `Inspecting pipeline #${directWorkflow.pipelineId}`,
      completedTools: [],
      workflowKind: "ci",
      workflowPhase: "pipeline_inspecting",
    };
  }
  return {
    status: "running",
    currentStep:
      directWorkflow.action === "refresh_branch"
        ? "Inspecting current branch"
        : directWorkflow.action === "inspect_staged_changes"
          ? "Inspecting staged changes"
          : "Inspecting current changes",
    completedTools: [],
    workflowKind: "git",
    workflowPhase: directWorkflow.action,
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
    runWorkflowAction,
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

    const { imageAttachments, message, repoPath, sessionId: existingId, llmConfig } = parsed.data;
    const projectLinkId = projectLinkIdFromChatPayload(parsed.data);
    const inlineProjectLink = inlineProjectLinkFromPayload(parsed.data);
    const sessionId = existingId ?? chatSessions.createSession(repoPath, projectLinkId);
    const sseWriter = createChatSseWriter(reply, sessionId);
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sseWriter.startTurn(turnId);
    sseWriter.sendChatEvent({ type: "progress", message: "Preparing conversation" });
    const projectLink = await resolveProjectLinkForChat(
      projectLinkId,
      inlineProjectLink,
      projectLinkStore,
    );
    const directWorkflow = runWorkflowAction
      ? readonlyWorkflowFromMessage(message, projectLink)
      : undefined;

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          if (directWorkflow) {
            const workflowRunner = runWorkflowAction;
            if (!workflowRunner) return;
            const storedMessage = imageAttachments.length
              ? `${message}\n\nAttached images: ${imageAttachments.map((item) => item.name).join(", ")}`.trim()
              : message;
            await chatSessions.appendUserTurn(sessionId, storedMessage, repoPath);
            sseWriter.sendChatEvent({
              type: "workflow_state",
              state: directWorkflowRunningState(directWorkflow),
            });
            const result = (await workflowRunner({
              ...directWorkflow,
              repoPath,
              sessionId,
              projectLinkId,
              projectLink,
            } as ChatWorkflowActionPayload)) as WorkflowActionResult;
            for (const tool of result.tools ?? []) {
              const args = { command: tool.command ?? tool.name };
              sseWriter.sendChatEvent({ type: "tool_start", name: tool.name, args });
              sseWriter.sendChatEvent({
                type: "tool_end",
                name: tool.name,
                ok: tool.ok !== false,
                summary: workflowToolSummary(tool),
                result: tool,
              });
            }
            const summary = result.summary?.trim() || "Workflow inspection completed.";
            sseWriter.sendChatEvent({ type: "assistant_delta", delta: summary });
            if (result.workflowState) {
              sseWriter.sendChatEvent({ type: "workflow_state", state: result.workflowState });
            }
            sseWriter.sendChatEvent({
              type: "done",
              result: workflowPlannerResult(summary, result),
            });
            sseWriter.end();
            resolve();
            return;
          }

          for await (const event of chatSessions.run(
            sessionId,
            message,
            repoPath,
            projectLinkId,
            llmConfig,
            projectLink,
            imageAttachments,
          )) {
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
