import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, encodeMonoPng, packScanlines } from "./monopng.js";

interface Chunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

function parseChunks(png: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8; // skip signature
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crc });
    offset += 12 + length;
  }
  return chunks;
}

describe("crc32", () => {
  it("matches the PNG reference value for the IEND chunk", () => {
    // Every PNG ends with 49 45 4E 44 AE 42 60 82: CRC of "IEND" is AE426082.
    expect(crc32(new Uint8Array([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082);
  });
});

describe("packScanlines", () => {
  it("packs pixels MSB-first with a leading filter byte per row", () => {
    // 2 rows of 10px: row 0 has pixel 0 and 9 set, row 1 has pixel 8 set.
    const mask = new Uint8Array(20);
    mask[0] = 1;
    mask[9] = 1;
    mask[18] = 1;
    const packed = packScanlines(mask, 10, 2);
    expect(Array.from(packed)).toEqual([
      0, 0b10000000, 0b01000000, // filter, bits 0-7, bits 8-9
      0, 0b00000000, 0b10000000,
    ]);
  });
});

describe("encodeMonoPng", () => {
  it("produces a valid 1-bit palette PNG with white=0, black=1", async () => {
    const width = 5;
    const height = 3;
    const mask = new Uint8Array(width * height);
    mask[0] = 1; // top-left
    mask[7] = 1; // middle-ish
    mask[14] = 1; // bottom-right

    const png = await encodeMonoPng(mask, width, height);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const chunks = parseChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);

    const ihdr = chunks[0]!;
    const view = new DataView(ihdr.data.buffer, ihdr.data.byteOffset);
    expect(view.getUint32(0)).toBe(width);
    expect(view.getUint32(4)).toBe(height);
    expect(ihdr.data[8]).toBe(1); // bit depth
    expect(ihdr.data[9]).toBe(3); // palette color type

    expect(Array.from(chunks[1]!.data)).toEqual([255, 255, 255, 0, 0, 0]);

    // Each chunk's CRC covers type + data.
    for (const c of chunks) {
      const typeBytes = Uint8Array.from(c.type, (ch) => ch.charCodeAt(0));
      const covered = new Uint8Array([...typeBytes, ...c.data]);
      expect(c.crc).toBe(crc32(covered));
    }

    // IDAT is zlib data whose inflation matches the packed scanlines.
    const inflated = inflateSync(chunks[2]!.data);
    expect(Array.from(inflated)).toEqual(Array.from(packScanlines(mask, width, height)));
  });

  it("rejects a mask that doesn't match the dimensions", async () => {
    await expect(encodeMonoPng(new Uint8Array(3), 2, 2)).rejects.toThrow(/mask length/);
  });
});
