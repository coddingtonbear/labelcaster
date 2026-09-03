import { describe, expect, it } from "vitest";
import { loadFonts, type FontRegistrar } from "./fonts.js";

describe("loadFonts", () => {
  it("returns families that loaded, preserving order", async () => {
    const loaded: [string, string][] = [];
    const registrar: FontRegistrar = {
      load: async (family, url) => {
        loaded.push([family, url]);
      },
    };
    const families = await loadFonts(
      [
        { family: "Oswald", url: "/fonts/Oswald.ttf" },
        { family: "Caveat", url: "/fonts/Caveat.ttf" },
      ],
      registrar,
    );
    expect(families).toEqual(["Oswald", "Caveat"]);
    expect(loaded).toEqual([
      ["Oswald", "/fonts/Oswald.ttf"],
      ["Caveat", "/fonts/Caveat.ttf"],
    ]);
  });

  it("skips fonts that fail to load without failing the rest", async () => {
    const registrar: FontRegistrar = {
      load: async (family) => {
        if (family === "Broken") throw new Error("bad font data");
      },
    };
    const families = await loadFonts(
      [
        { family: "Inter", url: "/fonts/Inter.ttf" },
        { family: "Broken", url: "/fonts/Broken.ttf" },
        { family: "Lora", url: "/fonts/Lora.ttf" },
      ],
      registrar,
    );
    expect(families).toEqual(["Inter", "Lora"]);
  });
});
