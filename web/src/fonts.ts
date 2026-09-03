import type { FontEntry } from "./api.js";

/** The slice of FontFace/document.fonts this module needs, for testability. */
export interface FontRegistrar {
  load(family: string, url: string, variable: boolean): Promise<void>;
}

const browserRegistrar: FontRegistrar = {
  async load(family, url, variable) {
    // A variable font registered with its full weight range serves real bold
    // faces; a static font must NOT claim the range, or bold text would
    // render at regular weight instead of being synthesized.
    const descriptors: FontFaceDescriptors = variable ? { weight: "100 900" } : {};
    const face = new FontFace(family, `url("${url}")`, descriptors);
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
        await registrar.load(entry.family, entry.url, entry.variable);
        return entry.family;
      } catch (error) {
        console.warn(`font "${entry.family}" failed to load:`, error);
        return null;
      }
    }),
  );
  return results.filter((family): family is string => family !== null);
}
