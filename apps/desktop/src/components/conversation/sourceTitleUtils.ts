export function stripSourceLineSuffix(title: string): string {
  return title.replace(/:(?:line\s*)?\d+(?:-\d+)?$/i, "").trim();
}

export function sourceLineNumberFromTitle(
  explicitLine: number | undefined,
  title: string | undefined,
): number | undefined {
  if (Number.isInteger(explicitLine) && (explicitLine ?? 0) > 0) return explicitLine;
  const match = title?.match(/:(?:line\s*)?(\d+)(?:-\d+)?$/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
