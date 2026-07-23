// Recognizer for the dot-matrix punch times printed by time clocks (uPunch
// and similar). Tesseract's LSTM models cannot read this font — the glyphs
// are sparse grids of disconnected dots — so times are recognized here by
// template matching instead, and Tesseract is only used as a fallback for
// cards printed in ordinary fonts (see UploadScanner).
//
// The pipeline works on a black-and-white bitmap (see binarizeTimecard):
//   1. erase the card's table grid (long straight runs of ink),
//   2. drop speckle noise,
//   3. dilate so each glyph's dots fuse into one connected blob,
//   4. group blobs into text lines, split blobs where two digits touch,
//   5. classify each blob against digit templates sampled from real punches,
//   6. read "HH:MM" tokens off each line using the detected colon dots.

const GRID_W = 10;
const GRID_H = 14;

// Per-digit ink-occupancy grids (GRID_W x GRID_H, values 0..1), averaged from
// glyphs stamped by a real uPunch clock. "7" is synthesized in the same
// style, since it never appears in the sampled punches.
const DIGIT_TEMPLATES: Record<string, number[]> = {
  "0": [0,0,0.94,1,1,0.88,0.81,0.19,0,0,0.25,0.38,1,1,1,1,1,0.5,0.13,0,1,1,1,0.5,0.38,1,1,0.75,0.5,0,0.13,1,1,0.75,0.06,0.63,0.63,0.56,0.25,0,0.42,1,1,0.75,0,0.67,0.83,0.83,0.67,0.08,0.44,1,1,0.75,0,0.25,1,1,0.75,0.25,0.25,1,1,0.94,0,0.63,1,1,1,0.25,0.44,1,1,0.94,0,0.63,1,1,1,0.25,0.5,1,1,1,0,0.25,1,1,1,0.25,0.5,1,1,1,0.25,0.5,1,1,1,1,0.44,1,1,1,0.25,0.5,1,1,1,0.75,0.25,1,1,1,0.44,0.56,1,1,1,0.25,0.06,0.69,1,1,1,0.75,0.69,0.63,0.5,0.13,0,0.17,1,1,0.92,0.67,0.42,0.17,0,0],
  "1": [0,0,0,0,0.63,1,1,0.67,0.08,0,0,0.08,0.67,0.75,0.92,1,1,0.5,0.17,0,0.18,0.53,1,1,1,1,1,0.17,0,0,1,1,1,1,1,1,0.83,0.29,0,0,0.75,0.75,0.71,0.58,0.92,1,0.96,0.67,0,0,0,0,0,0,0.56,0.89,1,0.83,0,0,0,0,0,0,0.75,1,1,0.83,0.17,0,0,0,0,0,0.88,1,1,0.83,0.08,0,0,0,0,0,1,1,1,0.83,0.21,0,0,0,0,0,0.92,0.92,1,0.83,0.33,0,0,0,0,0,0.53,0.75,1,0.79,0.17,0,0,0,0.08,0.08,0.38,1,1,0.71,0.25,0.17,0.17,0.75,1,1,1,1,1,1,1,0.83,0.17,0.83,1,1,1,1,1,1,0.94,0.67],
  "2": [0,0,0.68,0.95,1,0.96,0.93,0.55,0.04,0,0.25,0.36,0.91,1,0.96,1,1,0.91,0.55,0.25,0.7,0.86,0.88,0.77,0.25,0.93,1,1,1,0.57,0.57,0.75,0.75,0.59,0.07,0.7,1,1,0.95,0.68,0.43,0.67,0.67,0.55,0.14,0.43,0.95,1,0.98,0.9,0.05,0.18,0.18,0.13,0.07,0.3,0.93,1,1,1,0,0,0,0.36,0.79,1,1,0.84,0.43,0.18,0,0.09,0.61,0.88,0.98,1,0.95,0.7,0.07,0,0.04,0.59,0.96,1,1,0.89,0.5,0.11,0,0,0.38,1,1,1,0.74,0.31,0.14,0,0,0,0.46,1,1,1,0.45,0,0,0,0,0,0.34,1,1,0.93,0.63,0.27,0.2,0.18,0.11,0,0.61,1,1,0.98,1,0.96,0.86,0.75,0.64,0.14,0.45,0.9,1,0.93,0.88,0.76,0.67,0.5,0.36,0.1],
  "3": [0,0,0.66,0.94,0.97,1,0.97,0.34,0,0,0.31,0.47,1,0.97,1,1,1,0.69,0.22,0,1,1,1,0.5,0.22,0.63,1,1,0.72,0.25,0.38,0.46,0.5,0.26,0,0.63,1,1,0.75,0.25,0,0,0,0,0,0.56,1,1,0.81,0.42,0,0.03,0.16,0.25,0.31,0.56,1,1,0.75,0.5,0,0.25,0.88,1,1,1,1,0.61,0.15,0.06,0,0.16,0.66,0.88,1,1,1,0.78,0.47,0.06,0,0,0,0.13,0.13,0.31,1,1,0.94,0.56,0,0,0,0,0,0.38,1,1,1,1,0.16,0.4,0.4,0.21,0.04,0.33,0.97,1,1,0.67,0.44,1,1,0.66,0.34,0.5,1,1,1,0.44,0.25,0.69,0.88,0.81,0.75,0.75,0.84,0.63,0.53,0.31,0,0.08,0.58,0.75,0.75,0.71,0.58,0.25,0,0],
  "4": [0,0,0,0,0,0.25,1,1,1,1,0,0,0,1,1,1,1,1,1,0.5,0,0,0.17,1,1,1,1,1,1,0,0,0.5,1,1,1,1,1,1,1,0,0,0.5,1,1,1,1,1,1,1,0.5,0,0.5,1,1,1,1,1,1,1,1,0.38,0.88,1,1,0.75,0.63,1,1,1,0,0.63,1,1,1,0.88,0.88,1,1,1,0.5,1,1,1,1,1,1,1,1,1,1,0.38,0.75,0.75,0.75,0.5,0.75,1,1,1,1,0,0,0,0,0,0.38,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,0.67],
  "5": [0,0.25,1,1,1,1,1,1,1,0.75,0.38,0.75,1,1,1,1,1,1,1,0.88,1,1,1,1,0.75,0.5,0.5,0.13,0,0,0.75,1,1,1,0.5,0,0,0,0,0,0.25,1,1,1,0.5,0,0,0,0,0,0,0.88,1,1,0.63,0.13,0,0,0,0,0,1,1,1,1,1,1,0.88,0.25,0.13,0,0.5,0.75,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,0.75,0,0,0,0,0,0,1,1,1,0.5,0.25,0.5,0.5,0.5,0.25,0.25,1,1,0.88,0.75,0.5,1,1,1,0.88,0.88,1,1,0.88,0.63,0,0,0.63,1,1,1,1,0.5,0,0,0,0,0,0.5,1,1,0.75,0,0,0],
  "6": [0,0,0,0.38,1,1,1,1,1,0,0,0.13,0.5,0.75,1,1,1,1,1,0,0,0.5,1,1,1,1,0.25,0.25,0.25,0,0.38,1,1,1,0.75,0.63,0,0,0,0,0.25,1,1,1,1,1,1,0.5,0,0,0,1,1,1,1,1,1,0.75,0.5,0.25,0.33,1,1,1,1,1,1,1,1,1,0.5,1,1,1,0.75,1,1,1,1,0.5,0.5,1,1,1,0,1,1,1,1,0,0.75,1,1,1,1,1,1,1,1,0,0.88,1,1,1,0.75,1,1,1,0.88,0,0.5,1,1,1,1,1,1,1,0.75,0,0.13,0.5,1,1,1,1,1,0.5,0,0,0,0,0.5,1,1,1,0.67,0,0,0],
  "7": [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0],
  "8": [0,0,0,1,1,1,1,0.75,0,0,0,0.25,0.25,1,1,1,1,1,0.25,0.13,0.38,1,1,1,1,0.25,1,1,1,0.5,0.25,1,1,1,0.63,0,1,1,1,0.5,0.33,0.33,1,1,0.83,0,0.83,1,1,0.5,0.38,0,1,1,1,0.5,0.5,1,1,0.5,0,0,0.75,1,1,1,1,1,0.88,0.13,0,0.13,1,1,1,0.75,0.88,1,1,0.5,0.75,0.75,1,1,1,0.13,0.5,1,1,0.63,0.67,1,1,1,1,0.5,1,1,1,1,0,0.25,1,1,1,0.38,0.75,1,1,1,0,0.38,1,1,1,0.5,0.5,1,1,1,0,0.25,0.5,0.75,1,0.63,0.38,0.5,0.5,0.5,0,0,0,0.5,1,1,0.5,0,0,0],
  "9": [0,0,0.56,0.94,1,1,0.94,0.44,0,0,0.31,0.63,0.88,1,1,1,1,0.88,0.63,0,1,1,1,1,1,1,1,1,0.94,0,0.63,1,1,1,0,1,1,1,0.75,0,0.5,1,1,1,0.38,0.69,1,1,0.94,0,0.5,1,1,1,0.88,0.75,1,1,1,0,0.5,1,1,1,1,0.75,1,1,1,0.88,0.38,1,1,1,1,1,1,1,1,0.75,0,0.25,1,1,1,1,1,1,1,0.5,0,0,0.44,0.58,0.58,0.85,1,1,1,1,0,0,0,0.44,0.75,0.88,1,0.88,0.44,0.25,0,0.19,0.25,0.75,1,1,1,0.5,0,0,0,0.69,1,1,1,1,0.63,0,0,0,0,0.5,1,1,1,0.83,0.25,0,0,0],
};

