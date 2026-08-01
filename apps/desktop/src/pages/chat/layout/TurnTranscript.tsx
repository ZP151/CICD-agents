import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { turnTranscriptElapsedMs } from "../chatTurnTranscript.js";
import type { Bubble, TurnTranscriptBlock } from "../chat.types.js";
import { PendingActionCard } from "../approval/PendingActionCard.js";
import { commandLanguage, type CommandCodeLanguage } from "./commandLanguage.js";

const CommandCodeViewer = lazy(() => import("./CommandCodeViewer.js").then(({ CommandCodeViewer: Viewer }) => ({ default: Viewer })));
// The transcript is also rendered in Node-side tests/history previews where a
// layout effect is neither useful nor safe. In the desktop browser it makes
// the execution → final handoff paint atomically: Working is collapsed before
// the first final text frame can become visible.
const useTranscriptLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function TurnTranscriptView({
  bubble,
  approval,
  onConfirmApproval,
  onCancelApproval,
}: {
  bubble: Bubble;
  approval?: Bubble;
  onConfirmApproval?: (id: string) => void;
  onCancelApproval?: (id: string, feedback?: string) => void;
}) {
  const transcript = bubble.turnTranscript;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(() => transcript?.status === "working");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openCommands, setOpenCommands] = useState<Record<string, boolean>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const previousWorking = useRef(transcript?.status === "working");

  useEffect(() => {
    if (transcript?.status !== "working") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [transcript?.status]);

  useTranscriptLayoutEffect(() => {
    const working = transcript?.status === "working";
    const approvalWaiting = approval?.pendingStatus === "waiting" || approval?.pendingStatus === "executing";
    if (previousWorking.current && !working && !approvalWaiting) {
      // A completed Turn is reopened as a record, so start at the first
      // public statement rather than preserving the live auto-follow offset
      // from its final command group.
      followLatestRef.current = false;
      bodyRef.current?.scrollTo({ top: 0 });
      setOpen(false);
    }
    if (working) setOpen(true);
    if (approvalWaiting) setOpen(true);
    previousWorking.current = working;
  }, [approval?.pendingStatus, transcript?.status]);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element || !followLatestRef.current || !open) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [open, transcript?.blocks.length]);

  if (!transcript) return null;
  const working = transcript.status === "working";
  const label = working ? "Working" : transcript.status === "cancelled" ? "Cancelled" : transcript.status === "failed" ? "Stopped" : "Worked";
  const elapsed = formatElapsed(turnTranscriptElapsedMs(transcript, now));
  // A real model-wait state is transcript content too: it gives a delayed
  // runtime a truthful, expandable status without fabricating a plan.
  const hasContent = transcript.blocks.length > 0 || Boolean(approval) || Boolean(transcript.waitingForModel);

  return (
    <section className="mb-3 max-w-[760px] text-[13px] text-[rgb(var(--app-text-muted))]" aria-live={working ? "polite" : "off"}>
      <div className="min-h-8 py-1.5">
        {hasContent ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-7 items-center gap-1 rounded px-1 text-left text-[rgb(var(--app-text-subtle))] transition-[background,color] duration-150 hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--app-text))]"
          >
            <span>{label} for {elapsed}</span>
            <Chevron open={open} />
          </button>
        ) : (
          <span className="inline-flex min-h-7 items-center px-1 text-[rgb(var(--app-text-subtle))]">{label} for {elapsed}</span>
        )}
      </div>
      <div className="h-px w-full bg-[rgb(var(--app-border))]" />
      {open && hasContent && (
        <div
          ref={bodyRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            followLatestRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 28;
          }}
          className="max-h-[420px] overflow-y-auto pr-1 [scrollbar-color:rgb(var(--app-text-subtle))_transparent] [scrollbar-width:thin]"
        >
          <div className="space-y-1 pb-1">
            {transcript.blocks
              // The pending-action card is the live approval block. Its
              // compact action description avoids duplicating a model's
              // lengthy explanation inside the activity stream.
              .filter((block) => block.kind !== "approval" || !approval)
              .map((block) => (
              <TranscriptBlockView
                // A public statement and its resulting command group share a
                // logical decision id. Prefix the React key by block kind so
                // that this intentional relationship never becomes a key
                // collision while the transcript is streaming.
                key={`${block.kind}:${block.id}`}
                block={block}
                openGroups={openGroups}
                openCommands={openCommands}
                setOpenGroups={setOpenGroups}
                setOpenCommands={setOpenCommands}
              />
              ))}
            {working && transcript.waitingForModel && (
              <p className="px-1 py-1 leading-5 text-[rgb(var(--app-text-subtle))]" role="status">Waiting for model response…</p>
            )}
            {approval && onConfirmApproval && onCancelApproval && (
              <PendingActionCard
                bubble={approval}
                onConfirm={() => onConfirmApproval(approval.id)}
                onCancel={(feedback) => onCancelApproval(approval.id, feedback)}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TranscriptBlockView({
  block,
  openGroups,
  openCommands,
  setOpenGroups,
  setOpenCommands,
}: {
  block: TurnTranscriptBlock;
  openGroups: Record<string, boolean>;
  openCommands: Record<string, boolean>;
  setOpenGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setOpenCommands: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  if (block.kind === "statement") {
    return <p className="animate-[turn-transcript-in_150ms_ease-out] whitespace-pre-wrap px-1 py-1 leading-5 text-[rgb(var(--app-text))]">{block.text}</p>;
  }
  if (block.kind === "approval") {
    return <p className="px-1 py-1 leading-5 text-[rgb(var(--app-text-muted))]">{block.text}</p>;
  }
  const groupOpen = openGroups[block.id] ?? false;
  return (
    <section className="animate-[turn-transcript-in_150ms_ease-out] py-0.5">
      <button
        type="button"
        aria-expanded={groupOpen}
        onClick={() => setOpenGroups((current) => ({ ...current, [block.id]: !groupOpen }))}
        className="inline-flex min-h-7 items-center gap-1 rounded px-1 text-[rgb(var(--app-text-muted))] transition-[background,color] duration-150 hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--app-text))]"
      >
        {block.connector?.kind === "mcp" ? <McpConnectorIcon /> : <TerminalIcon />}
        <span>{block.label}</span>
        {block.connector?.kind === "mcp" && (
          <span className="ml-1 text-[11px] text-[rgb(var(--app-text-subtle))]" title={`MCP connector: ${block.connector.label}`}>
            {block.connector.label}
          </span>
        )}
        <Chevron open={groupOpen} />
      </button>
      {groupOpen && (
        <div className="ml-1 space-y-px pb-1 pt-0.5">
          {block.commands.map((command) => {
            const commandOpen = openCommands[command.id] ?? false;
            return (
              <div key={command.id}>
                <button
                  type="button"
                  aria-expanded={commandOpen}
                  onClick={() => setOpenCommands((current) => ({ ...current, [command.id]: !commandOpen }))}
                  title={command.command}
                  className={`flex min-h-[26px] max-w-full items-center gap-1.5 rounded px-1.5 text-left transition-[background,color] duration-150 hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--app-text))] ${
                    commandOpen ? "text-[rgb(var(--app-text))]" : "text-[rgb(var(--app-text-subtle))]"
                  }`}
                >
                  <TerminalIcon />
                  <span className="shrink-0">{commandActivityLabel(command.durationMs)}</span>
                  <Chevron open={commandOpen} />
                </button>
                {commandOpen && (
                  <div className="ml-1 mt-1 overflow-hidden rounded-[11px] border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised)_/_0.18)] animate-[turn-command-open_220ms_cubic-bezier(.22,.8,.24,1)]">
                    <div className="px-4 pb-1 pt-2 text-xs text-[rgb(var(--app-text-muted))]">Shell</div>
                    <LazyCommandCodeViewer
                      value={commandTerminalTranscript(command.command, command.output)}
                      language={commandLanguage(command.command)}
                      ariaLabel="Executed command and response"
                      output={Boolean(command.output)}
                    />
                    <div className="flex justify-end px-3 pb-2 pt-1 text-[11px] text-[rgb(var(--app-text-subtle))]">{commandStatusLabel(command.status)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LazyCommandCodeViewer({
  value,
  language,
  ariaLabel,
  output = false,
}: {
  value: string;
  language: "shell" | "powershell" | "diff";
  ariaLabel: string;
  output?: boolean;
}) {
  return (
    <Suspense
      fallback={(
        <pre
          className={`m-0 overflow-auto whitespace-pre-wrap break-words px-4 py-2 font-mono text-[12.5px] leading-[1.62] text-[rgb(var(--app-text))] ${
            output ? "max-h-[260px]" : "max-h-[150px]"
          }`}
          aria-label={ariaLabel}
        >
          {value}
        </pre>
      )}
    >
      <CommandCodeViewer value={value} language={language} ariaLabel={ariaLabel} output={output} />
    </Suspense>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <span className={`text-[11px] opacity-70 transition-transform duration-[140ms] ${open ? "rotate-90" : ""}`} aria-hidden="true">›</span>;
}

function TerminalIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 opacity-75" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.25" width="13" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="m5 6 2 2-2 2M9.25 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Keep connector provenance visible without turning an MCP action into a
 * different type of transcript block. Built-in shell groups retain the
 * terminal glyph from the reference interaction; externally-provided action
 * groups gain a small plug mark and their stable connector label.
 */
function McpConnectorIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 opacity-75" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 2.5v3m4-3v3M4.25 5.5h7.5v3.25a3.75 3.75 0 0 1-7.5 0V5.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12.5v1.25M5.75 13.75h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function commandActivityLabel(durationMs?: number): string {
  return durationMs === undefined ? "Ran command" : `Ran command in ${formatDuration(durationMs)}`;
}

export function commandTerminalTranscript(command: string, output?: string): string {
  return `$ ${command}${output ? `\n${output}` : ""}`;
}

function commandStatusLabel(status: "running" | "succeeded" | "failed" | "cancelled"): string {
  if (status === "succeeded") return "Success";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Running";
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
