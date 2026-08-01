import {
  ChatPlanner,
  LLMClient,
  getSettings,
  getProjectLink,
  projectLinkToToolExtra,
  type ToolExecutor,
  type ToolContext,
} from "@mergepilot/core";
import { inlineProjectLinkToToolExtra } from "./chatProjectLinkContext.js";
import type { InlineProjectLink } from "./chatHistoryStore.js";
import { buildEffectiveLlmSettings, type InlineLlmConfig } from "./llmSettings.js";
import { createChatToolExecutors } from "./chatToolRuntime.js";

export interface ChatRuntimeSetupOptions {
  repoPath: string;
  llmConfig?: InlineLlmConfig;
  inlineProjectLink?: InlineProjectLink;
  projectLinkId?: string;
  chatMessage?: string;
  /** A Turn owns one client so its public narrative and tool loop share transport state. */
  llm?: LLMClient;
}

export interface ChatRuntimeSetup {
  llm: LLMClient;
  planner: ChatPlanner;
  actionExecutor: ToolExecutor;
  close: () => Promise<void>;
}

export async function createChatRuntimeSetup(options: ChatRuntimeSetupOptions): Promise<ChatRuntimeSetup> {
  const llm = options.llm ?? new LLMClient(buildEffectiveLlmSettings(options.llmConfig));
  const toolRuntime = await createChatToolExecutors(buildToolContext(options), llm);

  return {
    llm,
    planner: new ChatPlanner(llm, toolRuntime.plannerExecutor),
    actionExecutor: toolRuntime.actionExecutor,
    close: toolRuntime.close,
  };
}

function buildToolContext(options: ChatRuntimeSetupOptions): ToolContext {
  return {
    repoPath: options.repoPath,
    env: {},
    timeoutSec: 60,
    extra: buildToolExtra(options),
  };
}

function buildToolExtra(options: ChatRuntimeSetupOptions): Record<string, unknown> {
  return {
    ...resolveProjectLinkExtra(options),
    ...(options.chatMessage ? { chat_message: options.chatMessage } : {}),
    ...(options.chatMessage && options.inlineProjectLink
      ? { chat_project_link: options.inlineProjectLink }
      : {}),
  };
}

function resolveProjectLinkExtra(options: ChatRuntimeSetupOptions): Record<string, unknown> {
  if (options.inlineProjectLink) {
    return inlineProjectLinkToToolExtra(options.inlineProjectLink);
  }

  const projectLinkId = options.projectLinkId;
  if (!projectLinkId) {
    return {};
  }

  const projectLink = getProjectLink(getSettings().dataDir, projectLinkId);
  return projectLink ? projectLinkToToolExtra(projectLink) : {};
}
