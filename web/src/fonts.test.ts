import { describe, expect, it } from "vitest";
import { loadFonts, type FontRegistrar } from "./fonts.js";

describe("loadFonts", () => {
  it("returns families that loaded, passing the variable flag through", async () => {
    const loaded: [string, string, boolean][] = [];
    const registrar: FontRegistrar = {
      load: async (family, url, variable) => {
        loaded.push([family, url, variable]);
      },
    };
    const families = await loadFonts(
      [
        { family: "Oswald", url: "/fonts/Oswald.ttf", variable: true },
        { family: "Caveat", url: "/fonts/Caveat.ttf", variable: false },
      ],
      registrar,
    );
    expect(families).toEqual(["Oswald", "Caveat"]);
    expect(loaded).toEqual([
      ["Oswald", "/fonts/Oswald.ttf", true],
      ["Caveat", "/fonts/Caveat.ttf", false],
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
        { family: "Inter", url: "/fonts/Inter.ttf", variable: true },
        { family: "Broken", url: "/fonts/Broken.ttf", variable: false },
        { family: "Lora", url: "/fonts/Lora.ttf", variable: true },
      ],
      registrar,
    );
    expect(families).toEqual(["Inter", "Lora"]);
  });
});
