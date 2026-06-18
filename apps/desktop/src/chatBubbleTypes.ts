export type ConversationPart =
  | { type: "text"; text: string }
  | { type: "markdown"; markdown: string }
  | { type: "code"; language?: string; code: string; title?: string; fileName?: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      state: "input-streaming" | "input-available" | "running" | "result" | "error";
      input?: unknown;
      output?: unknown;
      summary?: string;
    }
  | {
      type: "tool_approval";
      approvalId: string;
      toolName: string;
      description: string;
      args: Record<string, unknown>;
      riskLevel: "low" | "medium" | "high";
    }
  | {
      type: "source_document";
      sourceId: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    }
  | { type: "file"; fileName: string; mediaType?: string; url?: string; localPath?: string }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
      status: "streaming" | "ready" | "error";
      content?: string;
    }
  | { type: "process_step"; status: "running" | "done" | "error"; label: string; detail?: string }
  | { type: "suggested_reply"; id: string; label: string; message: string }
  | { type: "metadata"; riskLevel?: string; actionsTaken?: string[]; suggestions?: string[] };

export type ConversationToolCallPart = Extract<ConversationPart, { type: "tool_call" }>;
export type ConversationToolApprovalPart = Extract<ConversationPart, { type: "tool_approval" }>;
export type ConversationSourcePart = Extract<
  ConversationPart,
  { type: "source_document" | "source_url" }
>;
export type ConversationMetadataPart = Extract<ConversationPart, { type: "metadata" }>;
export type ConversationArtifactPart = Extract<ConversationPart, { type: "artifact" }>;

export type AssistantBubbleSource =
  | {
      type: "source_document";
      sourceId?: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId?: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    };

export interface AssistantBubbleMeta {
  riskLevel?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  actionsTaken?: string[];
  suggestions?: string[];
  sources?: AssistantBubbleSource[];
  artifacts?: ConversationArtifactPart[];
  timestamp?: number;
}

export interface ToolCallPartSnapshot {
  toolCallId: string;
  toolName: string;
  state?: ConversationToolCallPart["state"];
  input?: unknown;
  output?: unknown;
  summary?: string;
}

export interface ToolApprovalPartSnapshot {
  approvalId: string;
  toolName: string;
  description: string;
  args?: Record<string, unknown>;
  riskLevel?: string;
}

export interface ChatBubbleModel {
  id: string;
  kind: string;
  text?: string;
  parts?: ConversationPart[];
  streaming?: boolean;
  meta?: AssistantBubbleMeta;
  pendingStatus?: string;
}
