import { open, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

export interface FontEntry {
  /** CSS family name, derived from the filename (sans extension). */
  family: string;
  /** Filename within the fonts directory. */
  file: string;
  /**
   * True for variable fonts (sfnt `fvar` table present): the UI registers
   * these with a full weight-range FontFace descriptor so bold uses the real
   * face instead of browser synthesis.
   */
  variable: boolean;
}

/**
 * Detect a variable font by scanning the sfnt table directory for `fvar`.
 * Only meaningful for ttf/otf; woff/woff2 wrap the table list differently and
 * report false, which just means synthesized bold — a safe default.
 */
export async function isVariableFont(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    return false;
  }
  try {
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    const sfntVersion = header.readUInt32BE(0);
    if (sfntVersion !== 0x00010000 && sfntVersion !== 0x4f54544f /* 'OTTO' */) {
      return false;
    }
    const numTables = header.readUInt16BE(4);
    if (numTables > 512) return false; // corrupt/foreign file
    const records = Buffer.alloc(numTables * 16);
    await handle.read(records, 0, records.length, 12);
    for (let i = 0; i < numTables; i++) {
      if (records.toString("latin1", i * 16, i * 16 + 4) === "fvar") {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    await handle.close();
  }
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
  const fonts = names.filter((name) => FONT_EXTENSIONS.has(extname(name).toLowerCase()));
  const entries = await Promise.all(
    fonts.map(async (file) => ({
      family: familyFromFilename(file),
      file,
      variable: await isVariableFont(join(dir, file)),
    })),
  );
  return entries.sort((a, b) => a.family.localeCompare(b.family));
}
