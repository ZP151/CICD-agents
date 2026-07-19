import type { ConversationArtifactPart } from "../../../chatBubbles.js";

export function artifactDownloadFileName(artifact: ConversationArtifactPart): string {
  const extension: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "html",
    markdown: "md",
    mermaid: "mmd",
    react: "txt",
    text: "txt",
  };
  const base = `${artifact.title || artifact.artifactId || "artifact"}`.trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
  return `${base}.${extension[artifact.artifactType]}`;
}

export function artifactDownloadMimeType(type: ConversationArtifactPart["artifactType"]): string {
  const mimeTypes: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "text/html;charset=utf-8",
    markdown: "text/markdown;charset=utf-8",
    mermaid: "text/plain;charset=utf-8",
    react: "text/plain;charset=utf-8",
    text: "text/plain;charset=utf-8",
  };
  return mimeTypes[type];
}

export function artifactWorkspaceKindLabel(type: ConversationArtifactPart["artifactType"]): string {
  const labels: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview",
    markdown: "Report",
    mermaid: "Diagram",
    react: "Preview",
    text: "Text",
  };
  return labels[type];
}

export function artifactWorkspaceStatusLabel(status: ConversationArtifactPart["status"]): string {
  const labels: Record<ConversationArtifactPart["status"], string> = {
    error: "Error",
    ready: "Ready",
    streaming: "Streaming",
  };
  return labels[status];
}

export function artifactWorkspaceStatusClass(status: ConversationArtifactPart["status"]): string {
  const classes: Record<ConversationArtifactPart["status"], string> = {
    error: "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-danger))]",
    ready: "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-success))]",
    streaming: "rounded-full border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-accent-readable))]",
  };
  return classes[status];
}

export function artifactWorkspacePlaceholder(
  type: ConversationArtifactPart["artifactType"],
  status: ConversationArtifactPart["status"],
): string {
  if (status === "streaming") {
    return "The artifact is still streaming. The workspace shell is ready, and full content rendering will attach when the result is complete.";
  }
  if (status === "error") {
    return "The artifact failed before content rendering was available. Keep this selected while deciding whether to retry or inspect the failed run.";
  }
  const placeholders: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview rendering will be added in the next artifact content batch.",
    markdown: "Markdown report rendering will be added in the next artifact content batch.",
    mermaid: "Mermaid diagram rendering will be added in the next artifact content batch.",
    react: "Interactive preview rendering will be added in the next artifact content batch.",
    text: "Text artifact rendering will be added in the next artifact content batch.",
  };
  return placeholders[type];
}
