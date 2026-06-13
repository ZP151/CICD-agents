import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  checkAdoProjectLinkTools,
  chatStream,
  confirmAction as apiConfirmAction,
  confirmPlan,
  cancelPlan,
  discoverAdoProjectLinkOptions,
  fetchChatIndexStatus,
  fetchChatHistory,
  fetchChatMessages,
  fetchChatState,
  fetchProfilePrInsightArtifactById,
  runChatWorkflowAction,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type ChatEventPayload,
  type ChatHistoryEntry,
  type ChatIndexStatus,
  type ChatArtifact,
  type ChatUiChunk,
  type PrInsightArtifactRecord,
  type ChatWorkflowAction,
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "../api.js";
import { useAppData } from "../App.js";
import {
  ACTIVITY_HANDOFF_KEY,
  CHAT_HANDOFF_KEY,
  buildActivityPrInsightHandoffDraft,
  type ChatHandoffDraft,
} from "../checkpointHandoff.js";
import {
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
  DEFAULT_ADO_ORG_URL,
  loadStoredActiveProjectLinkId,
  pickRecommendedPipeline,
  type PatStatus,
  projectLinkNameFromRepo,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
  verifyPat,
} from "../projectLinks.js";
import {
  appendTextDeltaToConversationParts,
  appendToolOutputDeltaToConversationParts,
  assistantBubbleMetaFromUnknown,
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  finaliseAssistantResponseBubbles,
  mergeAssistantMetadataIntoLatestBubble,
  primaryToolCallPart,
  toolApprovalPartFromSnapshot,
  toolCallPartFromSnapshot,
  upsertToolCallPart,
  type AssistantBubbleMeta,
  type ConversationArtifactPart,
  type ConversationPart,
  type ConversationToolCallPart,
  type ToolCallPartSnapshot,
} from "../chatBubbles.js";
import {
  isNearChatBottom,
  readChatScrollMetrics,
  shouldFollowIncomingChatContent,
} from "../chatScroll.js";
import { groupChatRenderItems, type ChatRenderItem } from "../chatRenderItems.js";
import { ConversationPartRenderer } from "../components/conversation/ConversationPartRenderer.js";
import {
  ApprovalEvidence,
  type ApprovalPreflightEvidence,
  type ApprovalReadinessEvidence,
  type ApprovalWorkflowEvidence,
} from "../components/conversation/ApprovalEvidence.js";
import {
  ExecutionTimeline,
  type ExecutionTimelineItem,
} from "../components/conversation/ExecutionTimeline.js";
import {
  CommandChipBar,
  SuggestionReplyBar,
  deriveComposerInputState,
  deriveCommandChips,
  deriveComposerStateNotice,
  deriveSuggestionReplies,
  shouldQueueSuggestionReply,
  type ComposerStateNotice,
  type SuggestionReply,
} from "../components/conversation/SuggestionReplyBar.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type BubbleKind = "user" | "assistant" | "tool" | "confirm" | "pending_confirm" | "error" | "system";

interface Bubble {
  id: string;
  kind: BubbleKind;
  text?: string;
  parts?: ConversationPart[];
  streaming?: boolean;
  // tool
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  toolOpen?: boolean;
  toolLiveOutput?: string;
  // legacy risk-confirm (medium/high risk pre-execution gate)
  riskLevel?: string;
  plan?: string;
  sessionId?: string;
  confirmed?: boolean | null;
  // pending_confirm card (proposed write action awaiting user button click)
  pendingTool?: string;
  pendingArgs?: Record<string, unknown>;
  pendingDescription?: string;
  pendingNextHint?: string;
  pendingWorkflow?: ApprovalWorkflowEvidence;
  pendingReadiness?: ApprovalReadinessEvidence;
  pendingPreflight?: ApprovalPreflightEvidence;
  pendingStatus?: "waiting" | "executing" | "done" | "cancelled";
  // metadata shown in collapsible Details panel
  meta?: AssistantBubbleMeta;
}

interface SavedPrInsightSource {
  artifactId: string;
  pullRequestId: string;
  kind: string;
  at: string;
}

type ArtifactLookupState =
  | { status: "loading" }
  | { status: "loaded"; record: PrInsightArtifactRecord }
  | { status: "error"; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function makeToolCallId(toolName?: string, args?: Record<string, unknown>): string {
  if (args !== undefined) return `tool-${toolName ?? "unknown"}-${hashShort(JSON.stringify(args ?? {}))}`;
  return `tool-${toolName ?? "unknown"}-${uid()}`;
}

function hashShort(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function toolPartStateFromResult(toolOk?: boolean): "result" | "error" | "running" {
  if (toolOk === false) return "error";
  if (toolOk === true) return "result";
  return "running";
}

type ConversationModelChoice = "built_in" | "custom";

interface CustomConversationModel {
  available: boolean;
  label: string;
  provider: "azure" | "openai";
}

function readCustomConversationModel(): CustomConversationModel {
  try {
    const raw = localStorage.getItem("dev_agent_settings");
    if (!raw) return { available: false, label: "Additional model", provider: "azure" };
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const provider = settings["llmProvider"] === "openai" ? "openai" : "azure";
    if (provider === "openai") {
      const model = String(settings["openaiModel"] ?? "").trim();
      const key = String(settings["openaiApiKey"] ?? "").trim();
      return {
        available: Boolean(key && model),
        label: model ? `OpenAI · ${model}` : "OpenAI custom model",
        provider,
      };
    }
    const deployment = String(settings["azureDeployment"] ?? "").trim();
    const endpoint = String(settings["azureEndpoint"] ?? "").trim();
    const key = String(settings["azureApiKey"] ?? "").trim();
    return {
      available: Boolean(endpoint && key && deployment),
      label: deployment ? `Azure OpenAI · ${deployment}` : "Azure OpenAI custom deployment",
      provider,
    };
  } catch {
    return { available: false, label: "Additional model", provider: "azure" };
  }
}

function readInitialConversationModelChoice(): ConversationModelChoice {
  const customModel = readCustomConversationModel();
  return localStorage.getItem("dev_agent_active_model") === "custom" && customModel.available
    ? "custom"
    : "built_in";
}

function riskColor(level = "low") {
  if (level === "high") return "text-red-400 bg-red-900/30";
  if (level === "medium") return "text-yellow-400 bg-yellow-900/30";
  return "text-green-400 bg-green-900/30";
}

function collectConversationArtifacts(bubbles: Bubble[]): ConversationArtifactPart[] {
  const artifacts = new Map<string, ConversationArtifactPart>();
  for (const bubble of bubbles) {
    if (bubble.kind !== "assistant") continue;
    for (const part of conversationPartsFromAssistantBubble(bubble)) {
      if (part.type === "artifact") artifacts.set(part.artifactId, part);
    }
  }
  return [...artifacts.values()];
}

function workflowActionArtifactsFromResult(artifacts: ChatArtifact[] | undefined): ConversationArtifactPart[] {
  return (artifacts ?? []).map((artifact) => ({
    type: "artifact",
    artifactId: artifact.artifactId,
    title: artifact.title,
    artifactType: artifact.artifactType,
    status: artifact.status,
    content: artifact.content,
  }));
}

function prInsightArtifactTitle(source: SavedPrInsightSource): string {
  return `PR #${source.pullRequestId} ${source.kind.replace(/_/g, " ")} insight`;
}

function prInsightArtifactSignalDetails(record: PrInsightArtifactRecord): string[] {
  const signals = record.signals;
  if (!signals) return [];
  const details: string[] = [];
  if (signals.buildBlockers?.length) {
    details.push(
      "### Build blockers",
      "",
      ...signals.buildBlockers.slice(0, 10).map((build) => {
        const id = build.id ? `#${build.id}` : "build";
        const buildNumber = build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
        const definition = build.definitionName ? ` ${build.definitionName}` : "";
        const result = build.result || build.status || "unknown";
        return `- ${id}${buildNumber}${definition}: ${result}${build.url ? ` (${build.url})` : ""}`;
      }),
      "",
    );
  }
  if (signals.policyBlockers?.length) {
    details.push(
      "### Policy blockers",
      "",
      ...signals.policyBlockers.slice(0, 10).map((policy) =>
        `- ${policy.name || policy.typeName || policy.id || "policy"}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`
      ),
      "",
    );
  }
  if (signals.activeThreads?.length) {
    details.push(
      "### Active threads",
      "",
      ...signals.activeThreads.slice(0, 10).map((thread) =>
        `- #${thread.id}${thread.author ? ` ${thread.author}` : ""}: ${thread.firstComment || "active discussion"}`
      ),
      "",
    );
  }
  if (signals.linkedWorkItems?.length) {
    details.push(
      "### Linked work items",
      "",
      ...signals.linkedWorkItems.slice(0, 10).map((workItem) =>
        `- #${workItem.id} ${workItem.type}${workItem.state ? ` [${workItem.state}]` : ""}: ${workItem.title || "untitled"}${workItem.url ? ` (${workItem.url})` : ""}`
      ),
      "",
    );
  }
  return details;
}

export function prInsightArtifactRecordToMarkdown(record: PrInsightArtifactRecord): string {
  const lines = [
    `## ${record.title || `PR #${record.pullRequestId} insight`}`,
    "",
    record.summary || "No summary saved.",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Repository | ${record.repository} |`,
    `| Pull request | #${record.pullRequestId} |`,
    `| Kind | ${record.kind.replace(/_/g, " ")} |`,
    `| Saved | ${record.at} |`,
    `| Readiness | ${record.readiness ?? "unknown"} |`,
    `| Decision queue | ${record.decisionQueue ?? "unknown"} |`,
    `| Risk | ${record.decisionRiskLevel ?? "unknown"} |`,
    `| Confidence | ${record.contextConfidence || "unknown"} |`,
  ];

  if (record.signals) {
    lines.push(
      "",
      "### Signals",
      "",
      `- Files: ${record.signals.fileCount}`,
      `- Threads: ${record.signals.threadCount}`,
      `- Failed builds: ${record.signals.failedBuildCount}`,
      `- Failed policies: ${record.signals.failedPolicyCount ?? 0}`,
      `- Work items: ${record.signals.workItemCount}`,
    );
    lines.push("", ...prInsightArtifactSignalDetails(record).filter((line, index, arr) => !(line === "" && arr[index - 1] === "")));
  }

  if (record.risks.length > 0) {
    lines.push("", "### Risks", "", ...record.risks.map((risk) => `- ${risk}`));
  }

  lines.push("", `Tokens: ${record.tokensIn}/${record.tokensOut}`);
  return lines.join("\n");
}

// ─── Tool output parsers ──────────────────────────────────────────────────────

interface GitStatusData {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

interface DiffStats {
  files: number;
  added: number;
  removed: number;
}

function parseGitStatus(stdout: string): GitStatusData {
  const lines = stdout.split("\n");
  const result: GitStatusData = { branch: "", ahead: 0, behind: 0, staged: [], modified: [], untracked: [], deleted: [] };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      const m = line.match(/^## ([^\s.]+)/);
      if (m?.[1]) result.branch = m[1];
      const ahead = line.match(/\[ahead (\d+)/);
      const behind = line.match(/behind (\d+)/);
      if (ahead?.[1]) result.ahead = parseInt(ahead[1], 10);
      if (behind?.[1]) result.behind = parseInt(behind[1], 10);
    } else if (line.startsWith("??")) {
      result.untracked.push(line.slice(3).trim());
    } else if (line[0] === "D" || line[1] === "D") {
      result.deleted.push(line.slice(3).trim());
    } else if (line[0] === "A" || line[0] === "M" || line[0] === "R") {
      result.staged.push(line.slice(3).trim());
    } else if (line[1] === "M") {
      result.modified.push(line.slice(3).trim());
    }
  }
  return result;
}

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

function parseGitLog(stdout: string): GitCommit[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(" ");
      return {
        hash: parts[0] ?? "",
        author: parts[1] ?? "",
        date: parts[2] ?? "",
        message: parts.slice(3).join(" "),
      };
    });
}

interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

function parseGitDiff(stdout: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("diff --git")) {
      if (current) files.push(current);
      const m = line.match(/b\/(.+)$/);
      current = { path: m?.[1] ?? line, added: 0, removed: 0 };
    } else if (line.startsWith("+") && !line.startsWith("+++") && current) {
      current.added++;
    } else if (line.startsWith("-") && !line.startsWith("---") && current) {
      current.removed++;
    }
  }
  if (current) files.push(current);
  return files;
}

// ─── Collapsed card one-line summary ─────────────────────────────────────────

function toolCollapsedSummary(toolName?: string, toolOk?: boolean, toolResult?: unknown): string {
  if (toolOk === false) return "error";
  if (!toolResult || typeof toolResult !== "object") return "";
  const r = toolResult as Record<string, unknown>;
  const stdout = String(r["stdout"] ?? "").trim();

  if (toolName === "git_status") {
    const data = parseGitStatus(stdout);
    const parts: string[] = [];
    if (data.staged.length > 0) parts.push(`${data.staged.length} staged`);
    if (data.modified.length > 0) parts.push(`${data.modified.length} modified`);
    if (data.deleted.length > 0) parts.push(`${data.deleted.length} deleted`);
    if (data.untracked.length > 0) parts.push(`${data.untracked.length} untracked`);
    return parts.length > 0 ? parts.join(", ") : "clean";
  }
  if (toolName === "git_log") {
    const commits = parseGitLog(stdout);
    return `${commits.length} commit${commits.length !== 1 ? "s" : ""}`;
  }
  if (toolName === "git_diff") {
    const files = parseGitDiff(stdout);
    if (files.length === 0) return "no changes";
    const added = files.reduce((s, f) => s + f.added, 0);
    const removed = files.reduce((s, f) => s + f.removed, 0);
    return `${files.length} file${files.length !== 1 ? "s" : ""} · +${added} -${removed}`;
  }
  if (toolName === "git_current_branch") {
    return String((r as Record<string, unknown>)["branch"] ?? stdout.split("\n")[0]).trim().slice(0, 50);
  }
  if (toolName === "git_branch_list") {
    const count = stdout.split("\n").filter(Boolean).length;
    const current = stdout.split("\n").find((l) => l.startsWith("*"))?.replace("*", "").trim() ?? "";
    return current ? `${current} · ${count} branch${count !== 1 ? "es" : ""}` : `${count} branches`;
  }
  if (toolName === "git_remote") {
    const remotes = [...new Set(stdout.split("\n").filter(Boolean).map((l) => l.split(/\s+/)[0]))];
    return remotes.join(", ") || "no remotes";
  }
  if (toolName === "git_add") return "staged";
  if (toolName === "git_commit") {
    const m = stdout.match(/\[([^\]]+)\]/);
    return m ? m[0] : "committed";
  }
  if (toolName === "git_push") {
    return stdout.split("\n").find((l) => l.includes("->"))?.trim() ?? "pushed";
  }
  if (toolName === "git_stash") return stdout.split("\n")[0]?.slice(0, 50) ?? "stashed";
  if (toolName === "ado_create_pr") {
    const prResult = r as Record<string, unknown>;
    return prResult["pull_request_id"] ? `PR #${prResult["pull_request_id"]} created` : "PR created";
  }
  // generic: first non-empty line
  return stdout.split("\n").find(Boolean)?.slice(0, 60) ?? "";
}

// ─── Tool-specific renderers ─────────────────────────────────────────────────

function GitStatusRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const data = parseGitStatus(stdout);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-blue-300 font-mono">{data.branch || "unknown"}</span>
        {data.ahead > 0 && <span className="text-green-400">&uarr;{data.ahead}</span>}
        {data.behind > 0 && <span className="text-yellow-400">&darr;{data.behind}</span>}
      </div>
      {data.staged.length > 0 && (
        <FileList label="Staged" files={data.staged} color="text-green-400" prefix="+" />
      )}
      {data.modified.length > 0 && (
        <FileList label="Modified" files={data.modified} color="text-yellow-400" prefix="~" />
      )}
      {data.deleted.length > 0 && (
        <FileList label="Deleted" files={data.deleted} color="text-red-400" prefix="-" />
      )}
      {data.untracked.length > 0 && (
        <FileList label="Untracked" files={data.untracked} color="text-zinc-500" prefix="?" />
      )}
      {data.staged.length === 0 && data.modified.length === 0 && data.deleted.length === 0 && data.untracked.length === 0 && (
        <p className="text-zinc-500">Working tree clean</p>
      )}
    </div>
  );
}

