import type { LLMClient } from "@mergepilot/core";
import { getSettings, runCommand, type ChatPlannerResult } from "@mergepilot/core";
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
      const { repoPath, message, llm, sessionId, getBubbles, inlineProjectLink, projectLinkId } =
        args;
      const notes: string[] = [];
      const projectLinkContext = inlineProjectLinkToChatContextProjectLink(inlineProjectLink);
      // These reads have no dependency on one another. Starting them together
      // shortens the pre-planner gap while preserving the same final prompt.
      const bundlePromise = buildChatContext({
        repoPath,
        message,
        llm,
        projectLink: projectLinkContext,
      });
      const branchInfoPromise = currentBranchContext(repoPath, inlineProjectLink);
      const sessionBubblesPromise = sessionId && getBubbles ? getBubbles(sessionId) : undefined;
      const bundle = await bundlePromise;
      this.refreshContextIndexInBackground(repoPath, llm, projectLinkContext);
      notes.push(describeChatContext(bundle));
      const sources = chatContextSources(bundle);
      let prompt = chatContextToPrompt(bundle) ?? "";

      const branchInfo = await branchInfoPromise;
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

      if (sessionBubblesPromise) {
        const sessionBubbles = await sessionBubblesPromise;
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
    // Test requests use throwaway repositories which are removed immediately
    // after the response. A detached SQLite refresh can still hold index.db on
    // Windows at that point; it is not part of the response contract, so keep
    // integration tests deterministic and leave explicit refresh routes intact.
    if (process.env.VITEST || process.env.NODE_ENV === "test") return;
    const nowMs = Date.now();
    const last = this.indexRefreshAt.get(repoPath) ?? 0;
    if (nowMs - last < 5 * 60 * 1000) return;
    this.indexRefreshAt.set(repoPath, nowMs);
    void refreshChatIndex({ repoPath, llm, projectLink }).catch(() => undefined);
  }
}

export function inlineProjectLinkToChatContextProjectLink(
  projectLink?: InlineProjectLink,
): ChatContextProjectLink | undefined {
  if (!projectLink) return undefined;
  return {
    buildCommand: projectLink.buildCommand,
    testCommand: projectLink.testCommand,
    targetBranch: projectLink.targetBranch || undefined,
  };
}

async function currentBranchContext(
  repoPath: string,
  inlineProjectLink?: InlineProjectLink,
): Promise<string> {
  try {
    const branchResult = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
      timeoutSec: 5,
    });
    const currentBranch = branchResult.stdout.trim();
    if (!currentBranch || currentBranch === "HEAD") return "";
    const targetBranch = inlineProjectLink?.targetBranch;
    return [
      "\n## Current Git State",
      `- Current branch: ${currentBranch}`,
      targetBranch
        ? `- PR target branch: ${targetBranch}`
        : "- PR target branch: not configured; do not infer one before proposing a pull request.",
      targetBranch && currentBranch === targetBranch
        ? "- WARNING: You are on the PR target branch. Create a feature branch before committing and pushing."
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}
