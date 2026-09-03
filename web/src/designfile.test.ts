import { describe, expect, it } from "vitest";
import {
  defaultFilename,
  designNameFromFilename,
  filenameForDesign,
  parseDesignFile,
  serializeDesignFile,
} from "./designfile.js";

describe("design files", () => {
  it("round-trips a design", () => {
    const design = { widthPx: 425, heightPx: 76, canvas: { objects: [{ type: "IText" }] } };
    const parsed = parseDesignFile(serializeDesignFile(design));
    expect(parsed).toEqual({ format: "labelcaster-design", version: 1, ...design });
  });

  it("rejects non-JSON, foreign JSON, and bad versions", () => {
    expect(() => parseDesignFile("not json{")).toThrow(/invalid JSON/);
    expect(() => parseDesignFile('{"some":"other file"}')).toThrow(/not a labelcaster design/);
    expect(() =>
      parseDesignFile('{"format":"labelcaster-design","version":2,"widthPx":1,"heightPx":1,"canvas":{}}'),
    ).toThrow(/version/);
  });

  it("rejects invalid dimensions and missing canvas", () => {
    expect(() =>
      parseDesignFile('{"format":"labelcaster-design","version":1,"widthPx":-4,"heightPx":76,"canvas":{}}'),
    ).toThrow(/dimensions/);
    expect(() =>
      parseDesignFile('{"format":"labelcaster-design","version":1,"widthPx":425,"heightPx":76}'),
    ).toThrow(/canvas/);
  });

  it("names files with a sortable timestamp and the design extension", () => {
    const name = defaultFilename(new Date(2026, 8, 3, 13, 57, 12));
    expect(name).toBe("label-2026-09-03-135712.labelcaster.json");
  });
});

describe("filenameForDesign", () => {
  const now = new Date(2026, 8, 3, 13, 57, 12);

  it("uses the design name when present", () => {
    expect(filenameForDesign("Pantry jar", now)).toBe("Pantry jar.labelcaster.json");
  });

  it("strips filesystem-hostile characters and collapses whitespace", () => {
    expect(filenameForDesign('a/b\\c:d*e?f"g<h>i|j', now)).toBe(
      "a b c d e f g h i j.labelcaster.json",
    );
    expect(filenameForDesign("  lots   of\tspace  ", now)).toBe("lots of space.labelcaster.json");
  });

  it("falls back to the timestamp default for empty or degenerate names", () => {
    for (const name of ["", "   ", null, undefined, "///", "."]) {
      expect(filenameForDesign(name, now)).toBe("label-2026-09-03-135712.labelcaster.json");
    }
  });
});

describe("designNameFromFilename", () => {
  it("strips the design extension (and plain .json)", () => {
    expect(designNameFromFilename("Pantry jar.labelcaster.json")).toBe("Pantry jar");
    expect(designNameFromFilename("thing.JSON")).toBe("thing");
    expect(designNameFromFilename("no-extension")).toBe("no-extension");
  });
});
