import type { ReviewHistoryRecord } from "../reviewHistoryLocal.js";

export function parseReasonCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return value.split(";").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeReasonCodes(value: unknown): string[] {
  return parseReasonCodes(value);
}

export function normalizeContextConfidence(value: unknown): ReviewHistoryRecord["contextConfidence"] {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "";
}

export function normalizeManualDisposition(value: unknown): ReviewHistoryRecord["manualDisposition"] {
  if (
    value === "acknowledged" ||
    value === "marked_safe" ||
    value === "marked_blocked" ||
    value === "changes_requested"
  ) {
    return value;
  }
  return "";
}

export function parseDispositionEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionEvents"]> {
  if (Array.isArray(value)) return normalizeDispositionEvents(value);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeDispositionEvents(parsed);
  } catch {
    return [];
  }
}

export function normalizeDispositionEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionEvents"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as {
      disposition?: unknown;
      at?: unknown;
      actor?: unknown;
      note?: unknown;
    };
    const disposition = normalizeManualDisposition(raw.disposition);
    if (!disposition) return [];
    return [{
      disposition,
      at: typeof raw.at === "string" ? raw.at : "",
      actor: typeof raw.actor === "string" ? raw.actor : "",
      note: typeof raw.note === "string" ? raw.note : "",
    }];
  });
}

export function parseWriteBackEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionWriteBackEvents"]> {
  if (Array.isArray(value)) return normalizeWriteBackEvents(value);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeWriteBackEvents(parsed);
  } catch {
    return [];
  }
}

export function normalizeWriteBackEvents(value: unknown): NonNullable<ReviewHistoryRecord["manualDispositionWriteBackEvents"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as {
      disposition?: unknown;
      at?: unknown;
      ok?: unknown;
      actor?: unknown;
      note?: unknown;
      error?: unknown;
      threadId?: unknown;
      url?: unknown;
    };
    const disposition = normalizeManualDisposition(raw.disposition);
    if (!disposition) return [];
    return [{
      disposition,
      at: typeof raw.at === "string" ? raw.at : "",
      ok: Boolean(raw.ok),
      actor: typeof raw.actor === "string" ? raw.actor : "",
      note: typeof raw.note === "string" ? raw.note : "",
      error: typeof raw.error === "string" ? raw.error : "",
      threadId: typeof raw.threadId === "string" ? raw.threadId : "",
      url: typeof raw.url === "string" ? raw.url : "",
    }];
  });
}

export function normalizeQueue(value: unknown): ReviewHistoryRecord["decisionQueue"] {
  if (value === "auto_approved" || value === "needs_human_review" || value === "blocked" || value === "watching") {
    return value;
  }
  return "needs_human_review";
}

export function normalizeRisk(value: unknown): ReviewHistoryRecord["decisionRiskLevel"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}
