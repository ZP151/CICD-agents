import {
  type ChatMessage,
  type ChatPlannerResult,
  type ChatWorkflowState,
  type PendingToolAction,
  type TurnTimelineEvent,
} from "@mergepilot/core";
import type { InlineLlmConfig } from "./llmSettings.js";

export interface InlineProjectLink {
  id?: string;
  name?: string;
  repoPath: string;
  defaultBranch: string;
  targetBranch: string;
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  adoPat: string;
  adoPipelineId: string;
  adoPipelineName: string;
  adoMcpEnabled: boolean;
  adoMcpCommand: string;
  adoMcpAuthentication: string;
  adoMcpDomains: string;
  projectTemplate: string;
  buildCommand: string;
  testCommand: string;
  ignoredGlobs?: string[];
}

export interface StoredBubble {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  checkpointId?: string;
  checkpointPath?: string;
  riskLevel?: string;
  finalizationMode?: ChatPlannerResult["finalizationMode"];
  actionsTaken?: string[];
  suggestions?: string[];
  sources?: ChatPlannerResult["sources"];
  artifacts?: ChatPlannerResult["artifacts"];
  repoPath?: string;
}

export interface StoredSession {
  id: string;
  createdAt: number;
  updatedAt?: number;
  title?: string;
  pinned?: boolean;
  repoPath: string;
  projectLinkId?: string;
  messages: ChatMessage[];
  bubbles: StoredBubble[];
  /** Public-only Timeline records; used to restore the exact Turn hierarchy. */
  timelineEvents?: TurnTimelineEvent[];
  approvalProposal?: PendingToolAction;
  /** @deprecated Use approvalProposal. Kept so old local/Cosmos sessions can be resumed. */
  pendingAction?: PendingToolAction;
  workflowState?: ChatWorkflowState;
  llmConfig?: InlineLlmConfig;
  inlineProjectLink?: InlineProjectLink;
}

export type HistoryStore = Record<string, StoredSession>;

export interface ChatHistoryEntry {
  sessionId: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  pinned?: boolean;
}