// Classification confidence below which a blob is treated as unreadable
// noise rather than forced into the nearest digit.
const MIN_MATCH_SCORE = 0.62;

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  w: number;
  h: number;
  area: number;
}

/**
 * Black/white binarization tuned for timecard photos. Uses the green channel
 * as luminance — timecard grids are traditionally printed in green ink (a
 * "drop-out color"), so this keeps gray/black punch ink and pen strokes while
 * fading the table itself. A Bradley-style adaptive threshold (each pixel is
 * compared to the mean of its neighborhood via an integral image) handles the
 * uneven lighting of handheld phone photos, which defeats any global
 * threshold: shadowed corners go all-black and bright spots wash out entirely.
 */
export function binarizeTimecard(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const gray = new Float64Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = data[i + 1];
  }

  // Integral image so each pixel's local mean is O(1).
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const win = Math.max(15, Math.round(Math.min(width, height) / 16)) | 1;
  const half = win >> 1;
  // A pixel is ink when it's meaningfully darker than its neighborhood. The
  // ratio test adapts to lighting; the absolute floor stops uniform dark
  // regions (e.g. a table surface around the card) from turning into noise.
  const RATIO = 0.88;
  const MIN_CONTRAST = 8;
  const bin = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];
      const localMean = sum / area;
      const g = gray[y * width + x];
      bin[y * width + x] =
        g < localMean * RATIO && localMean - g >= MIN_CONTRAST ? 0 : 255;
    }
  }
  return bin;
}

