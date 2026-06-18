import { useEffect, useState } from "react";
import {
  fetchChatCheckpointPreview,
  fetchChatCheckpointRollbackPlan,
  type ChatCheckpointActivity,
  type ChatCheckpointPreview,
  type ChatCheckpointRollbackPlan,
} from "../../api.js";

export function useCheckpointDetails(
  selectedCheckpoint: ChatCheckpointActivity | null,
  onError: (message: string) => void,
) {
  const [checkpointPreview, setCheckpointPreview] = useState<ChatCheckpointPreview | null>(null);
  const [checkpointRollbackPlan, setCheckpointRollbackPlan] =
    useState<ChatCheckpointRollbackPlan | null>(null);
  const [checkpointPreviewLoading, setCheckpointPreviewLoading] = useState(false);
  const [checkpointRollbackLoading, setCheckpointRollbackLoading] = useState(false);

  useEffect(() => {
    if (!selectedCheckpoint) {
      setCheckpointPreview(null);
      setCheckpointRollbackPlan(null);
      return;
    }
    let cancelled = false;
    setCheckpointPreviewLoading(true);
    setCheckpointRollbackLoading(true);
    void Promise.allSettled([
      fetchChatCheckpointPreview(selectedCheckpoint.checkpointId),
      fetchChatCheckpointRollbackPlan(selectedCheckpoint.checkpointId),
    ])
      .then(([previewResult, planResult]) => {
        if (cancelled) return;
        if (previewResult.status === "fulfilled") {
          setCheckpointPreview(previewResult.value);
        } else {
          setCheckpointPreview(null);
          onError(errorMessage(previewResult.reason));
        }
        if (planResult.status === "fulfilled") {
          setCheckpointRollbackPlan(planResult.value);
        } else {
          setCheckpointRollbackPlan(null);
          onError(errorMessage(planResult.reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckpointPreviewLoading(false);
          setCheckpointRollbackLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError, selectedCheckpoint]);

  return {
    checkpointPreview,
    checkpointPreviewLoading,
    checkpointRollbackPlan,
    checkpointRollbackLoading,
  };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
