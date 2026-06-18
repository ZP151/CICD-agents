export interface SubmitPipelinePayloadInput {
  repoPath: unknown;
  projectTemplate?: unknown;
  targetBranch?: unknown;
  workItem?: unknown;
  title?: unknown;
  draft?: unknown;
  autoCreatePr?: unknown;
  triggerPipeline?: unknown;
}

export interface SubmitPipelinePayload extends Record<string, unknown> {
  repoPath: string;
  projectTemplate?: string;
  targetBranch: string | null;
  workItem: string | number | null;
  title: string | null;
  draft: boolean;
  autoCreatePr: boolean;
  triggerPipeline: boolean;
}

export function buildSubmitPipelinePayload(input: SubmitPipelinePayloadInput): SubmitPipelinePayload {
  const projectTemplate = nonBlankString(input.projectTemplate);
  return {
    repoPath: String(input.repoPath),
    ...(projectTemplate ? { projectTemplate } : {}),
    targetBranch: nullableString(input.targetBranch),
    workItem: nullableStringOrNumber(input.workItem),
    title: nullableString(input.title),
    draft: Boolean(input.draft),
    autoCreatePr: input.autoCreatePr === undefined ? true : Boolean(input.autoCreatePr),
    triggerPipeline: Boolean(input.triggerPipeline),
  };
}

function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function nullableString(value: unknown): string | null {
  return nonBlankString(value) ?? null;
}

function nullableStringOrNumber(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return nullableString(value);
}
