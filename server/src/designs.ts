import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Design names double as filenames: letters, digits, spaces, and a few safe
 * punctuation characters, starting with an alphanumeric — no dots or slashes,
 * so no path traversal and no clashes with temp files.
 */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _()-]{0,63}$/;

export interface DesignMeta {
  name: string;
  widthPx: number;
  heightPx: number;
  updatedAt: string;
}

export interface DesignInput {
  widthPx: number;
  heightPx: number;
  /** Fabric.js canvas JSON, passed through opaquely. */
  canvas: unknown;
}

export interface Design extends DesignMeta {
  canvas: unknown;
}

export function isDesignInput(value: unknown): value is DesignInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.widthPx === "number" &&
    Number.isFinite(v.widthPx) &&
    v.widthPx > 0 &&
    typeof v.heightPx === "number" &&
    Number.isFinite(v.heightPx) &&
    v.heightPx > 0 &&
    typeof v.canvas === "object" &&
    v.canvas !== null
  );
}

/** One JSON file per design in a flat directory. */
export class DesignStore {
  constructor(private readonly dir: string) {}

  private file(name: string): string {
    return join(this.dir, `${name}.json`);
  }

  async list(): Promise<DesignMeta[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return []; // no directory yet: no designs
    }
    const metas: DesignMeta[] = [];
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const design = JSON.parse(await readFile(join(this.dir, file), "utf8")) as Design;
        metas.push({
          name: design.name,
          widthPx: design.widthPx,
          heightPx: design.heightPx,
          updatedAt: design.updatedAt,
        });
      } catch {
        // skip unreadable/corrupt entries rather than failing the listing
      }
    }
    return metas.sort((a, b) => a.name.localeCompare(b.name));
  }

  async load(name: string): Promise<Design | null> {
    try {
      return JSON.parse(await readFile(this.file(name), "utf8")) as Design;
    } catch {
      return null;
    }
  }

  async save(name: string, input: DesignInput): Promise<Design> {
    await mkdir(this.dir, { recursive: true });
    const design: Design = {
      name,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      canvas: input.canvas,
      updatedAt: new Date().toISOString(),
    };
    // Write-then-rename so a crash mid-write never corrupts an existing file.
    const tmp = join(this.dir, `.${name}.tmp`);
    await writeFile(tmp, JSON.stringify(design));
    await rename(tmp, this.file(name));
    return design;
  }

  async remove(name: string): Promise<boolean> {
    try {
      await rm(this.file(name));
      return true;
    } catch {
      return false;
    }
  }
}
