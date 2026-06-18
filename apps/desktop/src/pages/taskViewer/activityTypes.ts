import type { ReviewOperationEvent } from "../../reviewOperations.js";

export interface ReviewActivityItem extends ReviewOperationEvent {
  projectLinkId: string;
  projectLinkName: string;
}
