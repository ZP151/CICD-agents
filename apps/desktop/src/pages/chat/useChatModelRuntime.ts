import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  readCustomConversationModels,
  readInitialConversationModelChoice,
  type ConversationModelChoice,
  type CustomConversationModel,
} from "./chatModelSelection.js";

export interface ChatModelRuntime {
  activeCustomModel: CustomConversationModel | null;
  activeModel: ConversationModelChoice;
  closeModelMenuFromChatSurface: (event: { target: EventTarget | null }) => void;
  customModels: CustomConversationModel[];
  modelMenuOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement>;
  setActiveModel: Dispatch<SetStateAction<ConversationModelChoice>>;
  setModelMenuOpen: Dispatch<SetStateAction<boolean>>;
}

interface UseChatModelRuntimeArgs {
  closeForComposerState: boolean;
}

function isInsideModelMenu(
  target: EventTarget | null,
  menuRef: RefObject<HTMLDivElement>,
): boolean {
  return target instanceof Node && Boolean(menuRef.current?.contains(target));
}

export function useChatModelRuntime({
  closeForComposerState,
}: UseChatModelRuntimeArgs): ChatModelRuntime {
  const [customModels, setCustomModels] = useState<CustomConversationModel[]>(
    readCustomConversationModels,
  );
  const [activeModel, setActiveModel] = useState<ConversationModelChoice>(
    readInitialConversationModelChoice,
  );
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const activeCustomModel = useMemo(
    () => customModels.find((model) => model.id === activeModel) ?? null,
    [activeModel, customModels],
  );

  const refreshModelChoices = useCallback(() => {
    const next = readCustomConversationModels();
    setCustomModels(next);
    setActiveModel((current) =>
      current !== "built_in" && !next.some((model) => model.id === current) ? "built_in" : current,
    );
  }, []);

  useEffect(() => {
    refreshModelChoices();
    const onFocus = () => refreshModelChoices();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === "mergepilot_settings" ||
        event.key === "mergepilot_active_model"
      )
        refreshModelChoices();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshModelChoices]);

  useEffect(() => {
    localStorage.setItem("mergepilot_active_model", activeModel);
  }, [activeModel]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onOutsideInteraction = (event: Event) => {
      if (isInsideModelMenu(event.target, modelMenuRef)) return;
      setModelMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (isInsideModelMenu(event.target, modelMenuRef)) return;
      setModelMenuOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isInsideModelMenu(event.target, modelMenuRef)) return;
      setModelMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onOutsideInteraction, true);
    document.addEventListener("mousedown", onOutsideInteraction, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onOutsideInteraction, true);
      document.removeEventListener("mousedown", onOutsideInteraction, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (closeForComposerState) setModelMenuOpen(false);
  }, [closeForComposerState]);

  const closeModelMenuFromChatSurface = useCallback(
    (event: { target: EventTarget | null }) => {
      if (!modelMenuOpen) return;
      if (isInsideModelMenu(event.target, modelMenuRef)) return;
      setModelMenuOpen(false);
    },
    [modelMenuOpen],
  );

  return {
    activeCustomModel,
    activeModel,
    closeModelMenuFromChatSurface,
    customModels,
    modelMenuOpen,
    modelMenuRef,
    setActiveModel,
    setModelMenuOpen,
  };
}
