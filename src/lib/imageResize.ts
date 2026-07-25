// Prepares a captured/uploaded timecard photo for the vision model. The model
// reads the ordinary colour photo directly (no binarization), so this only
// downscales very large phone photos — enough resolution for the small
// dot-matrix punch digits to stay legible, but small enough to keep the upload
// under the serverless request-body limit and the image-token cost reasonable.

// Vision models generally downsample beyond ~1500-2500px on the long edge, so
// 2000 keeps the punch digits crisp while trimming tokens and payload versus a
// full 4032px photo. Raise it if the configured OPENROUTER_MODEL supports more.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.9;

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

export interface PreparedImage {
  /** Base64-encoded JPEG (no data: prefix). */
  base64: string;
  mediaType: "image/jpeg";
  /** Data URL for previewing exactly what was sent to the model. */
  dataUrl: string;
}

export async function prepareImageForVision(file: File | Blob): Promise<PreparedImage> {
  const img = await loadImage(file);
  const longEdge = Math.max(img.width, img.height);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { base64, mediaType: "image/jpeg", dataUrl };
}
