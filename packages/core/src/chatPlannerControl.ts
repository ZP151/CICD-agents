import type {
  ChatPlannerArtifact,
  ChatPlannerResult,
  ChatPlannerSource,
  PendingToolAction,
} from "./chatPlannerTypes.js";

export const CHAT_CONTROL_JSON_MARKER = "__CONTROL_JSON__";
export const CHAT_FINAL_TOOL_NAME = "agent_final";

export function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function plannerResultFromControl(
  control: Record<string, unknown>,
  opts: {
    visibleText?: string;
    fallbackText: string;
    finalizationMode: ChatPlannerResult["finalizationMode"];
    streamedResponse?: string;
    toolCallsMade: ChatPlannerResult["toolCallsMade"];
    usedLlm: boolean;
  },
): ChatPlannerResult {
  const rawApprovalProposal = control["approval_proposal"] ?? control["pending_action"];
  const approvalProposal = pendingActionFromControl(rawApprovalProposal);
  return {
    response: String(control["response"] ?? opts.visibleText ?? opts.fallbackText),
    streamedResponse: opts.streamedResponse,
    finalizationMode: opts.finalizationMode,
    riskLevel: String(control["risk_level"] ?? control["riskLevel"] ?? "low"),
    actionsTaken: arrayOfStrings(control["actions_taken"] ?? control["actionsTaken"]),
    suggestions: arrayOfStrings(control["suggestions"]),
    sources: normalizeSources(control["sources"]),
    artifacts: normalizeArtifacts(control["artifacts"]),
    toolCallsMade: opts.toolCallsMade,
    usedLlm: opts.usedLlm,
    approvalProposal: approvalProposal?.tool ? approvalProposal : undefined,
  };
}

export function parseControlResponse(text: string): {
  visibleText?: string;
  control: Record<string, unknown> | null;
  mode: ChatPlannerResult["finalizationMode"];
} {
  const markerIndex = text.lastIndexOf(CHAT_CONTROL_JSON_MARKER);
  if (markerIndex !== -1) {
    const visibleText = text.slice(0, markerIndex).trim();
    const afterMarker = text.slice(markerIndex + CHAT_CONTROL_JSON_MARKER.length).trim();
    const control = parseFinalJson(afterMarker);
    return { visibleText, control, mode: "control_marker" };
  }
  return { control: parseFinalJson(text), mode: "plain_json" };
}

export function extractVisibleStreamingResponse(text: string): string {
  const markerIndex = text.indexOf(CHAT_CONTROL_JSON_MARKER);
  if (markerIndex !== -1) return text.slice(0, markerIndex);
  const responseField = extractStreamingJsonStringField(text, "response");
  if (responseField) return responseField;
  if (looksLikeStructuredJsonPrefix(text)) return "";
  return trimPotentialControlMarkerPrefix(text);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export function summarizeToolResult(result: unknown, ok: boolean): string {
  const text = typeof result === "string"
    ? result
    : result && typeof result === "object" && "error" in result
      ? String((result as { error?: unknown }).error ?? "")
      : JSON.stringify(result);
  const readable = summarizeKnownRuntimeError(text);
  return ok ? truncate(readable, 200) : `error: ${truncate(readable, 220)}`;
}

export function approvalDescription(description: string, fallbackName: string): string {
  const trimmed = description.trim();
  if (!trimmed) return fallbackName.replace(/_/g, " ");
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

function pendingActionFromControl(raw: unknown): PendingToolAction | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    tool: String(obj["tool"] ?? "").replace(/^functions\./, ""),
    args: (obj["args"] as Record<string, unknown>) ?? {},
    description: String(obj["description"] ?? ""),
    nextHint: obj["nextHint"] === undefined ? undefined : String(obj["nextHint"]),
    readiness: obj["readiness"] as PendingToolAction["readiness"],
    preflight: obj["preflight"] as PendingToolAction["preflight"],
    workflow: obj["workflow"] as PendingToolAction["workflow"],
  };
}

function arrayOfStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

