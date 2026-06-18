import type {
  ConversationPart,
  ConversationToolApprovalPart,
  ConversationToolCallPart,
  ToolApprovalPartSnapshot,
  ToolCallPartSnapshot,
} from "./chatBubbleTypes.js";

export function toolCallPartFromSnapshot(snapshot: ToolCallPartSnapshot): ConversationToolCallPart {
  return {
    type: "tool_call",
    toolCallId: snapshot.toolCallId,
    toolName: snapshot.toolName,
    state: snapshot.state ?? inferToolCallState(snapshot),
    input: snapshot.input,
    output: snapshot.output,
    summary: snapshot.summary,
  };
}

export function upsertToolCallPart(
  parts: ConversationPart[] | undefined,
  snapshot: ToolCallPartSnapshot,
): ConversationPart[] {
  const nextPart = toolCallPartFromSnapshot(snapshot);
  const current = parts?.length ? [...parts] : [];
  const index = current.findIndex(
    (part) => part.type === "tool_call" && part.toolCallId === snapshot.toolCallId,
  );
  if (index === -1) return [...current, nextPart];
  current[index] = nextPart;
  return current;
}

export function appendToolOutputDeltaToConversationParts(
  parts: ConversationPart[] | undefined,
  snapshot: ToolCallPartSnapshot,
  stream: "stdout" | "stderr" | undefined,
  delta: string,
): ConversationPart[] {
  if (!delta) return parts ?? [];
  const existing = parts?.find(
    (part): part is ConversationToolCallPart =>
      part.type === "tool_call" && part.toolCallId === snapshot.toolCallId,
  );
  const existingOutput =
    existing?.output && typeof existing.output === "object"
      ? (existing.output as Record<string, unknown>)
      : {};
  const key = stream === "stderr" ? "stderr" : "stdout";
  const output = {
    ...existingOutput,
    [key]: `${String(existingOutput[key] ?? "")}${delta}`.slice(-12000),
  };
  return upsertToolCallPart(parts, {
    ...snapshot,
    state: "running",
    input: snapshot.input ?? existing?.input,
    output,
    summary: snapshot.summary ?? existing?.summary,
  });
}

export function toolApprovalPartFromSnapshot(
  snapshot: ToolApprovalPartSnapshot,
): ConversationToolApprovalPart {
  return {
    type: "tool_approval",
    approvalId: snapshot.approvalId,
    toolName: snapshot.toolName,
    description: snapshot.description,
    args: snapshot.args ?? {},
    riskLevel: normalizeRiskLevel(snapshot.riskLevel),
  };
}

export function toolCallPartsFromConversationParts(
  parts: ConversationPart[] | undefined,
): ConversationToolCallPart[] {
  return (parts ?? []).filter(
    (part): part is ConversationToolCallPart => part.type === "tool_call",
  );
}

export function primaryToolCallPart(
  parts: ConversationPart[] | undefined,
): ConversationToolCallPart | null {
  const toolParts = toolCallPartsFromConversationParts(parts);
  return toolParts[toolParts.length - 1] ?? null;
}

export function groupConsecutiveToolCallParts(
  parts: ConversationPart[],
): Array<
  | { type: "tool_group"; parts: ConversationToolCallPart[] }
  | { type: "part"; part: ConversationPart }
> {
  const groups: Array<
    | { type: "tool_group"; parts: ConversationToolCallPart[] }
    | { type: "part"; part: ConversationPart }
  > = [];

  for (const part of parts) {
    if (part.type !== "tool_call") {
      groups.push({ type: "part", part });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last?.type === "tool_group") {
      last.parts.push(part);
    } else {
      groups.push({ type: "tool_group", parts: [part] });
    }
  }
  return groups;
}

function inferToolCallState(snapshot: ToolCallPartSnapshot): ConversationToolCallPart["state"] {
  if (snapshot.output !== undefined) return "result";
  if (snapshot.input !== undefined) return "input-available";
  return "input-streaming";
}

function normalizeRiskLevel(level?: string): "low" | "medium" | "high" {
  if (level === "high" || level === "medium" || level === "low") return level;
  return "medium";
}
