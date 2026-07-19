import { useState } from "react";

export interface GitStatusData {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

export function parseGitStatus(stdout: string): GitStatusData {
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

export function parseGitLog(stdout: string): GitCommit[] {
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

export function parseGitDiff(stdout: string): DiffFile[] {
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

export function toolCollapsedSummary(toolName?: string, toolOk?: boolean, toolResult?: unknown): string {
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
  return stdout.split("\n").find(Boolean)?.slice(0, 60) ?? "";
}

export function ToolOutputRenderer({ toolName, toolResult }: { toolName?: string; toolResult?: unknown }) {
  if (!toolResult || typeof toolResult !== "object") return null;
  const result = toolResult as Record<string, unknown>;
  const returncode = result["returncode"];
  const stderr = String(result["stderr"] ?? "").trim();

  if ((returncode !== 0 && returncode !== undefined) && stderr) {
    return <div className="text-xs text-[rgb(var(--app-danger))] font-mono whitespace-pre-wrap break-all">{stderr}</div>;
  }

  if (toolName === "git_status") return <GitStatusRenderer result={result} />;
  if (toolName === "git_log") return <GitLogRenderer result={result} />;
  if (toolName === "git_diff") return <GitDiffRenderer result={result} />;
  return <GenericToolRenderer result={result} />;
}

function GitStatusRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const data = parseGitStatus(stdout);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-[rgb(var(--app-accent-readable))] font-mono">{data.branch || "Branch not available"}</span>
        {data.ahead > 0 && <span className="text-[rgb(var(--app-success))]">&uarr;{data.ahead}</span>}
        {data.behind > 0 && <span className="text-[rgb(var(--app-warning))]">&darr;{data.behind}</span>}
      </div>
      {data.staged.length > 0 && <FileList label="Staged" files={data.staged} color="text-[rgb(var(--app-success))]" prefix="+" />}
      {data.modified.length > 0 && <FileList label="Modified" files={data.modified} color="text-[rgb(var(--app-warning))]" prefix="~" />}
      {data.deleted.length > 0 && <FileList label="Deleted" files={data.deleted} color="text-[rgb(var(--app-danger))]" prefix="-" />}
      {data.untracked.length > 0 && <FileList label="Untracked" files={data.untracked} color="text-[rgb(var(--app-text-muted))]" prefix="?" />}
      {data.staged.length === 0 && data.modified.length === 0 && data.deleted.length === 0 && data.untracked.length === 0 && (
        <p className="text-[rgb(var(--app-text-muted))]">Working tree clean</p>
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
        {shown.map((f) => <li key={f} className={`font-mono ${color} opacity-80`}>{prefix} {f}</li>)}
      </ul>
      {files.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="ml-2 text-[rgb(var(--app-text-subtle))] hover:text-[rgb(var(--app-text))]">
          {expanded ? "show less" : `+${files.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function GitLogRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const commits = parseGitLog(stdout);
  if (commits.length === 0) return <p className="text-xs text-[rgb(var(--app-text-muted))]">No commits found.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {commits.map((c) => (
        <li key={c.hash} className="flex items-start gap-2">
          <span className="shrink-0 font-mono text-[rgb(var(--app-accent-readable))]">{c.hash}</span>
          <span className="shrink-0 text-[rgb(var(--app-text-subtle))]">{c.date}</span>
          <span className="shrink-0 text-[rgb(var(--app-text-muted))]">{c.author}</span>
          <span className="text-[rgb(var(--app-text))]">{c.message}</span>
        </li>
      ))}
    </ul>
  );
}

function GitDiffRenderer({ result }: { result: Record<string, unknown> }) {
  const stdout = String(result["stdout"] ?? "");
  const files = parseGitDiff(stdout);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (files.length === 0) return <p className="text-xs text-[rgb(var(--app-text-muted))]">No changes found.</p>;
  return (
    <div className="space-y-1 text-xs">
      {files.map((f) => (
        <div key={f.path} className="rounded border border-[rgb(var(--app-border))] overflow-hidden">
          <button
            onClick={() => setExpanded((prev) => prev === f.path ? null : f.path)}
            title={`${expanded === f.path ? "Collapse" : "Expand"} diff for ${f.path}`}
            aria-label={`${expanded === f.path ? "Collapse" : "Expand"} diff for ${f.path}`}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[rgb(var(--app-surface-raised))]"
          >
            <span className="font-mono text-[rgb(var(--app-text))] flex-1 truncate">{f.path}</span>
            <span className="text-[rgb(var(--app-success))]">+{f.added}</span>
            <span className="text-[rgb(var(--app-danger))]">-{f.removed}</span>
            <span className="text-[rgb(var(--app-text-subtle))]">{expanded === f.path ? "▲" : "▼"}</span>
          </button>
          {expanded === f.path && (
            <div className="border-t border-[rgb(var(--app-border))] max-h-40 overflow-y-auto">
              <pre className="px-2 py-1 font-mono text-[10px] text-[rgb(var(--app-text-muted))] whitespace-pre-wrap break-all">
                {stdout
                  .split("diff --git")
                  .find((chunk) => chunk.includes(f.path))
                  ?.split("\n")
                  .map((line, i) => (
                    <span
                      key={i}
                      className={
                        line.startsWith("+") && !line.startsWith("+++")
                          ? "text-[rgb(var(--app-success))]"
                          : line.startsWith("-") && !line.startsWith("---")
                            ? "text-[rgb(var(--app-danger))]"
                            : "text-[rgb(var(--app-text-muted))]"
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
  if (!stdout || isMachineReadableJsonText(stdout)) {
    return <p className="text-xs text-[rgb(var(--app-text-subtle))]">No human-readable output.</p>;
  }
  const ok = returncode === 0 || returncode === undefined;
  return (
    <pre className={`whitespace-pre-wrap break-all text-xs font-mono ${ok ? "text-[rgb(var(--app-text-muted))]" : "text-[rgb(var(--app-danger))]"} max-h-40 overflow-y-auto`}>
      {stdout}
    </pre>
  );
}

function isMachineReadableJsonText(value: string): boolean {
  const text = value.trim();
  if (!text || !/^[{\[]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
