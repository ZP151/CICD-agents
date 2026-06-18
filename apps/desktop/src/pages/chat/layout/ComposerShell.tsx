import type { RefObject } from "react";
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
  activeProjectLinkId: string | null;
  composerStateNotice: ComposerStateNotice | null;
  composerInputState: ComposerInputState;
  suggestionReplies: SuggestionReply[];
  busy: boolean;
  workflowState: WorkflowEventState | null;
  queuedSuggestionId: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
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
  return (
    <div className="input-panel border-t border-zinc-800/80 px-3 py-2">
      {!mini && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1 pb-1.5">
          <div className="flex min-w-[180px] flex-1 items-center gap-1.5">
            {availableProjectLinks.length > 0 ? (
              <>
                <svg className="h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <select
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
      {composerStateNotice && (
        <div
          className={`mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${composerNoticeClass(composerStateNotice.tone)}`}
          aria-live="polite"
          data-composer-notice={composerStateNotice.tone}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${composerNoticeDotClass(composerStateNotice.tone)}`} aria-hidden="true" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{composerStateNotice.label}:</span>{" "}
              <span className="text-[rgb(var(--app-text))]">{composerStateNotice.detail}</span>
            </span>
          </span>
          {composerStateNotice.tone === "queued" && (
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
      <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 shadow-sm transition focus-within:border-[rgb(var(--app-accent))]">
        <textarea
          ref={textareaRef}
          className="w-full resize-none bg-transparent text-sm text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
          placeholder={composerInputState.placeholder}
          title={composerInputState.inputTitle}
          rows={1}
          value={input}
          disabled={composerInputState.inputDisabled}
          onChange={(event) => {
            onInputChange(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="relative mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={composerInputState.controlsDisabled}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
            title={composerInputState.controlsDisabled ? composerInputState.inputTitle : "Attach context"}
          >
            <span className="text-xl leading-none">+</span>
          </button>
          <div ref={modelMenuRef} className="relative">
            <button
              type="button"
              onClick={() => onModelMenuOpenChange((value) => !value)}
              disabled={composerInputState.controlsDisabled}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-muted))]"
              title={composerInputState.controlsDisabled ? composerInputState.inputTitle : "Conversation model"}
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
              onClick={onSend}
              disabled={composerInputState.sendDisabled}
              title={composerInputState.sendTitle}
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
