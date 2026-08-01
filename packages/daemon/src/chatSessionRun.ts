import { type ChatEvent, type ChatImageAttachment, type LLMClient } from "@mergepilot/core";
import type { InlineLlmConfig } from "./llmSettings.js";
import type { ActiveChatSessions } from "./chatActiveSessions.js";
import {
  loadSession,
  storedSessionProjectLinkId,
  type InlineProjectLink,
} from "./chatHistoryStore.js";
import { saveSession } from "./chatSessionRecords.js";
import { handleChatMessageApproval } from "./chatMessageApprovals.js";
import {
  streamPlannerContinuation,
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import { createChatRuntimeSetup, type ChatRuntimeSetup } from "./chatRuntimeSetup.js";

export interface RunChatSessionTurnArgs {
  active: ActiveChatSessions;
  sessionId: string;
  message: string;
  repoPath: string;
  projectLinkId?: string;
  llmConfig?: InlineLlmConfig;
  inlineProjectLink?: InlineProjectLink;
  imageAttachments?: ChatImageAttachment[];
  llm?: LLMClient;
  initialNarrative?: string;
  initialNarrativeInFlight?: boolean;
  fastStart?: boolean;
  /** Started alongside the opening narrative so tool/MCP setup cannot add a
   * second idle gap before the first real action. Ownership transfers to this
   * function once awaited and is released by the existing finally block. */
  prewarmedRuntime?: Promise<ChatRuntimeSetup>;
  adapters: PlannerContinuationAdapters;
}

export async function* runChatSessionTurn(args: RunChatSessionTurnArgs): AsyncGenerator<ChatEvent> {
  const {
    active,
    adapters,
    inlineProjectLink,
    llmConfig,
    message,
    imageAttachments = [],
    initialNarrative,
    initialNarrativeInFlight = false,
    fastStart = false,
    prewarmedRuntime,
    llm: turnLlm,
    projectLinkId,
    repoPath,
    sessionId,
  } = args;

  if (!active.has(sessionId)) {
    const storedCheck = await loadSession(sessionId);
    if (!storedCheck) {
      yield { type: "error", message: "session not found" };
      return;
    }
    active.start(sessionId, repoPath);
  }

  const session = active.get(sessionId)!;
  const projectLinkSnapshot = inlineProjectLink;
  const effectiveRepoPath = resolveTurnRepoPath(repoPath, projectLinkSnapshot);
  session.repoPath = effectiveRepoPath;

  const storedSession = await loadSession(sessionId);
  if (storedSession) {
    storedSession.repoPath = effectiveRepoPath;
    if (projectLinkId) {
      storedSession.projectLinkId = projectLinkId;
    }
    if (llmConfig) storedSession.llmConfig = llmConfig;
    if (projectLinkSnapshot) {
      storedSession.inlineProjectLink = projectLinkSnapshot;
    }
    await saveSession(storedSession);
  }

  const storedForRuntime = projectLinkSnapshot ? undefined : storedSession;
  const runtime = await (prewarmedRuntime ?? createChatRuntimeSetup({
    repoPath: session.repoPath,
    llmConfig,
    inlineProjectLink: projectLinkSnapshot,
    projectLinkId: projectLinkId ?? (storedForRuntime ? storedSessionProjectLinkId(storedForRuntime) : undefined),
    chatMessage: message,
    llm: turnLlm,
  }));
  const { llm, planner, actionExecutor } = runtime;
  const waitForConfirm = (): Promise<boolean> => active.waitForConfirm(sessionId);

  try {
    const storedMessage = messageWithImageNames(message, imageAttachments);
    await adapters.appendBubble(sessionId, { role: "user", content: storedMessage, timestamp: now(), repoPath });
    await adapters.appendMessage(sessionId, "user", storedMessage);

    const handledApproval = yield* handleChatMessageApproval({
      sessionId,
      message,
      repoPath: session.repoPath,
      llm,
      planner,
      actionExecutor,
      waitForConfirm,
      inlineProjectLink: projectLinkSnapshot,
      projectLinkId,
      adapters,
    });
    if (handledApproval) return;

    yield* streamPlannerContinuation({
      sessionId,
      message,
      repoPath: session.repoPath,
      historyLimit: 20,
      llm,
      planner,
      inlineProjectLink: projectLinkSnapshot,
      projectLinkId,
      imageAttachments,
      waitForConfirm,
      contextProgressMessage: "Reading project context",
      planningProgressMessage: "Planning response",
      initialNarrative,
      actionNarrativesEnabled: true,
      initialNarrativeInFlight,
      fastStart,
      adapters,
    });
  } finally {
    await runtime.close();
    active.finish(sessionId);
  }
}

/** Project Link is the execution target; the composer workspace is fallback only. */
export function resolveTurnRepoPath(repoPath: string, projectLink?: Pick<InlineProjectLink, "repoPath">): string {
  return (projectLink?.repoPath?.trim() || repoPath.trim()) || ".";
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function messageWithImageNames(message: string, imageAttachments: ChatImageAttachment[]): string {
  if (imageAttachments.length === 0) return message;
  const imageLines = imageAttachments.map((attachment) => `[image: ${attachment.name}]`).join("\n");
  return [message, imageLines].filter(Boolean).join("\n\n");
}
