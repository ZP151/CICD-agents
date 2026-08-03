import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Cropper from "react-easy-crop";
import { ActionButton } from "../../components/workbench/WorkbenchPrimitives.js";
import type { ComposerEditingImage } from "./useComposerImageAttachments.js";
import { cropImageFromDataUrl } from "./imageEditCanvas.js";

interface Point {
  x: number;
  y: number;
}

/**
 * MP-013/RA-063: lightweight pre-send image editor. Crop, zoom and rotation
 * are applied to a canvas copy; the attachment is replaced in place on
 * confirm, so no second ghost attachment is ever created.
 */
export function ImageEditModal({
  editing,
  onConfirm,
  onCancel,
}: {
  editing: ComposerEditingImage;
  onConfirm: (dataUrl: string, size: number) => void;
  onCancel: () => void;
}): JSX.Element {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (applying) return;
    setApplying(true);
    setError(null);
    try {
      const result = await cropImageFromDataUrl(editing.dataUrl, crop, rotation, zoom);
      onConfirm(result.dataUrl, result.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image edit failed.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Edit image
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">
            Crop, zoom or rotate {editing.name}. The change is applied before sending.
          </Dialog.Description>

          <div className="relative mt-3 h-72 w-full overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))]">
            <Cropper
              image={editing.dataUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={16 / 9}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
            />
          </div>

          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-[rgb(var(--app-text-muted))]">
              <span className="w-14 shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="flex-1"
                aria-label="Zoom"
              />
              <span className="w-8 shrink-0 text-right">{zoom.toFixed(2)}×</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-[rgb(var(--app-text-muted))]">
              <span className="w-14 shrink-0">Rotate</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
                className="flex-1"
                aria-label="Rotation"
              />
              <span className="w-8 shrink-0 text-right">{rotation}°</span>
            </label>
          </div>

          {error && <p className="mt-2 text-xs text-[rgb(var(--app-danger))]">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <ActionButton type="button" tone="secondary" onClick={onCancel} disabled={applying}>
              Cancel
            </ActionButton>
            <ActionButton type="button" tone="primary" onClick={() => void confirm()} loading={applying}>
              {applying ? "Applying..." : "Apply edit"}
            </ActionButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

