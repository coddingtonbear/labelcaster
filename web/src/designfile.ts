/**
 * The downloadable design file: a self-identifying JSON document holding
 * everything needed to reproduce a label — the fabric canvas plus the label
 * dimensions. No server storage; users keep these files themselves.
 */

export const DESIGN_FILE_EXTENSION = ".labelcaster.json";

export interface DesignFile {
  format: "labelcaster-design";
  version: 1;
  widthPx: number;
  heightPx: number;
  canvas: unknown;
}

export interface DesignPayload {
  widthPx: number;
  heightPx: number;
  canvas: unknown;
}

export function serializeDesignFile(design: DesignPayload): string {
  const file: DesignFile = {
    format: "labelcaster-design",
    version: 1,
    widthPx: design.widthPx,
    heightPx: design.heightPx,
    canvas: design.canvas,
  };
  return JSON.stringify(file, null, 2);
}

/** Parse and validate a design file's text; throws with a readable message. */
export function parseDesignFile(text: string): DesignFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("not a design file (invalid JSON)");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("not a design file (expected a JSON object)");
  }
  const v = value as Record<string, unknown>;
  if (v.format !== "labelcaster-design") {
    throw new Error("not a labelcaster design file");
  }
  if (v.version !== 1) {
    throw new Error(`unsupported design file version: ${String(v.version)}`);
  }
  if (
    typeof v.widthPx !== "number" ||
    !Number.isFinite(v.widthPx) ||
    v.widthPx <= 0 ||
    typeof v.heightPx !== "number" ||
    !Number.isFinite(v.heightPx) ||
    v.heightPx <= 0
  ) {
    throw new Error("design file has invalid label dimensions");
  }
  if (typeof v.canvas !== "object" || v.canvas === null) {
    throw new Error("design file has no canvas data");
  }
  return {
    format: "labelcaster-design",
    version: 1,
    widthPx: v.widthPx,
    heightPx: v.heightPx,
    canvas: v.canvas,
  };
}

/** e.g. "label-2026-09-03-135712.labelcaster.json" */
export function defaultFilename(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `label-${stamp}${DESIGN_FILE_EXTENSION}`;
}
