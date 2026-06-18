import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import type {
  ChatHistoryEntry,
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import type { ChatRenderItem } from "../../../chatRenderItems.js";
import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import type {
  ComposerInputState,
  ComposerStateNotice,
  SuggestionReply,
} from "../../../components/conversation/SuggestionReplyBar.js";
import type {
  ConversationModelChoice,
  CustomConversationModel,
} from "../chatModelSelection.js";
import type {
  ArtifactLookupState,
  Bubble,
  SavedPrInsightSource,
  WorkflowEventState,
} from "../chat.types.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import type {
  TaskState,
  WorkspaceAction,
} from "../workflowTaskState.js";
import type {
  HistoryMenuState,
} from "./HistorySidebar.js";
import type { DiffStats } from "./workspacePanel.types.js";

export interface ChatShellProps {
  activeCustomModel: CustomConversationModel | null;
  activeModel: ConversationModelChoice;
  activeProjectLinkId: string | null;
  artifactCount: number;
  availableProjectLinks: ProjectLink[];
  beginRenameHistory: (entry: ChatHistoryEntry) => void;
  bottomRef: RefObject<HTMLDivElement>;
  branchList: string[];
  bubbles: Bubble[];
  busy: boolean;
  cancelPendingAction: (id: string) => void;
  cancelQueuedSuggestion: () => void;
  cancelHistoryRename: () => void;
  clearArtifact: () => void;
  closeModelMenuFromChatSurface: (event: { target: EventTarget | null }) => void;
  codePanelWidth: number;
  commitHistoryRename: (entry: ChatHistoryEntry, value: string) => void;
  composerInputState: ComposerInputState;
  composerStateNotice: ComposerStateNotice | null;
  confirmPendingAction: (id: string) => void;
  conversationTitle: string | null;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  currentBranch: string | null;
  customModels: CustomConversationModel[];
  customTitle: string | null;
  deleteHistoryEntry: (entry: ChatHistoryEntry) => void;
  diffStats: DiffStats | null;
  gitStatus: GitStatusData | null;
  handleContainerScroll: () => void;
  handleSuggestionReply: (suggestion: SuggestionReply) => void;
  history: ChatHistoryEntry[];
  historyError: string | null;
  historyExpanded: boolean;
  historyMenu: HistoryMenuState | null;
  historyOpen: boolean;
  historyPage: number;
  historyWidth: number;
  input: string;
  loadSession: (sessionId: string) => void;
  mini: boolean;
  modelMenuOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement>;
  openPrInsightSourceInActivity: (source: { artifactId: string }) => void;
  openPrInsightSourceInWorkspace: (source: SavedPrInsightSource) => void;
  queuePrompt: (prompt: string) => void;
  queuedSuggestionId: string | null;
  renameCurrentSession: (value: string) => void;
  renamingHistoryId: string | null;
  renamingHistoryValue: string;
  renderItems: ChatRenderItem<Bubble>[];
  repoPath: string;
  resolveConfirm: (id: string, confirmed: boolean) => Promise<void>;
  rightPanelOpen: boolean;
  rightWidth: number;
  runWorkspaceAction: (action: WorkspaceAction) => void;
  scrollContainerRef: RefObject<HTMLDivElement>;
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectedArtifact: ConversationArtifactPart | null;
  selectedArtifactId: string | null;
  selectedArtifactLookupState: ArtifactLookupState | null;
  selectedSource: ConversationSourcePart | null;
  selectProjectLink: (id: string) => void;
  selectSource: (source: ConversationSourcePart) => void;
  send: () => void;
  sessionId: string | null;
  setActiveModel: Dispatch<SetStateAction<ConversationModelChoice>>;
  setActiveProjectLinkId: (id: string | null) => void;
  setHistoryExpanded: (expanded: boolean) => void;
  setHistoryMenu: Dispatch<SetStateAction<HistoryMenuState | null>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setHistoryPage: Dispatch<SetStateAction<number>>;
  setInput: Dispatch<SetStateAction<string>>;
  setModelMenuOpen: Dispatch<SetStateAction<boolean>>;
  setRepoPath: (value: string) => void;
  setRenamingHistoryValue: Dispatch<SetStateAction<string>>;
  setRightPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSummaryPinnedOpen: Dispatch<SetStateAction<boolean>>;
  setTitleEditing: Dispatch<SetStateAction<boolean>>;
  sourceParts: ConversationSourcePart[];
  startHistoryDrag: (clientX: number) => void;
  startRightDrag: (clientX: number) => void;
  statusText: string | null;
  stopCurrentTurn: () => void;
  suggestionReplies: SuggestionReply[];
  summaryPinnedOpen: boolean;
  taskState: TaskState | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
  titleEditing: boolean;
  titleInputRef: RefObject<HTMLInputElement>;
  toggleHistoryPin: (entry: ChatHistoryEntry) => void;
  toggleTool: (id: string) => void;
  welcomeSuggestions: string[];
  workflowState: WorkflowEventState | null;
  workspaceRef: RefObject<HTMLDivElement>;
}
