export function parseSortableDate(value?: string | null): number {
  const trimmed = value?.trim();
  if (!trimmed) return 0;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function formatSortableDate(value?: string | null): string {
  const timestamp = parseSortableDate(value);
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}
