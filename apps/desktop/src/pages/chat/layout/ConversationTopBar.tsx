import type { RefObject } from "react";

interface ConversationTopBarProps {
  historyOpen: boolean;
  historyWidth: number;
  onToggleHistory: () => void;
  rightPanelOpen: boolean;
  rightPanelOverlay: boolean;
  rightWidth: number;
  onToggleRight: () => void;
  summaryPinnedAvailable: boolean;
  summaryPinnedOpen: boolean;
  onToggleSummaryPinned: () => void;
  titleEditing: boolean;
  customTitle: string | null;
  conversationTitle: string | null;
  titleInputRef: RefObject<HTMLInputElement>;
  onStartTitleEdit: () => void;
  onConfirmTitle: (value: string) => void;
  onCancelTitle: () => void;
}

function ToggleLeftPanelIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M5.5 1.5v13" />
      {active && <path d="M2.5 5h2M2.5 8h2M2.5 11h2" strokeOpacity="0.6" />}
    </svg>
  );
}

function ToggleRightPanelIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <path d="M10.5 1.5v13" />
      {active && <path d="M11.5 5h2M11.5 8h2M11.5 11h2" strokeOpacity="0.6" />}
    </svg>
  );
}

export function ConversationTopBar({
  historyOpen,
  historyWidth,
  onToggleHistory,
  rightPanelOpen,
  rightPanelOverlay,
  rightWidth,
  onToggleRight,
  summaryPinnedAvailable,
  summaryPinnedOpen,
  onToggleSummaryPinned,
  titleEditing,
  customTitle,
  conversationTitle,
  titleInputRef,
  onStartTitleEdit,
  onConfirmTitle,
  onCancelTitle,
}: ConversationTopBarProps) {
  const summaryVisible = summaryPinnedAvailable && summaryPinnedOpen;
  const panelToggleClass = (active: boolean) =>
    `rounded p-1.5 transition-colors ${
      active
        ? "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))]"
        : "text-[rgb(var(--app-text-subtle))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
    }`;
  const summaryButtonClass = panelToggleClass(summaryVisible);
  const summaryButton = summaryPinnedAvailable ? (
    <button
      type="button"
      onClick={onToggleSummaryPinned}
      className={summaryButtonClass}
      title={summaryVisible ? "Hide pinned summary" : "Show pinned summary"}
      aria-label={summaryVisible ? "Hide pinned summary" : "Show pinned summary"}
      aria-pressed={summaryVisible}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 5h12M6 12h8M6 19h10" />
      </svg>
    </button>
  ) : null;

  return (
    <div className="relative flex min-h-[40px] shrink-0 items-center border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg))]">
      {/* This width follows the resizable history panel. Keeping it immediate
          avoids a layout-animation queue trailing behind pointer resizing. */}
      <div
        className="flex shrink-0 items-center overflow-hidden"
        style={{ width: historyOpen ? historyWidth : 40 }}
      >
        <button
          onClick={onToggleHistory}
          className={`ml-1.5 ${panelToggleClass(historyOpen)}`}
          title={historyOpen ? "Collapse history" : "Expand history"}
        >
          <ToggleLeftPanelIcon active={historyOpen} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 pr-24">
        <div className="min-w-0 flex-1">
          {titleEditing ? (
            <input
              ref={titleInputRef}
              className="w-full rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-sm text-[rgb(var(--app-text))] focus:border-[rgb(var(--app-accent))] focus:outline-none"
              defaultValue={customTitle ?? conversationTitle ?? ""}
              onBlur={(event) => onConfirmTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onConfirmTitle((event.target as HTMLInputElement).value);
                if (event.key === "Escape") onCancelTitle();
              }}
              autoFocus
            />
          ) : (
            <button
              className="group flex max-w-full items-center gap-1.5"
              title="Click to rename"
              onClick={onStartTitleEdit}
            >
              <span className="truncate text-sm text-[rgb(var(--app-text-muted))] transition-colors group-hover:text-[rgb(var(--app-text))]">
                {customTitle ?? conversationTitle ?? (
                  <span className="text-[rgb(var(--app-text-subtle))]">New conversation</span>
                )}
              </span>
              <svg className="h-3 w-3 shrink-0 text-[rgb(var(--app-text-subtle))] opacity-0 transition-opacity group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        className={[
          "relative flex h-full shrink-0 items-center justify-end overflow-visible",
        ].join(" ")}
        style={{ width: conversationTopBarRightSlotWidth({ rightPanelOpen, rightPanelOverlay, rightWidth }) }}
      >
        {summaryButton && (
          <div className="absolute right-full top-1/2 z-30 mr-2 -translate-y-1/2">
            {summaryButton}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleRight}
          className={`mr-1.5 ${panelToggleClass(rightPanelOpen)}`}
          title={rightPanelOpen ? "Collapse code panel" : "Expand code panel"}
          aria-pressed={rightPanelOpen}
        >
          <ToggleRightPanelIcon active={rightPanelOpen} />
        </button>
      </div>
    </div>
  );
}

export function conversationTopBarRightSlotWidth({
  rightPanelOpen,
  rightPanelOverlay,
  rightWidth,
}: {
  rightPanelOpen: boolean;
  rightPanelOverlay: boolean;
  rightWidth: number;
}): number {
  if (!rightPanelOpen || rightPanelOverlay) return 40;
  return rightWidth;
}
