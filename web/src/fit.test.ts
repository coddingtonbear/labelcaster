import { describe, expect, it } from "vitest";
import { fittedWidth } from "./fit.js";

function maskFromRows(rows: string[]): { mask: Uint8Array; width: number; height: number } {
  const width = rows[0]?.length ?? 0;
  const mask = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      if (row[x] === "#") mask[y * width + x] = 1;
    }
  });
  return { mask, width, height: rows.length };
}

describe("fittedWidth", () => {
  it("makes the right margin match the left margin", () => {
    const { mask, width, height } = maskFromRows([
      "..........",
      "..##......",
      "..........",
    ]);
    // Left margin 2, content ends at column 3 -> 4 + 2 = 6.
    expect(fittedWidth(mask, width, height)).toBe(6);
  });

  it("can grow the label when the right margin is smaller than the left", () => {
    const { mask, width, height } = maskFromRows(["....#"]);
    // Left margin 4, content ends at the last column -> 5 + 4 = 9.
    expect(fittedWidth(mask, width, height)).toBe(9);
  });

  it("returns the same width when margins already match", () => {
    const { mask, width, height } = maskFromRows([".##."]);
    expect(fittedWidth(mask, width, height)).toBe(4);
  });

  it("handles content flush against the left edge", () => {
    const { mask, width, height } = maskFromRows(["#....."]);
    expect(fittedWidth(mask, width, height)).toBe(1);
  });

  it("returns null for an empty label", () => {
    const { mask, width, height } = maskFromRows(["....", "...."]);
    expect(fittedWidth(mask, width, height)).toBeNull();
  });
});
