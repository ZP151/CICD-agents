import type { ConversationSourcePart } from "../../chatBubbles.js";
import type { ReferencePart } from "./ReferenceParts.js";

export interface MarkdownContentProps {
  markdown: string;
  streaming?: boolean;
  inlineSources?: ReferencePart[];
  onSourceSelect?: (source: ConversationSourcePart) => void;
}
