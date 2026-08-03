/**
 * MP-013: applies the react-easy-crop selection (crop box, zoom, rotation) to
 * a data URL and produces a replacement attachment payload. All conversion
 * happens before send; the source image is never modified.
 */

export interface ImageCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageEditResult {
  dataUrl: string;
  size: number;
}

export class ImageEditUnavailableError extends Error {
  constructor(message = "Image editing is not available in this environment.") {
    super(message);
    this.name = "ImageEditUnavailableError";
  }
}

/**
 * Crop a data-URL image from the react-easy-crop selection. `crop` is the
 * fraction-based selection ({x, y} percentages of the zoomed visible area);
 * zoom and rotation are applied exactly once here, mirroring the documented
 * react-easy-crop getCroppedImg pattern (MIT).
 */
export async function cropImageFromDataUrl(
  dataUrl: string,
  crop: { x: number; y: number },
  rotation: number,
  zoom: number,
  options: { outputType?: string; outputQuality?: number } = {},
): Promise<ImageEditResult> {
  if (typeof document === "undefined" || typeof Image === "undefined" || typeof HTMLCanvasElement === "undefined") {
    throw new ImageEditUnavailableError();
  }
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageEditUnavailableError("Canvas is unavailable.");

  const rad = (rotation * Math.PI) / 180;
  const visibleWidth = image.naturalWidth / zoom;
  const visibleHeight = image.naturalHeight / zoom;
  const cropX = (crop.x / 100) * visibleWidth;
  const cropY = (crop.y / 100) * visibleHeight;

  canvas.width = Math.max(1, Math.floor(visibleWidth));
  canvas.height = Math.max(1, Math.floor(visibleHeight));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.scale(zoom, zoom);
  ctx.translate(-(cropX + visibleWidth / 2), -(cropY + visibleHeight / 2));
  ctx.drawImage(image, 0, 0);

  const outputType = options.outputType ?? "image/jpeg";
  const dataUrlOut = canvas.toDataURL(outputType, options.outputQuality ?? 0.92);
  return { dataUrl: dataUrlOut, size: approximateDataUrlSize(dataUrlOut) };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageEditUnavailableError("The image could not be decoded."));
    image.src = dataUrl;
  });
}

function approximateDataUrlSize(dataUrl: string): number {
  // Base64 payload minus the data: prefix; ~3 bytes per 4 base64 chars.
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}
