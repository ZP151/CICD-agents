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
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Snapshot Preview
        </h3>
        {previewLoading && <span className="text-[11px] text-zinc-600">Loading</span>}
      </div>
      {!previewLoading && !preview && (
        <p className="text-sm text-zinc-600">No preview available for this checkpoint.</p>
      )}
      {preview && (
        <div className="space-y-3">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-600">Branch</p>
              <p className="mt-1 break-words font-mono text-zinc-300">
                {preview.branch || "unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-600">Files</p>
              <p className="mt-1 font-mono text-zinc-300">{preview.files.length}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-600">Diff</p>
              <p className="mt-1 font-mono text-zinc-300">
                {preview.diffChars} chars{preview.diffTruncated ? " · truncated" : ""}
              </p>
            </div>
          </div>
          <CheckpointChangedFiles files={preview.files} />
          {preview.statusLines.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-zinc-600">Status</p>
              <pre className="max-h-28 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-xs text-zinc-400">
                {preview.statusLines.join("\n")}
              </pre>
            </div>
          )}
          {preview.diffPreview && (
            <div>
              <p className="mb-1 text-xs text-zinc-600">Diff Preview</p>
              <pre className="max-h-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-xs text-zinc-400">
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
      <p className="mb-1 text-xs text-zinc-600">Changed Files</p>
      <div className="flex flex-wrap gap-1.5">
        {files.slice(0, 12).map((file) => (
          <span
            key={file}
            className="max-w-full truncate rounded-md border border-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400"
          >
            {file}
          </span>
        ))}
        {files.length > 12 && (
          <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">
            +{files.length - 12} more
          </span>
        )}
      </div>
    </div>
  );
}
