import {
  type ChatEvent,
  type ChatImageAttachment,
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
  imageAttachments?: ChatImageAttachment[];
  projectLinkId?: string;
  persistUserMessage?: boolean;
  contextProgressMessage: string;
  planningProgressMessage: string;
  initialNarrative?: string;
  actionNarrativesEnabled?: boolean;
  initialNarrativeInFlight?: boolean;
  /** Public opening must complete before ChatPlanner executes its first tool. */
  beforeFirstTool?: Promise<void>;
  /** Keep synchronous project-index work out of the first visible Turn path. */
  fastStart?: boolean;
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
    imageAttachments = [],
    initialNarrative,
    initialNarrativeInFlight = false,
    beforeFirstTool,
    fastStart = false,
    actionNarrativesEnabled = false,
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

  // History and repository context are independent reads. Start both before
  // yielding the visible context phase so a slow index does not serialize an
  // otherwise cheap history lookup. The SSE writer has already sent
  // `turn.started`; this phase is an honest description of work now in flight.
  const historyPromise = adapters.getHistory(sessionId, historyLimit);
  yield { type: "progress", message: contextProgressMessage };
  const contextPromise = fastStart
    ? undefined
    : contextPromptBuilder.build({
        repoPath,
        message,
        llm,
        inlineProjectLink,
        projectLinkId: args.projectLinkId,
        sessionId,
        getBubbles: adapters.getBubbles,
      });
  // A full repository-context build can take seconds. It is valuable evidence
  // but not a prerequisite for the first agent plan. Both bounded reads race
  // concurrently, so their 100/250 ms budgets never serialize the first
  // planner decision; missing evidence is gathered through actual tools in
  // this same Turn.
  const [history, context] = await Promise.all([
    contextWithinBudget(historyPromise, 100),
    contextPromise ? contextWithinBudget(contextPromise, 250) : Promise.resolve(undefined),
  ]);
  yield { type: "progress", message: planningProgressMessage };

  yield* streamPlannerAndPersist({
    sessionId,
    message,
    history: history ?? [],
    repoPath,
    planner,
    waitForConfirm,
    contextPrompt: context?.prompt,
    imageAttachments,
    contextNotes: context?.notes,
    contextSources: context?.sources,
    initialNarrative,
    actionNarrativesEnabled,
    initialNarrativeInFlight,
    beforeFirstTool,
    adapters,
  });
}

async function contextWithinBudget<T>(promise: Promise<T>, budgetMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
