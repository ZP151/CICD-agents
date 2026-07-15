import { useQuery } from "@tanstack/react-query";
import {
  fetchChatIndexStatus,
  type ChatIndexStatus,
} from "../../api.js";

interface ChatIndexStatusOptions {
  activeProjectLinkId: string | null;
  repoPath: string;
}

export function useChatIndexStatus({
  activeProjectLinkId,
  repoPath,
}: ChatIndexStatusOptions): { status: ChatIndexStatus | null; ready: boolean; refreshing: boolean } {
  const repo = repoPath.trim();
  const query = useQuery({
    queryKey: ["chatIndexStatus", repo, activeProjectLinkId ?? ""],
    enabled: Boolean(repo),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: () => fetchChatIndexStatus(repo, activeProjectLinkId ?? undefined),
    retry: false,
  });

  if (!repo) return { status: null, ready: true, refreshing: false };
  return {
    status: query.data ?? null,
    ready: query.isSuccess || query.isError,
    refreshing: query.isFetching && Boolean(query.data),
  };
}