/** Erases straight ink runs of maxRun+ pixels — the card's printed grid. */
function eraseGridLines(bin: Uint8Array, width: number, height: number, maxRun: number) {
  for (let y = 0; y < height; y++) {
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const black = x < width && bin[y * width + x] === 0;
      if (black && runStart < 0) runStart = x;
      if (!black && runStart >= 0) {
        if (x - runStart >= maxRun) {
          for (let xx = runStart; xx < x; xx++) bin[y * width + xx] = 255;
        }
        runStart = -1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let runStart = -1;
    for (let y = 0; y <= height; y++) {
      const black = y < height && bin[y * width + x] === 0;
      if (black && runStart < 0) runStart = y;
      if (!black && runStart >= 0) {
        if (y - runStart >= maxRun) {
          for (let yy = runStart; yy < y; yy++) bin[yy * width + x] = 255;
        }
        runStart = -1;
      }
    }
  }
}

/** Grows ink by radius r (separable square dilation) to fuse dot-matrix dots. */
function dilate(bin: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const horizontal = new Uint8Array(bin.length).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bin[y * width + x] === 0) {
        const x1 = Math.max(0, x - r);
        const x2 = Math.min(width - 1, x + r);
        for (let xx = x1; xx <= x2; xx++) horizontal[y * width + xx] = 0;
      }
    }
  }
  const out = new Uint8Array(bin.length).fill(255);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (horizontal[y * width + x] === 0) {
        const y1 = Math.max(0, y - r);
        const y2 = Math.min(height - 1, y + r);
        for (let yy = y1; yy <= y2; yy++) out[yy * width + x] = 0;
      }
    }
  }
  return out;
}

