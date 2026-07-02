// Timecards are often small/faint dot-matrix prints, sometimes with a
// watermark behind the text. Upscaling + grayscale + a binarizing threshold
// noticeably improves Tesseract's read rate on this kind of source image.

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

export async function preprocessForOcr(file: File | Blob): Promise<HTMLCanvasElement> {
  const img = await loadImage(file);
  const scale = Math.max(1, TARGET_MIN_DIMENSION / Math.min(img.width, img.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  // Grayscale + running average for a global threshold.
  let sum = 0;
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = value;
    sum += value;
  }
  const mean = sum / gray.length;
  // Print is usually darker than both the paper and any faint watermark, so
  // biasing the threshold below the mean keeps genuine ink while dropping
  // light background noise.
  const threshold = mean * 0.82;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = gray[p] < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
