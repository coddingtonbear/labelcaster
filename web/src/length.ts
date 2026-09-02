/** All supported P-Touch models print at 180dpi (PLAN.md, libptouch.c). */
export const DPI = 180;
const MM_PER_INCH = 25.4;

export function pxToMm(px: number): number {
  return (px / DPI) * MM_PER_INCH;
}

export function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * DPI);
}

export function formatMm(mm: number): string {
  return `${mm.toFixed(1)} mm`;
}