/** Connected components (8-connectivity) of black pixels, as bounding boxes. */
function findComponents(bin: Uint8Array, width: number, height: number): Box[] {
  const seen = new Uint8Array(bin.length);
  const comps: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < bin.length; start++) {
    if (bin[start] !== 0 || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let minX = width, maxX = 0, minY = height, maxY = 0, area = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p / width) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (bin[q] === 0 && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    comps.push({ minX, maxX, minY, maxY, area, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return comps;
}

/** Merges boxes that overlap significantly on the x axis (split glyph parts, colon dots). */
function mergeOverlapping(boxes: Box[]): Box[] {
  const merged = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];
        const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        if (xOverlap > 0.5 * Math.min(a.w, b.w)) {
          a.minX = Math.min(a.minX, b.minX);
          a.maxX = Math.max(a.maxX, b.maxX);
          a.minY = Math.min(a.minY, b.minY);
          a.maxY = Math.max(a.maxY, b.maxY);
          a.area += b.area;
          a.w = a.maxX - a.minX + 1;
          a.h = a.maxY - a.minY + 1;
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return merged;
}

/** Splits boxes much wider than the typical digit (touching glyphs) at their thinnest ink columns. */
function splitWideBoxes(boxes: Box[], bin: Uint8Array, width: number): Box[] {
  const widths = boxes.map((b) => b.w).sort((a, b) => a - b);
  if (widths.length === 0) return boxes;
  const median = widths[widths.length >> 1];
  const out: Box[] = [];
  for (const b of boxes) {
    const n = Math.round(b.w / median);
    if (b.w <= median * 1.55 || n < 2) {
      out.push(b);
      continue;
    }
    const hist = new Array<number>(b.w).fill(0);
    for (let y = b.minY; y <= b.maxY; y++) {
      for (let x = b.minX; x <= b.maxX; x++) {
        if (bin[y * width + x] === 0) hist[x - b.minX]++;
      }
    }
    let prev = b.minX;
    const cuts: number[] = [];
    for (let k = 1; k < n; k++) {
      const target = Math.round((b.w * k) / n);
      let best = target;
      let bestInk = Infinity;
      const radius = Math.max(3, median >> 2);
      for (let x = Math.max(1, target - radius); x <= Math.min(b.w - 2, target + radius); x++) {
        if (hist[x] < bestInk) {
          bestInk = hist[x];
          best = x;
        }
      }
      cuts.push(b.minX + best);
    }
    for (const cut of [...cuts, b.maxX + 1]) {
      out.push({
        minX: prev,
        maxX: cut - 1,
        minY: b.minY,
        maxY: b.maxY,
        w: cut - prev,
        h: b.h,
        area: b.area,
      });
      prev = cut;
    }
  }
  return out.sort((a, b) => a.minX - b.minX);
}

/** Samples a box's ink into a GRID_W x GRID_H occupancy grid (0..1 per cell). */
function normalizeGlyph(bin: Uint8Array, width: number, box: Box): Float64Array {
  const grid = new Float64Array(GRID_W * GRID_H);
  const counts = new Float64Array(GRID_W * GRID_H);
  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      const gx = Math.min(GRID_W - 1, Math.floor(((x - box.minX) / box.w) * GRID_W));
      const gy = Math.min(GRID_H - 1, Math.floor(((y - box.minY) / box.h) * GRID_H));
      counts[gy * GRID_W + gx]++;
      if (bin[y * width + x] === 0) grid[gy * GRID_W + gx]++;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    grid[i] = counts[i] ? grid[i] / counts[i] : 0;
  }
  return grid;
}

/** Best-matching digit for a normalized glyph, or null below the confidence floor. */
function classifyGlyph(
  grid: Float64Array
): { digit: string; score: number } | null {
  let best = "";
  let bestScore = -Infinity;
  for (const [digit, template] of Object.entries(DIGIT_TEMPLATES)) {
    let diff = 0;
    for (let i = 0; i < grid.length; i++) diff += Math.abs(grid[i] - template[i]);
    const score = 1 - diff / grid.length;
    if (score > bestScore) {
      bestScore = score;
      best = digit;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? { digit: best, score: bestScore } : null;
}

interface TimeHit {
  cx: number;
  cy: number;
  digitH: number;
  text: string;
  score: number;
}

/**
 * Reads the dot-matrix punch times from a binarized timecard bitmap.
 * Returns one text line per detected card row, e.g. "13:22 21:38", ordered
 * top to bottom — ready for parseTimecardText.
 *
 * Detection is anchored on the colon: a punch time's ":" is two small ink
 * blobs stacked with matching x-centers, a shape almost impossible to fake
 * with photo noise. The colon's geometry predicts the digit size, and the
 * time is accepted only when properly-sized digit blobs classify confidently
 * on both sides — so row numbers, handwriting, and grid-line remnants
 * elsewhere on the card can't corrupt the reading.
 */
export function recognizeStampTimes(
  binary: Uint8Array,
  width: number,
  height: number
): string {
  const bin = binary.slice();
  eraseGridLines(bin, width, height, Math.round(Math.min(width, height) / 12));

  // The dilation radius that fuses a glyph's dots without welding neighbors
  // depends on the print's dot pitch, which scales with the (unknown) stamp
  // size — so run several radii and pool the results. A time that reads at
  // any radius is kept; where radii disagree about the same stamp, the
  // higher-confidence reading wins.
  let bestHits: TimeHit[] = [];
  for (const radius of [1, 2, 3, 4]) {
    for (const hit of detectTimes(bin, width, height, radius)) {
      const clashIndex = bestHits.findIndex(
        (k) =>
          Math.abs(k.cy - hit.cy) < hit.digitH * 0.6 &&
          Math.abs(k.cx - hit.cx) < hit.digitH * 1.5
      );
      if (clashIndex < 0) bestHits.push(hit);
      else if (compareHits(hit, bestHits[clashIndex]) < 0) bestHits[clashIndex] = hit;
    }
  }
  if (bestHits.length === 0) return "";

  // All punches on a card come from the same clock, so their digit size is
  // consistent. A "time" whose size disagrees with the consensus is a false
  // positive assembled from other marks (day numbers, handwriting).
  const sizes = bestHits.map((h) => h.digitH).sort((a, b) => a - b);
  const medianSize = sizes[sizes.length >> 1];
  bestHits = bestHits.filter(
    (h) => h.digitH >= medianSize * 0.72 && h.digitH <= medianSize * 1.4
  );

  // Group accepted times into card rows by vertical proximity.
  bestHits.sort((a, b) => a.cy - b.cy);
  const rows: TimeHit[][] = [];
  for (const hit of bestHits) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].cy - hit.cy) < hit.digitH * 0.7) row.push(hit);
    else rows.push([hit]);
  }
  return rows
    .map((row) =>
      row
        .sort((a, b) => a.cx - b.cx)
        .map((h) => h.text)
        .join(" ")
    )
    .join("\n");
}

