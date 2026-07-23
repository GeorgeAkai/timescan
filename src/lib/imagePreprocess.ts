// Timecards are often small/faint dot-matrix prints on a green ruled grid,
// photographed under uneven lighting. Upscaling + an adaptive, green-aware
// binarization (see binarizeTimecard) keeps the punch ink legible while
// fading the printed grid — both for the template-matching stamp recognizer
// and for Tesseract's fallback pass on ordinary-font cards.

import { binarizeTimecard } from "./stampOcr";

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

const TARGET_MIN_DIMENSION = 1400;
// Guard against multiplying a large photo's pixel count past what canvas /
// the O(w·h) passes can handle comfortably on a phone.
const MAX_DIMENSION = 3000;

export interface PreprocessResult {
  /** Black-and-white canvas suitable for preview and as a Tesseract input. */
  canvas: HTMLCanvasElement;
  /** Row-major bitmap, 0 = ink, 255 = paper — input for recognizeStampTimes. */
  binary: Uint8Array;
  width: number;
  height: number;
}

export async function preprocessForOcr(file: File | Blob): Promise<PreprocessResult> {
  const img = await loadImage(file);
  const minSide = Math.min(img.width, img.height);
  const maxSide = Math.max(img.width, img.height);
  // Upscale faint/small cards toward the target, but never blow the longest
  // edge past MAX_DIMENSION.
  const scale = Math.min(
    Math.max(1, TARGET_MIN_DIMENSION / minSide),
    MAX_DIMENSION / maxSide
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const binary = binarizeTimecard(imageData.data, canvas.width, canvas.height);

  // Paint the binary back onto the canvas so the "enhanced image used for
  // OCR" preview and the Tesseract fallback see exactly what the stamp
  // recognizer saw.
  const { data } = imageData;
  for (let p = 0, i = 0; p < binary.length; p++, i += 4) {
    data[i] = data[i + 1] = data[i + 2] = binary[p];
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  return { canvas, binary, width: canvas.width, height: canvas.height };
}
