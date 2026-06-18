import type { ChatWorkflowAction } from "../../api.js";

export interface DirectWorkflowAction {
  action: ChatWorkflowAction;
  input?: {
    branch?: string;
    targetBranch?: string;
    title?: string;
    description?: string;
    draft?: boolean;
    pullRequestId?: number;
    workItemId?: number;
    pipelineId?: number;
    message?: string;
    includeUnstaged?: boolean;
    commitMode?: "commit" | "commit-push";
  };
}
