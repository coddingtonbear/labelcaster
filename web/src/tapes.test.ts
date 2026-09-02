import { describe, expect, it } from "vitest";
import { TAPE_SIZES, tapeByWidthMm } from "./tapes.js";

describe("tape table", () => {
  it("matches tape_info[] from libptouch.c for printable sizes", () => {
    expect(TAPE_SIZES).toEqual([
      { widthMm: 6, printAreaPx: 32 },
      { widthMm: 9, printAreaPx: 52 },
      { widthMm: 12, printAreaPx: 76 },
      { widthMm: 18, printAreaPx: 120 },
      { widthMm: 24, printAreaPx: 128 },
    ]);
  });

  it("never exceeds the 128px printhead", () => {
    for (const tape of TAPE_SIZES) {
      expect(tape.printAreaPx).toBeLessThanOrEqual(128);
    }
  });

  it("looks up by mm width", () => {
    expect(tapeByWidthMm(12)?.printAreaPx).toBe(76);
    expect(tapeByWidthMm(36)).toBeUndefined();
  });
});
