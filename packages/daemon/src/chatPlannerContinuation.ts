import {
  type ChatEvent,
  type ChatMessage,
  type ChatPlanner,
  type LLMClient,
} from "@mergepilot/core";
import { ChatContextPromptBuilder } from "./chatContextPrompt.js";
import type { InlineProjectLink, StoredBubble } from "./chatHistoryStore.js";
import {
  streamPlannerAndPersist,
  type PlannerPersistenceAdapters,
} from "./chatPlannerPersistence.js";

export interface PlannerContinuationAdapters extends PlannerPersistenceAdapters {
  getHistory: (sessionId: string, limit: number) => Promise<ChatMessage[]>;
  getBubbles: (sessionId: string) => Promise<StoredBubble[]>;
}

export interface StreamPlannerContinuationArgs {
  sessionId: string;
  message: string;
  repoPath: string;
  historyLimit: number;
  llm: LLMClient;
  planner: ChatPlanner;
  waitForConfirm: () => Promise<boolean>;
  inlineProjectLink?: InlineProjectLink;
  projectLinkId?: string;
  persistUserMessage?: boolean;
  contextProgressMessage: string;
  planningProgressMessage: string;
  adapters: PlannerContinuationAdapters;
}

const contextPromptBuilder = new ChatContextPromptBuilder();

export async function* streamPlannerContinuation(args: StreamPlannerContinuationArgs): AsyncGenerator<ChatEvent> {
  const {
    adapters,
    contextProgressMessage,
    historyLimit,
    inlineProjectLink,
    llm,
    message,
    persistUserMessage,
    planner,
    planningProgressMessage,
    repoPath,
    sessionId,
    waitForConfirm,
  } = args;

  if (persistUserMessage) {
    await adapters.appendMessage(sessionId, "user", message);
  }

  const history = await adapters.getHistory(sessionId, historyLimit);
  yield { type: "progress", message: contextProgressMessage };
  const context = await contextPromptBuilder.build({
    repoPath,
    message,
    llm,
    inlineProjectLink,
    projectLinkId: args.projectLinkId,
    sessionId,
    getBubbles: adapters.getBubbles,
  });
  yield { type: "progress", message: planningProgressMessage };

  yield* streamPlannerAndPersist({
    sessionId,
    message,
    history,
    repoPath,
    planner,
    waitForConfirm,
    contextPrompt: context.prompt,
    contextNotes: context.notes,
    contextSources: context.sources,
    adapters,
  });
}
