export function operationDetailSummary(details: string): string | null {
  const trimmed = details.trim();
  if (!trimmed) return null;

  const parsed = parseJson(trimmed);
  if (parsed !== undefined) return summaryFromUnknown(parsed);

  if (trimmed.length > 220) return trimmed.slice(0, 180).trimEnd() + "...";
  return null;
}

function summaryFromUnknown(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const summaries = value
      .map(summaryFromUnknown)
      .filter((summary): summary is string => Boolean(summary));
    return summaries.length > 0 ? summaries.join("; ") : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const zodSummary = flattenedValidationSummary(record);
  if (zodSummary) return zodSummary;

  const nested =
    record["message"] ??
    record["error"] ??
    record["detail"] ??
    record["reason"] ??
    record["description"];
  if (nested !== undefined) return summaryFromUnknown(nested);

  const stdout = stringValue(record["stdout"]);
  const stderr = stringValue(record["stderr"]);
  if (stderr) return firstLine(stderr);
  if (stdout) return firstLine(stdout);

  const returncode = record["returncode"];
  if (typeof returncode === "number") {
    return returncode === 0 ? "Command completed successfully." : `Command failed with exit code ${returncode}.`;
  }

  return null;
}

function flattenedValidationSummary(record: Record<string, unknown>): string | null {
  const formSummary = summaryFromUnknown(record["formErrors"]);
  const fieldErrors = record["fieldErrors"];
  const fieldSummaries = fieldErrors && typeof fieldErrors === "object"
    ? Object.entries(fieldErrors as Record<string, unknown>)
      .map(([field, issue]) => {
        const summary = summaryFromUnknown(issue);
        return summary ? `${field}: ${summary}` : "";
      })
      .filter(Boolean)
    : [];
  const summaries = [formSummary, ...fieldSummaries].filter((summary): summary is string => Boolean(summary));
  return summaries.length > 0 ? summaries.join("; ") : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.slice(0, 180) ?? value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
