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
  mergeConversationSource,
  sourceReferenceKey,
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
  openSources: ConversationSourcePart[];
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectSource: (source: ConversationSourcePart) => void;
  closeSource: (source: ConversationSourcePart) => void;
  clearSources: () => void;
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
  const [openSources, setOpenSources] = useState<ConversationSourcePart[]>([]);
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

  useEffect(() => {
    setOpenSources((current) => {
      const next = pruneOpenSourcesForConversation(current, sourceParts);
      if (next.length === current.length) return current;
      setSelectedSource((selected) => {
        if (!selected) return selected;
        const selectedKey = sourceReferenceKey(selected);
        return next.some((source) => sourceReferenceKey(source) === selectedKey)
          ? selected
          : next[next.length - 1] ?? null;
      });
      return next;
    });
  }, [sourceParts]);

  useEffect(() => {
    setSelectedSource((selected) => {
      if (!selected) return selected;
      const selectedKey = sourceReferenceKey(selected);
      const refreshed = sourceParts.find((source) => sourceReferenceKey(source) === selectedKey);
      return refreshed ?? selected;
    });
    setOpenSources((current) => refreshOpenSourcesFromConversation(current, sourceParts));
  }, [sourceParts]);

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
    setOpenSources((current) => replaceOpenSource(current, source));
    setSelectedArtifactId(null);
    setSelectedExternalArtifact(null);
    onOpenPanel();
  }, [onOpenPanel]);

  const closeSource = useCallback((source: ConversationSourcePart) => {
    const closingKey = sourceReferenceKey(source);
    setOpenSources((current) => {
      const remaining = current.filter((entry) => sourceReferenceKey(entry) !== closingKey);
      setSelectedSource((selected) => {
        if (!selected || sourceReferenceKey(selected) !== closingKey) return selected;
        return remaining[remaining.length - 1] ?? null;
      });
      return remaining;
    });
  }, []);

  const clearSources = useCallback(() => {
    setOpenSources([]);
    setSelectedSource(null);
  }, []);

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
  }, [activeProjectLinkId, artifactLookupState, persistedPrInsightArtifactIds, selectedArtifact, selectedArtifactId]);

  return {
    artifactParts,
    sourceParts,
    latestContextSources,
    selectedArtifactId,
    selectedArtifact,
    selectedArtifactLookupState,
    selectedSource,
    openSources,
    selectArtifact,
    selectSource,
    closeSource,
    clearSources,
    clearArtifact,
    openPrInsightSourceInWorkspace,
  };
}

export function replaceOpenSource(
  current: ConversationSourcePart[],
  source: ConversationSourcePart,
): ConversationSourcePart[] {
  const key = sourceReferenceKey(source);
  const existing = current.find((entry) => sourceReferenceKey(entry) === key);
  return [existing ? mergeConversationSource(existing, source) : source];
}

export function pruneOpenSourcesForConversation(
  current: ConversationSourcePart[],
  availableSources: ConversationSourcePart[],
): ConversationSourcePart[] {
  if (availableSources.length === 0) return [];
  const availableKeys = new Set(availableSources.map(sourceReferenceKey));
  return current.filter((source) => availableKeys.has(sourceReferenceKey(source)));
}

export function refreshOpenSourcesFromConversation(
  current: ConversationSourcePart[],
  availableSources: ConversationSourcePart[],
): ConversationSourcePart[] {
  if (current.length === 0 || availableSources.length === 0) return current;
  const availableByKey = new Map(availableSources.map((source) => [sourceReferenceKey(source), source]));
  return current.map((source) => availableByKey.get(sourceReferenceKey(source)) ?? source);
}
