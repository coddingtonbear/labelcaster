/**
 * Compute a label width that gives the content as much empty space on the
 * right as it has on the left: left margin is preserved, right margin is made
 * to match. Returns null when the mask has no printed pixels (nothing to fit).
 */
export function fittedWidth(mask: Uint8Array, width: number, height: number): number | null {
  let leftmost = -1;
  let rightmost = -1;
  for (let x = 0; x < width && leftmost === -1; x++) {
    for (let y = 0; y < height; y++) {
      if (mask[y * width + x] === 1) {
        leftmost = x;
        break;
      }
    }
  }
  if (leftmost === -1) {
    return null;
  }
  for (let x = width - 1; x >= 0 && rightmost === -1; x--) {
    for (let y = 0; y < height; y++) {
      if (mask[y * width + x] === 1) {
        rightmost = x;
        break;
      }
    }
  }
  return rightmost + 1 + leftmost;
}
