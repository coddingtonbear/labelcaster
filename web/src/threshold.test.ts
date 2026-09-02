import { describe, expect, it } from "vitest";
import { maskToRgba, thresholdToMask, type RasterImage } from "./threshold.js";

function image(pixels: [number, number, number, number][], width: number): RasterImage {
  const data = new Uint8ClampedArray(pixels.flat());
  return { width, height: pixels.length / width, data };
}

describe("thresholdToMask", () => {
  it("maps dark pixels to 1 and light pixels to 0", () => {
    const img = image(
      [
        [0, 0, 0, 255], // black
        [255, 255, 255, 255], // white
        [100, 100, 100, 255], // dark gray
        [200, 200, 200, 255], // light gray
      ],
      4,
    );
    expect(Array.from(thresholdToMask(img))).toEqual([1, 0, 1, 0]);
  });

  it("composites transparency over white (transparent black is not printed)", () => {
    const img = image(
      [
        [0, 0, 0, 0], // fully transparent black -> white
        [0, 0, 0, 128], // half-transparent black -> mid gray -> printed
        [0, 0, 0, 60], // mostly transparent black -> light -> not printed
      ],
      3,
    );
    expect(Array.from(thresholdToMask(img))).toEqual([0, 1, 0]);
  });

  it("weights color by luminance, not average", () => {
    const img = image(
      [
        [0, 0, 255, 255], // pure blue is dark (luminance ~29)
        [255, 255, 0, 255], // pure yellow is light (luminance ~226)
      ],
      2,
    );
    expect(Array.from(thresholdToMask(img))).toEqual([1, 0]);
  });
});

describe("maskToRgba", () => {
  it("renders 1 as opaque black and 0 as opaque white", () => {
    const target = new Uint8ClampedArray(8);
    maskToRgba(new Uint8Array([1, 0]), target);
    expect(Array.from(target)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
