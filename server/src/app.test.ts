import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { PtouchClient, type Exec } from "./ptouch.js";

const INFO_OUTPUT = `maximum printing width for this tape is 128px
media type = 01
media width = 24 mm
tape color = 06
text color = 08
error = 0000
`;

const okExec: Exec = (_binary, args) =>
  Promise.resolve(
    args[0] === "--info"
      ? { code: 0, stdout: INFO_OUTPUT, stderr: "" }
      : { code: 0, stdout: "", stderr: "" },
  );

const noPrinterExec: Exec = () =>
  Promise.resolve({ code: 5, stdout: "", stderr: "ptouch_open() failed" });

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function appWith(exec: Exec) {
  return buildApp({ client: new PtouchClient({ binary: "ptouch-print", exec }) });
}

describe("GET /api/status", () => {
  it("returns the parsed printer status", async () => {
    const res = await appWith(okExec).inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      printWidthPx: 128,
      mediaWidthMm: 24,
      tapeColor: { code: 6, name: "yellow" },
    });
  });

  it("returns 503 when the printer is unreachable", async () => {
    const res = await appWith(noPrinterExec).inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/ptouch_open/);
  });
});

describe("GET /api/fonts", () => {
  const cleanups: string[] = [];

  afterAll(async () => {
    for (const dir of cleanups) await rm(dir, { recursive: true, force: true });
  });

  it("lists bundled fonts with their serving URLs and serves the files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "labelcaster-appfonts-"));
    cleanups.push(dir);
    await writeFile(join(dir, "Comic Neue.ttf"), "fake-font-bytes");
    const app = buildApp({
      client: new PtouchClient({ binary: "ptouch-print", exec: okExec }),
      fontsDir: dir,
    });

    const list = await app.inject({ method: "GET", url: "/api/fonts" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([{ family: "Comic Neue", url: "/fonts/Comic%20Neue.ttf" }]);

    const file = await app.inject({ method: "GET", url: "/fonts/Comic%20Neue.ttf" });
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe("fake-font-bytes");
  });

  it("returns an empty list when no fonts directory is configured", async () => {
    const res = await appWith(okExec).inject({ method: "GET", url: "/api/fonts" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe("design routes", () => {
  const cleanups: string[] = [];

  afterAll(async () => {
    for (const dir of cleanups) await rm(dir, { recursive: true, force: true });
  });

  async function designApp() {
    const dir = await mkdtemp(join(tmpdir(), "labelcaster-appdesigns-"));
    cleanups.push(dir);
    return buildApp({
      client: new PtouchClient({ binary: "ptouch-print", exec: okExec }),
      designsDir: dir,
    });
  }

  it("saves, lists, fetches, and deletes a design", async () => {
    const app = await designApp();
    const body = { widthPx: 425, heightPx: 76, canvas: { objects: [] } };
    const put = await app.inject({ method: "PUT", url: "/api/designs/Pantry%20jar", payload: body });
    expect(put.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/designs" });
    expect(list.json()).toMatchObject([{ name: "Pantry jar", widthPx: 425 }]);

    const got = await app.inject({ method: "GET", url: "/api/designs/Pantry%20jar" });
    expect(got.statusCode).toBe(200);
    expect(got.json().canvas).toEqual({ objects: [] });

    const del = await app.inject({ method: "DELETE", url: "/api/designs/Pantry%20jar" });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/designs/Pantry%20jar" })).statusCode).toBe(404);
  });

  it("rejects invalid names and malformed bodies", async () => {
    const app = await designApp();
    const traversal = await app.inject({
      method: "PUT",
      url: "/api/designs/..%2Fescape",
      payload: { widthPx: 1, heightPx: 1, canvas: {} },
    });
    expect([400, 404]).toContain(traversal.statusCode);

    const bad = await app.inject({
      method: "PUT",
      url: "/api/designs/ok",
      payload: { widthPx: "wide", canvas: {} },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("503s when no designs directory is configured", async () => {
    const res = await appWith(okExec).inject({ method: "GET", url: "/api/designs" });
    expect(res.statusCode).toBe(503);
  });
});

describe("POST /api/print", () => {
  it("accepts a PNG body and prints it", async () => {
    const res = await appWith(okExec).inject({
      method: "POST",
      url: "/api/print",
      headers: { "content-type": "image/png" },
      payload: PNG,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, output: "" });
  });

  it("rejects non-PNG bodies", async () => {
    const res = await appWith(okExec).inject({
      method: "POST",
      url: "/api/print",
      headers: { "content-type": "image/png" },
      payload: Buffer.from("not a png"),
    });
    expect(res.statusCode).toBe(400);
  });

  it("surfaces printer failures as 502", async () => {
    const res = await appWith(noPrinterExec).inject({
      method: "POST",
      url: "/api/print",
      headers: { "content-type": "image/png" },
      payload: PNG,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toMatch(/exited 5/);
  });
});
