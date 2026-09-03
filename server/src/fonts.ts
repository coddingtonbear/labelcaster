import { readdir } from "node:fs/promises";
import { extname } from "node:path";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

export interface FontEntry {
  /** CSS family name, derived from the filename (sans extension). */
  family: string;
  /** Filename within the fonts directory. */
  file: string;
}

/** "Comic Neue.ttf" -> "Comic Neue"; underscores/hyphens read as spaces. */
export function familyFromFilename(file: string): string {
  return file
    .slice(0, file.length - extname(file).length)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Enumerate font files in a directory — the app's font list is exactly
 * whatever files are dropped in here. A missing directory is an empty list,
 * not an error, so the app runs without bundled fonts.
 */
export async function listFonts(dir: string): Promise<FontEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => FONT_EXTENSIONS.has(extname(name).toLowerCase()))
    .map((file) => ({ family: familyFromFilename(file), file }))
    .sort((a, b) => a.family.localeCompare(b.family));
}
