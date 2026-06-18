import { toolCommandPreview } from "./ApprovalEvidence.js";

export type ExecutionTimelineState =
  | "input-streaming"
  | "input-available"
  | "running"
  | "result"
  | "error";

export interface ExecutionTimelineItem {
  id: string;
  toolName?: string;
  state: ExecutionTimelineState;
  ok?: boolean;
  input?: unknown;
  output?: unknown;
  summary?: string;
  open?: boolean;
  liveOutput?: string;
  approval?: ExecutionTimelineApproval;
}

export interface ExecutionTimelineApproval {
  id: string;
  toolName?: string;
  description?: string;
  riskLevel?: string;
}

export type ExecutionGroupStatus = "running" | "done" | "error" | "approval";

export interface ExecutionGroup {
  id: string;
  title: string;
  kind: string;
  items: ExecutionTimelineItem[];
  status: ExecutionGroupStatus;
  hasApproval: boolean;
}

export function isRunningState(state: ExecutionTimelineState): boolean {
  return state === "input-streaming" || state === "input-available" || state === "running";
}

export function groupExecutionItems(items: ExecutionTimelineItem[]): ExecutionGroup[] {
  const groups: ExecutionGroup[] = [];
  for (const item of items) {
    const kind = executionGroupKind(item);
    const previous = groups[groups.length - 1];
    if (previous && previous.kind === kind) {
      previous.items.push(item);
      previous.status = executionGroupStatus(previous.items);
      previous.hasApproval = previous.items.some((entry) => Boolean(entry.approval));
      continue;
    }
    const groupItems = [item];
    groups.push({
      id: `${kind}-${groups.length}`,
      title: executionGroupTitle(kind),
      kind,
      items: groupItems,
      status: executionGroupStatus(groupItems),
      hasApproval: groupItems.some((entry) => Boolean(entry.approval)),
    });
  }
  return groups;
}

export function executionGroupSummary(group: ExecutionGroup): string {
  if (group.status === "error") {
    return `Stopped after ${group.items.length} command${group.items.length === 1 ? "" : "s"} because one command failed. Expand for stderr and exit code.`;
  }
  if (group.status === "approval")
    return "Waiting for approval before executing the scoped action.";
  if (group.status === "running") {
    return `Running ${group.items.length} command${group.items.length === 1 ? "" : "s"} in this step.`;
  }
  const summaries = group.items
    .map((item) => item.summary || summarizeOutput(item.output))
    .filter(Boolean)
    .slice(0, 2);
  if (summaries.length) return summaries.join(" · ");
  return `Completed ${group.items.length} command${group.items.length === 1 ? "" : "s"}.`;
}

export function executionGroupReflection(
  group: ExecutionGroup,
  nextGroup?: ExecutionGroup,
): string {
  if (group.status === "running") {
    return "Waiting for command output before deciding whether to continue, retry, or change strategy.";
  }
  if (group.status === "error") {
    return "This failure changes the path: inspect the related state before retrying or proposing a safer command.";
  }
  if (group.status === "approval") {
    return "Execution is paused so the proposed action can be checked against policy and user intent.";
  }
  if (nextGroup) return `The result is sufficient to move into ${nextGroup.title.toLowerCase()}.`;
  return "All planned execution evidence is available for the final answer.";
}

export function completedWorkflowSummary(groups: ExecutionGroup[]): string {
  const summaries = groups
    .map((group) => executionGroupSummary(group).replace(/\.$/, ""))
    .filter(Boolean);
  if (!summaries.length) return "All requested execution steps completed.";
  return summaries.join(" · ");
}

export function defaultGroupOpen(group: ExecutionGroup, completed: boolean): boolean {
  if (completed) return false;
  return (
    group.items.some((item) => item.open) ||
    group.status === "running" ||
    group.status === "error" ||
    group.hasApproval
  );
}

export function stateLabel(state: ExecutionTimelineState): string {
  if (state === "input-streaming") return "preparing";
  if (state === "input-available") return "ready";
  if (state === "result") return "done";
  return state;
}

export {
  timelineDotClass,
  timelineGroupPillClass,
  timelineGroupRailClass,
  timelineHeaderIconClass,
  timelineStatePillClass,
  timelineStatusPillClass,
} from "./executionTimelineStyles.js";

export function commandPreviewForItem(item: ExecutionTimelineItem): string {
  return toolCommandPreview(item.toolName ?? "", objectInput(item.input));
}

