export interface ComposerImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export function imageAttachmentLabel(attachment: ComposerImageAttachment): string {
  return `${attachment.name} (${formatAttachmentSize(attachment.size)})`;
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
