import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  ComposerInputState,
  ComposerStateNotice,
  SuggestionReply,
} from "../../../components/conversation/SuggestionReplyBar.js";
import { SuggestionReplyBar } from "../../../components/conversation/SuggestionReplyBar.js";
import type { ProjectLink } from "../../../api.js";
import type {
  ConversationModelChoice,
  CustomConversationModel,
} from "../chatModelSelection.js";
import { DEFAULT_CONVERSATION_MODEL_LABEL } from "../chatModelSelection.js";
import type { WorkflowEventState } from "../chat.types.js";
import {
  imageAttachmentLabel,
  type ComposerImageAttachment,
} from "../chatAttachments.js";
import { canSendComposerTurn } from "../chatComposerSendState.js";
import {
  hasComposerImageAttachmentSlot,
  useComposerImageAttachments,
} from "../useComposerImageAttachments.js";
import {
  toggleAttachmentMenuState,
  toggleModelMenuState,
} from "./composerMenuState.js";

interface ComposerShellProps {
  mini: boolean;
  input: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  modelMenuRef: RefObject<HTMLDivElement>;
  modelMenuOpen: boolean;
  activeModel: ConversationModelChoice;
  activeCustomModel: CustomConversationModel | null;
  customModels: CustomConversationModel[];
  availableProjectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  activeProjectLinkId: string | null;
  composerStateNotice: ComposerStateNotice | null;
  composerInputState: ComposerInputState;
  suggestionReplies: SuggestionReply[];
  busy: boolean;
  workflowState: WorkflowEventState | null;
  queuedSuggestionId: string | null;
  onInputChange: (value: string) => void;
  onSend: (options?: { message?: string; imageAttachments?: ComposerImageAttachment[] }) => void;
  onStop: () => void;
  onCancelQueuedSuggestion: () => void;
  onSuggestionPick: (suggestion: SuggestionReply) => void;
  onProjectLinkSelect: (id: string) => void;
  onModelMenuOpenChange: (open: boolean | ((value: boolean) => boolean)) => void;
  onActiveModelChange: (model: ConversationModelChoice) => void;
}

function composerNoticeClass(tone: ComposerStateNotice["tone"]): string {
  if (tone === "approval") {
    return "border-amber-500/30 bg-amber-500/10 text-[rgb(var(--app-warning))]";
  }
  if (tone === "queued") {
    return "border-blue-500/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text-muted))]";
  }
  return "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]";
}

function composerNoticeDotClass(tone: ComposerStateNotice["tone"]): string {
  if (tone === "approval") return "bg-amber-500";
  if (tone === "queued") return "bg-[rgb(var(--app-accent))]";
  return "bg-[rgb(var(--app-text-subtle))]";
}