export function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  const pathValue = record["path"] ?? record["paths"] ?? record["files"];
  const message = record["message"];
  const branch = record["branch"] ?? record["sourceBranch"] ?? record["targetBranch"];
  const flags = record["flags"] ?? record["options"];
  const pieces = [
    pathValue !== undefined ? `paths=${shortValue(pathValue)}` : "",
    branch !== undefined ? `branch=${shortValue(branch)}` : "",
    message !== undefined ? `message=${shortValue(message)}` : "",
    flags !== undefined ? `flags=${shortValue(flags)}` : "",
  ].filter(Boolean);
  return pieces.length ? pieces.join(" ") : shortValue(input);
}

export function summarizeOutput(output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const record = output as Record<string, unknown>;
  const stdout = String(record["stdout"] ?? "").trim();
  const stderr = String(record["stderr"] ?? "").trim();
  if (stderr) return stderr.split(/\r?\n/)[0]?.slice(0, 120) ?? "error";
  if (stdout) {
    if (isMachineReadableJsonText(stdout)) return "Structured result received.";
    return stdout.split(/\r?\n/)[0]?.slice(0, 120) ?? "output";
  }
  const returncode = record["returncode"];
  if (returncode !== undefined) {
    return Number(returncode) === 0
      ? "No human-readable output."
      : `Exit code ${String(returncode)}`;
  }
  return "";
}

export function outputExitCode(output: unknown): number | undefined {
  if (!output || typeof output !== "object") return undefined;
  const value = (output as Record<string, unknown>)["returncode"];
  return typeof value === "number" ? value : undefined;
}

export function shellOutputText(item: ExecutionTimelineItem, liveOutput: string): string {
  if (liveOutput) return isMachineReadableJsonText(liveOutput) ? "" : liveOutput;
  if (!item.output || typeof item.output !== "object") return "";
  const output = item.output as Record<string, unknown>;
  return [String(output["stdout"] ?? "").trim(), String(output["stderr"] ?? "").trim()]
    .filter((entry) => entry && !isMachineReadableJsonText(entry))
    .join("\n");
}

export function safeOutputFallback(output: unknown): string {
  if (!output || typeof output !== "object") return "No human-readable output.";
  const record = output as Record<string, unknown>;
  const error = record["error"];
  if (typeof error === "string" && error.trim()) return error.trim();
  const stderr = String(record["stderr"] ?? "").trim();
  if (stderr) return stderr;
  const stdout = String(record["stdout"] ?? "").trim();
  if (stdout && !isMachineReadableJsonText(stdout)) return stdout;
  const returncode = record["returncode"];
  if (Number(returncode) === 0) return "No human-readable output.";
  if (returncode !== undefined) return `Command finished with exit code ${String(returncode)}.`;
  return "Structured result received.";
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function formatUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function executionGroupKind(item: ExecutionTimelineItem): string {
  const name = (item.toolName ?? "").toLowerCase();
  const command = commandPreviewForItem(item).toLowerCase();
  const text = `${name} ${command}`;
  if (/\b(remote|status|branch|log|diff|ls-remote|fetch|rev-parse)\b/.test(text)) {
    return "inspect";
  }
  if (/\b(add|stage|restore|stash|clean|checkout|switch)\b/.test(text)) return "prepare";
  if (/\b(commit|tag|merge|rebase|cherry|revert)\b/.test(text)) return "change";
  if (/\b(push|pull)\b/.test(text)) return "sync";
  if (name.startsWith("ado_") || /\bazure|devops|pr|pull request|work item|pipeline\b/.test(text)) {
    return "ado";
  }
  if (/\b(test|build|lint|typecheck|validation)\b/.test(text)) return "validate";
  return "execute";
}

function executionGroupTitle(kind: string): string {
  const titles: Record<string, string> = {
    inspect: "Inspect repository state",
    prepare: "Prepare workspace",
    change: "Update local Git history",
    sync: "Sync remote repository",
    ado: "Update Azure DevOps",
    validate: "Run validation",
    execute: "Run command",
  };
  return titles[kind] ?? "Run command";
}

function executionGroupStatus(items: ExecutionTimelineItem[]): ExecutionGroupStatus {
  if (items.some((item) => item.state === "error" || item.ok === false)) return "error";
  if (items.some((item) => item.approval)) return "approval";
  if (items.some((item) => isRunningState(item.state))) return "running";
  return "done";
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : undefined;
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

function shortValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(",")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}
