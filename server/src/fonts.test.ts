import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { familyFromFilename, listFonts } from "./fonts.js";

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

  it("lists only font files, sorted by family", async () => {
    dir = await mkdtemp(join(tmpdir(), "labelcaster-fonts-"));
    for (const name of ["Oswald.ttf", "Inter.TTF", "readme.txt", "Caveat.woff2", "sub.png"]) {
      await writeFile(join(dir, name), "");
    }
    expect(await listFonts(dir)).toEqual([
      { family: "Caveat", file: "Caveat.woff2" },
      { family: "Inter", file: "Inter.TTF" },
      { family: "Oswald", file: "Oswald.ttf" },
    ]);
  });

  it("returns an empty list for a missing directory", async () => {
    expect(await listFonts("/nonexistent/fonts")).toEqual([]);
  });
});
