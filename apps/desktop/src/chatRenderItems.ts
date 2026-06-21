export interface ChatRenderBubbleLike {
  id: string;
  kind: string;
}

export type ChatRenderItem<T extends ChatRenderBubbleLike> =
  | { kind: "tool-group"; tools: T[]; approval?: T; key: string }
  | { kind: "bubble"; bubble: T };

export function groupChatRenderItems<T extends ChatRenderBubbleLike>(bubbles: T[]): ChatRenderItem<T>[] {
  const items: ChatRenderItem<T>[] = [];
  let turn: T[] = [];

  for (const bubble of bubbles) {
    if (bubble.kind === "user") {
      appendTurnItems(items, turn);
      turn = [];
      items.push({ kind: "bubble", bubble });
      continue;
    }
    turn.push(bubble);
  }

  appendTurnItems(items, turn);
  return items;
}

function appendTurnItems<T extends ChatRenderBubbleLike>(
  items: ChatRenderItem<T>[],
  turn: T[],
): void {
  if (turn.length === 0) return;

  const tools = turn.filter((bubble) => bubble.kind === "tool");
  if (tools.length > 0) {
    items.push({ kind: "tool-group", tools, key: tools[0]!.id });
  }

  for (const bubble of turn) {
    if (bubble.kind !== "tool" && bubble.kind !== "pending_confirm") {
      items.push({ kind: "bubble", bubble });
    }
  }

  for (const bubble of turn) {
    if (bubble.kind === "pending_confirm") {
      items.push({ kind: "bubble", bubble });
    }
  }
}
