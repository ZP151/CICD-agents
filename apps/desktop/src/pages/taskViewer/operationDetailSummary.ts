export function operationDetailSummary(details: string): string | null {
  const trimmed = details.trim();
  if (!trimmed) return null;

  const parsed = parseJson(trimmed);
  if (parsed !== undefined) return summaryFromUnknown(parsed);

  const lossyToolSummary = lossyToolOutputSummary(trimmed);
  if (lossyToolSummary) return lossyToolSummary;

  if (trimmed.length > 220) return trimmed.slice(0, 180).trimEnd() + "...";
  return null;
}

export function operationDetailPreview(details: string): string | null {
  const summary = operationDetailSummary(details);
  if (summary) return summary;
  return compactKeyValueDetail(details);
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

  const returncode = record["returncode"];
  const stdout = stringValue(record["stdout"]);
  const stderr = stringValue(record["stderr"]);
  if (typeof returncode === "number" && returncode !== 0 && stderr) return firstLine(stderr);
  if (stdout) return firstLine(stdout);
  if (typeof returncode === "number") {
    return returncode === 0 ? "Command completed successfully." : `Command failed with exit code ${returncode}.`;
  }
  if (stderr) return firstLine(stderr);

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
  const normalized = value.replace(/\\r\\n|\\n|\\r/g, "\n");
  return normalized.split(/\r?\n/)[0]?.slice(0, 180) ?? value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function lossyToolOutputSummary(value: string): string | null {
  if (!/"?(returncode|stdout|stderr)"?\s*:/.test(value)) return null;

  const returncodeMatch = value.match(/"?returncode"?\s*:\s*(-?\d+)/);
  const returncode = returncodeMatch ? Number(returncodeMatch[1]) : null;
  const stdout = extractJsonLikeField(value, "stdout");
  const stderr = extractJsonLikeField(value, "stderr");

  if (returncode !== null && returncode !== 0 && stderr) return firstLine(stderr);
  if (stdout) return firstLine(stdout);
  if (returncode !== null) {
    return returncode === 0
      ? "Command completed successfully."
      : `Command failed with exit code ${returncode}.`;
  }
  if (stderr) return firstLine(stderr);

  return null;
}

function compactKeyValueDetail(value: string): string | null {
  const pairs = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) return null;
      return {
        key: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    })
    .filter((pair): pair is { key: string; value: string } => Boolean(pair));

  if (pairs.length < 4) return null;

  const preferredKeys = [
    "queue",
    "readiness",
    "risk",
    "confidence",
    "findings",
    "risks",
    "files",
    "threads",
    "failedBuilds",
  ];
  const selected = preferredKeys
    .map((key) => pairs.find((pair) => pair.key === key))
    .filter((pair): pair is { key: string; value: string } => Boolean(pair))
    .slice(0, 3);

  if (selected.length === 0) return null;
  return selected.map((pair) => `${pair.key}=${pair.value}`).join("; ");
}

function extractJsonLikeField(value: string, field: "stdout" | "stderr"): string {
  const nextField = field === "stdout" ? "stderr" : null;
  const pattern = nextField
    ? new RegExp(`"?${field}"?\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"?${nextField}"?\\s*:`)
    : new RegExp(`"?${field}"?\\s*:\\s*"([\\s\\S]*?)"\\s*}?\\s*$`);
  const match = value.match(pattern);
  return (match?.[1] ?? "")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}
