import type { ChatCheckpointPreview } from "../../api.js";

interface CheckpointPreviewSectionProps {
  preview: ChatCheckpointPreview | null;
  previewLoading: boolean;
}

export function CheckpointPreviewSection({
  preview,
  previewLoading,
}: CheckpointPreviewSectionProps): JSX.Element {
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Snapshot Preview
        </h3>
        {previewLoading && (
          <span className="text-[11px] text-[rgb(var(--app-text-muted))]">Loading</span>
        )}
      </div>
      {!previewLoading && !preview && (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          No preview available for this checkpoint.
        </p>
      )}
      {preview && (
        <div className="space-y-3">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-[rgb(var(--app-text-muted))]">Branch</p>
              <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
                {preview.branch || "not available"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--app-text-muted))]">Files</p>
              <p className="mt-1 font-mono text-[rgb(var(--app-text))]">{preview.files.length}</p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--app-text-muted))]">Diff</p>
              <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
                {preview.diffChars} chars{preview.diffTruncated ? " · truncated" : ""}
              </p>
            </div>
          </div>
          <CheckpointChangedFiles files={preview.files} />
          {preview.statusLines.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-[rgb(var(--app-text-muted))]">Status</p>
              <pre className="max-h-28 overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2 text-xs text-[rgb(var(--app-text-muted))]">
                {preview.statusLines.join("\n")}
              </pre>
            </div>
          )}
          {preview.diffPreview && (
            <div>
              <p className="mb-1 text-xs text-[rgb(var(--app-text-muted))]">Diff Preview</p>
              <pre className="max-h-72 overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2 text-xs text-[rgb(var(--app-text-muted))]">
                {preview.diffPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CheckpointChangedFiles({ files }: { files: string[] }): JSX.Element | null {
  if (files.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-[rgb(var(--app-text-muted))]">Changed Files</p>
      <div className="flex flex-wrap gap-1.5">
        {files.slice(0, 12).map((file) => (
          <span
            key={file}
            className="max-w-full truncate rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1 font-mono text-xs text-[rgb(var(--app-text-muted))]"
          >
            {file}
          </span>
        ))}
        {files.length > 12 && (
          <span className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]">
            +{files.length - 12} more
          </span>
        )}
      </div>
    </div>
  );
}
