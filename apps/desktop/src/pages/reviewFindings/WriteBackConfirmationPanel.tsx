import type { ReviewQueueItem } from "../../api.js";
import { ActionButton, InlineNotice } from "../../components/workbench/WorkbenchPrimitives.js";
import { writeBackConfirmationText, type ManualDisposition } from "./reviewQueueRuntime.js";

/**
 * MP-009/RA-041: before any ADO mutation, show exactly what will be written
 * and where, and require explicit approval. Declining still records the
 * disposition locally — only the remote write is skipped.
 */
export function WriteBackConfirmationPanel({
  item,
  disposition,
  onConfirm,
  onKeepLocal,
}: {
  item: ReviewQueueItem;
  disposition: ManualDisposition;
  onConfirm: () => void;
  onKeepLocal: () => void;
}): JSX.Element {
  const { target, content } = writeBackConfirmationText(item, disposition);
  return (
    <InlineNotice tone="warning" title="Confirm Azure DevOps write-back">
      <div className="space-y-1.5 text-xs leading-5">
        <p className="font-medium text-[rgb(var(--app-text))]">Target</p>
        <p className="text-[rgb(var(--app-text-muted))]">{target}</p>
        <p className="mt-2 font-medium text-[rgb(var(--app-text))]">Content that will be posted</p>
        <pre className="whitespace-pre-wrap rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-2.5 py-2 text-[11px] leading-4 text-[rgb(var(--app-text-muted))]">
          {content}
        </pre>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <ActionButton type="button" tone="primary" className="min-h-7" onClick={onConfirm}>
          Approve and write to ADO
        </ActionButton>
        <ActionButton type="button" tone="secondary" className="min-h-7" onClick={onKeepLocal}>
          Keep local only
        </ActionButton>
      </div>
    </InlineNotice>
  );
}
