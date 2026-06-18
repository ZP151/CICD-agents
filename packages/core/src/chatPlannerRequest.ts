import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Tool } from "./tools/executor.js";
import { toolCapabilities, toolCapabilityPrompt } from "./tools/capabilities.js";
import { finalizationToolSchema } from "./chatPlannerFinalizationTool.js";
import { CHAT_SYSTEM_PROMPT } from "./chatPlannerPrompt.js";
import type { ChatMessage } from "./chatPlannerTypes.js";

export function buildPlannerMessages(opts: {
  message: string;
  history: ChatMessage[];
  repoPath: string;
  contextPrompt?: string;
  tools: Tool[];
}): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: [CHAT_SYSTEM_PROMPT, toolCapabilityPrompt(opts.tools)]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...opts.history.slice(-20).map(
      (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
    ),
    {
      role: "user",
      content: [
        `Working directory: ${opts.repoPath}`,
        opts.contextPrompt ? opts.contextPrompt : "",
        `## User request\n${opts.message}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
}

export function buildPlannerToolSchemas(registeredTools: Tool[]): ChatCompletionTool[] {
  return [
    ...registeredTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    finalizationToolSchema(),
  ];
}

export function buildToolCapabilitiesByName(registeredTools: Tool[]) {
  return new Map(
    toolCapabilities(registeredTools).map((cap) => [cap.name, cap]),
  );
}
