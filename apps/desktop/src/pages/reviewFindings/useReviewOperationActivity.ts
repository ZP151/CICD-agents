import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProjectLinkReviewOperations,
  recordProjectLinkReviewOperation,
} from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import { operationActivityCategory, type ActivityCategory } from "./reviewQueueViewModel.js";

export function useReviewOperationActivity(projectLinkId: string) {
  const [operationEvents, setOperationEvents] = useState<ReviewOperationEvent[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>("all");

  const refreshOperations = useCallback(() => {
    if (!projectLinkId) return;
    fetchProjectLinkReviewOperations(projectLinkId)
      .then((events) => setOperationEvents(events.slice(0, 6)))
      .catch(() => setOperationEvents([]));
  }, [projectLinkId]);

  useEffect(() => {
    refreshOperations();
  }, [refreshOperations]);

  const filteredOperationEvents = useMemo(
    () =>
      operationEvents.filter(
        (event) => activityFilter === "all" || operationActivityCategory(event) === activityFilter,
      ),
    [activityFilter, operationEvents],
  );

  function recordOperation(event: Parameters<typeof recordProjectLinkReviewOperation>[1]): void {
    if (!projectLinkId) return;
    void recordProjectLinkReviewOperation(projectLinkId, event)
      .then(() => fetchProjectLinkReviewOperations(projectLinkId))
      .then((events) => setOperationEvents(events.slice(0, 6)))
      .catch(() => {
        /* activity is best-effort */
      });
  }

  return {
    operationEvents,
    activityFilter,
    filteredOperationEvents,
    setActivityFilter,
    recordOperation,
    refreshOperations,
  };
}
