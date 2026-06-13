export interface ChatRenderBubbleLike {
  id: string;
  kind: string;
}

export type ChatRenderItem<T extends ChatRenderBubbleLike> =
  | { kind: "tool-group"; tools: T[]; approval?: T; key: string }
  | { kind: "bubble"; bubble: T };

export function groupChatRenderItems<T extends ChatRenderBubbleLike>(bubbles: T[]): ChatRenderItem<T>[] {
  const items: ChatRenderItem<T>[] = [];
  let i = 0;

  while (i < bubbles.length) {
    const bubble = bubbles[i]!;
    if (bubble.kind === "tool") {
      const group: T[] = [bubble];
      while (i + 1 < bubbles.length && bubbles[i + 1]!.kind === "tool") {
        i++;
        group.push(bubbles[i]!);
      }

      let approval: T | undefined;
      if (i + 1 < bubbles.length && bubbles[i + 1]!.kind === "pending_confirm") {
        i++;
        approval = bubbles[i]!;
      }

      items.push({ kind: "tool-group", tools: group, approval, key: group[0]!.id });
    } else {
      items.push({ kind: "bubble", bubble });
    }
    i++;
  }

  return items;
}
