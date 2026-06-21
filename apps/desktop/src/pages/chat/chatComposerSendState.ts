export interface ComposerSendStateInput {
  controlsDisabled: boolean;
  sendDisabled: boolean;
  message: string;
  imageAttachmentCount: number;
  pendingImageAttachmentCount?: number;
}

export function canSendComposerTurn(input: ComposerSendStateInput): boolean {
  if (input.controlsDisabled) return false;
  if ((input.pendingImageAttachmentCount ?? 0) > 0) return false;
  const imageOnlySend = input.message.trim().length === 0 && input.imageAttachmentCount > 0;
  return !input.sendDisabled || imageOnlySend;
}
