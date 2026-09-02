/**
 * Tape sizes supported by ptouch-print (tape_info[] in libptouch.c), used as
 * an offline fallback when the printer can't be queried for its loaded tape.
 * 36mm is listed there but exceeds the 128px printhead, so it's omitted here.
 */
export interface TapeSize {
  widthMm: number;
  printAreaPx: number;
}

export const TAPE_SIZES: readonly TapeSize[] = [
  { widthMm: 6, printAreaPx: 32 },
  { widthMm: 9, printAreaPx: 52 },
  { widthMm: 12, printAreaPx: 76 },
  { widthMm: 18, printAreaPx: 120 },
  { widthMm: 24, printAreaPx: 128 },
];

export function tapeByWidthMm(widthMm: number): TapeSize | undefined {
  return TAPE_SIZES.find((t) => t.widthMm === widthMm);
}
