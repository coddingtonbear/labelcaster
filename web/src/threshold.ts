/**
 * Structural subset of ImageData, so pure-logic tests don't need a browser
 * canvas. `data` is RGBA, 4 bytes per pixel, row-major.
 */
export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Threshold an RGBA image to a 1-bit mask (1 = black/printed, 0 = white).
 * Pixels are alpha-composited over white first — the printer has no concept
 * of transparency — then compared by Rec. 601 luminance.
 */
export function thresholdToMask(image: RasterImage, cutoff = 128): Uint8Array {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const a = (data[o + 3] ?? 0) / 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    if (luminance < cutoff) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** Paint a mask back into an RGBA buffer as pure black/white (for previews). */
export function maskToRgba(mask: Uint8Array, target: Uint8ClampedArray): void {
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] === 1 ? 0 : 255;
    const o = i * 4;
    target[o] = v;
    target[o + 1] = v;
    target[o + 2] = v;
    target[o + 3] = 255;
  }
}
