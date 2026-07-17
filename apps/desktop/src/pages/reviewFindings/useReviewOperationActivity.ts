import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchProjectLinkReviewOperations,
  recordProjectLinkReviewOperation,
} from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import { operationActivityCategory, type ActivityCategory } from "./reviewQueueViewModel.js";

export function useReviewOperationActivity(projectLinkId: string, projectLinkScopeKey = "") {
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>("all");
  const queryClient = useQueryClient();

  const operationsQuery = useQuery({
    queryKey: ["reviewActivity", projectLinkId, projectLinkScopeKey],
    enabled: Boolean(projectLinkId),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === projectLinkId && previousKey[2] === projectLinkScopeKey
        ? previous
        : undefined;
    },
    queryFn: async () => (await fetchProjectLinkReviewOperations(projectLinkId)).slice(0, 6),
    retry: false,
  });

  const operationEvents = operationsQuery.data ?? [];

  const refreshOperations = useCallback(() => {
    if (!projectLinkId) return;
    void operationsQuery.refetch();
  }, [operationsQuery, projectLinkId]);

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
      .then(() => queryClient.invalidateQueries({ queryKey: ["reviewActivity", projectLinkId] }))
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
