import { describe, expect, it } from "vitest";
import { formatMm, mmToPx, pxToMm } from "./length.js";

describe("length conversions (180dpi)", () => {
  it("converts px to mm per the PLAN formula", () => {
    // Label length in mm = width_px / 180 * 25.4
    expect(pxToMm(180)).toBeCloseTo(25.4);
    expect(pxToMm(90)).toBeCloseTo(12.7);
  });

  it("round-trips mm -> px -> mm within a pixel", () => {
    const px = mmToPx(60);
    expect(px).toBe(425);
    expect(pxToMm(px)).toBeCloseTo(60, 0);
  });

  it("formats with one decimal", () => {
    expect(formatMm(59.9678)).toBe("60.0 mm");
  });
});
