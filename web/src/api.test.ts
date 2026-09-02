import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchStatus, printPng } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("fetchStatus", () => {
  it("returns the parsed status JSON", async () => {
    const status = {
      printWidthPx: 76,
      mediaWidthMm: 12,
      mediaType: 1,
      tapeColor: { code: 1, name: "white" },
      textColor: { code: 8, name: "black" },
      errorCode: 0,
    };
    stubFetch(new Response(JSON.stringify(status), { status: 200 }));
    await expect(fetchStatus()).resolves.toEqual(status);
  });

  it("throws an ApiError carrying the server message and status", async () => {
    stubFetch(new Response(JSON.stringify({ message: "ptouch_open() failed" }), { status: 503 }));
    const error = await fetchStatus().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).message).toMatch(/ptouch_open/);
  });
});

describe("printPng", () => {
  it("POSTs the PNG bytes with the right content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, output: "" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await printPng(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith("/api/print", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([1, 2, 3]),
    });
  });

  it("throws with the server's message on failure", async () => {
    stubFetch(new Response(JSON.stringify({ message: "image is too large" }), { status: 502 }));
    await expect(printPng(new Uint8Array([1]))).rejects.toThrow(/too large/);
  });

  it("falls back to a generic message on non-JSON errors", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(printPng(new Uint8Array([1]))).rejects.toThrow(/status 502/);
  });
});
