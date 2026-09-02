/**
 * Minimal 1-bit indexed PNG encoder.
 *
 * ptouch-print's print_img() decides which pixels to print by comparing each
 * pixel against palette indices 0 and 1 (the darker entry wins), so the
 * uploaded file must be a genuine 2-color palette PNG — canvas.toBlob() only
 * produces RGBA PNGs. Encoding by hand is ~100 lines and dependency-free:
 * signature + IHDR (bit depth 1, color type 3) + PLTE (white, black) + IDAT
 * (zlib via CompressionStream) + IEND.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * Pack a 1-per-pixel mask (1 = black) into PNG scanlines: one filter byte
 * (0 = None) per row, then pixels packed 8 per byte, MSB first. Palette index
 * 1 (black) is a set bit.
 */
export function packScanlines(mask: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + rowBytes) + 1; // +1 skips the filter byte (0)
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        const idx = rowStart + (x >> 3);
        out[idx] = (out[idx] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" (not "deflate-raw") is the zlib format PNG requires.
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encode a mask (1 = black, row-major, width*height entries) as a 2-color PNG. */
export async function encodeMonoPng(
  mask: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (mask.length !== width * height) {
    throw new Error(`mask length ${mask.length} != ${width}x${height}`);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 3; // color type: palette
  // bytes 10-12: compression, filter, interlace — all 0

  const plte = new Uint8Array([255, 255, 255, 0, 0, 0]); // index 0 white, 1 black
  const idat = await zlibDeflate(packScanlines(mask, width, height));

  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
