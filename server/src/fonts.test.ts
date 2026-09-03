import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { familyFromFilename, isVariableFont, listFonts } from "./fonts.js";

/** Minimal sfnt: header + table directory with the given tags, no table data. */
function sfnt(tags: string[]): Buffer {
  const buf = Buffer.alloc(12 + tags.length * 16);
  buf.writeUInt32BE(0x00010000, 0);
  buf.writeUInt16BE(tags.length, 4);
  tags.forEach((tag, i) => buf.write(tag, 12 + i * 16, 4, "latin1"));
  return buf;
}

describe("familyFromFilename", () => {
  it("strips the extension", () => {
    expect(familyFromFilename("Inter.ttf")).toBe("Inter");
    expect(familyFromFilename("Comic Neue.woff2")).toBe("Comic Neue");
  });

  it("reads underscores and hyphens as spaces", () => {
    expect(familyFromFilename("Archivo_Black.ttf")).toBe("Archivo Black");
    expect(familyFromFilename("JetBrains-Mono.otf")).toBe("JetBrains Mono");
  });
});

describe("listFonts", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("lists only font files, sorted by family, with variable detection", async () => {
    dir = await mkdtemp(join(tmpdir(), "labelcaster-fonts-"));
    await writeFile(join(dir, "Oswald.ttf"), sfnt(["name", "fvar", "glyf"]));
    await writeFile(join(dir, "Inter.TTF"), sfnt(["name", "glyf"]));
    await writeFile(join(dir, "readme.txt"), "not a font");
    await writeFile(join(dir, "Caveat.woff2"), "");
    expect(await listFonts(dir)).toEqual([
      { family: "Caveat", file: "Caveat.woff2", variable: false },
      { family: "Inter", file: "Inter.TTF", variable: false },
      { family: "Oswald", file: "Oswald.ttf", variable: true },
    ]);
  });

  it("detects the bundled variable and static fonts correctly", async () => {
    const bundled = join(import.meta.dirname, "../../fonts");
    expect(await isVariableFont(join(bundled, "Inter.ttf"))).toBe(true);
    expect(await isVariableFont(join(bundled, "Oswald.ttf"))).toBe(true);
    expect(await isVariableFont(join(bundled, "Archivo Black.ttf"))).toBe(false);
    expect(await isVariableFont(join(bundled, "Comic Neue.ttf"))).toBe(false);
    expect(await isVariableFont("/nonexistent.ttf")).toBe(false);
  });

  it("returns an empty list for a missing directory", async () => {
    expect(await listFonts("/nonexistent/fonts")).toEqual([]);
  });
});
