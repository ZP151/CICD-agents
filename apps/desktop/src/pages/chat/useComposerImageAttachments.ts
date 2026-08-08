import {
  useCallback,
  useRef,
  useState,
} from "react";
import type { ComposerImageAttachment } from "./chatAttachments.js";

export const MAX_COMPOSER_IMAGE_ATTACHMENTS = 3;
export const MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** MP-013/RA-065..RA-066: typed attachment validation instead of bare strings. */
export type ComposerAttachmentErrorKind =
  | "too_many"
  | "too_large"
  | "unreadable"
  | "unsupported_format";

export const COMPOSER_ATTACHMENT_ERROR_MESSAGES: Record<ComposerAttachmentErrorKind, string> = {
  too_many: `Max ${MAX_COMPOSER_IMAGE_ATTACHMENTS} images`,
  too_large: "Image must be under 4 MB",
  unreadable: "Image could not be read",
  unsupported_format: "Only image files can be attached",
};

export interface ComposerEditingImage {
  id: string;
  name: string;
  dataUrl: string;
}

export function hasComposerImageAttachmentSlot(
  currentAttachmentCount: number,
  pendingAttachmentCount: number,
): boolean {
  return currentAttachmentCount + pendingAttachmentCount < MAX_COMPOSER_IMAGE_ATTACHMENTS;
}

export interface ComposerImageSelection<TFile extends { size: number; type: string }> {
  acceptedFiles: TFile[];
  error: string | null;
  errorKind: ComposerAttachmentErrorKind | null;
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
    return { acceptedFiles: [], error: null, errorKind: null, selectedImageCount: 0 };
  }

  if (remainingSlots === 0) {
    return {
      acceptedFiles: [],
      error: COMPOSER_ATTACHMENT_ERROR_MESSAGES.too_many,
      errorKind: "too_many",
      selectedImageCount: selectedFiles.length,
    };
  }

  const validFiles = selectedFiles.filter((file) => file.size <= MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES);
  const acceptedFiles = validFiles.slice(0, remainingSlots);
  const errorKind: ComposerAttachmentErrorKind | null = validFiles.length < selectedFiles.length
    ? "too_large"
    : acceptedFiles.length < validFiles.length
      ? "too_many"
      : null;

  return {
    acceptedFiles,
    error: errorKind ? COMPOSER_ATTACHMENT_ERROR_MESSAGES[errorKind] : null,
    errorKind,
    selectedImageCount: selectedFiles.length,
  };
}

export function useComposerImageAttachments() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [imageAttachments, setImageAttachments] = useState<ComposerImageAttachment[]>([]);
  const [pendingImageAttachmentCount, setPendingImageAttachmentCount] = useState(0);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentErrorKind, setAttachmentErrorKind] = useState<ComposerAttachmentErrorKind | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [editingImage, setEditingImage] = useState<ComposerEditingImage | null>(null);

  const attachImages = useCallback((files: FileList | File[] | null) => {
    const selection = selectComposerImageFiles(files, imageAttachments.length, pendingImageAttachmentCount);
    if (selection.selectedImageCount === 0) return;
    setAttachmentError(selection.error);
    setAttachmentErrorKind(selection.errorKind);

    for (const file of selection.acceptedFiles) {
      setPendingImageAttachmentCount((count) => count + 1);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          setAttachmentError(COMPOSER_ATTACHMENT_ERROR_MESSAGES.unreadable);
          setAttachmentErrorKind("unreadable");
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
            revision: 0,
          },
        ]);
      };
      reader.onerror = () => {
        setAttachmentError(COMPOSER_ATTACHMENT_ERROR_MESSAGES.unreadable);
        setAttachmentErrorKind("unreadable");
      };
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
    setEditingImage((current) => (current?.id === id ? null : current));
  }, []);

  const clearImageAttachments = useCallback(() => {
    setImageAttachments([]);
    setAttachmentError(null);
    setAttachmentErrorKind(null);
    setEditingImage(null);
  }, []);

  /** MP-013/RA-063: open the crop/zoom/rotate editor for one attachment. */
  const editImageAttachment = useCallback((id: string) => {
    setImageAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (!attachment) return current;
      setEditingImage({ id: attachment.id, name: attachment.name, dataUrl: attachment.dataUrl });
      return current;
    });
  }, []);

  /**
   * RA-063/RA-064: the edited image REPLACES the attachment in place (same
   * stable id, revision bumped); deleting afterwards removes the only copy.
   */
  const applyImageEdit = useCallback((editedDataUrl: string, editedSize: number) => {
    setImageAttachments((current) =>
      current.map((item) =>
        item.id === editingImage?.id
          ? { ...item, dataUrl: editedDataUrl, size: editedSize, revision: (item.revision ?? 0) + 1 }
          : item,
      ),
    );
    setEditingImage(null);
  }, [editingImage?.id]);

  const cancelImageEdit = useCallback(() => {
    setEditingImage(null);
  }, []);

  return {
    attachImages,
    attachImagesFromDataTransfer,
    attachmentError,
    attachmentErrorKind,
    clearImageAttachments,
    hasImageAttachments: imageAttachments.length > 0,
    hasPendingImageAttachments: pendingImageAttachmentCount > 0,
    imageAttachments,
    imageDragActive,
    imageInputRef,
    pendingImageAttachmentCount,
    removeImageAttachment,
    setImageDragActive,
    editingImage,
    editImageAttachment,
    applyImageEdit,
    cancelImageEdit,
  };
}
