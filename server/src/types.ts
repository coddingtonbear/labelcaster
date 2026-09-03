/** Parsed output of `ptouch-print --info`. */
export interface PrinterStatus {
  /** Usable print height for the loaded tape, in pixels (the canvas height). */
  printWidthPx: number;
  /** Loaded tape width in mm. */
  mediaWidthMm: number;
  /** Raw media type code (Brother raster spec). */
  mediaType: number;
  /** Raw tape color code plus a human name for common codes. */
  tapeColor: ColorInfo;
  /** Raw text color code plus a human name for common codes. */
  textColor: ColorInfo;
  /** Printer-reported error bits; 0 means no error. */
  errorCode: number;
}

export interface ColorInfo {
  code: number;
  name: string | null;
}

export type PrintResult =
  | { ok: true; output: string }
  | { ok: false; message: string };

/**
 * How multiple copies come out: "separate" prints one job per copy (each a
 * clean auto-cut label; leader scrap per copy); "cutmark" prints one strip
 * with printed cut marks between copies (leader scrap once; scissors).
 */
export type PrintMode = "separate" | "cutmark";
