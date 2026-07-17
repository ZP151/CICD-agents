export const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL ?? "http://127.0.0.1:8787";
export const runtimeUrl = RUNTIME_URL;

export function messageFromErrorBody(fallback: string, body: string): string {
  const fallbackMessage = friendlyFallbackMessage(fallback);
  const trimmedBody = body.trim();
  try {
    const json = JSON.parse(trimmedBody) as {
      authMessage?: unknown;
      message?: unknown;
      error?: unknown;
      detail?: unknown;
      fieldErrors?: unknown;
      formErrors?: unknown;
    };
    return explainRuntimeError(
      normalizeRuntimeErrorMessage(
        json.authMessage ?? json.message ?? json.error ?? json.detail ?? json.fieldErrors ?? json.formErrors,
        fallbackMessage,
      ),
    );
  } catch {
    return explainRuntimeError(trimmedBody || fallbackMessage);
  }
}

export async function messageFromErrorResponse(fallback: string, response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return messageFromErrorBody(fallback, body);
}

export function explainRuntimeError(message: string): string {
  if (/deployment.*does not exist/i.test(message)) {
    const envSource = message.match(/Daemon env source:\s*([^.]*)\./i)?.[1]?.trim();
    const deployment = message.match(/Deployment:\s*([^.]*)\./i)?.[1]?.trim();
    const details = [
      envSource ? `Daemon env source: ${envSource}.` : "",
      deployment ? `Deployment: ${deployment}.` : "",
    ].filter(Boolean).join(" ");
    return `Azure OpenAI deployment not found. ${details} Check Settings -> Additional Models deployment name, endpoint, and API version, or restart the daemon after updating model settings.`.trim();
  }
  return message;
}

function normalizeRuntimeErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeRuntimeErrorMessage(item, ""))
      .filter(Boolean);
    return items.length > 0 ? items.join("; ") : fallback;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const flattenedZodMessage = normalizeFlattenedZodError(record);
    if (flattenedZodMessage) return flattenedZodMessage;
    const nested =
      record["message"] ??
      record["error"] ??
      record["detail"] ??
      record["reason"] ??
      record["description"];
    if (nested !== undefined) return normalizeRuntimeErrorMessage(nested, fallback);
    const entries = Object.entries(record)
      .map(([key, entry]) => {
        const normalized = normalizeRuntimeErrorMessage(entry, "");
        return normalized ? `${key}: ${normalized}` : "";
      })
      .filter(Boolean);
    return entries.length > 0 ? entries.join("; ") : fallback;
  }
  return fallback;
}

function normalizeFlattenedZodError(record: Record<string, unknown>): string {
  const formErrors = normalizeRuntimeErrorMessage(record["formErrors"], "");
  const fieldErrors = record["fieldErrors"];
  const fieldMessages = fieldErrors && typeof fieldErrors === "object"
    ? Object.entries(fieldErrors as Record<string, unknown>)
      .map(([field, issue]) => {
        const message = normalizeRuntimeErrorMessage(issue, "");
        return message ? `${field}: ${message}` : "";
      })
      .filter(Boolean)
    : [];
  return [formErrors, ...fieldMessages].filter(Boolean).join("; ");
}

function friendlyFallbackMessage(message: string): string {
  const trimmed = message.trim();
  if (/^HTTP\s+\d+$/i.test(trimmed)) return "Request failed.";
  const routeMatch = trimmed.match(/^\/[^\s]+\s+HTTP\s+\d+(?::.*)?$/i);
  if (routeMatch) return "Request failed.";
  const labeledMatch = trimmed.match(/^(.+?)\s+HTTP\s+\d+(?::.*)?$/i);
  if (labeledMatch?.[1]?.trim()) return `${labeledMatch[1].trim()} failed.`;
  return message;
}
