import { useEffect, useState } from "react";
import { configureDaemon, fetchDaemonConfig } from "../../api.js";
import { normalizeStaleAgeHours } from "./reviewQueueRuntime.js";

export function useReviewQueueSettings() {
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(true);
  const [autoApproveSaving, setAutoApproveSaving] = useState(false);
  const [autoApproveError, setAutoApproveError] = useState<string | null>(null);
  const [staleAgeHours, setStaleAgeHours] = useState(24);
  const [staleAgeSaving, setStaleAgeSaving] = useState(false);

  useEffect(() => {
    fetchDaemonConfig()
      .then((cfg) => {
        setAutoApproveEnabled(
          cfg && typeof cfg.reviewAutoApproveEnabled === "boolean"
            ? cfg.reviewAutoApproveEnabled
            : true,
        );
        if (cfg && Number.isFinite(cfg.reviewStaleAgeHours) && cfg.reviewStaleAgeHours > 0) {
          setStaleAgeHours(cfg.reviewStaleAgeHours);
        }
      })
      .catch(() => {
        setAutoApproveEnabled(true);
      });
  }, []);

  async function setGlobalAutoApprove(enabled: boolean): Promise<void> {
    setAutoApproveSaving(true);
    setAutoApproveError(null);
    try {
      await configureDaemon({ reviewAutoApproveEnabled: enabled });
      setAutoApproveEnabled(enabled);
    } catch (err) {
      setAutoApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setAutoApproveSaving(false);
    }
  }

  async function saveStaleAgeHours(value: number): Promise<void> {
    const normalized = normalizeStaleAgeHours(value);
    setStaleAgeHours(normalized);
    setStaleAgeSaving(true);
    setAutoApproveError(null);
    try {
      await configureDaemon({ reviewStaleAgeHours: normalized });
    } catch (err) {
      setAutoApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaleAgeSaving(false);
    }
  }

  return {
    autoApproveEnabled,
    autoApproveSaving,
    autoApproveError,
    staleAgeHours,
    staleAgeSaving,
    setStaleAgeHours,
    setGlobalAutoApprove,
    saveStaleAgeHours,
  };
}