function FileList({ label, files, color, prefix }: { label: string; files: string[]; color: string; prefix: string }) {
  const [expanded, setExpanded] = useState(files.length <= 3);
  const shown = expanded ? files : files.slice(0, 3);
  return (
    <div>
      <span className={`font-semibold ${color}`}>{label} ({files.length})</span>
      <ul className="ml-2 mt-0.5 space-y-0.5">
        {shown.map((f) => (
          <li key={f} className={`font-mono ${color} opacity-80`}>{prefix} {f}</li>
        ))}
      </ul>
      {files.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="ml-2 text-zinc-600 hover:text-zinc-400">
          {expanded ? "show less" : `+${files.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function GitLogRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const commits = parseGitLog(stdout);
  if (commits.length === 0) return <p className="text-xs text-zinc-500">No commits found.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {commits.map((c) => (
        <li key={c.hash} className="flex items-start gap-2">
          <span className="shrink-0 font-mono text-blue-400">{c.hash}</span>
          <span className="shrink-0 text-zinc-600">{c.date}</span>
          <span className="shrink-0 text-zinc-500">{c.author}</span>
          <span className="text-zinc-300">{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

function GitDiffRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const files = parseGitDiff(stdout);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (files.length === 0) return <p className="text-xs text-zinc-500">No changes found.</p>;
  return (
    <div className="space-y-1 text-xs">
      {files.map((f) => (
        <div key={f.path} className="rounded border border-zinc-700/40 overflow-hidden">
          <button
            onClick={() => setExpanded((prev) => prev === f.path ? null : f.path)}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-zinc-700/20"
          >
            <span className="font-mono text-zinc-300 flex-1 truncate">{f.path}</span>
            <span className="text-green-400">+{f.added}</span>
            <span className="text-red-400">-{f.removed}</span>
            <span className="text-zinc-600">{expanded === f.path ? "▲" : "▼"}</span>
          </button>
          {expanded === f.path && (
            <div className="border-t border-zinc-700/40 max-h-40 overflow-y-auto">
              <pre className="px-2 py-1 font-mono text-[10px] text-zinc-400 whitespace-pre-wrap break-all">
                {stdout
                  .split("diff --git")
                  .find((chunk) => chunk.includes(f.path))
                  ?.split("\n")
                  .map((line, i) => (
                    <span
                      key={i}
                      className={
                        line.startsWith("+") && !line.startsWith("+++")
                          ? "text-green-400"
                          : line.startsWith("-") && !line.startsWith("---")
                            ? "text-red-400"
                            : "text-zinc-500"
                      }
                    >
                      {line}{"\n"}
                    </span>
                  ))}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GenericToolRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "").trim();
  const returncode = result["returncode"];
  if (!stdout) return <p className="text-xs text-zinc-500">No output.</p>;
  const ok = returncode === 0 || returncode === undefined;
  return (
    <pre className={`whitespace-pre-wrap break-all text-xs font-mono ${ok ? "text-zinc-300" : "text-red-300"} max-h-40 overflow-y-auto`}>
      {stdout}
    </pre>
  );
}

function ToolOutputRenderer({ toolName, toolResult }: { toolName?: string; toolResult?: unknown }) {
  if (!toolResult || typeof toolResult !== "object") return null;
  const result = toolResult as Record<string, unknown>;
  const returncode = result["returncode"];
  const stderr = String(result["stderr"] ?? "").trim();

  // Show error from stderr regardless of tool type
  if ((returncode !== 0 && returncode !== undefined) && stderr) {
    return (
      <div className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{stderr}</div>
    );
  }

  if (toolName === "git_status") return <GitStatusRenderer result={result} />;
  if (toolName === "git_log") return <GitLogRenderer result={result} />;
  if (toolName === "git_diff") return <GitDiffRenderer result={result} />;
  return <GenericToolRenderer result={result} />;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** Groups consecutive tool bubbles into a compact execution log. */
function ExecutionLog({
  tools,
  approval,
  onToggleTool,
  onConfirmApproval,
  onCancelApproval,
}: {
  tools: Bubble[];
  approval?: Bubble;
  onToggleTool: (id: string) => void;
  onConfirmApproval?: (id: string) => void;
  onCancelApproval?: (id: string) => void;
}) {
  const approvalTool = approval?.kind === "pending_confirm" ? approval.pendingTool : undefined;
  const approvalTargetId = approvalTool
    ? (tools.find((tool) => toolNameFromBubble(tool) === approvalTool)?.id ?? tools.at(-1)?.id)
    : undefined;

  const items: ExecutionTimelineItem[] = tools.map((tool) => {
    const part = primaryToolCallPart(tool.parts);
    const output = part?.output ?? tool.toolResult;
    const toolName = toolNameFromBubble(tool);
    const state = part?.state ?? toolPartStateFromResult(tool.toolOk);
    const pending = part ? isToolPartRunning(part) : tool.toolOk === undefined;
    const summary = pending
      ? undefined
      : part?.summary ?? tool.toolSummary ?? toolCollapsedSummary(toolName, tool.toolOk, output);

    return {
      id: tool.id,
      toolName,
      state,
      ok: tool.toolOk,
      input: part?.input ?? tool.toolArgs,
      output,
      summary,
      open: tool.toolOpen,
      liveOutput: toolLiveOutputFromPart(part) || tool.toolLiveOutput,
      approval: approval?.kind === "pending_confirm" && tool.id === approvalTargetId
        ? {
            id: approval.id,
            toolName: approval.pendingTool,
            description: approval.pendingDescription,
            riskLevel: approval.riskLevel,
          }
        : undefined,
    };
  });

  return (
    <ExecutionTimeline
      items={items}
      onToggleItem={onToggleTool}
      renderOutput={(item) => <ToolOutputRenderer toolName={item.toolName} toolResult={item.output} />}
      renderApproval={(item) => {
        if (!approval || item.approval?.id !== approval.id) return null;
        return (
          <PendingActionCard
            bubble={approval}
            onConfirm={() => onConfirmApproval?.(approval.id)}
            onCancel={() => onCancelApproval?.(approval.id)}
          />
        );
      }}
    />
  );
}

function toolNameFromBubble(tool: Bubble): string | undefined {
  return primaryToolCallPart(tool.parts)?.toolName ?? tool.toolName;
}

function isToolPartRunning(part: ConversationToolCallPart | null): boolean {
  return part?.state === "input-streaming" || part?.state === "input-available" || part?.state === "running";
}

function toolLiveOutputFromPart(part: ConversationToolCallPart | null): string {
  if (!part?.output || typeof part.output !== "object") return "";
  const output = part.output as Record<string, unknown>;
  return [
    String(output["stdout"] ?? ""),
    String(output["stderr"] ?? ""),
  ].filter(Boolean).join("");
}

function ConfirmCard({
  bubble,
  onConfirm,
  onCancel,
}: {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (bubble.confirmed !== null && bubble.confirmed !== undefined) {
    return (
      <div className="my-2 rounded-xl border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm">
        <span className={bubble.confirmed ? "text-green-400" : "text-zinc-500"}>
          {bubble.confirmed ? "Confirmed — executing..." : "Cancelled."}
        </span>
      </div>
    );
  }
  return (
    <div className="my-2 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskColor(bubble.riskLevel)}`}>
          {(bubble.riskLevel ?? "medium").toUpperCase()} RISK
        </span>
        <span className="text-xs text-zinc-400">Confirm before proceeding</span>
      </div>
      {bubble.plan && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-200">{bubble.plan}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-600 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 active:scale-95"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PendingActionCard({
  bubble,
  onConfirm,
  onCancel,
}: {
  bubble: Bubble;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const status = bubble.pendingStatus ?? "waiting";

  if (status === "executing") {
    return (
      <ApprovalStateCard
        status="executing"
        label="Executing approved action"
        description={bubble.pendingDescription}
      />
    );
  }
  if (status === "done") {
    return (
      <ApprovalStateCard
        status="done"
        label="Approved action finished"
        description={bubble.pendingDescription}
      />
    );
  }
  if (status === "cancelled") {
    return (
      <ApprovalStateCard
        status="cancelled"
        label="Approval skipped"
        description={bubble.pendingDescription}
      />
    );
  }

  const riskLevel = bubble.riskLevel ?? "medium";

  return (
    <section className="my-2 overflow-hidden rounded-lg border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] text-xs shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
          {bubble.pendingTool && (
            <span className="truncate rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">
              {bubble.pendingTool}
            </span>
          )}
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${approvalRiskClass(riskLevel)}`}>
          {riskLevel.toUpperCase()} risk
        </span>
      </div>
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-relaxed text-[rgb(var(--app-text))]">
            {bubble.pendingDescription}
          </p>
          {bubble.pendingNextHint && (
            <p className="mt-1.5 leading-relaxed text-[rgb(var(--app-text-muted))]">
              <span className="font-medium text-[rgb(var(--app-text-subtle))]">Next: </span>
              {bubble.pendingNextHint}
            </p>
          )}
          <ApprovalEvidence
            toolName={bubble.pendingTool}
            args={bubble.pendingArgs}
            nextHint={bubble.pendingNextHint}
            workflow={bubble.pendingWorkflow}
            readiness={bubble.pendingReadiness}
            preflight={bubble.pendingPreflight}
          />
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2.5">
          <div>
            <p className="font-medium text-[rgb(var(--app-text))]">Decision</p>
            <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">
              Approving runs only the scoped action shown here.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app-surface-raised))] active:translate-y-px"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-[rgb(var(--app-border-strong))] px-3 py-2 text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--app-surface-raised))] active:translate-y-px"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApprovalStateCard({
  status,
  label,
  description,
}: {
  status: "executing" | "done" | "cancelled";
  label: string;
  description?: string;
}) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${approvalStatusDotClass(status)}`} />
      <span className="font-medium text-[rgb(var(--app-text-subtle))]">{label}</span>
      {description && <span className="min-w-0 truncate">{description}</span>}
      {status === "executing" ? <ThinkingDots /> : <span className="ml-auto text-[10px] uppercase">{status}</span>}
    </div>
  );
}

function approvalRiskClass(level?: string): string {
  if (level === "high") return "border-red-400/40 bg-red-500/10 text-red-500";
  if (level === "low") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-600";
  return "border-amber-400/40 bg-amber-500/10 text-amber-600";
}

function approvalStatusDotClass(status: "executing" | "done" | "cancelled"): string {
  if (status === "done") return "bg-emerald-500";
  if (status === "cancelled") return "bg-zinc-400";
  return "bg-blue-500";
}

function composerNoticeClass(tone: ComposerStateNotice["tone"]): string {
  if (tone === "approval") {
    return "border-amber-500/30 bg-amber-500/10 text-[rgb(var(--app-warning))]";
  }
  if (tone === "queued") {
    return "border-blue-500/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text-muted))]";
  }
  return "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]";
}

function composerNoticeDotClass(tone: ComposerStateNotice["tone"]): string {
  if (tone === "approval") return "bg-amber-500";
  if (tone === "queued") return "bg-[rgb(var(--app-accent))]";
  return "bg-[rgb(var(--app-text-subtle))]";
}

function MetaPanel({
  meta,
  onOpenPrInsightSource,
  onOpenPrInsightWorkspace,
}: {
  meta: NonNullable<Bubble["meta"]>;
  onOpenPrInsightSource?: (source: { artifactId: string }) => void;
  onOpenPrInsightWorkspace?: (source: SavedPrInsightSource) => void;
}) {
  const suggestions = meta.suggestions?.filter(Boolean) ?? [];
  const insightSources = suggestions
    .map((source) => {
      const match = source.match(/^Used saved PR AI insight artifact (.+) for PR #(\d+) \(([^,]+), (.+)\)\.$/);
      return match
        ? {
            raw: source,
            artifactId: match[1] ?? "",
            pullRequestId: match[2] ?? "",
            kind: match[3] ?? "",
            at: match[4] ?? "",
          }
        : null;
    })
    .filter((source): source is SavedPrInsightSource & { raw: string } => Boolean(source));
  const contextSources = suggestions.filter((source) => source.startsWith("Repository context: "));
  const sourceMessages = new Set(insightSources.map((source) => source.raw));
  const contextMessages = new Set(contextSources);
  const otherSuggestions = suggestions.filter((source) => !sourceMessages.has(source) && !contextMessages.has(source));
  const runtimeSignals = [
    meta.finalizationMode ? `Finalization: ${meta.finalizationMode.replace(/_/g, " ")}` : "",
    meta.riskLevel ? `Risk: ${meta.riskLevel}` : "",
    meta.actionsTaken?.length ? `Actions: ${meta.actionsTaken.join(", ")}` : "",
  ].filter(Boolean);
  if (suggestions.length === 0 && runtimeSignals.length === 0) return null;
  return (
    <div className="mt-1.5 ml-1 space-y-1.5 text-xs text-zinc-500">
      {runtimeSignals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {runtimeSignals.map((signal) => (
            <span key={signal} className="rounded-md border border-zinc-800/60 bg-zinc-900/20 px-2 py-0.5 text-[11px] text-zinc-500">
              {signal}
            </span>
          ))}
        </div>
      )}
      {contextSources.length > 0 && (
        <div className="space-y-1 rounded-md border border-zinc-800/60 bg-zinc-900/20 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Context source</p>
          {contextSources.map((source) => (
            <p key={source} className="leading-relaxed text-zinc-500">
              {source.replace(/^Repository context:\s*/, "")}
            </p>
          ))}
        </div>
      )}
      {insightSources.length > 0 && (
        <div className="space-y-1 rounded-md border border-blue-950/60 bg-blue-950/10 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400/70">Saved PR insight source</p>
          {insightSources.map((source) => (
            <div key={source.raw} className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 break-words leading-relaxed text-zinc-500">
                PR #{source.pullRequestId} · {source.kind.replace(/_/g, " ")} · {source.at}
                <span className="block font-mono text-[11px] text-zinc-600">{source.artifactId}</span>
              </p>
              {onOpenPrInsightSource && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {onOpenPrInsightWorkspace && (
                    <button
                      type="button"
                      onClick={() => onOpenPrInsightWorkspace(source)}
                      className="rounded-md border border-blue-900/60 px-2 py-1 text-[11px] text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
                    >
                      Open workspace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenPrInsightSource({ artifactId: source.artifactId })}
                    className="rounded-md border border-blue-900/60 px-2 py-1 text-[11px] text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
                  >
                    Open Activity
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {otherSuggestions.length > 0 && (
        <ul className="space-y-0.5">
          {otherSuggestions.map((s, i) => (
            <li key={i} className="flex gap-1"><span className="text-zinc-600">›</span>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Workspace & Task Panel ───────────────────────────────────────────────────

export interface WorkflowStep {
  label: string;
  done: boolean;
  active: boolean;
  action?: WorkspaceAction;
}

export interface TaskState {
  goal: string;
  steps: WorkflowStep[];
  currentStepLabel: string;
  details?: string[];
  risk?: string;
}

type WorkflowStatus = "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";

export type WorkflowStepActionState = "idle" | "running" | "waiting" | "done" | "blocked";

export interface WorkflowStepActionStateContext {
  busy?: boolean;
  workflowStatus?: WorkflowStatus | string;
}

export function workflowStepActionState(
  step: WorkflowStep,
  context: WorkflowStepActionStateContext,
): WorkflowStepActionState {
  if (context.workflowStatus === "blocked") return "blocked";
  const workflowBusy = Boolean(
    context.busy
      || context.workflowStatus === "planning"
      || context.workflowStatus === "running",
  );
  if (workflowBusy && step.active) return "running";
  if (workflowBusy) return "waiting";
  if (step.done) return "done";
  return "idle";
}

interface ApprovalRequest {
  id: string;
  action: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    nextHint?: string;
    readiness?: {
      kind: "push";
      status: "no_upstream" | "up_to_date" | "ahead" | "behind" | "diverged" | "unknown";
      upstream?: string;
      ahead?: number;
      behind?: number;
      summary: string;
    };
    preflight?:
      | {
          kind: "branch";
          action: "checkout" | "create";
          status: "current" | "local_exists" | "remote_only" | "missing" | "would_create" | "already_exists" | "invalid" | "unknown";
          branch: string;
          currentBranch?: string;
          localBranch?: string;
          remoteBranch?: string;
          summary: string;
        }
      | {
          kind: "pr";
          status: "ready" | "missing_ado_mapping" | "missing_source_branch" | "dirty_worktree" | "unknown";
          sourceBranch?: string;
          targetBranch?: string;
          repository?: string;
          project?: string;
          organization?: string;
          title?: string;
          summary: string;
        }
      | {
          kind: "validation";
          status: "ready" | "default_command" | "missing_command" | "unknown";
          validationKind: "test" | "build";
          command: string;
          commandSource: "override" | "profile" | "derived" | "default" | "artifact";
          changedFiles?: string[];
          changedFileCount?: number;
          selectedScript?: string;
          packageFilters?: string[];
          packageRoots?: string[];
          selectionReason?: string;
          summary: string;
        };
    workflow?: {
      kind: "commit" | "pr" | "git" | "ci";
      phase:
        | "stage"
        | "commit"
        | "push"
          | "test"
          | "build"
          | "pipeline_trigger"
          | "create"
        | "link_work_item"
        | "stage_conflicts"
        | "continue_rebase"
        | "abort_rebase"
        | "skip_rebase"
        | "continue_merge"
        | "abort_merge"
        | "continue_cherry_pick"
        | "abort_cherry_pick"
        | "skip_cherry_pick"
        | "continue_revert"
        | "abort_revert"
        | "skip_revert";
      branch?: string;
      message?: string;
      pushAfterCommit?: boolean;
    };
  };
  riskLevel: string;
  explanation: string;
}

export interface WorkflowEventState {
  status: WorkflowStatus;
  currentStep: string;
  completedTools: string[];
  workflowKind?: "commit" | "git" | "ado" | "ci" | "pr";
  workflowPhase?: string;
  workflowSummary?: string;
  authStatus?: "ok" | "oauth_unavailable" | "oauth_no_org_access" | "pat_invalid_or_missing_scope" | "unknown_error";
  authMode?: "oauth" | "pat";
  authMessage?: string;
  retryable?: boolean;
  pendingApproval?: ApprovalRequest;
}

type WorkspaceAction =
  | { type: "inspect_environment" }
  | { type: "inspect_changes" }
  | { type: "refresh_branch" }
  | { type: "checkout_branch"; branch: string }
  | { type: "create_branch"; branch: string }
  | { type: "continue_rebase" }
  | { type: "abort_rebase" }
  | { type: "skip_rebase" }
  | { type: "continue_merge" }
  | { type: "abort_merge" }
  | { type: "continue_cherry_pick" }
  | { type: "abort_cherry_pick" }
  | { type: "skip_cherry_pick" }
  | { type: "continue_revert" }
  | { type: "abort_revert" }
  | { type: "skip_revert" }
  | { type: "create_pr"; branch?: string; targetBranch?: string; title?: string; description?: string; draft?: boolean }
  | { type: "inspect_pr_insight"; pullRequestId?: number }
  | { type: "check_pr_policy"; pullRequestId?: number }
  | { type: "list_pr_work_items"; pullRequestId?: number }
  | { type: "link_work_item"; pullRequestId?: number; workItemId: number }
  | { type: "inspect_pipeline"; pipelineId?: number }
  | { type: "trigger_pipeline"; pipelineId?: number; branch?: string }
  | { type: "prepare_commit"; branch?: string; message?: string; includeUnstaged: boolean }
  | { type: "commit_and_push"; branch?: string; message?: string; includeUnstaged: boolean }
  | { type: "push_branch"; branch?: string }
  | { type: "run_tests" }
  | { type: "run_build" };

interface WorkspacePanelProps {
  repoPath: string;
  setRepoPath: (v: string) => void;
  currentBranch: string | null;
  branchList: string[];
  gitStatus: GitStatusData | null;
  diffStats: DiffStats | null;
  taskState: TaskState | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  profiles: WorkspaceProfile[];
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  statusText: string | null;
  selectedArtifact: ConversationArtifactPart | null;
  selectedArtifactLookupState: ArtifactLookupState | null;
  artifactCount: number;
  onClearArtifact: () => void;
  onAction: (action: WorkspaceAction) => void;
}

const EMPTY_PROJECT_LINK: WorkspaceProfileInput = {
  name: "",
  repoPath: "",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoProject: "",
  adoRepoName: "",
  adoPat: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  templateProfile: "",
  buildCommand: "",
  testCommand: "",
};

function ProjectLinkSetupCard({
  repoPath,
  onCreated,
  createProjectLink,
}: {
  repoPath: string;
  onCreated: (profile: WorkspaceProfile) => void;
  createProjectLink: (data: WorkspaceProfileInput) => Promise<WorkspaceProfile>;
}) {
  const [form, setForm] = useState<WorkspaceProfileInput>(() => ({
    ...EMPTY_PROJECT_LINK,
    name: projectLinkNameFromRepo(repoPath),
    repoPath,
  }));
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState(false);
  const branchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [patStatus, setPatStatus] = useState<PatStatus>("none");
  const [verifyingPat, setVerifyingPat] = useState(false);
  const [discovering, setDiscovering] = useState<AdoDiscoveryKind | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [pipelineHint, setPipelineHint] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>({
    projects: [],
    repositories: [],
    pipelines: [],
  });
  const discoveryAutoRef = useRef<Partial<Record<AdoDiscoveryKind, string>>>({});
  const [mcpChecking, setMcpChecking] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      repoPath: current.repoPath || repoPath,
      name: current.name === "Project link" && repoPath ? projectLinkNameFromRepo(repoPath) : current.name,
    }));
  }, [repoPath]);

  const set = <K extends keyof WorkspaceProfileInput>(key: K) => (value: WorkspaceProfileInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const loadBranches = useCallback(async (path: string) => {
    if (!path.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    const trimmedPath = path.trim();
    const [detected, remote] = await Promise.all([
      fetchGitBranches(trimmedPath),
      fetchAzureDevOpsRemoteSuggestion(trimmedPath),
    ]);
    setBranches(detected);
    setBranchLoading(false);
    setBranchError(detected.length === 0);
    if (detected.length > 0) {
      setForm((current) => {
        const preferred =
          detected.includes(current.defaultBranch)
            ? current.defaultBranch
            : detected.includes("main")
              ? "main"
              : detected.includes("master")
                ? "master"
                : detected[0] ?? current.defaultBranch;
        const target =
          detected.includes(current.targetBranch)
            ? current.targetBranch
            : preferred;
        return { ...current, defaultBranch: preferred, targetBranch: target };
      });
    }
    if (remote) {
      setForm((current) => ({
        ...current,
        adoOrgUrl: current.adoOrgUrl || remote.adoOrgUrl,
        adoProject: current.adoProject || remote.adoProject,
        adoRepoName: current.adoRepoName || remote.adoRepoName,
      }));
    }
  }, []);

  useEffect(() => {
    if (branchDebounceRef.current) clearTimeout(branchDebounceRef.current);
    if (!form.repoPath.trim()) {
      setBranches([]);
      setBranchLoading(false);
      setBranchError(false);
      return;
    }
    setBranchLoading(true);
    setBranchError(false);
    branchDebounceRef.current = setTimeout(() => {
      void loadBranches(form.repoPath);
    }, 700);
    return () => {
      if (branchDebounceRef.current) clearTimeout(branchDebounceRef.current);
    };
  }, [form.repoPath, loadBranches]);

  useEffect(() => {
    if (patStatus === "verified" || patStatus === "invalid") setPatStatus("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adoPat]);

  const canSave = form.name.trim().length > 0 && form.repoPath.trim().length > 0;

  async function handleVerifyPat() {
    setVerifyingPat(true);
    setPatStatus(await verifyPat(form.adoOrgUrl, form.adoPat) ? "verified" : "invalid");
    setVerifyingPat(false);
  }

  function handleRequestPat() {
    const org = form.adoOrgUrl.replace(/\/$/, "");
    window.open(org ? `${org}/_usersSettings/tokens` : "https://dev.azure.com", "_blank");
    if (patStatus === "none") setPatStatus("pending");
  }

  function applyDiscovery(kind: AdoDiscoveryKind, option: AdoDiscoveryOption) {
    setDiscoveryError(null);
    if (kind === "projects") {
      setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
      setPipelineHint(null);
      setForm((current) => ({
        ...current,
        adoProject: option.name,
        adoRepoName: current.adoProject === option.name ? current.adoRepoName : "",
        adoPipelineId: current.adoProject === option.name ? current.adoPipelineId : "",
        adoPipelineName: current.adoProject === option.name ? current.adoPipelineName : "",
      }));
    } else if (kind === "repositories") {
      setDiscovered((current) => ({ ...current, pipelines: [] }));
      setPipelineHint(null);
      setForm((current) => ({
        ...current,
        adoRepoName: option.name,
        adoPipelineId: current.adoRepoName === option.name ? current.adoPipelineId : "",
        adoPipelineName: current.adoRepoName === option.name ? current.adoPipelineName : "",
      }));
    } else {
      setForm((current) => ({ ...current, adoPipelineId: option.id, adoPipelineName: option.name }));
    }
  }

  async function runDiscovery(kind: AdoDiscoveryKind, mode: "manual" | "auto" = "manual") {
    const signature = JSON.stringify({
      kind,
      org: form.adoOrgUrl.trim(),
      project: form.adoProject.trim(),
      repo: form.adoRepoName.trim(),
      pat: form.adoPat ? "pat" : "",
    });
    if (mode === "auto" && discoveryAutoRef.current[kind] === signature) return;
    if (mode === "auto") discoveryAutoRef.current[kind] = signature;
    setDiscovering(kind);
    setDiscoveryError(null);
    try {
      const result = await discoverAdoProjectLinkOptions(kind, {
        ...form,
      });
      setDiscovered((current) => ({ ...current, [kind]: result.items }));
      if (result.items.length === 1) applyDiscovery(kind, result.items[0]!);
      if (kind === "pipelines" && result.items.length > 1 && !form.adoPipelineId) {
        const recommended = pickRecommendedPipeline(result.items, form);
        if (recommended) {
          applyDiscovery(kind, recommended);
          setPipelineHint(`Recommended pipeline selected: ${recommended.name}`);
        }
      }
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(null);
    }
  }

  async function handleDiscover(kind: AdoDiscoveryKind) {
    await runDiscovery(kind, "manual");
  }

  useEffect(() => {
    if (!advanced || !form.adoOrgUrl.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("projects", "auto");
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanced, form.adoOrgUrl, form.adoPat]);

  useEffect(() => {
    if (!advanced || !form.adoOrgUrl.trim() || !form.adoProject.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("repositories", "auto");
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanced, form.adoOrgUrl, form.adoProject, form.adoPat]);

  async function handleCheckMcp() {
    setMcpChecking(true);
    setMcpStatus(null);
    try {
      const result = await checkAdoProjectLinkTools({
        ...form,
      });
      const authLabel = result.authMode === "pat" ? "PAT fallback" : "OAuth";
      setMcpStatus(result.ok
        ? `ADO tools ready via ${authLabel} · ${result.toolCount} internal tools`
        : `${authLabel} issue · ${result.authMessage ?? result.authStatus ?? "ADO tools unavailable"}`);
    } catch (err) {
      setMcpStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setMcpChecking(false);
    }
  }

  function BranchSelect({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) {
    if (branchLoading) {
      return (
        <div className="grid min-w-0 gap-1">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
          <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text-muted))]">
            <svg className="h-3 w-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
            </svg>
            Detecting branches...
          </div>
        </div>
      );
    }
    if (branches.length > 0) {
      return (
        <label className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-emerald-700/60 bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none transition focus:border-emerald-500"
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
            {!branches.includes(value) && value && <option value={value}>{value} (custom)</option>}
          </select>
        </label>
      );
    }
    return (
      <label className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
          placeholder="main"
        />
      </label>
    );
  }

  const repoInputClass = `rounded-lg border px-3 py-2 font-mono text-sm text-[rgb(var(--app-text))] outline-none transition ${
    !branchLoading && branches.length > 0
      ? "border-emerald-700/60 bg-[rgb(var(--app-surface-raised))] focus:border-emerald-500"
      : branchError && form.repoPath
        ? "border-amber-700/60 bg-[rgb(var(--app-surface-raised))] focus:border-amber-600"
        : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] focus:border-zinc-500"
  }`;
  const hasOptionalFallbacks = Boolean(form.adoPipelineName || form.adoPipelineId || form.adoPat || form.adoMcpEnabled);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createProjectLink({
        ...form,
        name: form.name.trim(),
        repoPath: form.repoPath.trim(),
        defaultBranch: form.defaultBranch.trim() || "main",
        targetBranch: form.targetBranch.trim() || form.defaultBranch.trim() || "main",
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5 text-left shadow-xl">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--app-surface-raised))]">
          <svg className="h-5 w-5 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 7h7a5 5 0 010 10H6m10-5h5M3 12h8" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">Create a Project Link</p>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">Link name</span>
          <input
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
            placeholder="web-app production"
          />
        </label>
        <label className="grid gap-1">
          <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-[rgb(var(--app-text-muted))]">
            <span>Local repository path</span>
            {form.repoPath && (
              <button
                type="button"
                onClick={() => void loadBranches(form.repoPath)}
                disabled={branchLoading}
                className="text-[10px] text-[rgb(var(--app-text-subtle))] transition hover:text-[rgb(var(--app-text-muted))] disabled:opacity-40"
              >
                {branchLoading ? "Loading..." : branchError ? "Retry branch detection" : branches.length > 0 ? `${branches.length} branches found` : "Detect branches"}
              </button>
            )}
          </span>
          <input
            value={form.repoPath}
            onChange={(e) => set("repoPath")(e.target.value)}
            className={repoInputClass}
            placeholder="C:\projects\my-app"
          />
          {branchError && form.repoPath && (
            <span className="text-[10px] text-amber-500/80">Could not read branches. Check this is a valid git repository.</span>
          )}
        </label>
        <div className="grid min-w-0 grid-cols-1 gap-3">
          <BranchSelect label="Default branch" value={form.defaultBranch} onChange={set("defaultBranch")} />
          <BranchSelect label="PR target branch" value={form.targetBranch} onChange={set("targetBranch")} />
        </div>

        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[rgb(var(--app-border))] px-3 py-2 text-left text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]"
        >
          <span className="flex items-center gap-2">
            <svg className={`h-3.5 w-3.5 transition ${advanced ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">Azure DevOps</span>
          </span>
          {form.adoProject && form.adoRepoName && (
            <span className="shrink-0 rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-subtle))]">configured</span>
          )}
        </button>

        {advanced && (
          <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
            <input className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoOrgUrl} onChange={(e) => { setDiscoveryError(null); set("adoOrgUrl")(e.target.value); }} placeholder="https://dev.azure.com/org" />
            <div className="grid min-w-0 grid-cols-1 gap-2">
              {discovered.projects.length > 0 ? (
                <select
                  className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                  value={discovered.projects.some((option) => option.name === form.adoProject) ? form.adoProject : ""}
                  onChange={(e) => {
                    const selected = discovered.projects.find((option) => option.name === e.target.value);
                    if (selected) applyDiscovery("projects", selected);
                  }}
                >
                  <option value="">{discovering === "projects" ? "Discovering projects..." : "Select project"}</option>
                  {discovered.projects.map((option) => (
                    <option key={option.id} value={option.name}>{option.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                  value={form.adoProject}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDiscoveryError(null);
                    setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
                    setPipelineHint(null);
                    setForm((current) => ({
                      ...current,
                      adoProject: value,
                      adoRepoName: current.adoProject === value ? current.adoRepoName : "",
                      adoPipelineId: current.adoProject === value ? current.adoPipelineId : "",
                      adoPipelineName: current.adoProject === value ? current.adoPipelineName : "",
                    }));
                  }}
                  placeholder={discovering === "projects" ? "Discovering projects..." : "ADO project"}
                />
              )}
              {discovered.repositories.length > 0 ? (
                <select
                  className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                  value={discovered.repositories.some((option) => option.name === form.adoRepoName) ? form.adoRepoName : ""}
                  onChange={(e) => {
                    const selected = discovered.repositories.find((option) => option.name === e.target.value);
                    if (selected) applyDiscovery("repositories", selected);
                  }}
                >
                  <option value="">{discovering === "repositories" ? "Discovering repositories..." : "Select repository"}</option>
                  {discovered.repositories.map((option) => (
                    <option key={option.id} value={option.name}>{option.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                  value={form.adoRepoName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDiscoveryError(null);
                    setDiscovered((current) => ({ ...current, pipelines: [] }));
                    setPipelineHint(null);
                    setForm((current) => ({
                      ...current,
                      adoRepoName: value,
                      adoPipelineId: current.adoRepoName === value ? current.adoPipelineId : "",
                      adoPipelineName: current.adoRepoName === value ? current.adoPipelineName : "",
                    }));
                  }}
                  placeholder={discovering === "repositories" ? "Discovering repositories..." : "ADO repo"}
                />
              )}
            </div>
            {discoveryError && (
              <p className="rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-300">
                {discoveryError}
              </p>
            )}

            <details className="group rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]">
                <span className="flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium">Optional fallbacks</span>
                </span>
                {hasOptionalFallbacks && (
                  <span className="shrink-0 rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-subtle))]">configured</span>
                )}
              </summary>
              <div className="grid gap-3 border-t border-[rgb(var(--app-border))] p-3">
                <div className="grid gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">Pipeline matching</span>
                    <button
                      type="button"
                      onClick={() => void handleDiscover("pipelines")}
                      disabled={!form.adoOrgUrl || !form.adoProject || !form.adoRepoName || discovering !== null}
                      className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-zinc-500 hover:text-[rgb(var(--app-text))] disabled:opacity-40"
                    >
                      {discovering === "pipelines" ? "Discovering..." : "Refresh pipelines"}
                    </button>
                  </div>
                  {(["pipelines"] as AdoDiscoveryKind[]).map((kind) => (
                    discovered[kind].length > 0 && (
                      <label key={kind} className="grid gap-1">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">{kind}</span>
                        <select
                          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                          defaultValue=""
                          onChange={(event) => {
                            const selected = discovered[kind].find((option) => option.id === event.target.value);
                            if (selected) applyDiscovery(kind, selected);
                          }}
                        >
                          <option value="">Select {kind.slice(0, -1)}</option>
                          {discovered[kind].map((option) => (
                            <option key={`${kind}-${option.id}`} value={option.id}>
                              {option.name}{option.description ? ` - ${option.description}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  ))}
                  {pipelineHint && (
                    <p className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2.5 py-1.5 text-[11px] text-emerald-300">
                      {pipelineHint}
                    </p>
                  )}
                  <div className="grid min-w-0 grid-cols-1 gap-2">
                    <input className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoPipelineId} onChange={(e) => set("adoPipelineId")(e.target.value)} placeholder="Pipeline ID" />
                    <input className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoPipelineName} onChange={(e) => set("adoPipelineName")(e.target.value)} placeholder="Pipeline name" />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">PAT fallback</span>
                    <div className="flex items-center gap-2">
                      {patStatus === "pending" && <span className="rounded-full border border-amber-800/40 bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">Pending</span>}
                      {patStatus === "verified" && <span className="rounded-full border border-emerald-800/40 bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Verified</span>}
                      {patStatus === "invalid" && <span className="rounded-full border border-red-800/40 bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-400">Invalid</span>}
                      <button type="button" onClick={handleRequestPat} className="text-[10px] text-[rgb(var(--app-text-muted))] underline underline-offset-2 transition hover:text-[rgb(var(--app-text))]">
                        Request PAT
                      </button>
                      {form.adoPat && form.adoOrgUrl && (
                        <button
                          type="button"
                          onClick={() => void handleVerifyPat()}
                          disabled={verifyingPat}
                          className="text-[10px] text-[rgb(var(--app-text-muted))] underline underline-offset-2 transition hover:text-[rgb(var(--app-text))] disabled:opacity-50"
                        >
                          {verifyingPat ? "Verifying..." : "Verify"}
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
                    type="password"
                    value={form.adoPat}
                    onChange={(e) => set("adoPat")(e.target.value)}
                    placeholder="PAT"
                  />
                </div>

                <div className="grid gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2.5">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={form.adoMcpEnabled}
                      onChange={(event) => set("adoMcpEnabled")(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-[rgb(var(--app-text))]">Enable external Azure DevOps MCP bridge fallback</span>
                    </span>
                  </label>
                  {form.adoMcpEnabled && (
                    <div className="grid gap-2">
                      <input className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoMcpCommand} onChange={(e) => set("adoMcpCommand")(e.target.value)} placeholder="mcp-server-azuredevops" />
                      <div className="grid grid-cols-2 gap-2">
                        <input className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoMcpAuthentication} onChange={(e) => set("adoMcpAuthentication")(e.target.value)} placeholder="pat or azcli" />
                        <input className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500" value={form.adoMcpDomains} onChange={(e) => set("adoMcpDomains")(e.target.value)} placeholder="repositories,pipelines,work-items" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCheckMcp()}
                          disabled={!form.adoOrgUrl || mcpChecking}
                          className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-zinc-500 hover:text-[rgb(var(--app-text))] disabled:opacity-40"
                        >
                          {mcpChecking ? "Checking..." : "Check ADO auth/tools"}
                        </button>
                        {mcpStatus && (
                          <span className={`text-[10px] ${mcpStatus.startsWith("ADO tools ready") ? "text-emerald-400" : "text-amber-400"}`}>
                            {mcpStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
        )}

        {error && <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave || saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Creating..." : "Create and use"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspacePanel({
  repoPath,
  setRepoPath,
  currentBranch,
  branchList,
  gitStatus,
  diffStats,
  taskState,
  workflowState,
  busy,
  profiles,
  activeProfileId,
  setActiveProfileId,
  statusText,
  selectedArtifact,
  selectedArtifactLookupState,
  artifactCount,
  onClearArtifact,
  onAction,
}: WorkspacePanelProps) {
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [newBranchName, setNewBranchName] = useState("");

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const adoReady = Boolean(activeProfile?.adoOrgUrl && activeProfile.adoProject && activeProfile.adoRepoName);
  const gitKnown = Boolean(gitStatus || diffStats);
  const branchName = currentBranch ?? activeProfile?.defaultBranch ?? "";
  const branchLabel = branchName || "not checked";
  const branchOptions = Array.from(new Set([branchName, ...branchList].filter(Boolean)));
  const changedFiles = gitStatus
    ? gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length + gitStatus.deleted.length
    : 0;
  const hasRepoPath = Boolean(repoPath.trim());
  const hasChanges = Boolean(diffStats ? diffStats.files > 0 : changedFiles > 0);
  const added = diffStats?.added ?? 0;
  const removed = diffStats?.removed ?? 0;
  const gitRecovery = gitRecoveryPanelState(workflowState);

  const handleProfileSelect = (id: string) => {
    setActiveProfileId(id || null);
    const p = profiles.find((pr) => pr.id === id);
    if (p) {
      if (p.repoPath) setRepoPath(p.repoPath);
    }
  };

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    setBranchMenuOpen(false);
    setCommitMenuOpen(false);
    onAction(action);
  };

  const commitPrompt = (mode: "commit" | "commit-push" | "push") => {
    const message = commitMessage.trim();
    if (mode === "push") {
      runAction({
        type: "push_branch",
        branch: branchName || undefined,
      });
      return;
    }
    runAction({
      type: mode === "commit-push" ? "commit_and_push" : "prepare_commit",
      branch: branchName || undefined,
      message: message || undefined,
      includeUnstaged,
    });
  };

  const createPullRequest = () => {
    const message = commitMessage.trim();
    runAction({
      type: "create_pr",
      branch: branchName || undefined,
      targetBranch: activeProfile?.targetBranch || activeProfile?.defaultBranch || "main",
      title: message || undefined,
      draft: false,
    });
  };

  const createBranch = () => {
    const name = newBranchName.trim();
    if (!name) return;
    runAction({ type: "create_branch", branch: name });
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-transparent px-3 py-6">
      <div className="relative min-w-0 rounded-2xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-[rgb(var(--app-text))] shadow-lg">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-[rgb(var(--app-text-muted))]">Environment</p>
          <button
            type="button"
            onClick={() => runAction({ type: "inspect_environment" })}
            disabled={!hasRepoPath || busy}
            className="shrink-0 rounded-md p-1 text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-default disabled:opacity-45"
            title="Inspect environment"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10.3 4.3l.7-1.3h2l.7 1.3 1.5.6 1.4-.4 1.4 1.4-.4 1.4.6 1.5 1.3.7v2l-1.3.7-.6 1.5.4 1.4-1.4 1.4-1.4-.4-1.5.6-.7 1.3h-2l-.7-1.3-1.5-.6-1.4.4-1.4-1.4.4-1.4-.6-1.5-1.3-.7v-2l1.3-.7.6-1.5-.4-1.4 1.4-1.4 1.4.4 1.5-.6z" />
              <circle cx="12" cy="11" r="2.6" strokeWidth={1.7} />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => runAction({ type: "inspect_changes" })}
          disabled={!hasRepoPath || busy}
          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-[rgb(var(--app-surface-raised))] disabled:cursor-default disabled:opacity-70"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 7h10M7 12h10M7 17h7M5 4h14v16H5z" />
            </svg>
            <span className="min-w-0 truncate">Changes</span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs">
            {busy && statusText ? (
              <span className="text-blue-500">running</span>
            ) : !gitKnown ? (
              <span className="text-[rgb(var(--app-text-subtle))]">not checked</span>
            ) : hasChanges ? (
              <>
                <span className="text-emerald-500">+{added}</span>
                <span className="ml-1 text-red-500">-{removed}</span>
              </>
            ) : (
              <span className="text-[rgb(var(--app-text-subtle))]">clean</span>
            )}
          </span>
        </button>

        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => setBranchMenuOpen((value) => !value)}
            disabled={!hasRepoPath || busy}
            className="flex w-full items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-1.5 py-1.5 text-sm transition hover:bg-[rgb(var(--app-accent-soft))]"
          >
            <svg className="h-4 w-4 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6m0 0l-2-2m2 2l-2 2M6 21v-7m0 0a3 3 0 100-6 3 3 0 000 6zm12 7v-7m0 0a3 3 0 100-6 3 3 0 000 6z" />
            </svg>
            <span className="min-w-0 flex-1 truncate text-left font-mono">{branchLabel}</span>
            <svg className="h-3.5 w-3.5 text-[rgb(var(--app-text-subtle))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {branchMenuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl">
              <div className="mb-3 flex items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-xs text-[rgb(var(--app-text-muted))]">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-4.3-4.3m1.8-5.2a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search branches
              </div>
              <button
                type="button"
                onClick={() => runAction({ type: "refresh_branch" })}
                disabled={busy}
                className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.9 3M19 9A7 7 0 007.1 6" />
                </svg>
                Refresh branch state
              </button>
              <p className="mb-2 text-xs text-[rgb(var(--app-text-muted))]">Branches</p>
              <div className="space-y-1">
                {branchOptions.map((branch) => (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => runAction({ type: "checkout_branch", branch })}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                  >
                    <svg className="h-4 w-4 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6M6 21v-7m0 0a3 3 0 100-6 3 3 0 000 6zm12 7v-7" />
                    </svg>
                    <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
                    {branch === branchName && <span className="text-[rgb(var(--app-text-muted))]">✓</span>}
                  </button>
                ))}
              </div>
              <div className="mt-3 border-t border-[rgb(var(--app-border))] pt-2">
                <input
                  value={newBranchName}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  className="mb-2 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-sm text-[rgb(var(--app-text))] outline-none placeholder:text-[rgb(var(--app-text-subtle))] focus:border-[rgb(var(--app-accent))]"
                  placeholder="new branch name"
                />
                <button
                  type="button"
                  onClick={createBranch}
                  disabled={!newBranchName.trim() || busy}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="text-lg leading-none">+</span>
                  Create and checkout new branch...
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative mt-1">
          <button
            type="button"
            onClick={() => setCommitMenuOpen((value) => !value)}
            disabled={!hasRepoPath || busy}
            className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
          >
            <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h7m2 0h7M8 8l-4 4 4 4m8-8l4 4-4 4" />
            </svg>
            <span className="min-w-0 truncate">Commit or push</span>
          </button>
          {commitMenuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[rgb(var(--app-text-muted))]">
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6M6 21v-7" />
                  </svg>
                  <span className="min-w-0 truncate">{branchLabel}</span>
                </span>
                {hasChanges && (
                  <span className="shrink-0 whitespace-nowrap font-mono">
                    <span className="text-emerald-500">+{added}</span>
                    <span className="ml-1 text-red-500">-{removed}</span>
                  </span>
                )}
              </div>
              <textarea
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                rows={2}
                className="mb-3 w-full resize-none rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-sm text-[rgb(var(--app-text))] outline-none placeholder:text-[rgb(var(--app-text-subtle))] focus:border-[rgb(var(--app-accent))]"
                placeholder="Commit message (leave blank to generate)..."
              />
              <label className="mb-2 flex items-center gap-2 text-sm text-[rgb(var(--app-text-muted))]">
                <input
                  type="checkbox"
                  checked={includeUnstaged}
                  onChange={(event) => setIncludeUnstaged(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[rgb(var(--app-border))]"
                />
                Include unstaged changes
              </label>
              <div className="space-y-1 border-t border-[rgb(var(--app-border))] pt-2">
                <button type="button" aria-label="Prepare commit" onClick={() => commitPrompt("commit")} disabled={busy} className="flex w-full min-w-0 items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-left text-sm transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-wait disabled:opacity-60">
                  <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h16M8 8l-4 4 4 4" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">Commit</span>
                  <span className="shrink-0 rounded bg-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">Ctrl+↵</span>
                </button>
                <button type="button" aria-label="Prepare commit and push" onClick={() => commitPrompt("commit-push")} disabled={busy} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
                  </svg>
                  <span className="min-w-0 truncate">Commit and push</span>
                </button>
                <button type="button" aria-label="Push branch" onClick={() => commitPrompt("push")} disabled={busy} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
                  </svg>
                  <span className="min-w-0 truncate">Push</span>
                </button>
                <button type="button" onClick={createPullRequest} disabled={busy || !hasRepoPath} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h8m-8 5h5m-8 8h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="min-w-0 truncate">Create pull request</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {gitRecovery && (
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
            <p className="mb-2 truncate text-xs text-amber-700 dark:text-amber-300">
              {gitRecovery.label} needs attention
            </p>
            <div className={`grid gap-1 ${gitRecovery.actions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {gitRecovery.actions.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => runAction({ type: action.type })}
                  disabled={busy}
                  className="truncate whitespace-nowrap rounded-md border border-amber-500/30 px-1.5 py-1 text-[10px] text-amber-800 transition hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50 dark:text-amber-200"
                  title={action.title}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2">
          {profiles.length > 0 ? (
            <select
              className="w-full bg-transparent text-xs text-[rgb(var(--app-text-muted))] outline-none"
              value={activeProfileId ?? ""}
              onChange={(e) => handleProfileSelect(e.target.value)}
              title="Project Link"
            >
              <option value="">No Project Link</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No Project Link</p>
          )}
          <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]" title={repoPath}>
            {repoName || repoPath || "No local repository selected"}
          </p>
          {adoReady && (
            <>
              <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]">
                {activeProfile?.adoProject} / {activeProfile?.adoRepoName}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => runAction({ type: "inspect_pr_insight" })}
                  disabled={busy}
                  className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
                  title="Inspect the latest active pull request insight"
                >
                  PR insight
                </button>
                <button
                  type="button"
                  onClick={() => runAction({ type: "check_pr_policy" })}
                  disabled={busy}
                  className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
                  title="Check policy evaluations for the latest active pull request"
                >
                  Policy
                </button>
                <button
                  type="button"
                  onClick={() => runAction({ type: "list_pr_work_items" })}
                  disabled={busy}
                  className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
                  title="List linked work items for the latest active pull request"
                >
                  Work items
                </button>
                <button
                  type="button"
                  onClick={() => runAction({ type: "inspect_pipeline" })}
                  disabled={busy}
                  className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
                  title="Inspect Azure DevOps pipeline readiness for this project link"
                >
                  Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => runAction({ type: "trigger_pipeline", branch: branchName || undefined })}
                  disabled={busy}
                  className="col-span-2 truncate whitespace-nowrap rounded-md border border-amber-500/30 px-1.5 py-1 text-[10px] text-amber-700 transition hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50 dark:text-amber-300"
                  title="Prepare approval before triggering the configured Azure DevOps pipeline"
                >
                  Run pipeline
                </button>
              </div>
            </>
          )}
        </div>

        <ArtifactWorkspaceShell
          artifact={selectedArtifact}
          lookupState={selectedArtifactLookupState}
          artifactCount={artifactCount}
          onClear={onClearArtifact}
        />

        <div className="mt-4 border-t border-[rgb(var(--app-border))] pt-4">
          <p className="mb-2 text-sm text-[rgb(var(--app-text-muted))]">Progress</p>
          {taskState ? (
            <div className="space-y-2">
              {taskState.steps.map((step, i) => {
                const actionState = workflowStepActionState(step, {
                  busy,
                  workflowStatus: workflowState?.status,
                });
                return (
                  <div key={i} className="flex items-start gap-2 text-sm text-[rgb(var(--app-text-muted))]">
                    <span className={workflowStepDotClass(step, actionState)} />
                    {step.action ? (
                      <button
                        type="button"
                        onClick={() => runAction(step.action!)}
                        disabled={workflowStepActionDisabled(actionState)}
                        className={workflowStepActionClass(step, actionState)}
                        data-workflow-step-state={actionState}
                        title={workflowStepActionTitle(step, actionState, workflowState)}
                      >
                        <span className="min-w-0 truncate">{step.label}</span>
                        {actionState !== "idle" && (
                          <span className={workflowStepActionBadgeClass(actionState)}>
                            {workflowStepActionBadgeLabel(actionState)}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className={step.done ? "text-[rgb(var(--app-text-subtle))] line-through" : ""}>{step.label}</span>
                    )}
                  </div>
                );
              })}
              {taskState.details && taskState.details.length > 0 && (
                <div className="border-t border-[rgb(var(--app-border))] pt-2 text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
                  {taskState.details.map((detail, i) => (
                    <p key={i} className="truncate" title={detail}>{detail}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-[rgb(var(--app-text-subtle))]">
              Ask MergePilot to inspect changes, run CI/CD checks, analyze PR insight, or prepare a commit.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function workflowStepDotClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "mt-1 h-3.5 w-3.5 shrink-0 rounded-full border";
  if (actionState === "blocked") return `${base} border-red-500 bg-red-500/15`;
  if (actionState === "running") return `${base} border-blue-500 bg-blue-500/25`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]`;
  if (actionState === "done" || step.done) return `${base} border-emerald-500 bg-emerald-500`;
  if (step.active) return `${base} border-amber-500 bg-amber-500/20`;
  return `${base} border-[rgb(var(--app-border))]`;
}

function workflowStepActionDisabled(actionState: WorkflowStepActionState): boolean {
  return actionState === "running" || actionState === "waiting" || actionState === "blocked";
}

function workflowStepActionClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "inline-flex min-w-0 max-w-full items-center gap-1.5 text-left transition hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-65";
  if (actionState === "blocked") return `${base} text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} text-blue-600 dark:text-blue-300`;
  if (actionState === "waiting") return `${base} text-[rgb(var(--app-text-subtle))]`;
  if (actionState === "done" || step.done) return `${base} text-[rgb(var(--app-text-subtle))]`;
  return `${base} underline decoration-dotted underline-offset-2`;
}

function workflowStepActionBadgeClass(actionState: WorkflowStepActionState): string {
  const base = "shrink-0 rounded border px-1 py-px text-[10px] font-medium";
  if (actionState === "blocked") return `${base} border-red-500/30 bg-red-500/10 text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-subtle))]`;
  return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`;
}

function workflowStepActionBadgeLabel(actionState: WorkflowStepActionState): string {
  if (actionState === "running") return "Running";
  if (actionState === "waiting") return "Wait";
  if (actionState === "blocked") return "Blocked";
  if (actionState === "done") return "Done";
  return "";
}

function workflowStepActionTitle(
  step: WorkflowStep,
  actionState: WorkflowStepActionState,
  workflowState: WorkflowEventState | null,
): string {
  if (actionState === "running") return `${step.label} is running.`;
  if (actionState === "waiting") return "Wait for the current workflow action to finish.";
  if (actionState === "blocked") return workflowState?.currentStep ?? "Resolve the blocked workflow before running another action.";
  if (actionState === "done") return `Run ${step.label.toLowerCase()} again.`;
  return `Run ${step.label.toLowerCase()}`;
}

function ArtifactWorkspaceShell({
  artifact,
  lookupState,
  artifactCount,
  onClear,
}: {
  artifact: ConversationArtifactPart | null;
  lookupState: ArtifactLookupState | null;
  artifactCount: number;
  onClear: () => void;
}) {
  const selectedCountLabel = artifact
    ? "1 selected"
    : artifactCount > 0
      ? `${artifactCount} available`
      : "empty";

  return (
    <section className="mt-4 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">Result workspace</p>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--app-text-subtle))]">{selectedCountLabel}</p>
        </div>
        {artifact && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
          >
            Clear
          </button>
        )}
      </div>
      {artifact ? (
        <div className="p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]" title={artifact.title}>
                {artifact.title}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
                {artifact.artifactId}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
                {artifactWorkspaceKindLabel(artifact.artifactType)}
              </span>
              <span className={artifactWorkspaceStatusClass(artifact.status)} aria-live="polite">
                {artifactWorkspaceStatusLabel(artifact.status)}
              </span>
            </div>
          </div>
          <ArtifactWorkspaceContent artifact={artifact} lookupState={lookupState} />
        </div>
      ) : (
        <div className="px-3 py-3">
          <div className="rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-3">
            <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
              No artifact selected
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
            {artifactCount > 0
              ? `${artifactCount} artifact${artifactCount === 1 ? "" : "s"} available in chat. Select one to inspect it here.`
              : "Generated diagrams, PR insight reports, and long review summaries will appear here after an artifact is selected."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ArtifactWorkspaceContent({
  artifact,
  lookupState,
}: {
  artifact: ConversationArtifactPart;
  lookupState: ArtifactLookupState | null;
}) {
  const persistedContent = lookupState?.status === "loaded"
    ? prInsightArtifactRecordToMarkdown(lookupState.record)
    : "";
  const content = artifact.content?.trim();
  const renderContent = content || persistedContent.trim();
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const downloadFileName = artifactDownloadFileName(artifact);
  const copyContent = useCallback(() => {
    if (!renderContent) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(renderContent).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      });
      return;
    }
    setCopied(true);
    if (typeof window !== "undefined") window.setTimeout(() => setCopied(false), 1800);
  }, [renderContent]);
  const downloadContent = useCallback(() => {
    if (!renderContent || typeof document === "undefined" || typeof URL === "undefined") return;
    const url = URL.createObjectURL(new Blob([renderContent], { type: artifactDownloadMimeType(artifact.artifactType) }));
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadFileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1800);
  }, [artifact.artifactType, downloadFileName, renderContent]);

  if (!artifact.content?.trim() && lookupState?.status === "loading") {
    return (
      <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2" aria-live="polite">
        <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
          Loading saved PR insight artifact...
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-4/5 rounded-full bg-[rgb(var(--app-border))]" />
          <div className="h-1.5 w-2/3 rounded-full bg-[rgb(var(--app-border))]" />
        </div>
      </div>
    );
  }

  if (!artifact.content?.trim() && lookupState?.status === "error") {
    return (
      <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2" aria-live="polite">
        <p className="text-xs font-medium text-[rgb(var(--app-danger))]">Saved artifact unavailable</p>
        <p className="mt-1 break-words text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
          {lookupState.message}
        </p>
      </div>
    );
  }

  if (!renderContent) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <p className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {artifactWorkspacePlaceholder(artifact.artifactType, artifact.status)}
        </p>
      </div>
    );
  }

  if (artifact.artifactType === "markdown") {
    return (
      <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Markdown report</span>
          <ArtifactActionStrip
            copied={copied}
            downloaded={downloaded}
            onCopy={copyContent}
            onDownload={downloadContent}
          />
        </div>
        <div className="p-3">
          <ConversationPartRenderer parts={[{ type: "markdown", markdown: renderContent }]} />
        </div>
      </div>
    );
  }

  if (artifact.artifactType === "mermaid") {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2">
          <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
            Rendered Mermaid diagram. Source remains available below.
          </p>
          <ArtifactActionStrip
            copied={copied}
            downloaded={downloaded}
            onCopy={copyContent}
            onDownload={downloadContent}
          />
        </div>
        <MermaidArtifactPreview source={renderContent} />
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {renderContent}
        </pre>
      </div>
    );
  }

  if (artifact.artifactType === "text") {
    return (
      <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Text artifact</span>
          <ArtifactActionStrip
            copied={copied}
            downloaded={downloaded}
            onCopy={copyContent}
            onDownload={downloadContent}
          />
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {renderContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Saved source</span>
        <ArtifactActionStrip
          copied={copied}
          downloaded={downloaded}
          onCopy={copyContent}
          onDownload={downloadContent}
        />
      </div>
      <p className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        Preview content is saved, but isolated HTML/React rendering is not enabled in this workspace yet.
      </p>
      <p className="mt-1 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
        {renderContent.length.toLocaleString()} characters available
      </p>
    </div>
  );
}

function MermaidArtifactPreview({ source }: { source: string }) {
  const reactId = useId();
  const renderId = useMemo(
    () => `artifact-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    [reactId],
  );
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; svg: string }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "transparent",
            primaryColor: "#eff6ff",
            primaryBorderColor: "#93c5fd",
            primaryTextColor: "#111827",
            lineColor: "#64748b",
            secondaryColor: "#f8fafc",
            tertiaryColor: "#f1f5f9",
          },
        });
        return mermaid.render(renderId, source);
      })
      .then((result) => {
        if (!cancelled) setState({ status: "ready", svg: result.svg });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [renderId, source]);

  if (state.status === "loading") {
    return (
      <div className="rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]" aria-live="polite">
        <p className="font-medium">Rendering Mermaid diagram...</p>
        <div className="mt-2 h-24 rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2" aria-live="polite">
        <p className="text-xs font-medium text-[rgb(var(--app-danger))]">Mermaid render failed</p>
        <p className="mt-1 break-words text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">{state.message}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="mermaid-artifact-svg"
      className="overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-white p-3 text-slate-900 shadow-inner [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}

function ArtifactActionStrip({
  copied,
  downloaded,
  onCopy,
  onDownload,
}: {
  copied: boolean;
  downloaded: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1">
      <ArtifactActionButton onClick={onCopy} active={copied}>
        {copied ? "Copied" : "Copy content"}
      </ArtifactActionButton>
      <ArtifactActionButton onClick={onDownload} active={downloaded}>
        {downloaded ? "Download started" : "Download"}
      </ArtifactActionButton>
    </div>
  );
}

function ArtifactActionButton({
  children,
  onClick,
  active = false,
}: {
  children: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-[rgb(var(--app-success))]"
          : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))]"
      }`}
    >
      {children}
    </button>
  );
}

function artifactDownloadFileName(artifact: ConversationArtifactPart): string {
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

function artifactDownloadMimeType(type: ConversationArtifactPart["artifactType"]): string {
  const mimeTypes: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "text/html;charset=utf-8",
    markdown: "text/markdown;charset=utf-8",
    mermaid: "text/plain;charset=utf-8",
    react: "text/plain;charset=utf-8",
    text: "text/plain;charset=utf-8",
  };
  return mimeTypes[type];
}

function artifactWorkspaceKindLabel(type: ConversationArtifactPart["artifactType"]): string {
  const labels: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview",
    markdown: "Report",
    mermaid: "Diagram",
    react: "Preview",
    text: "Text",
  };
  return labels[type];
}

function artifactWorkspaceStatusLabel(status: ConversationArtifactPart["status"]): string {
  const labels: Record<ConversationArtifactPart["status"], string> = {
    error: "Error",
    ready: "Ready",
    streaming: "Streaming",
  };
  return labels[status];
}

function artifactWorkspaceStatusClass(status: ConversationArtifactPart["status"]): string {
  const classes: Record<ConversationArtifactPart["status"], string> = {
    error: "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-danger))]",
    ready: "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-success))]",
    streaming: "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] text-blue-400",
  };
  return classes[status];
}

function artifactWorkspacePlaceholder(
  type: ConversationArtifactPart["artifactType"],
  status: ConversationArtifactPart["status"],
): string {
  if (status === "streaming") return "The artifact is still streaming. The workspace shell is ready, and full content rendering will attach when the result is complete.";
  if (status === "error") return "The artifact failed before content rendering was available. Keep this selected while deciding whether to retry or inspect the failed run.";
  const placeholders: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview rendering will be added in the next artifact content batch.",
    markdown: "Markdown report rendering will be added in the next artifact content batch.",
    mermaid: "Mermaid diagram rendering will be added in the next artifact content batch.",
    react: "Interactive preview rendering will be added in the next artifact content batch.",
    text: "Text artifact rendering will be added in the next artifact content batch.",
  };
  return placeholders[type];
}

type GitRecoveryWorkspaceAction = Extract<
  WorkspaceAction,
  {
    type:
      | "continue_rebase"
      | "abort_rebase"
      | "skip_rebase"
      | "continue_merge"
      | "abort_merge"
      | "continue_cherry_pick"
      | "abort_cherry_pick"
      | "skip_cherry_pick"
      | "continue_revert"
      | "abort_revert"
      | "skip_revert";
  }
>;

function gitRecoveryPanelState(workflowState: WorkflowEventState | null): {
  label: string;
  actions: Array<{ type: GitRecoveryWorkspaceAction["type"]; label: string; title: string }>;
} | null {
  if (workflowState?.workflowKind !== "git") return null;
  const phase = workflowState.workflowPhase ?? "";
  if (phase.includes("rebase")) {
    return {
      label: "Rebase",
      actions: [
        { type: "continue_rebase", label: "Continue", title: "Continue the in-progress rebase" },
        { type: "abort_rebase", label: "Abort", title: "Abort the in-progress rebase" },
        { type: "skip_rebase", label: "Skip", title: "Skip the current rebase patch" },
      ],
    };
  }
  if (phase.includes("merge")) {
    return {
      label: "Merge",
      actions: [
        { type: "continue_merge", label: "Continue", title: "Continue the in-progress merge" },
        { type: "abort_merge", label: "Abort", title: "Abort the in-progress merge" },
      ],
    };
  }
  if (phase.includes("cherry_pick")) {
    return {
      label: "Cherry-pick",
      actions: [
        { type: "continue_cherry_pick", label: "Continue", title: "Continue the in-progress cherry-pick" },
        { type: "abort_cherry_pick", label: "Abort", title: "Abort the in-progress cherry-pick" },
        { type: "skip_cherry_pick", label: "Skip", title: "Skip the current cherry-pick patch" },
      ],
    };
  }
  if (phase.includes("revert")) {
    return {
      label: "Revert",
      actions: [
        { type: "continue_revert", label: "Continue", title: "Continue the in-progress revert" },
        { type: "abort_revert", label: "Abort", title: "Abort the in-progress revert" },
        { type: "skip_revert", label: "Skip", title: "Skip the current revert patch" },
      ],
    };
  }
  return null;
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    git_status: "Check Git status",
    git_diff: "Inspect changes",
    git_current_branch: "Read current branch",
    git_log: "Read commit history",
    git_branch_list: "List branches",
    git_remote: "Inspect remotes",
    git_show: "Inspect revision",
    git_fetch: "Fetch remotes",
    git_merge_base: "Find merge base",
    git_checkout: "Switch branch",
    git_pull: "Pull branch",
    git_merge: "Merge branch",
    git_cherry_pick: "Cherry-pick commit",
    git_revert: "Revert commit",
    git_rebase: "Rebase branch",
    git_restore: "Restore files",
    git_add: "Stage files",
    git_commit: "Create commit",
    git_push: "Push branch",
    git_stash: "Stash changes",
    git_create_branch: "Create branch",
    ado_create_pr: "Create pull request",
    ado_get_pull_request_by_id: "Read pull request",
    ado_list_pull_request_threads: "Read PR threads",
    ado_get_pull_request_changes: "Read PR changes",
    ado_list_pull_request_work_items: "Read linked work items",
    ado_list_pull_request_policy_evaluations: "Read PR policies",
    ado_pipelines_get_builds: "Read PR builds",
    ado_link_work_item: "Link work item",
    ado_trigger_pipeline: "Run pipeline",
    validation_command: "Run validation",
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

export function workflowStateWithActionSummary(
  workflowState: WorkflowEventState | null | undefined,
  summary?: string,
): WorkflowEventState | null {
  if (!workflowState) return null;
  const clean = summary?.trim();
  return clean ? { ...workflowState, workflowSummary: clean } : workflowState;
}

export function taskStateFromWorkflow(
  workflowState: WorkflowEventState | null,
  fallbackGoal: string | null,
): TaskState | null {
  if (!workflowState) return null;
  if (workflowState.workflowKind === "commit") {
    return taskStateFromCommitWorkflow(workflowState, fallbackGoal);
  }
  if (workflowState.workflowKind === "pr") {
    return taskStateFromPrWorkflow(workflowState, fallbackGoal);
  }
  if (workflowState.workflowKind === "ci") {
    return taskStateFromCiWorkflow(workflowState, fallbackGoal);
  }
  const completed = workflowState.completedTools ?? [];
  const steps: WorkflowStep[] = completed.map((tool) => ({
    label: toolLabel(tool),
    done: true,
    active: false,
  }));

  const pendingTool = workflowState.pendingApproval?.action.tool;
  const currentLabel =
    workflowState.pendingApproval?.action.description
      ?? workflowState.currentStep
      ?? workflowState.status;

  if (pendingTool) {
    steps.push({ label: currentLabel || toolLabel(pendingTool), done: false, active: true });
  } else if (workflowState.status === "running" || workflowState.status === "planning") {
    steps.push({ label: currentLabel, done: false, active: true });
  } else if (steps.length === 0 && currentLabel) {
    steps.push({ label: currentLabel, done: workflowState.status === "done", active: false });
  }

  return {
    goal: fallbackGoal ?? "Current workflow",
    steps,
    currentStepLabel: currentLabel,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromPrWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const completed = new Set(workflowState.completedTools ?? []);
  const phase = workflowState.workflowPhase ?? "";
  const pendingTool = workflowState.pendingApproval?.action.tool;
  const readinessSteps = prReadinessFollowUpSteps(workflowState, completed);
  const steps: WorkflowStep[] = phase === "inspected" || phase === "policy_checked" || phase === "work_items_listed"
    ? [
        {
          label: "Load pull request",
          done: completed.has("ado_get_pull_request_by_id") || completed.has("ado_list_pull_request_policy_evaluations") || completed.has("ado_list_pull_request_work_items"),
          active: workflowState.status === "planning",
        },
        {
          label: phase === "policy_checked"
            ? "Check policy"
            : phase === "work_items_listed"
              ? "List work items"
              : "Analyze PR insight",
          done: workflowState.status === "done",
          active: workflowState.status === "running",
        },
        ...readinessSteps,
      ]
    : [
        {
          label: "Inspect branch",
          done: completed.has("git_current_branch") || completed.has("git_status"),
          active: workflowState.status === "planning",
        },
        {
          label: pendingTool === "ado_link_work_item" ? "Link work item" : "Prepare pull request",
          done: false,
          active: phase === "waiting_for_create_pr_approval" || pendingTool === "ado_create_pr" || pendingTool === "ado_link_work_item",
        },
      ];
  return {
    goal: fallbackGoal ?? "Pull request workflow",
    steps,
    currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function prReadinessFollowUpSteps(workflowState: WorkflowEventState, completed: Set<string>): WorkflowStep[] {
  const summary = `${workflowState.workflowSummary ?? ""}\n${workflowState.currentStep ?? ""}`;
  const failedBuilds = numericSignal(summary, /(\d+)\s+failed\/canceled build/i);
  const failedPolicies = numericSignal(summary, /(\d+)\s+failed\/error policy/i);
  const linkedWorkItems = numericSignal(summary, /(\d+)\s+linked work item/i);
  const lower = summary.toLowerCase();
  const steps: WorkflowStep[] = [];
  let activatedNextAction = false;
  const nextActionActive = (done: boolean): boolean => {
    if (done || activatedNextAction) return false;
    activatedNextAction = true;
    return true;
  };
  if ((failedBuilds ?? 0) > 0 || /\b(ci|build|test|validation).{0,40}\b(failed|blocked|failure)\b/.test(lower)) {
    const done = completed.has("validation_command");
    steps.push({
      label: "Review CI blockers",
      done,
      active: nextActionActive(done),
      action: { type: "run_tests" },
    });
  }
  if ((failedPolicies ?? 0) > 0 || /\b(policy|policies).{0,40}\b(failed|blocked|blocking|error)\b/.test(lower)) {
    const done = completed.has("ado_list_pull_request_policy_evaluations");
    steps.push({
      label: "Check policy blockers",
      done,
      active: nextActionActive(done),
      action: { type: "check_pr_policy" },
    });
  }
  if (linkedWorkItems === 0 || /\bno linked work items?\b/.test(lower)) {
    const done = completed.has("ado_list_pull_request_work_items");
    steps.push({
      label: "Review work items",
      done,
      active: nextActionActive(done),
      action: { type: "list_pr_work_items" },
    });
  }
  return steps.slice(0, 3);
}

function numericSignal(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function taskStateFromCommitWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const completed = new Set(workflowState.completedTools ?? []);
  const phase = workflowState.workflowPhase ?? "";
  const workflow = workflowState.pendingApproval?.action.workflow;
  const shouldPush = Boolean(workflow?.pushAfterCommit || phase === "waiting_for_push_approval" || completed.has("git_push"));
  const steps: WorkflowStep[] = [
    {
      label: "Inspect changes",
      done: completed.has("git_status") || completed.has("git_diff"),
      active: phase === "preflight" || workflowState.status === "planning",
    },
    {
      label: "Stage changes",
      done: completed.has("git_add"),
      active: phase === "waiting_for_stage_approval" || workflowState.currentStep === "git_add",
    },
    {
      label: "Commit changes",
      done: completed.has("git_commit"),
      active: phase === "waiting_for_commit_approval" || workflowState.currentStep === "git_commit",
    },
  ];
  if (shouldPush) {
    steps.push({
      label: "Push branch",
      done: completed.has("git_push"),
      active: phase === "waiting_for_push_approval" || workflowState.currentStep === "git_push",
    });
  }

  const currentStepLabel =
    workflowState.pendingApproval?.action.description
      ?? workflowState.currentStep
      ?? workflowState.status;

  return {
    goal: fallbackGoal ?? "Commit workflow",
    steps,
    currentStepLabel,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromCiWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const phase = workflowState.workflowPhase ?? "";
  if (phase.includes("pipeline") || workflowState.pendingApproval?.action.tool === "ado_trigger_pipeline") {
    const waiting = workflowState.status === "waiting_for_approval";
    const running = workflowState.status === "running";
    const inspected = workflowState.completedTools?.includes("ado_list_pipeline_runs") || phase === "pipeline_inspected";
    const triggered = workflowState.completedTools?.includes("ado_trigger_pipeline") || phase === "pipeline_triggered";
    return {
      goal: fallbackGoal ?? "Pipeline workflow",
      steps: [
        { label: "Inspect pipeline", done: inspected, active: running && !inspected, action: { type: "inspect_pipeline" } },
        { label: "Review latest runs", done: inspected, active: phase === "pipeline_inspected" && workflowState.status === "done" },
        { label: "Trigger pipeline", done: triggered, active: waiting || (!triggered && inspected), action: { type: "trigger_pipeline" } },
        { label: triggered ? "Pipeline triggered" : "Review run status", done: triggered, active: running && inspected },
      ],
      currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
      details: workflowDetailLines(workflowState),
      risk: workflowState.pendingApproval?.riskLevel,
    };
  }
  const isBuild = phase.includes("build") || workflowState.currentStep.toLowerCase().includes("build");
  const noun = isBuild ? "Build" : "Tests";
  const passed = phase.endsWith("_passed") || (workflowState.status === "done" && !phase.endsWith("_failed"));
  const failed = phase.endsWith("_failed") || workflowState.status === "failed";
  const waiting = workflowState.status === "waiting_for_approval";
  const running = workflowState.status === "running";
  return {
    goal: fallbackGoal ?? `${noun} validation`,
    steps: [
      { label: "Inspect workspace", done: true, active: false },
      { label: `Approve ${noun.toLowerCase()}`, done: !waiting, active: waiting },
      { label: `Run ${noun.toLowerCase()}`, done: passed || failed, active: running },
      { label: passed ? `${noun} passed` : failed ? `${noun} failed` : "Review result", done: passed, active: failed },
    ],
    currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function workflowDetailLines(workflowState: WorkflowEventState): string[] {
  const action = workflowState.pendingApproval?.action;
  const lines: string[] = [];
  if (workflowState.authMessage) lines.push(truncateMiddle(workflowState.authMessage, 120));
  if (workflowState.authStatus) {
    const authLabel = workflowState.authMode === "pat" ? "PAT" : "OAuth";
    const retryLabel = workflowState.retryable ? "retry after reconnecting" : "check configuration";
    lines.push(`${authLabel}: ${workflowState.authStatus} (${retryLabel})`);
  }
  if (action?.preflight?.summary) lines.push(action.preflight.summary);
  if (action?.readiness?.summary) lines.push(action.readiness.summary);
  if ((workflowState.workflowKind === "pr" || workflowState.workflowKind === "ci") && workflowState.workflowSummary) {
    lines.push(truncateMiddle(workflowState.workflowSummary, 160));
  }
  if (action?.workflow?.branch) lines.push(`Branch: ${action.workflow.branch}`);
  if (action?.workflow?.message) lines.push(`Message: ${truncateMiddle(action.workflow.message, 90)}`);
  return lines.slice(0, 4);
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = Math.max(1, Math.floor((maxLength - 3) * 0.65));
  const tail = Math.max(1, maxLength - 3 - head);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function workspaceActionToolCandidates(action: WorkspaceAction): string[] {
  switch (action.type) {
    case "inspect_environment":
      return ["git_status", "git_diff", "git_current_branch", "git_branch_list", "git_remote"];
    case "run_tests":
    case "run_build":
      return ["validation_command", "npm_test", "npm_build", "pytest_run", "dotnet_test", "dotnet_build"];
    case "inspect_changes":
      return ["git_status", "git_diff"];
    case "refresh_branch":
      return ["git_current_branch", "git_branch_list"];
    case "checkout_branch":
      return ["git_checkout", "git_switch"];
    case "create_branch":
      return ["git_create_branch", "git_checkout"];
    case "continue_rebase":
    case "abort_rebase":
    case "skip_rebase":
      return ["git_rebase"];
    case "continue_merge":
    case "abort_merge":
      return ["git_merge"];
    case "continue_cherry_pick":
    case "abort_cherry_pick":
    case "skip_cherry_pick":
      return ["git_cherry_pick"];
    case "continue_revert":
    case "abort_revert":
    case "skip_revert":
      return ["git_revert"];
    case "create_pr":
      return ["ado_create_pr"];
    case "inspect_pr_insight":
      return [
        "ado_get_pull_request_by_id",
        "ado_list_pull_request_threads",
        "ado_get_pull_request_changes",
        "ado_pipelines_get_builds",
        "ado_list_pull_request_work_items",
        "ado_list_pull_request_policy_evaluations",
      ];
    case "check_pr_policy":
      return ["ado_list_pull_request_policy_evaluations"];
    case "list_pr_work_items":
      return ["ado_list_pull_request_work_items"];
    case "link_work_item":
      return ["ado_link_work_item"];
    case "inspect_pipeline":
      return ["ado_list_pipeline_runs", "ado_get_build_timeline", "ado_get_build_log_excerpt"];
    case "trigger_pipeline":
      return ["ado_trigger_pipeline"];
    case "push_branch":
      return ["git_push"];
    case "commit_and_push":
      return ["git_add", "git_commit", "git_push"];
    case "prepare_commit":
      return ["git_add", "git_commit"];
  }
}

function workspaceActionMatchesApproval(action: WorkspaceAction, approval: ApprovalRequest): boolean {
  return workspaceActionToolCandidates(action).includes(approval.action.tool);
}

function workspaceActionToDirectWorkflow(action: WorkspaceAction): {
  action: ChatWorkflowAction;
  input?: {
    branch?: string;
    targetBranch?: string;
    title?: string;
    description?: string;
    draft?: boolean;
    pullRequestId?: number;
    workItemId?: number;
    pipelineId?: number;
    message?: string;
    includeUnstaged?: boolean;
    commitMode?: "commit" | "commit-push";
  };
} {
  switch (action.type) {
    case "inspect_environment":
      return { action: "inspect_environment" };
    case "inspect_changes":
      return { action: "inspect_changes" };
    case "run_tests":
      return { action: "run_tests" };
    case "run_build":
      return { action: "run_build" };
    case "refresh_branch":
      return { action: "refresh_branch" };
    case "checkout_branch":
      return { action: "checkout_branch", input: { branch: action.branch } };
    case "create_branch":
      return { action: "create_branch", input: { branch: action.branch } };
    case "continue_rebase":
      return { action: "continue_rebase" };
    case "abort_rebase":
      return { action: "abort_rebase" };
    case "skip_rebase":
      return { action: "skip_rebase" };
    case "continue_merge":
      return { action: "continue_merge" };
    case "abort_merge":
      return { action: "abort_merge" };
    case "continue_cherry_pick":
      return { action: "continue_cherry_pick" };
    case "abort_cherry_pick":
      return { action: "abort_cherry_pick" };
    case "skip_cherry_pick":
      return { action: "skip_cherry_pick" };
    case "continue_revert":
      return { action: "continue_revert" };
    case "abort_revert":
      return { action: "abort_revert" };
    case "skip_revert":
      return { action: "skip_revert" };
    case "create_pr":
      return {
        action: "create_pr",
        input: {
          branch: action.branch,
          targetBranch: action.targetBranch,
          title: action.title,
          description: action.description,
          draft: action.draft,
        },
      };
    case "inspect_pr_insight":
      return { action: "inspect_pr_insight", input: { pullRequestId: action.pullRequestId } };
    case "check_pr_policy":
      return { action: "check_pr_policy", input: { pullRequestId: action.pullRequestId } };
    case "list_pr_work_items":
      return { action: "list_pr_work_items", input: { pullRequestId: action.pullRequestId } };
    case "link_work_item":
      return { action: "link_work_item", input: { pullRequestId: action.pullRequestId, workItemId: action.workItemId } };
    case "inspect_pipeline":
      return { action: "inspect_pipeline", input: { pipelineId: action.pipelineId } };
    case "trigger_pipeline":
      return { action: "trigger_pipeline", input: { pipelineId: action.pipelineId, branch: action.branch } };
    case "push_branch":
      return { action: "push_branch", input: { branch: action.branch } };
    case "commit_and_push":
      return {
        action: "prepare_commit",
        input: {
          branch: action.branch,
          message: action.message,
          includeUnstaged: action.includeUnstaged,
          commitMode: "commit-push",
        },
      };
    case "prepare_commit":
      return {
        action: "prepare_commit",
        input: {
          branch: action.branch,
          message: action.message,
          includeUnstaged: action.includeUnstaged,
          commitMode: "commit",
        },
      };
  }
}

function workspaceActionFromSuggestion(suggestion: SuggestionReply): WorkspaceAction | null {
  if (suggestion.action.kind !== "workspace_action") return null;
  switch (suggestion.action.action) {
    case "inspect_changes":
      return { type: "inspect_changes" };
    case "inspect_environment":
      return { type: "inspect_environment" };
    case "run_tests":
      return { type: "run_tests" };
    case "run_build":
      return { type: "run_build" };
    case "refresh_branch":
      return { type: "refresh_branch" };
    case "inspect_pr_insight":
      return { type: "inspect_pr_insight" };
    case "check_pr_policy":
      return { type: "check_pr_policy" };
    case "list_pr_work_items":
      return { type: "list_pr_work_items" };
    case "inspect_pipeline":
      return { type: "inspect_pipeline" };
    case "trigger_pipeline":
      return { type: "trigger_pipeline" };
  }
  return null;
}

function workspaceActionFromWelcomeSuggestion(suggestion: string): WorkspaceAction | null {
  if (/^run tests$/i.test(suggestion)) return { type: "run_tests" };
  return null;
}

// ─── Panel toggle icons ───────────────────────────────────────────────────────

function ToggleLeftPanelIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M5.5 1.5v13" />
      {active && <path d="M2.5 5h2M2.5 8h2M2.5 11h2" strokeOpacity="0.6" />}
    </svg>
  );
}

function ToggleRightPanelIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M10.5 1.5v13" />
      {active && <path d="M11.5 5h2M11.5 8h2M11.5 11h2" strokeOpacity="0.6" />}
    </svg>
  );
}

// ─── ConversationTopBar ────────────────────────────────────────────────────────
// Spans the full workspace width. Three zones mirror the three panel columns:
//   [history-width zone] [flex-1 title] [right-width zone]
// When a panel collapses, its zone shrinks to button-only width (40px).

interface ConversationTopBarProps {
  historyOpen: boolean;
  historyWidth: number;
  onToggleHistory: () => void;
  rightPanelOpen: boolean;
  rightWidth: number;
  onToggleRight: () => void;
  titleEditing: boolean;
  customTitle: string | null;
  conversationTitle: string | null;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onStartTitleEdit: () => void;
  onConfirmTitle: (value: string) => void;
  onCancelTitle: () => void;
}

function ConversationTopBar({
  historyOpen, historyWidth, onToggleHistory,
  rightPanelOpen, rightWidth, onToggleRight,
  titleEditing, customTitle, conversationTitle,
  titleInputRef, onStartTitleEdit, onConfirmTitle, onCancelTitle,
}: ConversationTopBarProps) {
  return (
    <div className="flex shrink-0 items-center border-b border-zinc-800/80 min-h-[40px] bg-zinc-950/95">

      {/* Left zone — width mirrors history panel, collapses to 40px */}
      <div
        className="flex shrink-0 items-center overflow-hidden"
        style={{ width: historyOpen ? historyWidth : 40, transition: "width 180ms ease" }}
      >
        <button
          onClick={onToggleHistory}
          className={`ml-1.5 rounded p-1.5 transition-colors ${historyOpen ? "bg-zinc-800 text-zinc-300" : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"}`}
          title={historyOpen ? "Collapse history" : "Expand history"}
        >
          <ToggleLeftPanelIcon active={historyOpen} />
        </button>
      </div>

      {/* Middle zone — title, fills remaining space */}
      <div className="flex flex-1 items-center min-w-0 px-2">
        {titleEditing ? (
          <input
            ref={titleInputRef}
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            defaultValue={customTitle ?? conversationTitle ?? ""}
            onBlur={(e) => onConfirmTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmTitle((e.target as HTMLInputElement).value);
              if (e.key === "Escape") onCancelTitle();
            }}
            autoFocus
          />
        ) : (
          <button
            className="group flex items-center gap-1.5 max-w-full"
            title="Click to rename"
            onClick={onStartTitleEdit}
          >
            <span className="truncate text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors">
              {customTitle ?? conversationTitle ?? <span className="text-zinc-700">New conversation</span>}
            </span>
            <svg className="h-3 w-3 shrink-0 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      {/* Right zone — width mirrors right panel, collapses to 40px */}
      <div
        className="flex shrink-0 items-center justify-end overflow-hidden"
        style={{ width: rightPanelOpen ? rightWidth : 40, transition: "width 180ms ease" }}
      >
        <button
          onClick={onToggleRight}
          className={`mr-1.5 rounded p-1.5 transition-colors ${rightPanelOpen ? "bg-zinc-800 text-zinc-300" : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"}`}
          title={rightPanelOpen ? "Collapse context panel" : "Expand context panel"}
        >
          <ToggleRightPanelIcon active={rightPanelOpen} />
        </button>
      </div>

    </div>
  );
}

// ─── Main Chat component ──────────────────────────────────────────────────────

interface ChatProps {
  mini?: boolean;
}

const CHAT_DRAFT_STORAGE_KEY = "dev_agent_chat_draft_v1";

interface ChatDraftState {
  repoPath: string;
  input: string;
  bubbles: Bubble[];
  sessionId: string | null;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
  customTitle: string | null;
  activeProfileId: string | null;
}

function isActiveWorkflowDraft(workflowState: WorkflowEventState | null): boolean {
  return Boolean(workflowState && (
    workflowState.status === "planning" ||
    workflowState.status === "running" ||
    workflowState.status === "waiting_for_approval"
  ));
}

function restoreInterruptedStreamingBubble(bubble: Bubble): Bubble {
  if (bubble.kind !== "assistant" || !bubble.streaming) {
    return bubble;
  }
  const restoredText = bubble.text || conversationTextFromParts(bubble.parts);
  return {
    ...bubble,
    text: restoredText,
    streaming: false,
  };
}

function sanitizeChatDraft(draft: ChatDraftState): ChatDraftState {
  const hadInterruptedStream = draft.bubbles.some((bubble) => bubble.kind === "assistant" && bubble.streaming);
  const activeWorkflow = isActiveWorkflowDraft(draft.workflowState);
  return {
    ...draft,
    bubbles: draft.bubbles.map(restoreInterruptedStreamingBubble),
    statusText: hadInterruptedStream && !activeWorkflow ? null : draft.statusText,
  };
}

function loadChatDraft(): ChatDraftState | null {
  try {
    const raw = sessionStorage.getItem(CHAT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeChatDraft(JSON.parse(raw) as ChatDraftState);
  } catch {
    return null;
  }
}

function saveChatDraft(draft: ChatDraftState): void {
  try {
    sessionStorage.setItem(CHAT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore storage quota / privacy mode */
  }
}

export default function Chat({ mini = false }: ChatProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const initialDraftRef = useRef<ChatDraftState | null>(null);
  if (initialDraftRef.current === null) {
    const explicitNewChat = new URLSearchParams(location.search).get("new") === "1";
    initialDraftRef.current = !explicitNewChat && typeof window !== "undefined" ? loadChatDraft() : null;
  }
  const initialDraft = initialDraftRef.current;
  const [repoPath, setRepoPath] = useState(
    initialDraft?.repoPath ?? (typeof window !== "undefined" ? (localStorage.getItem("chat_repo") ?? "") : ""),
  );
  const [input, setInput] = useState(initialDraft?.input ?? "");
  const [bubbles, setBubbles] = useState<Bubble[]>(initialDraft?.bubbles ?? []);
  const [sessionId, setSessionId] = useState<string | null>(initialDraft?.sessionId ?? null);
  const [busy, setBusy] = useState(false);
  const [queuedSuggestion, setQueuedSuggestion] = useState<SuggestionReply | null>(null);
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedExternalArtifact, setSelectedExternalArtifact] = useState<ConversationArtifactPart | null>(null);
  const [artifactLookupState, setArtifactLookupState] = useState<Record<string, ArtifactLookupState>>({});
  const [persistedPrInsightArtifactIds, setPersistedPrInsightArtifactIds] = useState<Set<string>>(() => new Set());
  const [historyWidth, setHistoryWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(300);
  const historyDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const rightDragRef   = useRef<{ startX: number; startW: number } | null>(null);
  // ref to the workspace div so drag handlers can read its live width
  const workspaceRef   = useRef<HTMLDivElement>(null);

  /** Middle panel must never be squeezed below this px — guards drag handlers and auto-collapse */
  const MIDDLE_MIN = 420;
  const RIGHT_MIN = 280;
  const HANDLE_GAP = 8; // px reserved for the two drag handle elements

  const startHistoryDrag = useCallback((startX: number) => {
    historyDragRef.current = { startX, startW: historyWidth };
    const onMove = (e: MouseEvent) => {
      if (!historyDragRef.current) return;
      const workspaceW = workspaceRef.current?.clientWidth ?? 900;
      const otherPanel = rightPanelOpen ? rightWidth : 0;
      // Maximum history width = whatever is left after reserving middle min + other panel + handles
      const maxHistory = Math.max(160, workspaceW - otherPanel - MIDDLE_MIN - HANDLE_GAP);
      const delta = e.clientX - historyDragRef.current.startX;
      setHistoryWidth(Math.max(160, Math.min(Math.min(400, maxHistory), historyDragRef.current.startW + delta)));
    };
    const onUp = () => {
      historyDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [historyWidth, rightPanelOpen, rightWidth]);

  const startRightDrag = useCallback((startX: number) => {
    rightDragRef.current = { startX, startW: rightWidth };
    const onMove = (e: MouseEvent) => {
      if (!rightDragRef.current) return;
      const workspaceW = workspaceRef.current?.clientWidth ?? 900;
      const otherPanel = historyOpen ? historyWidth : 0;
      const maxRight = Math.max(RIGHT_MIN, workspaceW - otherPanel - MIDDLE_MIN - HANDLE_GAP);
      const delta = e.clientX - rightDragRef.current.startX;
      setRightWidth(Math.max(RIGHT_MIN, Math.min(Math.min(420, maxRight), rightDragRef.current.startW - delta)));
    };
    const onUp = () => {
      rightDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rightWidth, historyOpen, historyWidth]);
  const [statusText, setStatusText] = useState<string | null>(initialDraft?.statusText ?? null);
  const [workflowState, setWorkflowState] = useState<WorkflowEventState | null>(initialDraft?.workflowState ?? null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState<string | null>(initialDraft?.customTitle ?? null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    () => initialDraft?.activeProfileId ?? (loadStoredActiveProjectLinkId() || null),
  );
  const [customModel, setCustomModel] = useState<CustomConversationModel>(readCustomConversationModel);
  const [activeModel, setActiveModel] = useState<ConversationModelChoice>(readInitialConversationModelChoice);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<ChatIndexStatus | null>(null);
  // Project Links come from global AppDataContext — loaded once on app start, no per-mount fetch.
  // The underlying storage type is still WorkspaceProfile until the model is migrated.
  const { profiles: availableProfiles, createProfile: createProjectLink } = useAppData();
  const cancelRef = useRef<(() => void) | null>(null);
  const artifactLookupRequestRef = useRef(0);
  const uiStreamAvailableRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const openPrInsightSourceInActivity = useCallback((source: { artifactId: string }) => {
    sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify(buildActivityPrInsightHandoffDraft({
      artifactId: source.artifactId,
    })));
    navigate("/activity");
  }, [navigate]);

  const useProjectLink = useCallback((profile: WorkspaceProfile) => {
    setActiveProfileId(profile.id);
    if (profile.repoPath) setRepoPath(profile.repoPath);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const queuePrompt = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const activeProfile = useMemo(
    () => availableProfiles.find((profile) => profile.id === activeProfileId) ?? null,
    [availableProfiles, activeProfileId],
  );
  const artifactParts = useMemo(() => collectConversationArtifacts(bubbles), [bubbles]);
  const selectedArtifact = useMemo(
    () => (
      artifactParts.find((artifact) => artifact.artifactId === selectedArtifactId)
      ?? (selectedExternalArtifact?.artifactId === selectedArtifactId ? selectedExternalArtifact : null)
    ),
    [artifactParts, selectedArtifactId, selectedExternalArtifact],
  );
  const selectedArtifactLookupState = selectedArtifactId ? artifactLookupState[selectedArtifactId] ?? null : null;

  useEffect(() => {
    if (selectedArtifactId && !selectedArtifact) setSelectedArtifactId(null);
  }, [selectedArtifact, selectedArtifactId]);

  useEffect(() => {
    if (availableProfiles.length === 0) return;
    setActiveProfileId((current) => resolveActiveProjectLinkId(availableProfiles, current) || null);
  }, [availableProfiles]);

  const selectArtifact = useCallback((artifact: ConversationArtifactPart) => {
    setSelectedExternalArtifact(null);
    setSelectedArtifactId(artifact.artifactId);
    setPersistedPrInsightArtifactIds((current) => {
      if (!current.has(artifact.artifactId)) return current;
      const next = new Set(current);
      next.delete(artifact.artifactId);
      return next;
    });
    if (!mini) setRightPanelOpen(true);
  }, [mini]);

  const openPrInsightSourceInWorkspace = useCallback((source: SavedPrInsightSource) => {
    const artifact: ConversationArtifactPart = {
      type: "artifact",
      artifactId: source.artifactId,
      title: prInsightArtifactTitle(source),
      artifactType: "markdown",
      status: "ready",
    };
    setSelectedExternalArtifact(artifact);
    setSelectedArtifactId(source.artifactId);
    setPersistedPrInsightArtifactIds((current) => new Set(current).add(source.artifactId));
    if (!mini) setRightPanelOpen(true);
  }, [mini]);

  useEffect(() => {
    if (!selectedArtifact || selectedArtifact.content?.trim() || !selectedArtifactId) return;
    if (!persistedPrInsightArtifactIds.has(selectedArtifactId)) return;
    const artifactId = selectedArtifact.artifactId;
    const current = artifactLookupState[artifactId];
    if (current?.status === "loading" || current?.status === "loaded") return;
    if (!activeProfileId) {
      const message = "Select a Project Link before loading saved PR insight artifacts.";
      if (current?.status === "error" && current.message === message) return;
      setArtifactLookupState((state) => ({
        ...state,
        [artifactId]: { status: "error", message },
      }));
      return;
    }

    const requestId = artifactLookupRequestRef.current + 1;
    artifactLookupRequestRef.current = requestId;
    setArtifactLookupState((state) => ({
      ...state,
      [artifactId]: { status: "loading" },
    }));
    void fetchProfilePrInsightArtifactById(activeProfileId, artifactId)
      .then((record) => {
        if (artifactLookupRequestRef.current !== requestId) return;
        setArtifactLookupState((state) => ({
          ...state,
          [artifactId]: { status: "loaded", record },
        }));
      })
      .catch((error: unknown) => {
        if (artifactLookupRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : String(error);
        setArtifactLookupState((state) => ({
          ...state,
          [artifactId]: { status: "error", message },
        }));
      });
    return () => {
      if (artifactLookupRequestRef.current === requestId) artifactLookupRequestRef.current += 1;
    };
  }, [activeProfileId, persistedPrInsightArtifactIds, selectedArtifact, selectedArtifactId]);

  const refreshModelChoices = useCallback(() => {
    const next = readCustomConversationModel();
    setCustomModel(next);
    setActiveModel((current) => (current === "custom" && !next.available ? "built_in" : current));
  }, []);

  useEffect(() => {
    refreshModelChoices();
    const onFocus = () => refreshModelChoices();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "dev_agent_settings" || event.key === "dev_agent_active_model") refreshModelChoices();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshModelChoices]);

  useEffect(() => {
    localStorage.setItem("dev_agent_active_model", activeModel === "custom" ? "custom" : "built_in");
  }, [activeModel]);

  const loadIndexStatus = useCallback(async () => {
    const repo = repoPath.trim();
    if (!repo) {
      setIndexStatus(null);
      return;
    }
    try {
      const status = await fetchChatIndexStatus(repo, activeProfileId ?? undefined);
      setIndexStatus(status);
    } catch {
      setIndexStatus(null);
    }
  }, [repoPath, activeProfileId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadIndexStatus();
    }, 350);
    return () => clearTimeout(timeout);
  }, [loadIndexStatus]);

  useEffect(() => {
    const raw = sessionStorage.getItem(CHAT_HANDOFF_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CHAT_HANDOFF_KEY);
    try {
      const draft = JSON.parse(raw) as ChatHandoffDraft;
      const message = typeof draft.message === "string" ? draft.message.trim() : "";
      if (!message) return;
      setSessionId(null);
      setBubbles([]);
      setWorkflowState(null);
      setCustomTitle(null);
      setInput(message);
      if (typeof draft.repoPath === "string" && draft.repoPath.trim()) {
        setRepoPath(draft.repoPath.trim());
      }
      if (typeof draft.profileId === "string" && draft.profileId.trim()) {
        setActiveProfileId(draft.profileId.trim());
      }
      setStatusText("Rollback proposal loaded");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch {
      /* ignore malformed handoff payloads */
    }
  }, []);

  // ── Auto-expand the Tauri window when opening panels would clip content ───
  useEffect(() => {
    if (mini) return;

    // Left sidebar ~192px (w-48) + open panels + 4px drag handles + MIDDLE_MIN + buffer
    const required =
      192 +
      (historyOpen   ? historyWidth + 4 : 0) +
      MIDDLE_MIN +
      (rightPanelOpen ? rightWidth  + 4 : 0) +
      32;

    if (window.innerWidth >= required) return; // already wide enough

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize }      = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        // window.innerHeight is already the logical CSS height of the content area.
        // setSize(LogicalSize) also operates on the logical inner area, so this
        // correctly expands only the width while keeping the height unchanged.
        await win.setSize(new LogicalSize(required, window.innerHeight));
      } catch (err) {
        console.warn("[auto-expand]", err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mini, historyOpen, rightPanelOpen, historyWidth, rightWidth]);

  // ── Auto-collapse panels when workspace is too narrow ─────────────────────
  useEffect(() => {
    if (mini) return;
    const checkFit = () => {
      const w = workspaceRef.current?.clientWidth ?? 0;
      if (w === 0) return;
      // Collapse right first (less critical), then history
      setRightPanelOpen((wasOpen) => {
        if (wasOpen && w - rightWidth - (historyOpen ? historyWidth : 0) < MIDDLE_MIN) return false;
        return wasOpen;
      });
      setHistoryOpen((wasOpen) => {
        if (wasOpen && w - historyWidth < MIDDLE_MIN) return false;
        return wasOpen;
      });
    };
    const ro = new ResizeObserver(checkFit);
    if (workspaceRef.current) ro.observe(workspaceRef.current);
    checkFit(); // run once on mount / panel-state change
    return () => ro.disconnect();
  // historyWidth/rightWidth are stable between renders unless the user drags;
  // re-registering then is intentional so the observer uses fresh widths.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mini, historyWidth, rightWidth]);

  // Track whether user is near the bottom so we don't hijack scroll when browsing history
  const atBottomRef = useRef(true);
  // Signal that new content was streamed/added (not just a toggle)
  const shouldScrollRef = useRef(false);

  const scrollToBottomIfNeeded = useCallback(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const markIncomingContentScrollIntent = useCallback(() => {
    const shouldFollow = shouldFollowIncomingChatContent(readChatScrollMetrics(scrollContainerRef.current));
    atBottomRef.current = shouldFollow;
    shouldScrollRef.current = shouldFollow;
  }, []);

  const forceNextScrollToBottom = useCallback(() => {
    atBottomRef.current = true;
    shouldScrollRef.current = true;
  }, []);

  useEffect(() => {
    if (shouldScrollRef.current) {
      scrollToBottomIfNeeded();
      shouldScrollRef.current = false;
    }
  }, [bubbles, scrollToBottomIfNeeded]);

  const handleContainerScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    atBottomRef.current = isNearChatBottom(readChatScrollMetrics(el)!);
  }, []);

  useEffect(() => {
    if (!mini) {
      fetchChatHistory()
        .then(setHistory)
        .catch(() => undefined);
    }
  }, [mini]);

  // Project Links are managed globally by AppDataContext — no per-mount fetch needed here.

  useEffect(() => {
    saveStoredActiveProjectLinkId(activeProfileId);
  }, [activeProfileId]);

  // On mount: if there is an active Project Link but no saved repo path, restore
  // the repo path from that link so git tools have a valid cwd from the start.
  useEffect(() => {
    if (repoPath) return;
    if (!activeProfileId || availableProfiles.length === 0) return;
    const p = availableProfiles.find((pr) => pr.id === activeProfileId);
    if (p?.repoPath) setRepoPath(p.repoPath);
  // Run once when Project Links first become available; intentionally exclude repoPath
  // from deps to avoid a loop when the effect itself sets repoPath.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, availableProfiles]);

  useEffect(() => {
    localStorage.setItem("chat_repo", repoPath);
  }, [repoPath]);

  // Derived: current branch from the most recent git_current_branch / git_status tool result
  const currentBranch = useMemo(() => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      if (b.kind === "tool" && b.toolOk && b.toolResult && typeof b.toolResult === "object") {
        const r = b.toolResult as Record<string, unknown>;
        if (b.toolName === "git_current_branch") {
          return String(r["branch"] ?? String(r["stdout"] ?? "").trim().split("\n")[0]).trim().slice(0, 45);
        }
        if (b.toolName === "git_status") {
          const m = String(r["stdout"] ?? "").match(/^## ([^\s.]+)/m);
          if (m?.[1]) return m[1].slice(0, 45);
        }
      }
    }
    return null;
  }, [bubbles]);

  const gitStatus = useMemo(() => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      if (b.kind === "tool" && b.toolOk && b.toolName === "git_status" && b.toolResult) {
        const stdout = String((b.toolResult as Record<string, unknown>)["stdout"] ?? "");
        return parseGitStatus(stdout);
      }
    }
    return null;
  }, [bubbles]);

  // Derived: group consecutive tool bubbles and attach a following approval.
  const renderItems = useMemo((): ChatRenderItem<Bubble>[] => groupChatRenderItems(bubbles), [bubbles]);

  const suggestionReplies = useMemo(() => {
    const lastAssistant = [...bubbles].reverse().find((bubble) => bubble.kind === "assistant");
    const lastUser = [...bubbles].reverse().find((bubble) => bubble.kind === "user");
    const lastError = [...bubbles].reverse().find((bubble) => bubble.kind === "error");
    const pendingTool =
      workflowState?.pendingApproval?.action.tool ??
      [...bubbles].reverse().find((bubble) => bubble.kind === "pending_confirm" && bubble.pendingStatus === "waiting")?.pendingTool;
    const sourceTypes = Array.from(new Set((lastAssistant?.meta?.sources ?? []).map((source) => source.type)));
    return deriveSuggestionReplies({
      metadataSuggestions: lastAssistant?.meta?.suggestions,
      metadataActions: lastAssistant?.meta?.actionsTaken,
      sourceTypes,
      lastAssistantText: lastAssistant?.text,
      lastUserText: lastUser?.text,
      workflowStatus: workflowState?.status,
      workflowKind: workflowState?.workflowKind,
      workflowPhase: workflowState?.workflowPhase,
      pendingTool,
      pendingApprovalTool: workflowState?.pendingApproval?.action.tool,
      pendingApprovalDescription: workflowState?.pendingApproval?.action.description,
      hasAuthError: Boolean(lastError?.text && /\b(auth|oauth|pat|token|credential|sign in|permission)\b/i.test(lastError.text)),
      inputValue: input,
      busy,
    });
  }, [bubbles, busy, input, workflowState]);

  const composerPendingApproval = useMemo(
    () => (
      workflowState?.pendingApproval
      ?? [...bubbles].reverse().find((bubble) => bubble.kind === "pending_confirm" && bubble.pendingStatus === "waiting")
      ?? null
    ),
    [bubbles, workflowState?.pendingApproval],
  );

  const commandChips = useMemo(() => {
    return deriveCommandChips({
      hasRepoPath: Boolean(repoPath.trim()),
      hasAdoLink: Boolean(activeProfile?.adoProject && activeProfile?.adoRepoName),
      inputValue: input,
      pendingApproval: Boolean(composerPendingApproval),
    });
  }, [activeProfile?.adoProject, activeProfile?.adoRepoName, composerPendingApproval, input, repoPath]);

  const commandChipsDisabled = useMemo(
    () => Boolean(composerPendingApproval),
    [composerPendingApproval],
  );

  const composerStateNotice = useMemo(() => deriveComposerStateNotice({
    busy,
    workflowStatus: workflowState?.status,
    pendingApproval: Boolean(composerPendingApproval),
    pendingApprovalDescription:
      composerPendingApproval && "action" in composerPendingApproval
        ? composerPendingApproval.action.description
        : composerPendingApproval?.pendingDescription,
    queuedLabel: queuedSuggestion?.label,
    statusText,
  }), [busy, composerPendingApproval, queuedSuggestion?.label, statusText, workflowState?.status]);

  const composerInputState = useMemo(() => deriveComposerInputState({
    busy,
    workflowStatus: workflowState?.status,
    pendingApproval: Boolean(composerPendingApproval),
    inputValue: input,
  }), [busy, composerPendingApproval, input, workflowState?.status]);

  useEffect(() => {
    if (busy || commandChipsDisabled) setModelMenuOpen(false);
  }, [busy, commandChipsDisabled]);

  // Derived: conversation title from first user message
  const conversationTitle = useMemo(() => {
    const first = bubbles.find((b) => b.kind === "user");
    if (!first?.text) return null;
    const t = first.text.trim();
    return t.length > 55 ? t.slice(0, 55) + "…" : t;
  }, [bubbles]);

  // Derived: branch list from latest git_branch_list tool result
  const branchList = useMemo(() => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      if (b.kind === "tool" && b.toolOk && b.toolName === "git_branch_list" && b.toolResult) {
        const stdout = String((b.toolResult as Record<string, unknown>)["stdout"] ?? "");
        return stdout.split("\n").filter(Boolean).map((l) => l.replace(/^\*\s*/, "").trim()).filter(Boolean);
      }
    }
    return [] as string[];
  }, [bubbles]);

  const diffStats = useMemo((): DiffStats | null => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      if (b.kind === "tool" && b.toolOk && b.toolName === "git_diff" && b.toolResult) {
        const stdout = String((b.toolResult as Record<string, unknown>)["stdout"] ?? "");
        const files = parseGitDiff(stdout);
        if (files.length === 0) return { files: 0, added: 0, removed: 0 };
        return {
          files: files.length,
          added: files.reduce((sum, file) => sum + file.added, 0),
          removed: files.reduce((sum, file) => sum + file.removed, 0),
        };
      }
    }
    return null;
  }, [bubbles]);

  const welcomeSuggestions = useMemo(() => {
    const hasAdoMapping = Boolean(activeProfile?.adoOrgUrl && activeProfile.adoProject && activeProfile.adoRepoName);
    const hasPipeline = Boolean(activeProfile?.adoPipelineId || activeProfile?.adoPipelineName);
    const needsProjectUnderstanding = indexStatus ? (!indexStatus.indexed || !indexStatus.semanticReady) : false;
    const suggestions = [
      needsProjectUnderstanding ? "Understand this project" : "Explain this project architecture",
      "Review my changes",
      "What's on this branch?",
      hasAdoMapping ? "Analyze PR insight for this repo" : "Run tests",
      hasPipeline ? "Check the CI/CD pipeline state" : "Find the build and test commands",
      "Stage and commit",
      hasAdoMapping ? "Push and create PR" : "Prepare a PR plan",
    ];
    return Array.from(new Set(suggestions)).slice(0, 7);
  }, [activeProfile, indexStatus]);

  // Dynamic workflow task state for the right-side panel. The daemon owns this
  // state; the UI no longer infers a fixed Git-to-PR checklist from bubbles.
  const taskState = useMemo(
    () => taskStateFromWorkflow(workflowState, conversationTitle),
    [workflowState, conversationTitle],
  );

  const addBubble = useCallback((bubble: Bubble, options?: { forceScroll?: boolean }) => {
    if (options?.forceScroll) forceNextScrollToBottom();
    else markIncomingContentScrollIntent();
    setBubbles((prev) => [...prev, bubble]);
  }, [forceNextScrollToBottom, markIncomingContentScrollIntent]);

  const addErrorBubbleOnce = useCallback((message: string) => {
    const text = message || "Unknown error";
    markIncomingContentScrollIntent();
    setBubbles((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "error" && last.text === text) return prev;
      return [...prev, { id: uid(), kind: "error", text }];
    });
  }, [markIncomingContentScrollIntent]);

  /** Add the clean assistant response; approvals are rendered from structured events. */
  const finaliseWithResponse = useCallback((
    cleanText: string,
    meta?: Bubble["meta"],
    streamedText?: string,
  ) => {
    markIncomingContentScrollIntent();
    setBubbles((prev) => {
      return finaliseAssistantResponseBubbles(
        prev,
        cleanText,
        meta,
        streamedText,
        (text, bubbleMeta) => ({
          id: uid(),
          kind: "assistant",
          text,
          parts: conversationPartsFromAssistantBubble({ text, meta: bubbleMeta }),
          streaming: false,
          meta: bubbleMeta,
        }),
      );
    });
  }, [markIncomingContentScrollIntent]);

  const showApprovalRequest = useCallback((approval: ApprovalRequest) => {
    markIncomingContentScrollIntent();
    setBubbles((prev) => {
      const alreadyWaiting = prev.some(
        (b) =>
          b.kind === "pending_confirm" &&
          b.pendingStatus === "waiting" &&
          b.pendingTool === approval.action.tool,
      );
      if (alreadyWaiting) return prev;
      return [
        ...prev,
        {
          id: uid(),
          kind: "pending_confirm",
          pendingTool: approval.action.tool,
          pendingArgs: approval.action.args,
          pendingDescription: approval.explanation || approval.action.description,
          pendingNextHint: approval.action.nextHint,
          pendingWorkflow: approval.action.workflow,
          pendingReadiness: approval.action.readiness,
          pendingPreflight: approval.action.preflight,
          pendingStatus: "waiting",
          parts: [
            toolApprovalPartFromSnapshot({
              approvalId: approval.id,
              toolName: approval.action.tool,
              description: approval.explanation || approval.action.description,
              args: approval.action.args,
              riskLevel: approval.riskLevel,
            }),
          ],
        },
      ];
    });
  }, [markIncomingContentScrollIntent]);

  const stopStreaming = useCallback(() => {
    setBubbles((prev) => {
      const reversedIdx = [...prev].reverse().findIndex((bubble) => bubble.kind === "assistant" && bubble.streaming);
      if (reversedIdx !== -1) {
        const realIdx = prev.length - 1 - reversedIdx;
        const bubble = prev[realIdx];
        if (!bubble || bubble.kind !== "assistant") return prev;
        const streamedText = bubble.text?.trim() || conversationTextFromParts(bubble.parts).trim();
        if (streamedText) {
          return prev.map((item, index) =>
            index === realIdx ? { ...bubble, text: bubble.text || streamedText, streaming: false } : item,
          );
        }
        return prev.filter((_, index) => index !== realIdx);
      }
      return prev;
    });
  }, []);

  const appendAssistantDelta = useCallback((delta: string) => {
    if (!delta) return;
    markIncomingContentScrollIntent();
    setBubbles((prev) => {
      const reversedIdx = [...prev].reverse().findIndex((bubble) => bubble.kind === "assistant" && bubble.streaming);
      if (reversedIdx !== -1) {
        const realIdx = prev.length - 1 - reversedIdx;
        return prev.map((bubble, index) => {
          if (index !== realIdx || bubble.kind !== "assistant") return bubble;
          return {
            ...bubble,
            text: `${bubble.text ?? ""}${delta}`,
            parts: appendTextDeltaToConversationParts(bubble.parts, delta),
          };
        });
      }
      return [
        ...prev,
        {
          id: uid(),
          kind: "assistant",
          text: delta,
          parts: appendTextDeltaToConversationParts(undefined, delta),
          streaming: true,
        },
      ];
    });
  }, [markIncomingContentScrollIntent]);

  const upsertToolBubble = useCallback((
    snapshot: ToolCallPartSnapshot,
    options: {
      ok?: boolean;
      result?: unknown;
      open?: boolean;
      liveOutput?: string;
    } = {},
  ) => {
    if (!snapshot.toolName) return;
    markIncomingContentScrollIntent();
    setBubbles((prev) => {
      const existingIndex = prev.findIndex(
        (b) =>
          b.kind === "tool" &&
          (b.toolCallId === snapshot.toolCallId ||
            (!b.toolCallId && b.toolName === snapshot.toolName && b.toolOk === undefined)),
      );
      const nextPart = toolCallPartFromSnapshot(snapshot);
      if (existingIndex === -1) {
        return [
          ...prev,
          {
            id: uid(),
            kind: "tool",
            toolCallId: snapshot.toolCallId,
            toolName: snapshot.toolName,
            toolArgs: snapshot.input && typeof snapshot.input === "object"
              ? (snapshot.input as Record<string, unknown>)
              : undefined,
            toolOk: options.ok,
            toolSummary: snapshot.summary,
            toolResult: options.result ?? snapshot.output,
            toolOpen: options.open ?? false,
            toolLiveOutput: options.liveOutput,
            parts: [nextPart],
          },
        ];
      }

      return prev.map((b, i) => {
        if (i !== existingIndex) return b;
        return {
          ...b,
          toolCallId: snapshot.toolCallId,
          toolName: snapshot.toolName,
          toolArgs: snapshot.input && typeof snapshot.input === "object"
            ? (snapshot.input as Record<string, unknown>)
            : b.toolArgs,
          toolOk: options.ok ?? b.toolOk,
          toolSummary: snapshot.summary ?? b.toolSummary,
          toolResult: options.result ?? snapshot.output ?? b.toolResult,
          toolOpen: options.open ?? b.toolOpen,
          toolLiveOutput: options.liveOutput ?? b.toolLiveOutput,
          parts: upsertToolCallPart(b.parts, snapshot),
        };
      });
    });
  }, [markIncomingContentScrollIntent]);

  const appendToolOutputDelta = useCallback((toolName: string | undefined, stream: "stdout" | "stderr" | undefined, delta: string | undefined, toolCallId?: string) => {
    if (!toolName || !delta) return;
    markIncomingContentScrollIntent();
    const prefix = stream === "stderr" ? "[stderr] " : "";
    setBubbles((prev) => {
      const idx = [...prev].reverse().findIndex(
        (b) =>
          b.kind === "tool" &&
          (toolCallId ? b.toolCallId === toolCallId : b.toolName === toolName) &&
          b.toolOk === undefined,
      );
      if (idx === -1 && toolCallId) {
        return [
          ...prev,
          {
            id: uid(),
            kind: "tool",
            toolCallId,
            toolName,
            toolOpen: true,
            toolLiveOutput: `${prefix}${delta}`.slice(-12000),
            parts: appendToolOutputDeltaToConversationParts(
              undefined,
              { toolCallId, toolName },
              stream,
              delta,
            ),
          },
        ];
      }
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((b, i) => {
        if (i !== realIdx) return b;
        const resolvedToolCallId = b.toolCallId ?? toolCallId ?? makeToolCallId(toolName);
        return {
          ...b,
          toolCallId: resolvedToolCallId,
          toolLiveOutput: `${b.toolLiveOutput ?? ""}${prefix}${delta}`.slice(-12000),
          toolOpen: true,
          parts: appendToolOutputDeltaToConversationParts(
            b.parts,
            {
              toolCallId: resolvedToolCallId,
              toolName,
              input: b.toolArgs,
              summary: b.toolSummary,
            },
            stream,
            delta,
          ),
        };
      });
    });
  }, [markIncomingContentScrollIntent]);

  const mergeAssistantMetadata = useCallback((metadata: unknown) => {
    const meta = assistantBubbleMetaFromUnknown(metadata);
    if (!meta) return;
    markIncomingContentScrollIntent();
    setBubbles((prev) => mergeAssistantMetadataIntoLatestBubble(prev, meta));
  }, [markIncomingContentScrollIntent]);

  const handleUiChunk = useCallback((chunk?: ChatUiChunk) => {
    if (!chunk) return;
    uiStreamAvailableRef.current = true;
    switch (chunk.type) {
      case "start":
        setStatusText("Thinking");
        break;

      case "text-start":
        setStatusText(null);
        break;

      case "text-delta":
        setStatusText(null);
        appendAssistantDelta(chunk.delta);
        break;

      case "text-end":
        stopStreaming();
        break;

      case "progress":
        setStatusText(chunk.message || "Working");
        break;

      case "finish":
        stopStreaming();
        uiStreamAvailableRef.current = false;
        setBusy(false);
        setStatusText(null);
        cancelRef.current = null;
        break;

      case "error":
        stopStreaming();
        uiStreamAvailableRef.current = false;
        addErrorBubbleOnce(chunk.errorText || "Unknown error");
        setBusy(false);
        setStatusText(null);
        cancelRef.current = null;
        break;

      case "tool-input-start":
        upsertToolBubble({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "input-streaming",
        });
        break;

      case "tool-input-available":
        upsertToolBubble({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "input-available",
          input: chunk.input,
        });
        break;

      case "tool-output-available":
        upsertToolBubble({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "result",
          output: chunk.output,
          summary: chunk.summary,
        }, {
          ok: true,
          result: chunk.output,
          open: false,
        });
        break;

      case "tool-output-error":
        upsertToolBubble({
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          state: "error",
          output: { error: chunk.errorText },
          summary: chunk.summary,
        }, {
          ok: false,
          result: { error: chunk.errorText },
          open: true,
        });
        break;

      case "approval-required":
      case "approval-resolved":
      case "workflow-updated":
        break;

      case "metadata-available":
        mergeAssistantMetadata(chunk.metadata);
        break;

      case "tool-output-delta":
        appendToolOutputDelta(chunk.toolName, chunk.stream, chunk.delta, chunk.toolCallId);
        break;
    }
  }, [addErrorBubbleOnce, appendAssistantDelta, appendToolOutputDelta, mergeAssistantMetadata, stopStreaming, upsertToolBubble]);

  const toggleTool = useCallback((id: string) => {
    setBubbles((prev) =>
      prev.map((b) => (b.id === id ? { ...b, toolOpen: !b.toolOpen } : b)),
    );
  }, []);

  const resolveConfirm = useCallback(
    async (bubbleId: string, confirmed: boolean) => {
      setBubbles((prev) =>
        prev.map((b) => (b.id === bubbleId ? { ...b, confirmed } : b)),
      );
      if (!sessionId) return;
      if (confirmed) {
        await confirmPlan(sessionId);
      } else {
        await cancelPlan(sessionId);
      }
    },
    [sessionId],
  );

  // ── Core streaming turn ────────────────────────────────────────────────────

  const sendMessage = useCallback((msg: string, options?: { silent?: boolean }) => {
    if (!msg || busy) return;
    setBusy(true);
    setStatusText("Planning");
    if (!options?.silent) {
      addBubble({ id: uid(), kind: "user", text: msg }, { forceScroll: true });
    }

    const repo = repoPath || ".";
    const resolvedModelChoice = activeModel === "custom" && customModel.available ? "custom" : "built_in";
    if (activeModel === "custom" && !customModel.available) {
      setStatusText("Custom model is no longer configured, using built-in model.");
    }

    let resolvedSessionId = sessionId;
    uiStreamAvailableRef.current = false;

    const { cancel } = chatStream(
      msg,
      repo,
      sessionId,
      (ev: ChatEventPayload) => {
        switch (ev.type) {
        case "ui.chunk":
          handleUiChunk(ev.uiChunk);
          break;

        case "session":
          if (ev.sessionId) {
            resolvedSessionId = ev.sessionId;
            setSessionId(ev.sessionId);
          }
          break;

        case "assistant_delta":
          if (uiStreamAvailableRef.current) break;
          setStatusText(null);
          appendAssistantDelta(ev.delta ?? "");
          break;

        case "progress":
          if (uiStreamAvailableRef.current) break;
          stopStreaming();
          setStatusText(ev.message ?? "Working");
          break;

        case "tool_start":
          setStatusText(`Running ${ev.name}`);
          stopStreaming();
          {
            const toolName = ev.name ?? "unknown";
            const toolCallId = ev.toolCallId ?? makeToolCallId(toolName, ev.args);
            upsertToolBubble({
              toolCallId,
              toolName,
              state: "input-available",
              input: ev.args,
            });
          }
          break;

        case "tool_output_delta":
        case "tool.output.delta":
          if (!uiStreamAvailableRef.current) {
            appendToolOutputDelta(ev.name, ev.stream, ev.delta, ev.toolCallId);
          }
          break;

        case "tool_end":
          setBubbles((prev) => {
            const idx = [...prev].reverse().findIndex(
              (b) => b.kind === "tool" && b.toolName === ev.name && b.toolOk === undefined,
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            return prev.map((b, i) => {
              if (i !== realIdx) return b;
              const toolName = b.toolName ?? ev.name ?? "unknown";
              const toolCallId = ev.toolCallId ?? b.toolCallId ?? makeToolCallId(toolName, b.toolArgs);
              return {
                ...b,
                toolCallId,
                toolOk: ev.ok,
                toolSummary: ev.summary,
                toolResult: ev.toolResult,
                toolOpen: false,
                parts: upsertToolCallPart(b.parts, {
                  toolCallId,
                  toolName,
                  state: toolPartStateFromResult(ev.ok),
                  input: b.toolArgs,
                  output: ev.toolResult,
                  summary: ev.summary,
                }),
              };
            });
          });
          setStatusText("Processing");
          break;

        case "confirm_required": {
          stopStreaming();
          const confirmId = uid();
          addBubble({
            id: confirmId, kind: "confirm", riskLevel: ev.riskLevel, plan: ev.plan,
            sessionId: resolvedSessionId ?? undefined, confirmed: null,
          });
          setStatusText("Waiting for confirmation");
          break;
        }

        case "workflow_state":
          setWorkflowState(ev.state ?? null);
          if (ev.state?.pendingApproval) showApprovalRequest(ev.state.pendingApproval);
          if (ev.state?.status === "waiting_for_approval") setStatusText("Waiting for approval");
          else if (ev.state?.status === "running") setStatusText("Executing");
          else if (ev.state?.status === "planning") setStatusText("Planning");
          break;

        case "approval_required":
          if (ev.approval) {
            setWorkflowState((prev) => ({
              status: "waiting_for_approval",
              currentStep: ev.approval?.action.description ?? "Waiting for approval",
              completedTools: prev?.completedTools ?? [],
              pendingApproval: ev.approval,
            }));
            showApprovalRequest(ev.approval);
          }
          setStatusText("Waiting for approval");
          break;

        case "approval_resolved":
          setWorkflowState((prev) =>
            prev
              ? {
                  ...prev,
                  status: ev.approved ? "running" : "done",
                  currentStep: ev.approved ? "Executing approved action" : "Approval cancelled",
                  pendingApproval: undefined,
                }
              : prev,
          );
          setStatusText(ev.approved ? "Approval accepted" : "Approval cancelled");
          break;

        case "executing":
          addBubble({ id: uid(), kind: "system", text: "Executing actions..." });
          setStatusText("Executing");
          break;

        case "message":
          if (uiStreamAvailableRef.current) break;
          if (ev.text) { stopStreaming(); addBubble({ id: uid(), kind: "assistant", text: ev.text }); }
          break;

        case "done": {
          // Mark any in-progress pending_confirm as done
          setBubbles((prev) =>
            prev.map((b) =>
              b.kind === "pending_confirm" && b.pendingStatus === "executing"
                ? { ...b, pendingStatus: "done" }
                : b,
            ),
          );
          const meta: Bubble["meta"] = ev.result
            ? {
                riskLevel: ev.result.riskLevel,
                finalizationMode: ev.result.finalizationMode,
                actionsTaken: ev.result.actionsTaken,
                suggestions: ev.result.suggestions,
                sources: ev.result.sources,
                artifacts: ev.result.artifacts,
              }
            : undefined;
          const cleanText = ev.result?.response?.trim() ?? "";
          finaliseWithResponse(
            cleanText,
            meta,
            ev.result?.streamedResponse ?? (uiStreamAvailableRef.current ? cleanText : undefined),
          );
          uiStreamAvailableRef.current = false;
          setBusy(false);
          setStatusText(null);
          cancelRef.current = null;
          if (!mini) fetchChatHistory().then(setHistory).catch(() => undefined);
          break;
        }

        case "cancelled":
          stopStreaming();
          uiStreamAvailableRef.current = false;
          addBubble({ id: uid(), kind: "system", text: "Action cancelled." });
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;

        case "error":
          stopStreaming();
          uiStreamAvailableRef.current = false;
          addErrorBubbleOnce(ev.message ?? "Unknown error");
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;
      }
      },
      activeProfileId ?? undefined,
      resolvedModelChoice,
    );
    cancelRef.current = cancel;
  }, [
    busy,
    customModel.available,
    sessionId,
    repoPath,
    activeProfileId,
    activeModel,
    addBubble,
    addErrorBubbleOnce,
    stopStreaming,
    appendAssistantDelta,
    appendToolOutputDelta,
    upsertToolBubble,
    handleUiChunk,
    finaliseWithResponse,
    showApprovalRequest,
    mini,
  ]);

  const send = useCallback(() => {
    const msg = input.trim();
    if (composerInputState.sendDisabled) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    sendMessage(msg);
  }, [composerInputState.sendDisabled, input, sendMessage]);

  // Pending-action card confirm / cancel
  const confirmPendingAction = useCallback((bubbleId: string) => {
    if (!sessionId || busy) return;
    // Mark the card as executing (not cancelled, not waiting)
    setBubbles((prev) => prev.map((b) => b.id === bubbleId ? { ...b, pendingStatus: "executing" } : b));
    setBusy(true);
    setStatusText("Executing");
    uiStreamAvailableRef.current = false;

    // Dispatch structured confirm — does NOT send a chat message
    const { cancel } = apiConfirmAction(sessionId, (ev: ChatEventPayload) => {
      switch (ev.type) {
        case "ui.chunk":
          handleUiChunk(ev.uiChunk);
          break;

        case "assistant_delta":
          if (uiStreamAvailableRef.current) break;
          setStatusText(null);
          appendAssistantDelta(ev.delta ?? "");
          break;

        case "progress":
          if (uiStreamAvailableRef.current) break;
          stopStreaming();
          setStatusText(ev.message ?? "Working");
          break;

        case "tool_start":
          setStatusText(`Running ${ev.name}`);
          stopStreaming();
          {
            const toolName = ev.name ?? "unknown";
            const toolCallId = ev.toolCallId ?? makeToolCallId(toolName, ev.args);
            upsertToolBubble({
              toolCallId,
              toolName,
              state: "input-available",
              input: ev.args,
            });
          }
          break;

        case "tool_output_delta":
        case "tool.output.delta":
          if (!uiStreamAvailableRef.current) {
            appendToolOutputDelta(ev.name, ev.stream, ev.delta, ev.toolCallId);
          }
          break;

        case "tool_end":
          setBubbles((prev) => {
            const idx = [...prev].reverse().findIndex(
              (b) => b.kind === "tool" && b.toolName === ev.name && b.toolOk === undefined,
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            return prev.map((b, i) => {
              if (i !== realIdx) return b;
              const toolName = b.toolName ?? ev.name ?? "unknown";
              const toolCallId = ev.toolCallId ?? b.toolCallId ?? makeToolCallId(toolName, b.toolArgs);
              return {
                ...b,
                toolCallId,
                toolOk: ev.ok,
                toolSummary: ev.summary,
                toolResult: ev.toolResult,
                toolOpen: false,
                parts: upsertToolCallPart(b.parts, {
                  toolCallId,
                  toolName,
                  state: toolPartStateFromResult(ev.ok),
                  input: b.toolArgs,
                  output: ev.toolResult,
                  summary: ev.summary,
                }),
              };
            });
          });
          // Mark the confirmation card as done once the tool finishes
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId && b.pendingStatus === "executing" ? { ...b, pendingStatus: "done" } : b,
          ));
          setStatusText("Processing");
          break;

        case "workflow_state":
          setWorkflowState(ev.state ?? null);
          if (ev.state?.pendingApproval) showApprovalRequest(ev.state.pendingApproval);
          if (ev.state?.status === "running") setStatusText("Executing");
          else if (ev.state?.status === "waiting_for_approval") setStatusText("Waiting for approval");
          else if (ev.state?.status === "planning") setStatusText("Planning");
          break;

        case "approval_required":
          if (ev.approval) {
            setWorkflowState((prev) => ({
              status: "waiting_for_approval",
              currentStep: ev.approval?.action.description ?? "Waiting for approval",
              completedTools: prev?.completedTools ?? [],
              pendingApproval: ev.approval,
            }));
            showApprovalRequest(ev.approval);
          }
          setStatusText("Waiting for approval");
          break;

        case "approval_resolved":
          setWorkflowState((prev) =>
            prev
              ? {
                  ...prev,
                  status: ev.approved ? "running" : "done",
                  currentStep: ev.approved ? "Executing approved action" : "Approval cancelled",
                  pendingApproval: undefined,
                }
              : prev,
          );
          setStatusText(ev.approved ? "Approval accepted" : "Approval cancelled");
          break;

        case "done": {
          // Mark any still-executing pending_confirm as done
          setBubbles((prev) =>
            prev.map((b) =>
              b.kind === "pending_confirm" && b.pendingStatus === "executing"
                ? { ...b, pendingStatus: "done" }
                : b,
            ),
          );
          const meta: Bubble["meta"] = ev.result
            ? {
                riskLevel: ev.result.riskLevel,
                finalizationMode: ev.result.finalizationMode,
                actionsTaken: ev.result.actionsTaken,
                suggestions: ev.result.suggestions,
                sources: ev.result.sources,
                artifacts: ev.result.artifacts,
              }
            : undefined;
          const cleanText = ev.result?.response?.trim() ?? "";
          finaliseWithResponse(
            cleanText,
            meta,
            ev.result?.streamedResponse ?? (uiStreamAvailableRef.current ? cleanText : undefined),
          );
          uiStreamAvailableRef.current = false;
          setBusy(false);
          setStatusText(null);
          cancelRef.current = null;
          if (!mini) fetchChatHistory().then(setHistory).catch(() => undefined);
          break;
        }

        case "message":
          if (uiStreamAvailableRef.current) break;
          if (ev.text) { stopStreaming(); addBubble({ id: uid(), kind: "assistant", text: ev.text }); }
          break;

        case "cancelled":
          stopStreaming();
          uiStreamAvailableRef.current = false;
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b,
          ));
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;

        case "error":
          stopStreaming();
          uiStreamAvailableRef.current = false;
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b,
          ));
          addErrorBubbleOnce(ev.message ?? "Unknown error");
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;
      }
    });
    cancelRef.current = cancel;
  }, [sessionId, busy, addBubble, addErrorBubbleOnce, stopStreaming, appendAssistantDelta, appendToolOutputDelta, upsertToolBubble, handleUiChunk, finaliseWithResponse, showApprovalRequest, mini]);

  const cancelPendingAction = useCallback((bubbleId: string) => {
    setBubbles((prev) => prev.map((b) => b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b));
    // Send explicit cancel message so backend clears the approval proposal state.
    sendMessage("no");
  }, [sendMessage]);

  const runWorkspaceAction = useCallback(async (action: WorkspaceAction) => {
    const candidateTools = workspaceActionToolCandidates(action);
    const matchingPendingBubble = [...bubbles].reverse().find(
      (bubble) =>
        bubble.kind === "pending_confirm" &&
        (bubble.pendingStatus ?? "waiting") === "waiting" &&
        bubble.pendingTool &&
        candidateTools.includes(bubble.pendingTool),
    );

    if (matchingPendingBubble) {
      if (busy) {
        setStatusText("Current workflow is still updating the approval state.");
        return;
      }
      confirmPendingAction(matchingPendingBubble.id);
      return;
    }

    const pendingApproval = workflowState?.pendingApproval;
    if (pendingApproval) {
      if (workspaceActionMatchesApproval(action, pendingApproval)) {
        setStatusText(`Waiting for approval: ${pendingApproval.action.description}`);
      } else {
        setStatusText(`Finish current approval first: ${pendingApproval.action.description}`);
      }
      return;
    }

    if (busy || workflowState?.status === "planning" || workflowState?.status === "running") {
      setStatusText(statusText ? `Workflow already active: ${statusText}` : "Workflow already active");
      return;
    }

    if (workflowState?.status === "blocked") {
      setStatusText(`Workflow blocked: ${workflowState.currentStep}`);
      return;
    }

    if (!repoPath.trim()) return;

    const directWorkflow = workspaceActionToDirectWorkflow(action);
    setBusy(true);
    setStatusText("Inspecting workspace");
    try {
      const result = await runChatWorkflowAction(directWorkflow.action, repoPath, activeProfileId, {
        sessionId,
        ...directWorkflow.input,
      });
      if (result.sessionId) setSessionId(result.sessionId);
      setWorkflowState(workflowStateWithActionSummary(result.workflowState ?? null, result.summary));
      const workflowArtifacts = workflowActionArtifactsFromResult(result.artifacts);
      const resultBubbleMeta: AssistantBubbleMeta | undefined = workflowArtifacts.length
        ? { artifacts: workflowArtifacts }
        : undefined;
      const resultBubble: Bubble = workflowArtifacts.length
        ? {
            id: uid(),
            kind: result.ok ? "assistant" as const : "error" as const,
            text: result.summary,
            meta: resultBubbleMeta,
            parts: conversationPartsFromAssistantBubble({ text: result.summary, meta: resultBubbleMeta }),
          }
        : {
            id: uid(),
            kind: result.ok ? "system" as const : "error" as const,
            text: result.summary,
          };
      setBubbles((prev) => [
        ...prev,
        ...result.tools.map((tool) => {
          const toolCallId = makeToolCallId(tool.name);
          const toolArgs = { command: tool.command };
          const toolResult = {
            stdout: tool.stdout,
            stderr: tool.stderr,
            returncode: tool.returncode,
          };
          const toolSummary = tool.ok ? tool.stdout.trim().split(/\r?\n/)[0] || "ok" : tool.stderr || "failed";
          return {
            id: uid(),
            kind: "tool" as const,
            toolCallId,
            toolName: tool.name,
            toolArgs,
            toolOk: tool.ok,
            toolSummary,
            toolResult,
            toolOpen: false,
            parts: [
              toolCallPartFromSnapshot({
                toolCallId,
                toolName: tool.name,
                state: toolPartStateFromResult(tool.ok),
                input: toolArgs,
                output: toolResult,
                summary: toolSummary,
              }),
            ],
          };
        }),
        resultBubble,
      ]);
      if (result.workflowState?.pendingApproval) {
        showApprovalRequest(result.workflowState.pendingApproval);
      }
    } catch (err) {
      addBubble({ id: uid(), kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setStatusText(null);
    }
  }, [activeProfileId, addBubble, bubbles, busy, confirmPendingAction, repoPath, sessionId, showApprovalRequest, statusText, workflowState]);

  const handleSuggestionReply = useCallback((suggestion: SuggestionReply) => {
    if (shouldQueueSuggestionReply({ busy, workflowStatus: workflowState?.status })) {
      setQueuedSuggestion(suggestion);
      setStatusText(`Queued follow-up: ${suggestion.label}`);
      return;
    }
    const action = workspaceActionFromSuggestion(suggestion);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(suggestion.message);
  }, [busy, queuePrompt, runWorkspaceAction, workflowState?.status]);

  useEffect(() => {
    if (!queuedSuggestion) return;
    if (shouldQueueSuggestionReply({ busy, workflowStatus: workflowState?.status })) return;
    const next = queuedSuggestion;
    setQueuedSuggestion(null);
    const action = workspaceActionFromSuggestion(next);
    if (action) {
      void runWorkspaceAction(action);
      return;
    }
    queuePrompt(next.message);
    setStatusText(null);
  }, [busy, queuePrompt, queuedSuggestion, runWorkspaceAction, workflowState?.status]);


  const loadSession = useCallback(async (sid: string) => {
    try {
      const [stored, state] = await Promise.all([
        fetchChatMessages(sid) as Promise<Array<{
        role: string;
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
        sources?: AssistantBubbleMeta["sources"];
        artifacts?: AssistantBubbleMeta["artifacts"];
        }>>,
        fetchChatState(sid).catch(() => ({ workflowState: undefined })),
      ]);
      setSessionId(sid);
      forceNextScrollToBottom();
      setBubbles(
        stored.map((m) => {
          const base = { id: uid(), timestamp: m.timestamp };
          if (m.role === "user") {
            return { ...base, kind: "user" as const, text: m.content };
          }
          if (m.role === "tool") {
            const toolName = m.toolName ?? "unknown";
            const toolCallId = makeToolCallId(toolName);
            return {
              ...base,
              kind: "tool" as const,
              toolCallId,
              toolName,
              toolArgs: m.toolArgs,
              toolOk: m.toolOk,
              toolSummary: m.toolSummary,
              toolResult: m.toolResult,
              toolOpen: false,
              parts: [
                toolCallPartFromSnapshot({
                  toolCallId,
                  toolName,
                  state: toolPartStateFromResult(m.toolOk),
                  input: m.toolArgs,
                  output: m.toolResult,
                  summary: m.toolSummary,
                }),
              ],
            };
          }
          if (m.role === "system") {
            return { ...base, kind: "system" as const, text: m.content };
          }
          if (m.role === "error") {
            return { ...base, kind: "error" as const, text: m.content };
          }
          // assistant — content is the clean natural-language response
          const meta: Bubble["meta"] = (m.riskLevel || m.finalizationMode || m.actionsTaken || m.suggestions || m.sources || m.artifacts)
            ? {
                riskLevel: m.riskLevel,
                finalizationMode: m.finalizationMode,
                actionsTaken: m.actionsTaken,
                suggestions: m.suggestions,
                sources: m.sources,
                artifacts: m.artifacts,
              }
            : undefined;
          return {
            ...base,
            kind: "assistant" as const,
            text: m.content,
            parts: conversationPartsFromAssistantBubble({ text: m.content, meta }),
            meta,
          };
        }),
      );
      setWorkflowState(state.workflowState ?? null);
      // Restore approval card bubble if the session was waiting for user approval
      if (state.workflowState?.pendingApproval) {
        showApprovalRequest(state.workflowState.pendingApproval);
      }
      setHistoryOpen(false);
    } catch {
      /* ignore */
    }
  }, [forceNextScrollToBottom, showApprovalRequest]);

  const newChat = useCallback(() => {
    try {
      sessionStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSessionId(null);
    setBubbles([]);
    cancelRef.current?.();
    setBusy(false);
    setStatusText(null);
    setWorkflowState(null);
    setCustomTitle(null);
    setTitleEditing(false);
  }, []);

  useEffect(() => {
    if (mini) return;
    saveChatDraft({
      repoPath,
      input,
      bubbles,
      sessionId,
      statusText,
      workflowState,
      customTitle,
      activeProfileId,
    });
  }, [activeProfileId, bubbles, customTitle, input, mini, repoPath, sessionId, statusText, workflowState]);

  useEffect(() => {
    if (mini) return;
    const params = new URLSearchParams(location.search);
    if (params.get("new") !== "1") return;
    newChat();
    navigate("/chat", { replace: true });
  }, [location.search, mini, navigate, newChat]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 ${mini ? "h-full rounded-xl" : "flex-1 min-w-0 h-full"}`}>

      {/* ── Full-width top bar — zones mirror the three panel columns ─────── */}
      {!mini ? (
        <ConversationTopBar
          historyOpen={historyOpen}
          historyWidth={historyWidth}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          rightPanelOpen={rightPanelOpen}
          rightWidth={rightWidth}
          onToggleRight={() => setRightPanelOpen((v) => !v)}
          titleEditing={titleEditing}
          customTitle={customTitle}
          conversationTitle={conversationTitle}
          titleInputRef={titleInputRef}
          onStartTitleEdit={() => { setTitleEditing(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
          onConfirmTitle={(v) => { setCustomTitle(v.trim() || null); setTitleEditing(false); }}
          onCancelTitle={() => setTitleEditing(false)}
        />
      ) : (
        /* Mini mode: simple title strip */
        <div className="flex shrink-0 items-center border-b border-zinc-800/80 px-3 min-h-[36px]">
          <span className="truncate text-xs text-zinc-500 flex-1">
            {customTitle ?? conversationTitle ?? "Chat"}
          </span>
        </div>
      )}

      {/* ── Flex workspace: [history] [drag] [middle] [drag] [right] ───────── */}
      <div ref={workspaceRef} className={mini ? "flex flex-col flex-1 overflow-hidden" : "chat-workspace"}>

        {/* ── History panel (col 1) ────────────────────────────────────────── */}
        {!mini && (
          <>
            <aside
              className="history-panel"
              style={{
                width: historyOpen ? historyWidth : 0,
                opacity: historyOpen ? 1 : 0,
                pointerEvents: historyOpen ? "auto" : "none",
              }}
            >
              <p className="shrink-0 px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                History
              </p>
              {history.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-700">No sessions yet.</p>
              )}
              {history.map((h) => (
                <button
                  key={h.sessionId}
                  onClick={() => void loadSession(h.sessionId)}
                  className="px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
                >
                  <p className="truncate">{h.preview || "(empty)"}</p>
                  <p className="text-zinc-600 text-[10px]">
                    {new Date(h.createdAt * 1000).toLocaleString()}
                  </p>
                </button>
              ))}
            </aside>

            {/* Drag handle — history/middle boundary */}
            {historyOpen && (
              <div
                className="panel-resize-handle"
                onMouseDown={(e) => { e.preventDefault(); startHistoryDrag(e.clientX); }}
              />
            )}
          </>
        )}


        {/* ── Col 2: Middle panel — header + messages + input ──────────────── */}
        <div className={mini ? "flex flex-col flex-1 overflow-hidden" : "middle-panel"}>
          <div className={mini ? "flex flex-col flex-1 overflow-hidden" : "middle-panel-inner"}>

            {/* Message list */}
            <div
              ref={scrollContainerRef}
              data-testid="chat-message-panel"
              onScroll={handleContainerScroll}
              className="message-panel px-4 py-4 flex flex-col"
            >
          {bubbles.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 w-full px-8">

              {/* ── Project Link gate ─────────────────────────────────────── */}
              {availableProfiles.length === 0 ? (
                <ProjectLinkSetupCard
                  repoPath={repoPath}
                  createProjectLink={createProjectLink}
                  onCreated={useProjectLink}
                />
              ) : (
                /* Project Links exist — show selector if none active */
                !activeProfileId ? (
                  <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p className="text-xs font-semibold text-zinc-400">Choose a Project Link for this chat</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {availableProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => useProjectLink(p)}
                          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left hover:border-zinc-700 hover:bg-zinc-800/60 transition group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">{p.name}</p>
                            {p.repoPath && (
                              <p className="text-xs text-zinc-600 font-mono truncate">{p.repoPath}</p>
                            )}
                          </div>
                          <svg className="h-3.5 w-3.5 shrink-0 text-zinc-700 group-hover:text-zinc-400 transition ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    <details className="pt-0.5">
                      <summary className="cursor-pointer text-xs text-zinc-600 transition hover:text-zinc-400">
                        + New Project Link
                      </summary>
                      <div className="mt-3">
                        <ProjectLinkSetupCard
                          repoPath={repoPath}
                          createProjectLink={createProjectLink}
                          onCreated={useProjectLink}
                        />
                      </div>
                    </details>
                  </div>
                ) : (
                  /* Project Link selected — show the normal welcome + suggestions */
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
                      <svg className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-medium text-zinc-400">Ask MergePilot anything</p>
                      <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
                        "help me review changes and go all the way to PR"<br />
                        "what's changed since main?" &nbsp;·&nbsp; "run tests" &nbsp;·&nbsp; "create PR"
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 max-w-md">
                      {welcomeSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            const action = workspaceActionFromWelcomeSuggestion(suggestion);
                            if (action) void runWorkspaceAction(action);
                            else queuePrompt(suggestion);
                          }}
                          className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                )
              )}

            </div>
          )}

          {renderItems.map((item) => {
            if (item.kind === "tool-group") {
              return (
                <div key={item.key} className="mb-3">
                  <ExecutionLog
                    tools={item.tools}
                    approval={item.approval}
                    onToggleTool={toggleTool}
                    onConfirmApproval={confirmPendingAction}
                    onCancelApproval={cancelPendingAction}
                  />
                </div>
              );
            }

            const b = item.bubble;

            if (b.kind === "user") {
              return (
                <div key={b.id} className="mb-3 flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[rgb(var(--app-accent))] px-4 py-2.5 text-sm text-white shadow-md ring-1 ring-[rgb(var(--app-accent))]/25">
                    {b.text}
                  </div>
                </div>
              );
            }

            if (b.kind === "assistant") {
              return (
                <div key={b.id} className="mb-3 flex justify-start">
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--app-border))]/70 bg-[rgb(var(--app-surface))] px-4 py-2.5 text-sm text-[rgb(var(--app-text))] shadow-sm">
                      <ConversationPartRenderer
                        parts={conversationPartsFromAssistantBubble(b)}
                        streaming={b.streaming}
                        typingIndicator={<ThinkingDots />}
                        selectedArtifactId={selectedArtifactId}
                        onArtifactSelect={selectArtifact}
                      />
                    </div>
                    {b.meta && (
                      <MetaPanel
                        meta={b.meta}
                        onOpenPrInsightSource={openPrInsightSourceInActivity}
                        onOpenPrInsightWorkspace={openPrInsightSourceInWorkspace}
                      />
                    )}
                  </div>
                </div>
              );
            }

            if (b.kind === "confirm") {
              return (
                <div key={b.id} className="mb-3">
                  <ConfirmCard
                    bubble={b}
                    onConfirm={() => void resolveConfirm(b.id, true)}
                    onCancel={() => void resolveConfirm(b.id, false)}
                  />
                </div>
              );
            }

            if (b.kind === "pending_confirm") {
              return (
                <div key={b.id} className="mb-3">
                  <PendingActionCard
                    bubble={b}
                    onConfirm={() => confirmPendingAction(b.id)}
                    onCancel={() => cancelPendingAction(b.id)}
                  />
                </div>
              );
            }

            if (b.kind === "system") {
              return (
                <div key={b.id} className="mb-2 flex items-center justify-center gap-1">
                  <span className="h-px w-8 bg-[rgb(var(--app-border))]" />
                  <span className="text-xs text-[rgb(var(--app-text-subtle))]">{b.text}</span>
                  <span className="h-px w-8 bg-[rgb(var(--app-border))]" />
                </div>
              );
            }

            if (b.kind === "error") {
              return (
                <div
                  key={b.id}
                  className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300"
                >
                  {b.text}
                </div>
              );
            }

            return null;
          })}

          {/* Status bar shown while busy and no streaming bubble */}
          {busy && statusText && !bubbles.some((b) => b.kind === "assistant" && b.streaming) && (
            <div className="mb-2 flex items-center gap-2 pl-1">
              <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--app-border))]/70 bg-[rgb(var(--app-surface-raised))] px-4 py-2.5 text-sm text-[rgb(var(--app-text-muted))]">
                {statusText}
                <ThinkingDots />
              </div>
            </div>
          )}

              <div ref={bottomRef} />
            </div>{/* end message-panel */}

            {/* Input bar — scoped to middle column only */}
            <div className="input-panel border-t border-zinc-800/80 px-3 py-2">
              {/* Project Link context chip */}
              {!mini && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1 pb-1.5">
                  <div className="flex min-w-[180px] flex-1 items-center gap-1.5">
                    {availableProfiles.length > 0 ? (
                      <>
                        <svg className="h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <select
                          className="min-w-0 flex-1 cursor-pointer bg-transparent text-[11px] text-zinc-500 transition hover:text-zinc-300 focus:outline-none"
                          value={activeProfileId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            setActiveProfileId(id || null);
                            const p = availableProfiles.find((pr) => pr.id === id);
                            if (p?.repoPath) setRepoPath(p.repoPath);
                          }}
                        >
                          <option value="">No Project Link selected</option>
                          {availableProfiles.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <span className="text-[11px] text-zinc-700">No Project Link yet — create one above</span>
                    )}
                  </div>
                </div>
              )}
              {composerStateNotice && (
                <div
                  className={`mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${composerNoticeClass(composerStateNotice.tone)}`}
                  aria-live="polite"
                  data-composer-notice={composerStateNotice.tone}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${composerNoticeDotClass(composerStateNotice.tone)}`} aria-hidden="true" />
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{composerStateNotice.label}:</span>{" "}
                      <span className="text-[rgb(var(--app-text))]">{composerStateNotice.detail}</span>
                    </span>
                  </span>
                  {composerStateNotice.tone === "queued" && (
                    <button
                      type="button"
                      onClick={() => {
                        setQueuedSuggestion(null);
                        setStatusText(null);
                      }}
                      className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              <CommandChipBar commands={commandChips} onPick={handleSuggestionReply} disabled={commandChipsDisabled} />
              <SuggestionReplyBar
                suggestions={suggestionReplies}
                onPick={handleSuggestionReply}
                state={{
                  busy,
                  workflowStatus: workflowState?.status,
                  queuedSuggestionId: queuedSuggestion?.id,
                  blocked: workflowState?.status === "blocked",
                  blockedReason: workflowState?.currentStep,
                }}
              />
              <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 shadow-sm transition focus-within:border-[rgb(var(--app-accent))]">
                <textarea
                  ref={textareaRef}
                  className="w-full resize-none bg-transparent text-sm text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
                  placeholder={composerInputState.placeholder}
                  title={composerInputState.inputTitle}
                  rows={1}
                  value={input}
                  disabled={composerInputState.inputDisabled}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="relative mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={composerInputState.controlsDisabled}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
                    title={composerInputState.controlsDisabled ? composerInputState.inputTitle : "Attach context"}
                  >
                    <span className="text-xl leading-none">+</span>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setModelMenuOpen((value) => !value)}
                      disabled={composerInputState.controlsDisabled}
                      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
                      title={composerInputState.controlsDisabled ? composerInputState.inputTitle : "Conversation model"}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M13 3L6 13h5l-1 8 7-11h-5l1-7z" />
                      </svg>
                      <span className="max-w-[190px] truncate">
                        {activeModel === "custom" && customModel.available ? customModel.label : "Built-in model"}
                      </span>
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {modelMenuOpen && (
                      <div className="absolute bottom-9 left-0 z-40 w-64 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 shadow-2xl">
                        <p className="px-2 pb-1.5 text-xs text-[rgb(var(--app-text-muted))]">Model</p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModel("built_in");
                            setModelMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                        >
                          <span>Built-in model</span>
                          {activeModel !== "custom" && <span className="text-[rgb(var(--app-text-muted))]">✓</span>}
                        </button>
                        {customModel.available && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveModel("custom");
                              setModelMenuOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                          >
                            <span className="min-w-0 truncate">{customModel.label}</span>
                            {activeModel === "custom" && <span className="ml-2 text-[rgb(var(--app-text-muted))]">✓</span>}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1" />
                  {busy ? (
                    <button
                      onClick={() => {
                        cancelRef.current?.();
                        cancelRef.current = null;
                        stopStreaming();
                        uiStreamAvailableRef.current = false;
                        setBusy(false);
                        setStatusText(null);
                      }}
                      className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:scale-95"
                    >
                      Stop
                    </button>
                  ) : (
                  <button
                    onClick={send}
                    disabled={composerInputState.sendDisabled}
                    title={composerInputState.sendTitle}
                    aria-label="Send message"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg className="h-4 w-4 translate-x-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h13m0 0-5-5m5 5-5 5" />
                    </svg>
                  </button>
                  )}
                </div>
              </div>
            </div>{/* end input-panel */}

          </div>{/* end middle-panel-inner */}
        </div>{/* end middle-panel */}


        {/* ── Right context panel (col 3) ──────────────────────────────────── */}
        {!mini && (
          <>
            {/* Drag handle — middle/right boundary */}
            {rightPanelOpen && (
              <div
                className="panel-resize-handle"
                onMouseDown={(e) => { e.preventDefault(); startRightDrag(e.clientX); }}
              />
            )}

            <aside
              className="right-panel"
              style={{
                width: rightPanelOpen ? rightWidth : 0,
                opacity: rightPanelOpen ? 1 : 0,
                pointerEvents: rightPanelOpen ? "auto" : "none",
              }}
            >
              <WorkspacePanel
                repoPath={repoPath}
                setRepoPath={setRepoPath}
                currentBranch={currentBranch}
                branchList={branchList}
                gitStatus={gitStatus}
                diffStats={diffStats}
                taskState={taskState}
                workflowState={workflowState}
                busy={busy}
                profiles={availableProfiles}
                activeProfileId={activeProfileId}
                setActiveProfileId={setActiveProfileId}
                statusText={statusText}
                selectedArtifact={selectedArtifact}
                selectedArtifactLookupState={selectedArtifactLookupState}
                artifactCount={artifactParts.length}
                onClearArtifact={() => {
                  setSelectedArtifactId(null);
                  setSelectedExternalArtifact(null);
                }}
                onAction={runWorkspaceAction}
              />
            </aside>
          </>
        )}

      </div>{/* end chat-workspace flex */}
    </div>
  );
}
