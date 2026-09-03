import type { FontEntry } from "./api.js";

/** The slice of FontFace/document.fonts this module needs, for testability. */
export interface FontRegistrar {
  load(family: string, url: string): Promise<void>;
}

const browserRegistrar: FontRegistrar = {
  async load(family, url) {
    const face = new FontFace(family, `url("${url}")`);
    await face.load();
    document.fonts.add(face);
  },
};

/**
 * Load bundled fonts into the document, returning the families that actually
 * loaded (in the order given). A font that fails to parse or fetch is skipped
 * rather than breaking the rest of the list.
 */
export async function loadFonts(
  entries: readonly FontEntry[],
  registrar: FontRegistrar = browserRegistrar,
): Promise<string[]> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        await registrar.load(entry.family, entry.url);
        return entry.family;
      } catch (error) {
        console.warn(`font "${entry.family}" failed to load:`, error);
        return null;
      }
    }),
  );
  return results.filter((family): family is string => family !== null);
}
