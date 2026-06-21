export interface ComposerMenuState {
  attachmentMenuOpen: boolean;
  modelMenuOpen: boolean;
}

export function toggleAttachmentMenuState(state: ComposerMenuState): ComposerMenuState {
  const attachmentMenuOpen = !state.attachmentMenuOpen;
  return {
    attachmentMenuOpen,
    modelMenuOpen: attachmentMenuOpen ? false : state.modelMenuOpen,
  };
}

export function toggleModelMenuState(state: ComposerMenuState): ComposerMenuState {
  const modelMenuOpen = !state.modelMenuOpen;
  return {
    attachmentMenuOpen: modelMenuOpen ? false : state.attachmentMenuOpen,
    modelMenuOpen,
  };
}
