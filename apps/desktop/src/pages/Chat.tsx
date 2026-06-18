import { ChatShell } from "./chat/layout/ChatShell.js";
import { useChatPageRuntime } from "./chat/useChatPageRuntime.js";

export type { WorkflowEventState } from "./chat/chat.types.js";
export {
  taskStateFromWorkflow,
  workflowStepActionState,
  workflowStateWithActionSummary,
} from "./chat/workflowTaskState.js";
export type {
  TaskState,
  WorkflowStep,
  WorkflowStepActionState,
  WorkspaceAction,
} from "./chat/workflowTaskState.js";
export { prInsightArtifactRecordToMarkdown } from "./chat/artifacts/prInsightArtifacts.js";

interface ChatProps {
  mini?: boolean;
}

export default function Chat({ mini = false }: ChatProps) {
  const runtime = useChatPageRuntime(mini);
  return <ChatShell {...runtime} />;
}
