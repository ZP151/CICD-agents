import { useCallback, useEffect, useState } from "react";
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
}: ChatIndexStatusOptions): ChatIndexStatus | null {
  const [indexStatus, setIndexStatus] = useState<ChatIndexStatus | null>(null);

  const loadIndexStatus = useCallback(async () => {
    const repo = repoPath.trim();
    if (!repo) {
      setIndexStatus(null);
      return;
    }
    try {
      const status = await fetchChatIndexStatus(repo, activeProjectLinkId ?? undefined);
      setIndexStatus(status);
    } catch {
      setIndexStatus(null);
    }
  }, [repoPath, activeProjectLinkId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadIndexStatus();
    }, 350);
    return () => clearTimeout(timeout);
  }, [loadIndexStatus]);

  return indexStatus;
}
