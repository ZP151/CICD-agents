import {
  useCallback,
  useRef,
  useState,
} from "react";
import type { ComposerImageAttachment } from "./chatAttachments.js";

export const MAX_COMPOSER_IMAGE_ATTACHMENTS = 3;
export const MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export function hasComposerImageAttachmentSlot(
  currentAttachmentCount: number,
  pendingAttachmentCount: number,
): boolean {
  return currentAttachmentCount + pendingAttachmentCount < MAX_COMPOSER_IMAGE_ATTACHMENTS;
}

export interface ComposerImageSelection<TFile extends { size: number; type: string }> {
  acceptedFiles: TFile[];
  error: string | null;
  selectedImageCount: number;
}

export function selectComposerImageFiles<TFile extends { size: number; type: string }>(
  files: ArrayLike<TFile> | Iterable<TFile> | null,
  currentAttachmentCount: number,
  pendingAttachmentCount: number,
): ComposerImageSelection<TFile> {
  const selectedFiles = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
  const remainingSlots = Math.max(0, MAX_COMPOSER_IMAGE_ATTACHMENTS - currentAttachmentCount - pendingAttachmentCount);

  if (selectedFiles.length === 0) {
    return { acceptedFiles: [], error: null, selectedImageCount: 0 };
  }

  if (remainingSlots === 0) {
    return { acceptedFiles: [], error: "Max 3 images", selectedImageCount: selectedFiles.length };
  }

  const validFiles = selectedFiles.filter((file) => file.size <= MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES);
  const acceptedFiles = validFiles.slice(0, remainingSlots);
  const error = validFiles.length < selectedFiles.length
    ? "Image must be under 4 MB"
    : acceptedFiles.length < validFiles.length
      ? "Max 3 images"
      : null;

  return { acceptedFiles, error, selectedImageCount: selectedFiles.length };
}

export function useComposerImageAttachments() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ComposerImageAttachment[]>([]);
  const [pendingImageAttachmentCount, setPendingImageAttachmentCount] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);

  const attachImages = useCallback((files: FileList | File[] | null) => {
    const selection = selectComposerImageFiles(files, imageAttachments.length, pendingImageAttachmentCount);
    if (selection.selectedImageCount === 0) return;
    setAttachmentError(selection.error);

    for (const file of selection.acceptedFiles) {
      setPendingImageAttachmentCount((count) => count + 1);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          setAttachmentError("Image could not be read");
          return;
        }
        setImageAttachments((current) => [
          ...current,
          {
            id: globalThis.crypto?.randomUUID?.() ?? `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            dataUrl,
          },
        ]);
      };
      reader.onerror = () => setAttachmentError("Image could not be read");
      reader.onloadend = () => {
        setPendingImageAttachmentCount((count) => Math.max(0, count - 1));
      };
      reader.readAsDataURL(file);
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, [imageAttachments.length, pendingImageAttachmentCount]);

  const attachImagesFromDataTransfer = useCallback((items: DataTransferItemList | undefined) => {
    const files = Array.from(items ?? [])
      .map((item) => (item.kind === "file" ? item.getAsFile() : null))
      .filter((file): file is File => file instanceof File && file.type.startsWith("image/"));
    if (files.length > 0) attachImages(files);
    return files.length > 0;
  }, [attachImages]);

  const removeImageAttachment = useCallback((id: string) => {
    setImageAttachments((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearImageAttachments = useCallback(() => {
    setImageAttachments([]);
    setAttachmentError(null);
  }, []);

  return {
    attachImages,
    attachImagesFromDataTransfer,
    attachmentError,
    clearImageAttachments,
    hasImageAttachments: imageAttachments.length > 0,
    hasPendingImageAttachments: pendingImageAttachmentCount > 0,
    imageAttachments,
    imageDragActive,
    imageInputRef,
    pendingImageAttachmentCount,
    removeImageAttachment,
    setImageDragActive,
  };
}
