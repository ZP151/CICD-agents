import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchProjectLinkPrInsightArtifactById } from "../../../api.js";
import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import type { ArtifactLookupState, Bubble, SavedPrInsightSource } from "../chat.types.js";
import {
  collectConversationArtifacts,
  collectConversationSources,
  latestRepositoryContextSources,
} from "./conversationArtifacts.js";
import { prInsightArtifactTitle } from "./prInsightArtifacts.js";

interface UseArtifactWorkspaceOptions {
  activeProjectLinkId: string | null;
  bubbles: Bubble[];
  onOpenPanel: () => void;
}

export interface ArtifactWorkspaceState {
  artifactParts: ConversationArtifactPart[];
  sourceParts: ConversationSourcePart[];
  latestContextSources: string[];
  selectedArtifactId: string | null;
  selectedArtifact: ConversationArtifactPart | null;
  selectedArtifactLookupState: ArtifactLookupState | null;
  selectedSource: ConversationSourcePart | null;
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectSource: (source: ConversationSourcePart) => void;
  clearArtifact: () => void;
  openPrInsightSourceInWorkspace: (source: SavedPrInsightSource) => void;
}

export function useArtifactWorkspace({
  activeProjectLinkId,
  bubbles,
  onOpenPanel,
}: UseArtifactWorkspaceOptions): ArtifactWorkspaceState {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedExternalArtifact, setSelectedExternalArtifact] = useState<ConversationArtifactPart | null>(null);
  const [selectedSource, setSelectedSource] = useState<ConversationSourcePart | null>(null);
  const [artifactLookupState, setArtifactLookupState] = useState<Record<string, ArtifactLookupState>>({});
  const [persistedPrInsightArtifactIds, setPersistedPrInsightArtifactIds] = useState<Set<string>>(() => new Set());
  const artifactLookupRequestRef = useRef(0);

  const artifactParts = useMemo(() => collectConversationArtifacts(bubbles), [bubbles]);
  const sourceParts = useMemo(() => collectConversationSources(bubbles), [bubbles]);
  const latestContextSources = useMemo(() => latestRepositoryContextSources(bubbles), [bubbles]);
  const selectedArtifact = useMemo(
    () => (
      artifactParts.find((artifact) => artifact.artifactId === selectedArtifactId)
      ?? (selectedExternalArtifact?.artifactId === selectedArtifactId ? selectedExternalArtifact : null)
    ),
    [artifactParts, selectedArtifactId, selectedExternalArtifact],
  );
  const selectedArtifactLookupState = selectedArtifactId ? artifactLookupState[selectedArtifactId] ?? null : null;

  useEffect(() => {
    if (selectedArtifactId && !selectedArtifact) setSelectedArtifactId(null);
  }, [selectedArtifact, selectedArtifactId]);

  const selectArtifact = useCallback((artifact: ConversationArtifactPart) => {
    setSelectedSource(null);
    setSelectedExternalArtifact(null);
    setSelectedArtifactId(artifact.artifactId);
    setPersistedPrInsightArtifactIds((current) => {
      if (!current.has(artifact.artifactId)) return current;
      const next = new Set(current);
      next.delete(artifact.artifactId);
      return next;
    });
    onOpenPanel();
  }, [onOpenPanel]);

  const selectSource = useCallback((source: ConversationSourcePart) => {
    setSelectedSource(source);
    onOpenPanel();
  }, [onOpenPanel]);

  const clearArtifact = useCallback(() => {
    setSelectedArtifactId(null);
    setSelectedExternalArtifact(null);
  }, []);

  const openPrInsightSourceInWorkspace = useCallback((source: SavedPrInsightSource) => {
    setSelectedSource(null);
    const artifact: ConversationArtifactPart = {
      type: "artifact",
      artifactId: source.artifactId,
      title: prInsightArtifactTitle(source),
      artifactType: "markdown",
      status: "ready",
    };
    setSelectedExternalArtifact(artifact);
    setSelectedArtifactId(source.artifactId);
    setPersistedPrInsightArtifactIds((current) => new Set(current).add(source.artifactId));
    onOpenPanel();
  }, [onOpenPanel]);

  useEffect(() => {
    if (!selectedArtifact || selectedArtifact.content?.trim() || !selectedArtifactId) return;
    if (!persistedPrInsightArtifactIds.has(selectedArtifactId)) return;
    const artifactId = selectedArtifact.artifactId;
    const current = artifactLookupState[artifactId];
    if (current?.status === "loading" || current?.status === "loaded") return;
    if (!activeProjectLinkId) {
      const message = "Select a Project Link before loading saved PR insight artifacts.";
      if (current?.status === "error" && current.message === message) return;
      setArtifactLookupState((state) => ({
        ...state,
        [artifactId]: { status: "error", message },
      }));
      return;
    }

    const requestId = artifactLookupRequestRef.current + 1;
    artifactLookupRequestRef.current = requestId;
    setArtifactLookupState((state) => ({
      ...state,
      [artifactId]: { status: "loading" },
    }));
    void fetchProjectLinkPrInsightArtifactById(activeProjectLinkId, artifactId)
      .then((record) => {
        if (artifactLookupRequestRef.current !== requestId) return;
        setArtifactLookupState((state) => ({
          ...state,
          [artifactId]: { status: "loaded", record },
        }));
      })
      .catch((error: unknown) => {
        if (artifactLookupRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : String(error);
        setArtifactLookupState((state) => ({
          ...state,
          [artifactId]: { status: "error", message },
        }));
      });
    return () => {
      if (artifactLookupRequestRef.current === requestId) artifactLookupRequestRef.current += 1;
    };
  }, [activeProjectLinkId, artifactLookupState, persistedPrInsightArtifactIds, selectedArtifact, selectedArtifactId]);

  return {
    artifactParts,
    sourceParts,
    latestContextSources,
    selectedArtifactId,
    selectedArtifact,
    selectedArtifactLookupState,
    selectedSource,
    selectArtifact,
    selectSource,
    clearArtifact,
    openPrInsightSourceInWorkspace,
  };
}