function normalizeSources(raw: unknown): ChatPlannerSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sources = raw
    .map((item, index): ChatPlannerSource | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const title = stringValue(source["title"]) || stringValue(source["file"]) || stringValue(source["url"]);
      if (!title) return null;

      if (source["type"] === "source_url") {
        const url = stringValue(source["url"]);
        if (!url) return null;
        return {
          type: "source_url",
          sourceId: stringValue(source["sourceId"]) || `url-${index}`,
          title,
          url,
          domain: stringValue(source["domain"]),
          snippet: stringValue(source["snippet"]),
        };
      }

      if (source["type"] !== "source_document") return null;
      const line = typeof source["line"] === "number" && Number.isFinite(source["line"])
        ? source["line"]
        : undefined;
      return {
        type: "source_document",
        sourceId: stringValue(source["sourceId"]) || `document-${index}`,
        title,
        file: stringValue(source["file"]),
        line,
        snippet: stringValue(source["snippet"]),
      };
    })
    .filter((source): source is ChatPlannerSource => Boolean(source));
  return sources.length ? sources : undefined;
}

function normalizeArtifacts(raw: unknown): ChatPlannerArtifact[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const artifacts = raw
    .map((item): ChatPlannerArtifact | null => {
      if (!item || typeof item !== "object") return null;
      const artifact = item as Record<string, unknown>;
      const artifactId = String(artifact["artifactId"] ?? artifact["artifact_id"] ?? "").trim();
      const title = String(artifact["title"] ?? "").trim();
      const artifactType = artifact["artifactType"] ?? artifact["artifact_type"];
      const status = artifact["status"];
      if (!artifactId || !title) return null;
      if (!["react", "html", "markdown", "mermaid", "text"].includes(String(artifactType))) return null;
      if (!["streaming", "ready", "error"].includes(String(status))) return null;
      const content = typeof artifact["content"] === "string" ? artifact["content"] : undefined;
      return {
        type: "artifact",
        artifactId,
        title,
        artifactType: artifactType as ChatPlannerArtifact["artifactType"],
        status: status as ChatPlannerArtifact["status"],
        content,
      };
    })
    .filter((artifact): artifact is ChatPlannerArtifact => Boolean(artifact));
  return artifacts.length ? artifacts : undefined;
}

function stringValue(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function parseFinalJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const close = text.lastIndexOf("}");
  if (close === -1) return null;
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(text.slice(i, close + 1)) as Record<string, unknown>;
          if ("response" in obj) return obj;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function looksLikeStructuredJsonPrefix(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return false;
  return (
    trimmed.includes("\"response\"") ||
    trimmed.includes("\"risk_level\"") ||
    trimmed.includes("\"approval_proposal\"") ||
    trimmed.includes("\"actions_taken\"")
  );
}

function trimPotentialControlMarkerPrefix(text: string): string {
  const max = Math.min(text.length, CHAT_CONTROL_JSON_MARKER.length - 1);
  for (let len = max; len > 0; len--) {
    if (CHAT_CONTROL_JSON_MARKER.startsWith(text.slice(-len))) {
      return text.slice(0, -len);
    }
  }
  return text;
}

function extractStreamingJsonStringField(text: string, field: string): string {
  const key = `"${field}"`;
  const keyIndex = text.indexOf(key);
  if (keyIndex === -1) return "";
  const colonIndex = text.indexOf(":", keyIndex + key.length);
  if (colonIndex === -1) return "";

  let quoteIndex = -1;
  for (let i = colonIndex + 1; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch ?? "")) continue;
    if (ch !== "\"") return "";
    quoteIndex = i;
    break;
  }
  if (quoteIndex === -1) return "";

  let out = "";
  for (let i = quoteIndex + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\"") return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }

    if (i + 1 >= text.length) return out;
    const esc = text[++i]!;
    if (esc === "\"" || esc === "\\" || esc === "/") out += esc;
    else if (esc === "b") out += "\b";
    else if (esc === "f") out += "\f";
    else if (esc === "n") out += "\n";
    else if (esc === "r") out += "\r";
    else if (esc === "t") out += "\t";
    else if (esc === "u") {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 4;
    }
  }
  return out;
}

function summarizeKnownRuntimeError(text: string): string {
  if (/Could not locate the bindings file/i.test(text) || /better_sqlite3\.node/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not load its native SQLite binding.";
  }
  if (/schema\.sql/i.test(text) && /ENOENT|no such file|cannot find/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not find its database schema.";
  }
  return text.replace(/\s*[-=]{2,}\s*$/g, "").trim();
}
