import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  chatStream,
  confirmAction as apiConfirmAction,
  confirmPlan,
  cancelPlan,
  fetchChatHistory,
  fetchChatMessages,
  listProfiles,
  type ChatEventPayload,
  type ChatHistoryEntry,
  type WorkspaceProfile,
} from "../api.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type BubbleKind = "user" | "assistant" | "thinking" | "tool" | "confirm" | "pending_confirm" | "error" | "system";

interface Bubble {
  id: string;
  kind: BubbleKind;
  text?: string;
  streaming?: boolean;
  // thinking bubble (collapsible execution trace)
  thinkingOpen?: boolean;
  // tool
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  toolOpen?: boolean;
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
  pendingStatus?: "waiting" | "executing" | "done" | "cancelled";
  // metadata shown in collapsible Details panel
  meta?: {
    riskLevel?: string;
    actionsTaken?: string[];
    suggestions?: string[];
    timestamp?: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function riskColor(level = "low") {
  if (level === "high") return "text-red-400 bg-red-900/30";
  if (level === "medium") return "text-yellow-400 bg-yellow-900/30";
  return "text-green-400 bg-green-900/30";
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

function ThinkingTrace({ bubble, onToggle }: { bubble: Bubble; onToggle: () => void }) {
  const summary = bubble.text?.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "Thinking…";
  return (
    <div className="mb-1 flex justify-start">
      <div className="max-w-[85%]">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-400 transition-colors"
        >
          <span className="text-zinc-700">{bubble.thinkingOpen ? "▼" : "▶"}</span>
          <span className="font-mono text-zinc-500">Reasoning</span>
          {bubble.streaming ? (
            <ThinkingDots />
          ) : (
            <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-zinc-800 text-zinc-600">done</span>
          )}
          {!bubble.thinkingOpen && !bubble.streaming && (
            <span className="ml-1 truncate max-w-[200px] text-zinc-700 italic">{summary}</span>
          )}
        </button>
        {bubble.thinkingOpen && (
          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
            <pre className="whitespace-pre-wrap break-words text-[11px] text-zinc-600 font-mono">
              {bubble.text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/** Groups consecutive tool bubbles into a compact execution log. */
function ExecutionLog({ tools, onToggleTool }: { tools: Bubble[]; onToggleTool: (id: string) => void }) {
  const running = tools.some((t) => t.toolOk === undefined);
  const hasError = tools.some((t) => t.toolOk === false);
  const statusColor = hasError ? "text-red-400" : running ? "text-zinc-500" : "text-emerald-500";
  const statusLabel = running ? "running…" : hasError ? "error" : `${tools.length} step${tools.length > 1 ? "s" : ""}`;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-zinc-800/50 bg-zinc-900/25 text-xs">
      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-zinc-800/40 px-3 py-1 text-zinc-600">
        <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">Execution</span>
        <span className={`ml-1 ${statusColor}`}>{statusLabel}</span>
      </div>
      {/* Tool rows */}
      <div className="divide-y divide-zinc-800/30">
        {tools.map((tool) => {
          const pending = tool.toolOk === undefined;
          const summary = pending ? "" : toolCollapsedSummary(tool.toolName, tool.toolOk, tool.toolResult);
          const hasOutput = !!tool.toolResult && !pending;
          return (
            <div key={tool.id}>
              <button
                onClick={hasOutput ? () => onToggleTool(tool.id) : undefined}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
                  hasOutput ? "cursor-pointer hover:bg-zinc-800/30" : "cursor-default"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    pending
                      ? "bg-zinc-600 animate-pulse"
                      : tool.toolOk === false
                        ? "bg-red-500"
                        : "bg-emerald-500"
                  }`}
                />
                <span className="w-36 shrink-0 font-mono text-blue-400/80">{tool.toolName}</span>
                {!pending && summary && <span className="truncate text-zinc-600">{summary}</span>}
                {pending && <span className="italic text-zinc-700">running…</span>}
                {hasOutput && (
                  <span className="ml-auto shrink-0 text-zinc-700">{tool.toolOpen ? "▲" : "▼"}</span>
                )}
              </button>
              {tool.toolOpen && hasOutput && (
                <div className="border-t border-zinc-800/40 bg-zinc-900/60 px-3 py-2">
                  <ToolOutputRenderer toolName={tool.toolName} toolResult={tool.toolResult} />
                  <RawDebug label="Raw JSON" data={tool.toolResult} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RawDebug({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-zinc-700 hover:text-zinc-500">
        {open ? "▼" : "▶"} {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-28 overflow-y-auto rounded bg-zinc-900/80 p-1.5 text-[10px] font-mono text-zinc-600 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
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
      <div className="my-2 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm">
        <span className="text-zinc-400">Executing:</span>
        <span className="text-zinc-300">{bubble.pendingDescription}</span>
        <ThinkingDots />
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-600">
        <span className="text-emerald-600">[+]</span>
        <span>{bubble.pendingDescription}</span>
        <span className="ml-auto text-zinc-700">done</span>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="my-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-600">
        Skipped: {bubble.pendingDescription}
      </div>
    );
  }

  // waiting — show the action card
  return (
    <div className="my-2 rounded-xl border border-blue-700/40 bg-blue-950/20 p-3">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400/70">
        Action required
      </div>
      <p className="text-sm font-medium text-zinc-200">{bubble.pendingDescription}</p>
      {bubble.pendingTool && (
        <p className="mt-0.5 font-mono text-xs text-zinc-600">{bubble.pendingTool}</p>
      )}
      {bubble.pendingNextHint && (
        <p className="mt-1 text-xs text-zinc-600">
          <span className="text-zinc-500">Next: </span>{bubble.pendingNextHint}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onConfirm}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95 transition"
        >
          Confirm
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-700 px-4 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 active:scale-95 transition"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function MetaPanel({ meta }: { meta: NonNullable<Bubble["meta"]> }) {
  const [open, setOpen] = useState(false);
  const hasContent =
    (meta.riskLevel && meta.riskLevel !== "low") ||
    (meta.actionsTaken?.length ?? 0) > 0 ||
    (meta.suggestions?.length ?? 0) > 0;
  if (!hasContent) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>Details</span>
        {meta.riskLevel && meta.riskLevel !== "low" && (
          <span className={`ml-1 rounded px-1 text-[10px] font-medium ${riskColor(meta.riskLevel)}`}>
            {meta.riskLevel}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
          {meta.actionsTaken && meta.actionsTaken.length > 0 && (
            <div className="mb-1.5">
              <span className="font-semibold text-zinc-400">Actions taken</span>
              <ul className="mt-0.5 ml-2 space-y-0.5">
                {meta.actionsTaken.map((a, i) => <li key={i} className="text-zinc-500">- {a}</li>)}
              </ul>
            </div>
          )}
          {meta.suggestions && meta.suggestions.length > 0 && (
            <div>
              <span className="font-semibold text-zinc-400">Suggestions</span>
              <ul className="mt-0.5 ml-2 space-y-0.5">
                {meta.suggestions.map((s, i) => <li key={i} className="text-zinc-500">- {s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Workspace & Task Panel ───────────────────────────────────────────────────

interface WorkflowStep {
  label: string;
  tool: string | null;
  done: boolean;
  active: boolean;
}

interface TaskState {
  goal: string;
  steps: WorkflowStep[];
  currentStepLabel: string;
  risk?: string;
}

interface WorkspacePanelProps {
  repoPath: string;
  setRepoPath: (v: string) => void;
  currentBranch: string | null;
  branchList: string[];
  taskState: TaskState | null;
  busy: boolean;
  profiles: WorkspaceProfile[];
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

function WorkspacePanel({ repoPath, setRepoPath, currentBranch, branchList, taskState, busy, profiles, activeProfileId, setActiveProfileId }: WorkspacePanelProps) {
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";

  const handleBrowse = async () => {
    if (!("__TAURI__" in window)) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({ directory: true, multiple: false });
      if (result && typeof result === "string") setRepoPath(result);
    } catch { /* plugin not available */ }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  const handleProfileSelect = (id: string) => {
    setActiveProfileId(id || null);
    const p = profiles.find((pr) => pr.id === id);
    if (p) {
      if (p.repoPath) setRepoPath(p.repoPath);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950/40">

      {/* Current Task section — pinned to top when active */}
      {taskState && (
        <div className="p-3 space-y-2.5 border-b border-zinc-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Current Task</p>
          <p className="text-xs text-zinc-400 leading-snug line-clamp-2">{taskState.goal}</p>
          <div className="space-y-1.5">
            {taskState.steps.map((step, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${
                step.done ? "text-zinc-600" : step.active ? "text-zinc-200" : "text-zinc-700"
              }`}>
                {step.done ? (
                  <span className="shrink-0 text-emerald-600 text-[10px]">&#10003;</span>
                ) : step.active ? (
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${busy ? "animate-pulse bg-indigo-400" : "bg-amber-400"}`} />
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700" />
                )}
                <span className={step.done ? "line-through text-zinc-700" : step.active ? "font-medium" : ""}>{step.label}</span>
              </div>
            ))}
          </div>
          {taskState.risk && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-zinc-600">Risk</span>
              <span className={`rounded px-1 text-[10px] font-semibold ${
                taskState.risk === "high" ? "bg-red-900/40 text-red-400" :
                taskState.risk === "medium" ? "bg-amber-900/40 text-amber-400" :
                "bg-emerald-900/30 text-emerald-600"
              }`}>{taskState.risk}</span>
            </div>
          )}
        </div>
      )}

      {/* Context section */}
      <div className="p-3 space-y-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Context</p>

        {/* Profile selector */}
        {profiles.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-zinc-600">Profile</p>
            <select
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-700 focus:outline-none"
              value={activeProfileId ?? ""}
              onChange={(e) => handleProfileSelect(e.target.value)}
            >
              <option value="">-- none --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {activeProfile?.adoProject && (
              <p className="text-[10px] text-zinc-600 truncate pl-0.5">
                {activeProfile.adoProject} / {activeProfile.adoRepoName}
              </p>
            )}
          </div>
        )}

        {/* Repository */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-600">Repository</p>
          <div className="flex items-center gap-1">
            <input
              className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 placeholder-zinc-700 focus:border-zinc-700 focus:outline-none"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="Path to repository"
              title={repoPath}
            />
            <button
              onClick={() => void handleBrowse()}
              className="shrink-0 rounded-md border border-zinc-800 bg-zinc-900/60 p-1 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400 transition-colors"
              title="Browse for folder"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
          </div>
          {repoName && <p className="truncate text-[10px] text-zinc-700 pl-0.5">{repoName}</p>}
        </div>

        {/* Branch */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-600">Branch</p>
          {branchList.length > 1 ? (
            <select
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-700 focus:outline-none"
              value={currentBranch ?? ""}
              onChange={() => {/* branch switching — future implementation */}}
            >
              {branchList.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          ) : (
            <p className="truncate font-mono text-[11px] text-zinc-500">
              {currentBranch ?? <span className="text-zinc-700">not detected</span>}
            </p>
          )}
        </div>
      </div>

    </div>
  );
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

export default function Chat({ mini = false }: ChatProps) {
  const navigate = useNavigate();
  const [repoPath, setRepoPath] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("chat_repo") ?? "") : "",
  );
  const [input, setInput] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [historyWidth, setHistoryWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(240);
  const historyDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const rightDragRef   = useRef<{ startX: number; startW: number } | null>(null);
  // ref to the workspace div so drag handlers can read its live width
  const workspaceRef   = useRef<HTMLDivElement>(null);

  /** Middle panel must never be squeezed below this px — guards drag handlers and auto-collapse */
  const MIDDLE_MIN = 520;
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
      const maxRight = Math.max(180, workspaceW - otherPanel - MIDDLE_MIN - HANDLE_GAP);
      const delta = e.clientX - rightDragRef.current.startX;
      setRightWidth(Math.max(180, Math.min(Math.min(420, maxRight), rightDragRef.current.startW - delta)));
    };
    const onUp = () => {
      rightDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rightWidth, historyOpen, historyWidth]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    typeof window !== "undefined" ? (localStorage.getItem("chat_profile_id") ?? null) : null,
  );
  const [availableProfiles, setAvailableProfiles] = useState<WorkspaceProfile[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (shouldScrollRef.current) {
      scrollToBottomIfNeeded();
      shouldScrollRef.current = false;
    }
  }, [bubbles, scrollToBottomIfNeeded]);

  const handleContainerScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  }, []);

  useEffect(() => {
    if (!mini) {
      fetchChatHistory()
        .then(setHistory)
        .catch(() => undefined);
    }
  }, [mini]);

  useEffect(() => {
    if (!mini) {
      listProfiles()
        .then(setAvailableProfiles)
        .catch(() => undefined);
    }
  }, [mini]);

  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem("chat_profile_id", activeProfileId);
    } else {
      localStorage.removeItem("chat_profile_id");
    }
  }, [activeProfileId]);

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

  // Derived: group consecutive tool bubbles together for compact rendering
  type RenderItem =
    | { kind: "tool-group"; tools: Bubble[]; key: string }
    | { kind: "bubble"; bubble: Bubble };

  const renderItems = useMemo((): RenderItem[] => {
    const items: RenderItem[] = [];
    let i = 0;
    while (i < bubbles.length) {
      const b = bubbles[i]!;
      if (b.kind === "tool") {
        const group: Bubble[] = [b];
        while (i + 1 < bubbles.length && bubbles[i + 1]!.kind === "tool") {
          i++;
          group.push(bubbles[i]!);
        }
        items.push({ kind: "tool-group", tools: group, key: group[0]!.id });
      } else {
        items.push({ kind: "bubble", bubble: b });
      }
      i++;
    }
    return items;
  }, [bubbles]);

  // Derived: the most recent pending_confirm bubble that is still waiting
  const activePendingBubble = useMemo(() => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      if (b.kind === "pending_confirm" && b.pendingStatus === "waiting") return b;
    }
    return null;
  }, [bubbles]);

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

  // Derived workflow task state for the right-side panel
  const taskState = useMemo((): TaskState | null => {
    if (bubbles.length === 0) return null;
    // Only show panel when there are tool executions (i.e. an active workflow)
    const hasTools = bubbles.some((b) => b.kind === "tool");
    if (!hasTools) return null;

    const firstUserMsg = bubbles.find((b) => b.kind === "user")?.text ?? "";

    // Extract branch from git_current_branch result
    const branchBubble = [...bubbles].reverse().find(
      (b) => b.kind === "tool" && b.toolName === "git_current_branch",
    );
    const rawBranch = branchBubble?.toolResult;
    const branch = typeof rawBranch === "object" && rawBranch !== null && "stdout" in rawBranch
      ? String((rawBranch as Record<string, unknown>).stdout).trim()
      : typeof rawBranch === "string" ? rawBranch.trim() : undefined;

    // Extract risk from last assistant bubble meta
    const risk = [...bubbles].reverse().find((b) => b.meta?.riskLevel)?.meta?.riskLevel;

    // Active pending card
    const pending = activePendingBubble;

    // Derive step completion from executed tools
    const toolDone = (name: string) => bubbles.some((b) => b.kind === "tool" && b.toolName === name && b.toolOk === true);

    const STEPS: WorkflowStep[] = [
      { label: "Review changes",    tool: null,           done: hasTools, active: false },
      { label: "Stage files",       tool: "git_add",      done: toolDone("git_add"),      active: pending?.pendingTool === "git_add" },
      { label: "Commit",            tool: "git_commit",   done: toolDone("git_commit"),   active: pending?.pendingTool === "git_commit" },
      { label: "Push branch",       tool: "git_push",     done: toolDone("git_push"),     active: pending?.pendingTool === "git_push" },
      { label: "Create PR",         tool: "ado_create_pr",done: toolDone("ado_create_pr"),active: pending?.pendingTool === "ado_create_pr" },
    ];

    const activeStep = STEPS.find((s) => s.active);
    const currentStepLabel = activeStep ? `Waiting: ${activeStep.label}` : busy ? "Executing…" : "Thinking…";

    return { goal: firstUserMsg.slice(0, 80), steps: STEPS, currentStepLabel, risk };
  }, [bubbles, activePendingBubble, busy, repoPath]);

  const addBubble = useCallback((bubble: Bubble) => {
    shouldScrollRef.current = true;
    setBubbles((prev) => [...prev, bubble]);
  }, []);

  const updateStreamingBubble = useCallback((delta: string) => {
    shouldScrollRef.current = true;
    setBubbles((prev) => {
      const last = prev[prev.length - 1];
      // Stream into an existing thinking/assistant streaming bubble
      if ((last?.kind === "thinking" || last?.kind === "assistant") && last.streaming) {
        return [...prev.slice(0, -1), { ...last, kind: "thinking", text: (last.text ?? "") + delta }];
      }
      // Create a new thinking bubble (collapsed header by default, shows live content when open)
      return [...prev, { id: uid(), kind: "thinking", text: delta, streaming: true, thinkingOpen: false }];
    });
  }, []);

  /** Strip the structured JSON agent response from thinking text so it doesn't appear in the Reasoning card. */
  const stripAgentJson = (text: string): string => {
    // Remove any line (or trailing block) that looks like the agent's final JSON output
    return text
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (!t.startsWith("{")) return true;
        try {
          const parsed = JSON.parse(t) as Record<string, unknown>;
          return !(("response" in parsed) && ("risk_level" in parsed || "actions_taken" in parsed));
        } catch {
          return true;
        }
      })
      .join("\n")
      .trimEnd();
  };

  /**
   * Finalise the streaming thinking bubble, add the clean assistant response,
   * and optionally append a PendingActionCard.
   */
  const finaliseWithResponse = useCallback((
    cleanText: string,
    meta?: Bubble["meta"],
    pendingAction?: { tool: string; args: Record<string, unknown>; description: string; nextHint?: string },
  ) => {
    shouldScrollRef.current = true;
    setBubbles((prev) => {
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      const result: Bubble[] = [];

      // Finalise or discard the streaming thinking bubble (strip embedded JSON)
      if ((last?.kind === "thinking" || last?.kind === "assistant") && last.streaming) {
        const stripped = stripAgentJson(last.text ?? "").trim();
        if (stripped) {
          result.push(...prev.slice(0, lastIdx), { ...last, kind: "thinking", text: stripped, streaming: false, thinkingOpen: false });
        } else {
          result.push(...prev.slice(0, lastIdx)); // discard if nothing left after strip
        }
      } else {
        result.push(...prev); // keep everything as-is
      }

      // Clean assistant response
      if (cleanText) {
        result.push({ id: uid(), kind: "assistant", text: cleanText, streaming: false, meta });
      }

      // Pending action card
      if (pendingAction?.tool) {
        result.push({
          id: uid(),
          kind: "pending_confirm",
          pendingTool: pendingAction.tool,
          pendingArgs: pendingAction.args,
          pendingDescription: pendingAction.description,
          pendingNextHint: pendingAction.nextHint,
          pendingStatus: "waiting",
        });
      }

      return result;
    });
  }, []);

  const stopStreaming = useCallback(() => {
    setBubbles((prev) => {
      const last = prev[prev.length - 1];
      if ((last?.kind === "thinking" || last?.kind === "assistant") && last.streaming) {
        if (last.text?.trim()) {
          return [...prev.slice(0, -1), { ...last, kind: "thinking", streaming: false, thinkingOpen: false }];
        }
        return prev.slice(0, -1); // discard empty
      }
      return prev;
    });
  }, []);

  const toggleTool = useCallback((id: string) => {
    setBubbles((prev) =>
      prev.map((b) => (b.id === id ? { ...b, toolOpen: !b.toolOpen } : b)),
    );
  }, []);

  const toggleThinking = useCallback((id: string) => {
    setBubbles((prev) =>
      prev.map((b) => (b.id === id ? { ...b, thinkingOpen: !b.thinkingOpen } : b)),
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

  const sendMessage = useCallback((msg: string) => {
    if (!msg || busy) return;
    setBusy(true);
    setStatusText("Thinking");
    addBubble({ id: uid(), kind: "user", text: msg });

    const repo = repoPath || ".";
    let resolvedSessionId = sessionId;

    const { cancel } = chatStream(msg, repo, sessionId, (ev: ChatEventPayload) => {
      switch (ev.type) {
        case "session":
          if (ev.sessionId) {
            resolvedSessionId = ev.sessionId;
            setSessionId(ev.sessionId);
          }
          break;

        case "thinking":
          if (ev.delta) updateStreamingBubble(ev.delta);
          setStatusText("Thinking");
          break;

        case "tool_start":
          setStatusText(`Running ${ev.name}`);
          stopStreaming();
          addBubble({ id: uid(), kind: "tool", toolName: ev.name, toolArgs: ev.args, toolOpen: false });
          break;

        case "tool_end":
          setBubbles((prev) => {
            const idx = [...prev].reverse().findIndex(
              (b) => b.kind === "tool" && b.toolName === ev.name && b.toolOk === undefined,
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            return prev.map((b, i) =>
              i === realIdx
                ? { ...b, toolOk: ev.ok, toolSummary: ev.summary, toolResult: ev.toolResult, toolOpen: false }
                : b,
            );
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

        case "executing":
          addBubble({ id: uid(), kind: "system", text: "Executing actions..." });
          setStatusText("Executing");
          break;

        case "message":
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
            ? { riskLevel: ev.result.riskLevel, actionsTaken: ev.result.actionsTaken, suggestions: ev.result.suggestions }
            : undefined;
          const pa = ev.result?.pendingAction;
          finaliseWithResponse(ev.result?.response?.trim() ?? "", meta, pa);
          setBusy(false);
          setStatusText(null);
          cancelRef.current = null;
          if (!mini) fetchChatHistory().then(setHistory).catch(() => undefined);
          break;
        }

        case "cancelled":
          stopStreaming();
          addBubble({ id: uid(), kind: "system", text: "Action cancelled." });
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;

        case "error":
          stopStreaming();
          addBubble({ id: uid(), kind: "error", text: ev.message ?? "Unknown error" });
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;
      }
    }, activeProfileId ?? undefined);
    cancelRef.current = cancel;
  }, [busy, sessionId, repoPath, activeProfileId, addBubble, updateStreamingBubble, stopStreaming, finaliseWithResponse, mini]);

  const send = useCallback(() => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    sendMessage(msg);
  }, [input, busy, sendMessage]);

  // Pending-action card confirm / cancel
  const confirmPendingAction = useCallback((bubbleId: string) => {
    if (!sessionId || busy) return;
    // Mark the card as executing (not cancelled, not waiting)
    setBubbles((prev) => prev.map((b) => b.id === bubbleId ? { ...b, pendingStatus: "executing" } : b));
    setBusy(true);
    setStatusText("Executing");

    // Dispatch structured confirm — does NOT send a chat message
    const { cancel } = apiConfirmAction(sessionId, (ev: ChatEventPayload) => {
      switch (ev.type) {
        case "thinking":
          if (ev.delta) updateStreamingBubble(ev.delta);
          setStatusText("Thinking");
          break;

        case "tool_start":
          setStatusText(`Running ${ev.name}`);
          stopStreaming();
          addBubble({ id: uid(), kind: "tool", toolName: ev.name, toolArgs: ev.args, toolOpen: false });
          break;

        case "tool_end":
          setBubbles((prev) => {
            const idx = [...prev].reverse().findIndex(
              (b) => b.kind === "tool" && b.toolName === ev.name && b.toolOk === undefined,
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            return prev.map((b, i) =>
              i === realIdx
                ? { ...b, toolOk: ev.ok, toolSummary: ev.summary, toolResult: ev.toolResult, toolOpen: false }
                : b,
            );
          });
          // Mark the confirmation card as done once the tool finishes
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId && b.pendingStatus === "executing" ? { ...b, pendingStatus: "done" } : b,
          ));
          setStatusText("Processing");
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
            ? { riskLevel: ev.result.riskLevel, actionsTaken: ev.result.actionsTaken, suggestions: ev.result.suggestions }
            : undefined;
          const pa = ev.result?.pendingAction;
          finaliseWithResponse(ev.result?.response?.trim() ?? "", meta, pa);
          setBusy(false);
          setStatusText(null);
          cancelRef.current = null;
          if (!mini) fetchChatHistory().then(setHistory).catch(() => undefined);
          break;
        }

        case "message":
          if (ev.text) { stopStreaming(); addBubble({ id: uid(), kind: "assistant", text: ev.text }); }
          break;

        case "cancelled":
          stopStreaming();
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b,
          ));
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;

        case "error":
          stopStreaming();
          setBubbles((prev) => prev.map((b) =>
            b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b,
          ));
          addBubble({ id: uid(), kind: "error", text: ev.message ?? "Unknown error" });
          setBusy(false); setStatusText(null); cancelRef.current = null;
          break;
      }
    });
    cancelRef.current = cancel;
  }, [sessionId, busy, addBubble, updateStreamingBubble, stopStreaming, finaliseWithResponse, mini]);

  const cancelPendingAction = useCallback((bubbleId: string) => {
    setBubbles((prev) => prev.map((b) => b.id === bubbleId ? { ...b, pendingStatus: "cancelled" } : b));
    // Send explicit cancel message so backend clears the pending action state
    sendMessage("no");
  }, [sendMessage]);


  const loadSession = useCallback(async (sid: string) => {
    try {
      const stored = await fetchChatMessages(sid) as Array<{
        role: string;
        content: string;
        timestamp: number;
        toolName?: string;
        toolArgs?: Record<string, unknown>;
        toolOk?: boolean;
        toolSummary?: string;
        toolResult?: unknown;
        riskLevel?: string;
        actionsTaken?: string[];
        suggestions?: string[];
      }>;
      setSessionId(sid);
      atBottomRef.current = true;
      shouldScrollRef.current = true;
      setBubbles(
        stored.map((m) => {
          const base = { id: uid(), timestamp: m.timestamp };
          if (m.role === "user") {
            return { ...base, kind: "user" as const, text: m.content };
          }
          if (m.role === "tool") {
            return {
              ...base,
              kind: "tool" as const,
              toolName: m.toolName,
              toolArgs: m.toolArgs,
              toolOk: m.toolOk,
              toolSummary: m.toolSummary,
              toolResult: m.toolResult,
              toolOpen: false,
            };
          }
          if (m.role === "system") {
            return { ...base, kind: "system" as const, text: m.content };
          }
          if (m.role === "error") {
            return { ...base, kind: "error" as const, text: m.content };
          }
          // assistant — content is the clean natural-language response
          const meta: Bubble["meta"] = (m.riskLevel || m.actionsTaken || m.suggestions)
            ? { riskLevel: m.riskLevel, actionsTaken: m.actionsTaken, suggestions: m.suggestions }
            : undefined;
          return { ...base, kind: "assistant" as const, text: m.content, meta };
        }),
      );
      setHistoryOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const newChat = useCallback(() => {
    setSessionId(null);
    setBubbles([]);
    cancelRef.current?.();
    setBusy(false);
    setStatusText(null);
    setCustomTitle(null);
    setTitleEditing(false);
  }, []);

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
              onScroll={handleContainerScroll}
              className="message-panel px-4 py-4 flex flex-col"
            >
          {bubbles.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 w-full px-8">

              {/* ── Profile gate ─────────────────────────────────────────── */}
              {availableProfiles.length === 0 ? (
                /* No profiles at all — guide user to create one first */
                <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col items-center gap-3 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800">
                    <svg className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Set up a profile first</p>
                    <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
                      A profile stores your repo path, Azure DevOps connection, and pipeline settings.
                      It will be reused for all chats in the same project.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/profiles")}
                    className="mt-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition active:scale-95"
                  >
                    Create a profile
                  </button>
                </div>
              ) : (
                /* Profiles exist — show selector if none active */
                !activeProfileId ? (
                  <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p className="text-xs font-semibold text-zinc-400">Choose a profile for this chat</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {availableProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActiveProfileId(p.id);
                            if (p.repoPath) setRepoPath(p.repoPath);
                            setTimeout(() => textareaRef.current?.focus(), 0);
                          }}
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
                    <button
                      onClick={() => navigate("/profiles")}
                      className="text-xs text-zinc-600 hover:text-zinc-400 transition text-left pt-0.5"
                    >
                      + New profile
                    </button>
                  </div>
                ) : (
                  /* Profile selected — show the normal welcome + suggestions */
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
                      <svg className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-medium text-zinc-400">Ask Dev Agent anything</p>
                      <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
                        "help me review changes and go all the way to PR"<br />
                        "what's changed since main?" &nbsp;·&nbsp; "run tests" &nbsp;·&nbsp; "create PR"
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 max-w-md">
                      {[
                        "Review my changes",
                        "What's on this branch?",
                        "Stage and commit",
                        "Push and create PR",
                        "Run tests",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => { setInput(suggestion); setTimeout(() => textareaRef.current?.focus(), 0); }}
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
                <div key={item.key} className="mb-1">
                  <ExecutionLog tools={item.tools} onToggleTool={toggleTool} />
                </div>
              );
            }

            const b = item.bubble;

            if (b.kind === "user") {
              return (
                <div key={b.id} className="mb-3 flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600/80 px-4 py-2.5 text-sm text-white/95 shadow-md ring-1 ring-indigo-500/30">
                    {b.text}
                  </div>
                </div>
              );
            }

            if (b.kind === "thinking") {
              return (
                <div key={b.id} className="mb-1">
                  <ThinkingTrace bubble={b} onToggle={() => toggleThinking(b.id)} />
                </div>
              );
            }

            if (b.kind === "assistant") {
              return (
                <div key={b.id} className="mb-3 flex justify-start">
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-tl-sm bg-zinc-800/70 px-4 py-2.5 text-sm text-zinc-100 shadow-sm">
                      <span className="whitespace-pre-wrap">{b.text}</span>
                      {b.streaming && <ThinkingDots />}
                    </div>
                    {b.meta && <MetaPanel meta={b.meta} />}
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
                  <span className="h-px w-8 bg-zinc-800" />
                  <span className="text-xs text-zinc-600">{b.text}</span>
                  <span className="h-px w-8 bg-zinc-800" />
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
              <div className="rounded-2xl rounded-tl-sm bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-400">
                {statusText}
                <ThinkingDots />
              </div>
            </div>
          )}

              <div ref={bottomRef} />
            </div>{/* end message-panel */}

            {/* Input bar — scoped to middle column only */}
            <div className="input-panel border-t border-zinc-800/80 px-3 py-2">
              {/* Profile context chip */}
              {!mini && (
                <div className="flex items-center gap-1.5 px-1 pb-1.5">
                  {availableProfiles.length > 0 ? (
                    <>
                      <svg className="h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <select
                        className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-500 focus:outline-none cursor-pointer hover:text-zinc-300 transition"
                        value={activeProfileId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          setActiveProfileId(id || null);
                          const p = availableProfiles.find((pr) => pr.id === id);
                          if (p?.repoPath) setRepoPath(p.repoPath);
                        }}
                      >
                        <option value="">No profile selected</option>
                        {availableProfiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate("/profiles")}
                      className="text-[11px] text-zinc-700 hover:text-zinc-500 transition"
                    >
                      No profiles — create one
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 focus-within:border-zinc-600 transition">
                <textarea
                  ref={textareaRef}
                  className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
                  placeholder="Ask Dev Agent… (Shift+Enter for new line)"
                  rows={1}
                  value={input}
                  disabled={busy}
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
                {busy ? (
                  <button
                    onClick={() => {
                      cancelRef.current?.();
                      setBusy(false);
                      setStatusText(null);
                    }}
                    className="shrink-0 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600 transition active:scale-95"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim()}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 transition active:scale-95"
                  >
                    Send
                  </button>
                )}
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
                taskState={taskState}
                busy={busy}
                profiles={availableProfiles}
                activeProfileId={activeProfileId}
                setActiveProfileId={setActiveProfileId}
              />
            </aside>
          </>
        )}

      </div>{/* end chat-workspace flex */}
    </div>
  );
}
