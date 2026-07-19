import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { renderMermaidDiagram } from "./mermaidArtifactRenderer.js";

type MermaidPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

export function MermaidArtifactPreview({ source }: { source: string }) {
  const reactId = useId();
  const renderId = useMemo(
    () => `artifact-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    [reactId],
  );
  const requestId = useRef(0);
  const [state, setState] = useState<MermaidPreviewState>({ status: "idle" });

  useEffect(() => {
    requestId.current += 1;
    setState({ status: "idle" });
  }, [source]);

  const renderPreview = useCallback(() => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setState({ status: "loading" });
    void renderMermaidDiagram(renderId, source)
      .then((result) => {
        if (requestId.current === currentRequest) {
          setState({ status: "ready", svg: result.svg });
        }
      })
      .catch((error: unknown) => {
        if (requestId.current === currentRequest) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }, [renderId, source]);

  if (state.status === "idle") {
    return (
      <div className="rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-[rgb(var(--app-text))]">Mermaid diagram preview</p>
            <p className="mt-1 leading-relaxed">
              Preview rendering is optional so opening the artifact stays lightweight.
            </p>
          </div>
          <button
            type="button"
            onClick={renderPreview}
            className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text))] transition hover:bg-[rgb(var(--app-bg-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
          >
            Render diagram
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]" aria-live="polite">
        <p className="font-medium">Rendering Mermaid diagram...</p>
        <div className="mt-2 h-24 rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-md border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-3 py-2" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-[rgb(var(--app-danger))]">Mermaid render failed</p>
            <p className="mt-1 break-words text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
              {state.message}
            </p>
          </div>
          <button
            type="button"
            onClick={renderPreview}
            className="shrink-0 rounded-md border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-danger))] transition hover:bg-[rgb(var(--app-danger-soft))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-danger-border))] active:translate-y-px"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={renderPreview}
          className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          Render again
        </button>
      </div>
      <div
        data-testid="mermaid-artifact-svg"
        className="overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-white p-3 text-slate-900 shadow-inner [&_svg]:mx-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </div>
  );
}