export function ComposerShell({
  mini,
  input,
  textareaRef,
  modelMenuRef,
  modelMenuOpen,
  activeModel,
  activeCustomModel,
  customModels,
  availableProjectLinks,
  projectLinksLoading,
  activeProjectLinkId,
  composerStateNotice,
  composerInputState,
  suggestionReplies,
  busy,
  workflowState,
  queuedSuggestionId,
  onInputChange,
  onSend,
  onStop,
  onCancelQueuedSuggestion,
  onSuggestionPick,
  onProjectLinkSelect,
  onModelMenuOpenChange,
  onActiveModelChange,
}: ComposerShellProps) {
  const imageInputId = useId();
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const {
    attachImages,
    attachImagesFromDataTransfer,
    attachmentError,
    clearImageAttachments,
    hasImageAttachments,
    hasPendingImageAttachments,
    imageAttachments,
    imageDragActive,
    imageInputRef,
    pendingImageAttachmentCount,
    removeImageAttachment,
    setImageDragActive,
  } = useComposerImageAttachments();
  const activeWorkflow = busy || workflowState?.status === "planning" || workflowState?.status === "running";
  const visibleComposerNotice = composerStateNotice?.tone === "queued" ? composerStateNotice : null;
  const showSuggestionReplies = !activeWorkflow && !composerStateNotice;
  const projectLinkRequired = !mini && !activeProjectLinkId;
  const projectLinkResolving = projectLinkRequired && projectLinksLoading;
  const effectiveComposerInputState = projectLinkRequired
    ? {
        ...composerInputState,
        controlsDisabled: true,
        inputDisabled: true,
        inputTitle: projectLinkResolving
          ? "Loading Project Link..."
          : "Create or select a Project Link before starting a project workflow.",
        placeholder: projectLinkResolving
          ? "Loading Project Link..."
          : "Create or select a Project Link first...",
        sendDisabled: true,
        sendTitle: projectLinkResolving
          ? "Loading Project Link..."
          : "Create or select a Project Link first.",
      }
    : composerInputState;
  const sendDisabled = !canSendComposerTurn({
    controlsDisabled: effectiveComposerInputState.controlsDisabled,
    sendDisabled: effectiveComposerInputState.sendDisabled,
    message: input,
    imageAttachmentCount: imageAttachments.length,
    pendingImageAttachmentCount,
  });
  const sendTitle = hasPendingImageAttachments
    ? "Preparing image..."
    : hasImageAttachments
      ? "Send message with image"
      : effectiveComposerInputState.sendTitle;
  const imageAttachmentSlotAvailable = hasComposerImageAttachmentSlot(
    imageAttachments.length,
    pendingImageAttachmentCount,
  );
  const sendWithAttachments = () => {
    if (sendDisabled) return;
    const attachments = imageAttachments;
    clearImageAttachments();
    onSend({ message: input, imageAttachments: attachments });
  };
  const toggleAttachmentMenu = () => {
    setAttachmentMenuOpen((open) => {
      const next = toggleAttachmentMenuState({ attachmentMenuOpen: open, modelMenuOpen });
      if (next.modelMenuOpen !== modelMenuOpen) onModelMenuOpenChange(next.modelMenuOpen);
      return next.attachmentMenuOpen;
    });
  };
  const toggleModelMenu = () => {
    const next = toggleModelMenuState({ attachmentMenuOpen, modelMenuOpen });
    setAttachmentMenuOpen(next.attachmentMenuOpen);
    onModelMenuOpenChange(next.modelMenuOpen);
  };

  useEffect(() => {
    if (modelMenuOpen) setAttachmentMenuOpen(false);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && attachmentMenuRef.current?.contains(target)) return;
      setAttachmentMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [attachmentMenuOpen]);

  return (
    <div className="input-panel border-t border-zinc-800/80 px-3 py-2">
      {!mini && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1 pb-1.5">
          <div className="flex min-w-[180px] flex-1 items-center gap-1.5">
            {projectLinksLoading && availableProjectLinks.length === 0 ? (
              <span className="text-[11px] text-zinc-700">Loading Project Link...</span>
            ) : availableProjectLinks.length > 0 ? (
              <>
                <svg className="h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <select
                  aria-label="Composer Project Link"
                  className="min-w-0 flex-1 cursor-pointer bg-transparent text-[11px] text-zinc-500 transition hover:text-zinc-300 focus:outline-none"
                  value={activeProjectLinkId ?? ""}
                  onChange={(event) => onProjectLinkSelect(event.target.value)}
                >
                  <option value="">No Project Link selected</option>
                  {availableProjectLinks.map((projectLink) => (
                    <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <span className="text-[11px] text-zinc-700">No Project Link yet — create one above</span>
            )}
          </div>
        </div>
      )}
      {visibleComposerNotice && (
        <div
          className={`mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${composerNoticeClass(visibleComposerNotice.tone)}`}
          aria-live="polite"
          data-composer-notice={visibleComposerNotice.tone}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${composerNoticeDotClass(visibleComposerNotice.tone)}`} aria-hidden="true" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{visibleComposerNotice.label}:</span>{" "}
              <span className="text-[rgb(var(--app-text))]">{visibleComposerNotice.detail}</span>
            </span>
          </span>
          {visibleComposerNotice.tone === "queued" && (
            <button
              type="button"
              onClick={onCancelQueuedSuggestion}
              className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {showSuggestionReplies && (
        <SuggestionReplyBar
          suggestions={suggestionReplies}
          onPick={onSuggestionPick}
          state={{
            busy,
            workflowStatus: workflowState?.status,
            queuedSuggestionId: queuedSuggestionId ?? undefined,
            blocked: workflowState?.status === "blocked",
            blockedReason: workflowState?.currentStep,
          }}
        />
      )}
      <div
        className={[
          "rounded-md border bg-[rgb(var(--app-surface))] px-3 py-2 shadow-sm transition focus-within:border-[rgb(var(--app-accent))]",
          imageDragActive ? "border-[rgb(var(--app-accent))]" : "border-[rgb(var(--app-border))]",
        ].join(" ")}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) return;
          event.preventDefault();
          setImageDragActive(true);
        }}
        onDragLeave={() => setImageDragActive(false)}
        onDrop={(event) => {
          setImageDragActive(false);
          if (!attachImagesFromDataTransfer(event.dataTransfer.items)) return;
          event.preventDefault();
        }}
      >
        <textarea
          ref={textareaRef}
          className="w-full resize-none bg-transparent text-sm text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
          placeholder={effectiveComposerInputState.placeholder}
          title={effectiveComposerInputState.inputTitle}
          rows={1}
          value={input}
          disabled={effectiveComposerInputState.inputDisabled}
          onChange={(event) => {
            onInputChange(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
          }}
          onPaste={(event) => {
            if (!attachImagesFromDataTransfer(event.clipboardData.items)) return;
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendWithAttachments();
            }
          }}
        />
        {(hasImageAttachments || hasPendingImageAttachments || attachmentError) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {hasPendingImageAttachments && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-1 text-xs text-[rgb(var(--app-text-muted))]">
                <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-accent))]" aria-hidden="true" />
                Preparing image...
              </span>
            )}
            {imageAttachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-1 text-xs text-[rgb(var(--app-text-muted))]"
                title={imageAttachmentLabel(attachment)}
              >
                <img
                  src={attachment.dataUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-sm object-cover"
                />
                <span className="min-w-0 truncate">{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeImageAttachment(attachment.id)}
                  className="shrink-0 rounded px-0.5 text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
                >
                  ×
                </button>
              </span>
            ))}
            {attachmentError && <span className="text-xs text-[rgb(var(--app-warning))]">{attachmentError}</span>}
          </div>
        )}
        <div className="relative mt-2 flex items-center gap-2">
          <div ref={attachmentMenuRef} className="relative">
            <input
              id={imageInputId}
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={!imageAttachmentSlotAvailable}
              className="hidden"
              onChange={(event) => {
                attachImages(event.target.files);
                setAttachmentMenuOpen(false);
              }}
            />
            <button
              type="button"
              onClick={toggleAttachmentMenu}
              disabled={effectiveComposerInputState.controlsDisabled}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
              title={effectiveComposerInputState.controlsDisabled ? effectiveComposerInputState.inputTitle : "Add image"}
              aria-label="Add image"
              aria-haspopup="menu"
              aria-expanded={attachmentMenuOpen}
            >
              <span className="text-xl leading-none">+</span>
            </button>
            {attachmentMenuOpen && (
              <div
                role="menu"
                className="absolute bottom-9 left-0 z-40 w-32 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-1 shadow-2xl"
              >
                <label
                  htmlFor={imageInputId}
                  role="menuitem"
                  aria-disabled={!imageAttachmentSlotAvailable}
                  tabIndex={imageAttachmentSlotAvailable ? 0 : -1}
                  onClick={(event) => {
                    if (!imageAttachmentSlotAvailable) {
                      event.preventDefault();
                      setAttachmentMenuOpen(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.currentTarget.click();
                  }}
                  className={[
                    "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35",
                    imageAttachmentSlotAvailable
                      ? ""
                      : "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[rgb(var(--app-text-muted))]",
                  ].join(" ")}
                  title={imageAttachmentSlotAvailable ? "Add image" : "Max 3 images"}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 7a3 3 0 013-3h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 14l2.2-2.2a1 1 0 011.4 0L15 15m-1-1 1.2-1.2a1 1 0 011.4 0L20 16M8.5 8.5h.01" />
                  </svg>
                  <span>Image</span>
                </label>
              </div>
            )}
          </div>
          <div ref={modelMenuRef} className="relative">
            <button
              type="button"
              onClick={toggleModelMenu}
              disabled={effectiveComposerInputState.controlsDisabled}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
              title={effectiveComposerInputState.controlsDisabled ? effectiveComposerInputState.inputTitle : "Conversation model"}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M13 3L6 13h5l-1 8 7-11h-5l1-7z" />
              </svg>
              <span className="max-w-[190px] truncate">
                {activeCustomModel ? activeCustomModel.label : DEFAULT_CONVERSATION_MODEL_LABEL}
              </span>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {modelMenuOpen && (
              <div className="absolute bottom-9 left-0 z-40 w-64 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 shadow-2xl">
                <p className="px-2 pb-1.5 text-xs text-[rgb(var(--app-text-muted))]">Model</p>
                <button
                  type="button"
                  onClick={() => {
                    onActiveModelChange("built_in");
                    onModelMenuOpenChange(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                >
                  <span>{DEFAULT_CONVERSATION_MODEL_LABEL}</span>
                  {activeModel === "built_in" && <span className="text-[rgb(var(--app-text-muted))]">✓</span>}
                </button>
                {customModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onActiveModelChange(model.id);
                      onModelMenuOpenChange(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                  >
                    <span className="min-w-0 truncate">{model.label}</span>
                    {activeModel === model.id && <span className="ml-2 text-[rgb(var(--app-text-muted))]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1" />
          {busy ? (
            <button
              onClick={onStop}
              className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:scale-95"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={sendWithAttachments}
              disabled={sendDisabled}
              title={sendTitle}
              aria-label="Send message"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19V5m0 0-6 6m6-6 6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
