import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Tool } from "./tools/executor.js";
import { toolCapabilities, toolCapabilityPrompt } from "./tools/capabilities.js";
import { finalizationToolSchema } from "./chatPlannerFinalizationTool.js";
import { CHAT_SYSTEM_PROMPT } from "./chatPlannerPrompt.js";
import type { ChatImageAttachment, ChatMessage } from "./chatPlannerTypes.js";

export function buildPlannerMessages(opts: {
  message: string;
  history: ChatMessage[];
  repoPath: string;
  contextPrompt?: string;
  tools: Tool[];
  imageAttachments?: ChatImageAttachment[];
}): ChatCompletionMessageParam[] {
  const userText = [
    `Working directory: ${opts.repoPath}`,
    opts.contextPrompt ? opts.contextPrompt : "",
    opts.imageAttachments?.length
      ? `Attached images: ${opts.imageAttachments.map((attachment) => attachment.name).join(", ")}`
      : "",
    `## User request\n${opts.message}`,
  ].filter(Boolean).join("\n\n");
  const userMessage: ChatCompletionMessageParam = opts.imageAttachments?.length
    ? {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...opts.imageAttachments.map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.dataUrl, detail: "auto" as const },
          })),
        ],
      }
    : {
        role: "user",
        content: userText,
      };
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
    userMessage,
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
