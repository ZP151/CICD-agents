import {
  getSettings,
  LLMClient,
  runCommand,
  type ChatPlannerResult,
} from "@mergepilot/core";
import {
  buildChatContext,
  chatContextSources,
  chatContextToPrompt,
  describeChatContext,
  refreshChatIndex,
  type ChatContextProjectLink,
} from "@mergepilot/core/chatContext";
import {
  buildPrInsightContextBundle,
  formatPipelineFailureArtifactsForChat,
  formatValidationArtifactsForChat,
} from "./chatArtifactContext.js";
import type { InlineProjectLink, StoredBubble } from "./chatHistoryStore.js";

export interface BuiltContextPrompt {
  prompt?: string;
  notes: string[];
  sources?: ChatPlannerResult["sources"];
}

export class ChatContextPromptBuilder {
  private readonly indexRefreshAt = new Map<string, number>();

  async build(args: {
    repoPath: string;
    message: string;
    llm: LLMClient;
    inlineProjectLink?: InlineProjectLink;
    projectLinkId?: string;
    sessionId?: string;
    getBubbles?: (sessionId: string) => Promise<StoredBubble[]>;
  }): Promise<BuiltContextPrompt> {
    try {
      const { repoPath, message, llm, sessionId, getBubbles, inlineProjectLink, projectLinkId } = args;
      const notes: string[] = [];
      const projectLinkContext = inlineProjectLinkToChatContextProjectLink(inlineProjectLink);
      const bundle = await buildChatContext({ repoPath, message, llm, projectLink: projectLinkContext });
      this.refreshContextIndexInBackground(repoPath, llm, projectLinkContext);
      notes.push(describeChatContext(bundle));
      const sources = chatContextSources(bundle);
      let prompt = chatContextToPrompt(bundle) ?? "";

      const branchInfo = await currentBranchContext(repoPath, inlineProjectLink);
      if (branchInfo) {
        prompt = prompt ? `${prompt}\n${branchInfo}` : branchInfo;
      }

      const insightContext = buildPrInsightContextBundle({
        dataDir: getSettings().dataDir,
        message,
        projectLinkId: projectLinkId ?? inlineProjectLink?.id,
        repository: inlineProjectLink?.adoRepoName,
      });
      if (insightContext.prompt) {
        prompt = prompt ? `${prompt}\n${insightContext.prompt}` : insightContext.prompt;
        notes.push(...insightContext.notes);
      }

      if (sessionId && getBubbles) {
        const sessionBubbles = await getBubbles(sessionId);
        const validationPrompt = formatValidationArtifactsForChat(sessionBubbles, message);
        if (validationPrompt) {
          prompt = prompt ? `${prompt}\n${validationPrompt}` : validationPrompt;
          notes.push("Used latest validation failure artifact from this conversation.");
        }
        const pipelinePrompt = formatPipelineFailureArtifactsForChat(sessionBubbles, message);
        if (pipelinePrompt) {
          prompt = prompt ? `${prompt}\n${pipelinePrompt}` : pipelinePrompt;
          notes.push("Used latest Azure Pipeline failure artifact from this conversation.");
        }
      }

      return { prompt: prompt || undefined, notes, sources };
    } catch {
      return { notes: [] };
    }
  }

  private refreshContextIndexInBackground(
    repoPath: string,
    llm: LLMClient,
    projectLink?: ChatContextProjectLink,
  ): void {
    const nowMs = Date.now();
    const last = this.indexRefreshAt.get(repoPath) ?? 0;
    if (nowMs - last < 5 * 60 * 1000) return;
    this.indexRefreshAt.set(repoPath, nowMs);
    void refreshChatIndex({ repoPath, llm, projectLink }).catch(() => undefined);
  }
}

export function inlineProjectLinkToChatContextProjectLink(projectLink?: InlineProjectLink): ChatContextProjectLink | undefined {
  if (!projectLink) return undefined;
  return {
    buildCommand: projectLink.buildCommand,
    testCommand: projectLink.testCommand,
    targetBranch: projectLink.targetBranch || projectLink.defaultBranch || "main",
    pipelineName: projectLink.adoPipelineName,
  };
}

async function currentBranchContext(repoPath: string, inlineProjectLink?: InlineProjectLink): Promise<string> {
  try {
    const branchResult = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 5,
    });
    const currentBranch = branchResult.stdout.trim();
    if (!currentBranch || currentBranch === "HEAD") return "";
    const targetBranch = inlineProjectLink?.targetBranch || inlineProjectLink?.defaultBranch || "main";
    return [
      "\n## Current Git State",
      `- Current branch: ${currentBranch}`,
      `- PR target branch: ${targetBranch}`,
      currentBranch === targetBranch
        ? "- WARNING: You are on the PR target branch. Create a feature branch before committing and pushing."
        : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
