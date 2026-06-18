import { suggestionButtonTitle, suggestionReplyButtonState } from "./suggestionReplyState.js";
import type {
  CommandChipBarProps,
  SuggestionReplyAction,
  SuggestionReplyBarProps,
  SuggestionReplyButtonState,
} from "./suggestionReplyTypes.js";

export function SuggestionReplyBar({ suggestions, onPick, state }: SuggestionReplyBarProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
      {suggestions.map((suggestion) => {
        const buttonState = suggestionReplyButtonState(suggestion, state);
        const disabled = buttonState === "queued" || buttonState === "blocked";
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onPick(suggestion)}
            disabled={disabled}
            aria-busy={buttonState === "running" ? true : undefined}
            className={suggestionButtonClass(suggestion.action, buttonState)}
            data-action-kind={suggestion.action.kind}
            data-suggestion-state={buttonState}
            title={suggestionButtonTitle(suggestion, buttonState, state)}
          >
            <span className={suggestionActionDotClass(suggestion.action, buttonState)} aria-hidden="true" />
            {suggestion.label}
            {buttonState !== "idle" && (
              <span className="ml-0.5 rounded border border-current/20 px-1 py-px text-[10px] font-medium opacity-80">
                {suggestionStateLabel(buttonState)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CommandChipBar({ commands, onPick, disabled }: CommandChipBarProps) {
  if (commands.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
      {commands.map((command) => (
        <button
          key={command.id}
          type="button"
          onClick={() => onPick(command)}
          disabled={disabled}
          className={commandChipClass(command.action)}
          data-action-kind={command.action.kind}
          title={disabled ? "Finish the current approval first" : command.message}
        >
          <span className="shrink-0 text-[10px] text-[rgb(var(--app-text-subtle))]" aria-hidden="true">
            {commandActionGlyph(command.action)}
          </span>
          {command.label}
        </button>
      ))}
    </div>
  );
}

function suggestionButtonClass(action: SuggestionReplyAction, state: SuggestionReplyButtonState = "idle"): string {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-65 disabled:active:translate-y-0";
  if (state === "queued") {
    return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`;
  }
  if (state === "blocked") {
    return `${base} border-red-500/30 bg-red-500/10 text-[rgb(var(--app-danger))]`;
  }
  if (state === "running") {
    return `${base} border-blue-500/40 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))] hover:border-blue-500/60 hover:bg-[rgb(var(--app-surface-raised))]`;
  }
  if (action.kind === "requires_approval") {
    return `${base} border-amber-500/30 bg-amber-500/10 text-[rgb(var(--app-warning))] hover:bg-amber-500/15`;
  }
  if (action.kind === "workspace_action") {
    return `${base} border-blue-500/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))] hover:border-blue-500/50 hover:bg-[rgb(var(--app-surface-raised))]`;
  }
  return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
}

function commandChipClass(action: SuggestionReplyAction): string {
  const base = "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[rgb(var(--app-text-subtle))]";
  if (action.kind === "workspace_action") {
    return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:border-blue-500/40 hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
  }
  return `${base} border-[rgb(var(--app-border))] bg-transparent text-[rgb(var(--app-text-subtle))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]`;
}

function suggestionActionDotClass(action: SuggestionReplyAction, state: SuggestionReplyButtonState = "idle"): string {
  if (state === "queued") return "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500";
  if (state === "blocked") return "h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-danger))]";
  if (state === "running") return "h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[rgb(var(--app-accent))]";
  if (action.kind === "requires_approval") return "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500";
  if (action.kind === "workspace_action") return "h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-accent))]";
  return "h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--app-text-faint))]";
}

function suggestionStateLabel(state: SuggestionReplyButtonState): string {
  if (state === "running") return "Queue";
  if (state === "queued") return "Queued";
  if (state === "blocked") return "Blocked";
  return "";
}

function commandActionGlyph(action: SuggestionReplyAction): string {
  if (action.kind === "workspace_action") return "->";
  if (action.kind === "requires_approval") return "!";
  return ">";
}
