import { describe, expect, it } from "vitest";
import { defaultFilename, parseDesignFile, serializeDesignFile } from "./designfile.js";

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
