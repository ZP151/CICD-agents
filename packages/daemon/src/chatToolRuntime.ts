import {
  LLMClient,
  ToolExecutor,
  ActionPolicy,
  actionVerdictForTool,
  capabilityRegistryFromTools,
  toolRequiresApproval,
  createGitCheckpoint,
  azureDevOpsTools,
  dotnetTools,
  gitTools,
  npmTools,
  pytestTools,
  validationTools,
  type Tool,
  type ToolContext,
} from "@mergepilot/core";
import {
  buildChatContext,
  chatContextSources,
  chatContextToPrompt,
  describeChatContext,
  refreshChatIndex,
} from "@mergepilot/core/chatContext";
import { inlineProjectLinkToChatContextProjectLink } from "./chatContextPrompt.js";
import type { InlineProjectLink } from "./chatHistoryStore.js";
import { createAzureDevOpsMcpConnector, createWebResearchMcpConnector } from "./chatMcpConnectors.js";
import { deliveryTools } from "./deliveryTools.js";

type ChatExecutorMode = "planner" | "confirmed-action";

export interface ChatToolExecutors {
  plannerExecutor: ToolExecutor;
  actionExecutor: ToolExecutor;
  close: () => Promise<void>;
}

export async function createChatToolExecutors(ctx: ToolContext, llm = new LLMClient()): Promise<ChatToolExecutors> {
  const [azureDevOpsMcp, webResearchMcp] = await Promise.all([
    createAzureDevOpsMcpConnector(ctx),
    createWebResearchMcpConnector(ctx),
  ]);
  const tools = [
    ...chatTools(),
    ...chatContextTools(llm),
    ...(azureDevOpsMcp?.tools ?? []),
    ...(webResearchMcp?.tools ?? []),
  ];
  const plannerExecutor = createChatToolExecutor(ctx, "planner", tools);
  const actionExecutor = createChatToolExecutor(ctx, "confirmed-action", tools);
  return {
    plannerExecutor,
    actionExecutor,
    close: async () => { await Promise.all([azureDevOpsMcp?.close(), webResearchMcp?.close()]); },
  };
}

function chatTools(): Tool[] {
  return [
    ...gitTools(),
    ...dotnetTools(),
    ...npmTools(),
    ...pytestTools(),
    ...validationTools(),
    ...azureDevOpsTools(),
    ...deliveryTools(),
  ];
}

function chatContextTools(llm: LLMClient): Tool[] {
  return [
    {
      name: "repo_refresh_index",
      description:
        "Refresh the local repository understanding index for the current Project Link. Use when the user asks the agent to understand, scan, index, or re-index the project before answering.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      handler: async (ctx) => {
        const stats = await refreshChatIndex({ repoPath: ctx.repoPath, llm });
        const embeddingError = "embeddingError" in stats
          ? nonEmptyString((stats as { embeddingError?: unknown }).embeddingError)
          : "";
        const originalMessage = nonEmptyString(ctx.extra["chat_message"]);
        const inlineProjectLink = isInlineProjectLinkLike(ctx.extra["chat_project_link"])
          ? ctx.extra["chat_project_link"]
          : isInlineProjectLinkLike(ctx.extra["chat_profile"])
            ? ctx.extra["chat_profile"]
            : undefined;
        const projectLink = inlineProjectLinkToChatContextProjectLink(inlineProjectLink);
        const followUpContext = originalMessage
          ? await buildChatContext({
              repoPath: ctx.repoPath,
              message: originalMessage,
              llm,
              projectLink,
              useSemanticIndex: true,
            })
          : null;
        const repositoryContextPrompt = followUpContext
          ? chatContextToPrompt(followUpContext, 10_000)
          : "";
        const contextSources = followUpContext ? chatContextSources(followUpContext) : [];
        return {
          ok: true,
          repoPath: ctx.repoPath,
          filesSeen: stats.filesSeen,
          filesIndexed: stats.filesIndexed,
          filesIndexedThisRun: stats.filesIndexed,
          embedded: stats.embedded,
          embeddingWarning: embeddingError
            ? `Embedding failed; repository file/chunk index is still usable. ${embeddingError}`
            : "",
          totalFilesIndexed: followUpContext?.indexStats.filesIndexed ?? 0,
          totalChunksIndexed: followUpContext?.indexStats.chunksIndexed ?? 0,
          totalChunksEmbedded: followUpContext?.indexStats.chunksEmbedded ?? 0,
          contextSummary: followUpContext ? describeChatContext(followUpContext) : "",
          repositoryContextPrompt,
          contextSources,
          instruction:
            "Use repositoryContextPrompt to answer the user's original request now. Copy relevant entries from contextSources into final sources. filesIndexedThisRun is only the incremental update count, not the total indexed repository size. Do not stop after refreshing the index, and do not ask the user to provide a high-level overview when repository context is available.",
          summary:
            `Repository index refresh complete. Current index: ${followUpContext?.indexStats.filesIndexed ?? 0} files, ` +
            `${followUpContext?.indexStats.chunksIndexed ?? 0} chunks, ` +
            `${followUpContext?.indexStats.chunksEmbedded ?? 0} embedded chunks. ` +
            `This incremental run updated ${stats.filesIndexed} file(s) and embedded ${stats.embedded} chunk(s). ` +
            (embeddingError ? "Embedding failed, so semantic search may fall back to quick scan. " : "") +
            "Follow-up repository context is included in this tool result.",
        };
      },
    },
  ];
}

function createChatToolExecutor(ctx: ToolContext, mode: ChatExecutorMode, tools: Tool[]): ToolExecutor {
  // MP-015: the planner gate is the local ActionPolicy over the
  // CapabilityRegistry, not a bare risk check. Verdicts are typed and
  // auditable; server annotations never enter the decision.
  const policy = new ActionPolicy();
  const registry = capabilityRegistryFromTools(tools);
  const executor = new ToolExecutor(
    ctx,
    mode === "planner"
      ? ({ tool }) => {
          const verdict = actionVerdictForTool(policy, registry.get(tool.name), "implicit");
          return verdict.decision === "allow";
        }
      : undefined,
    mode === "confirmed-action"
      ? async ({ toolName, tool }) => {
          if (toolName === "git_checkpoint") return;
          if (!toolName.startsWith("git_")) return;
          if (!toolRequiresApproval(tool)) return;
          const checkpoint = await createGitCheckpoint(ctx, `before ${toolName}`);
          return {
            checkpointId: checkpoint["checkpointId"],
            checkpointPath: checkpoint["path"],
          };
        }
      : undefined,
  );
  executor.registerMany(tools);
  return executor;
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isInlineProjectLinkLike(value: unknown): value is InlineProjectLink {
  return typeof value === "object" && value !== null && typeof (value as { repoPath?: unknown }).repoPath === "string";
}