function detectTimes(
  bin: Uint8Array,
  width: number,
  height: number,
  radius: number
): TimeHit[] {
  const fused = dilate(bin, width, height, radius);
  const comps = findComponents(fused, width, height).filter(
    (c) => c.area >= 4 && c.h < height * 0.1 && c.w < width * 0.1
  );

  // Colon anchors: either two stacked blobs with aligned x-centers and
  // similar sizes, or (when dilation already welded the dots) one blob
  // roughly twice as tall as it is wide.
  interface Anchor {
    minX: number;
    maxX: number;
    cy: number;
    digitH: number;
    blobH?: number;
  }
  const anchors: Anchor[] = [];
  const small = comps.filter((c) => c.h <= height * 0.03 && c.w <= width * 0.03);
  for (let i = 0; i < small.length; i++) {
    for (let j = 0; j < small.length; j++) {
      if (i === j) continue;
      const a = small[i];
      const b = small[j];
      if (a.maxY >= b.minY) continue; // a must sit fully above b
      const sizeRatio = Math.max(a.h / b.h, b.h / a.h, a.w / b.w, b.w / a.w);
      if (sizeRatio > 2.2) continue;
      const axc = (a.minX + a.maxX) / 2;
      const bxc = (b.minX + b.maxX) / 2;
      if (Math.abs(axc - bxc) > Math.max(a.w, b.w) * 0.8) continue;
      const gap = b.minY - a.maxY;
      const dotH = Math.max(a.h, b.h);
      if (gap < dotH * 0.2 || gap > dotH * 3) continue;
      const span = b.maxY - a.minY + 1;
      anchors.push({
        minX: Math.min(a.minX, b.minX),
        maxX: Math.max(a.maxX, b.maxX),
        cy: a.minY + span / 2,
        // The dots sit around the middle of the digit band, so the digit
        // is roughly twice the dot-pair's vertical span.
        digitH: span * 2,
      });
    }
  }
  for (const c of comps) {
    const aspect = c.h / c.w;
    if (aspect >= 1.8 && aspect <= 4.5 && c.h <= height * 0.045) {
      anchors.push({
        minX: c.minX,
        maxX: c.maxX,
        cy: (c.minY + c.maxY) / 2,
        digitH: c.h * 2.1,
        // A welded colon is much shorter than a digit; a lone tall blob (a
        // "1", a line fragment) has the same silhouette, so single-blob
        // anchors carry their height for a later size sanity check.
        blobH: c.h,
      });
    }
  }

  const hits: TimeHit[] = [];
  for (const anchor of anchors) {
    const digitH = anchor.digitH;
    const digitW = digitH * 0.42;

    // Digit-sized blobs vertically centered on the anchor.
    let band = comps.filter(
      (c) =>
        c.h >= digitH * 0.62 &&
        c.h <= digitH * 1.45 &&
        c.w <= digitH &&
        Math.abs((c.minY + c.maxY) / 2 - anchor.cy) < digitH * 0.35
    );
    if (band.length < 3) continue;
    // Reject single-blob "colons" as tall as the digits around them — those
    // are actual digits (a "1") or stray line fragments, not a colon.
    if (anchor.blobH !== undefined) {
      const bandHeights = band.map((c) => c.h).sort((a, b) => a - b);
      const medianBandH = bandHeights[bandHeights.length >> 1];
      if (anchor.blobH > medianBandH * 0.75) continue;
    }
    band = splitWideBoxes(mergeOverlapping(band), fused, width);

    const right = band
      .filter((c) => c.minX > anchor.maxX && c.minX - anchor.maxX < digitW * 4)
      .sort((a, b) => a.minX - b.minX);
    // Walk right for the two minute digits, allowing only small gaps.
    const minuteBoxes: Box[] = [];
    let edge = anchor.maxX;
    for (const c of right) {
      if (c.minX - edge > digitW * 1.6) break;
      minuteBoxes.push(c);
      edge = c.maxX;
      if (minuteBoxes.length === 2) break;
    }
    if (minuteBoxes.length !== 2) continue;

    const left = band
      .filter((c) => c.maxX < anchor.minX && anchor.minX - c.maxX < digitW * 4)
      .sort((a, b) => b.maxX - a.maxX);
    const hourBoxes: Box[] = [];
    edge = anchor.minX;
    for (const c of left) {
      if (edge - c.maxX > digitW * 1.6) break;
      hourBoxes.unshift(c);
      edge = c.minX;
      if (hourBoxes.length === 2) break;
    }

    // Classify the minutes first; they anchor everything else.
    let text = "";
    let totalScore = 0;
    let digitCount = 0;
    let failed = false;
    for (const boxItem of minuteBoxes) {
      const result = classifyGlyph(normalizeGlyph(fused, width, boxItem));
      if (!result) {
        failed = true;
        break;
      }
      text += result.digit;
      totalScore += result.score;
      digitCount++;
    }
    if (failed) continue;
    const minuteText = text;

    // Hour digits. The hour-tens digit is often welded to the small
    // day-of-month prefix the clock stamps just before it, or printed too
    // faintly to survive as one component — so when the component that
    // should sit in a slot is missing, fall back to classifying the raw ink
    // in that slot (one digit pitch further left each step).
    const pitch = minuteBoxes[1].minX - minuteBoxes[0].minX;
    const yLo = Math.min(minuteBoxes[0].minY, minuteBoxes[1].minY) - 3;
    const yHi = Math.max(minuteBoxes[0].maxY, minuteBoxes[1].maxY) + 3;
    // How tight the kerning runs on this stamp, measured on the minute side.
    const charGap = Math.max(2, minuteBoxes[0].minX - anchor.maxX) + pitch * 0.35;

    const hourDigits: { digit: string; score: number }[] = [];
    const units = hourBoxes[hourBoxes.length - 1];
    let unitsLeft: number;
    if (units && anchor.minX - units.maxX <= charGap) {
      const result = classifyGlyph(normalizeGlyph(fused, width, units));
      if (!result) continue;
      hourDigits.unshift(result);
      unitsLeft = units.minX;
    } else {
      const rescued = classifySlot(
        fused, width, anchor.minX - Math.round(pitch), anchor.minX - 2, yLo, yHi, digitH
      );
      if (!rescued) continue;
      hourDigits.unshift(rescued.result);
      unitsLeft = rescued.minX;
    }

    const tens = hourBoxes.length === 2 && hourBoxes[1] === units ? hourBoxes[0] : undefined;
    if (tens && unitsLeft - tens.maxX <= charGap) {
      const result = classifyGlyph(normalizeGlyph(fused, width, tens));
      if (!result) continue;
      hourDigits.unshift(result);
    } else {
      const rescued = classifySlot(
        fused, width, unitsLeft - Math.round(pitch), unitsLeft - 2, yLo, yHi, digitH
      );
      // A rescued tens digit can only be 0, 1 or 2 — anything else is the
      // day prefix or noise, and the hour is genuinely one digit.
      if (rescued && "012".includes(rescued.result.digit)) {
        hourDigits.unshift(rescued.result);
      }
    }
    for (const d of hourDigits) {
      totalScore += d.score;
      digitCount++;
    }
    text = hourDigits.map((d) => d.digit).join("") + ":" + minuteText;
    hits.push({
      cx: (anchor.minX + anchor.maxX) / 2,
      cy: anchor.cy,
      digitH,
      text,
      score: totalScore / digitCount,
    });
  }

  // Several anchors can describe the same physical colon (dot pair plus the
  // welded-blob rule, or overlapping pair combinations) — keep one hit per
  // location, preferring the most complete reading, then confidence.
  hits.sort(compareHits);
  const kept: TimeHit[] = [];
  for (const hit of hits) {
    const clash = kept.some(
      (k) =>
        Math.abs(k.cy - hit.cy) < hit.digitH * 0.6 &&
        Math.abs(k.cx - hit.cx) < hit.digitH * 1.5
    );
    if (!clash) kept.push(hit);
  }
  return kept;
}

/** Orders hits best-first: longer readings beat shorter, then higher score. */
function compareHits(a: TimeHit, b: TimeHit): number {
  if (a.text.length !== b.text.length) return b.text.length - a.text.length;
  return b.score - a.score;
}

/**
 * Classifies the ink inside a fixed window — used when a digit didn't
 * survive as its own connected component (welded to neighboring print or
 * broken up by faint printing).
 */
function classifySlot(
  fused: Uint8Array,
  width: number,
  xLo: number,
  xHi: number,
  yLo: number,
  yHi: number,
  digitH: number
): { result: { digit: string; score: number }; minX: number } | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let area = 0;
  for (let y = Math.max(0, yLo); y <= yHi; y++) {
    for (let x = Math.max(0, xLo); x <= xHi; x++) {
      if (fused[y * width + x] === 0) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (area === 0) return null;
  const box: Box = {
    minX, maxX, minY, maxY, area,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
  // Too little ink, or a shape that can't be a digit.
  if (box.h < digitH * 0.55 || box.w < digitH * 0.14 || area < box.w * box.h * 0.2) {
    return null;
  }
  const result = classifyGlyph(normalizeGlyph(fused, width, box));
  return result ? { result, minX: box.minX } : null;
}
