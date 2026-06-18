export interface ChatArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

export type ChatSource =
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

export interface ChatHistoryEntry {
  sessionId: string;
  preview: string;
  createdAt: number;
  updatedAt?: number;
  title?: string;
  pinned?: boolean;
}

export interface ChatMessageEntry {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  riskLevel?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  actionsTaken?: string[];
  suggestions?: string[];
  sources?: ChatSource[];
  artifacts?: ChatArtifact[];
}
