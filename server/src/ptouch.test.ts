import { describe, expect, it } from "vitest";
import { parseInfo, PtouchClient, type Exec, type ExecResult } from "./ptouch.js";

const INFO_OUTPUT = `maximum printing width for this tape is 76px
media type = 01
media width = 12 mm
tape color = 01
text color = 08
error = 0000
`;

describe("parseInfo", () => {
  it("parses the --info output of ptouch-print", () => {
    expect(parseInfo(INFO_OUTPUT)).toEqual({
      printWidthPx: 76,
      mediaWidthMm: 12,
      mediaType: 1,
      tapeColor: { code: 1, name: "white" },
      textColor: { code: 8, name: "black" },
      errorCode: 0,
    });
  });

  it("passes unknown color codes through with a null name", () => {
    const status = parseInfo(INFO_OUTPUT.replace("tape color = 01", "tape color = 7f"));
    expect(status.tapeColor).toEqual({ code: 0x7f, name: null });
  });

  it("throws on unrecognized output", () => {
    expect(() => parseInfo("ptouch_open() failed\n")).toThrow(/could not parse/);
  });
});

function fakeExec(results: Record<string, ExecResult>): Exec {
  return (_binary, args) => {
    const key = args[0] ?? "";
    const result = results[key];
    if (!result) throw new Error(`unexpected args: ${args.join(" ")}`);
    return Promise.resolve(result);
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("PtouchClient", () => {
  it("returns parsed status", async () => {
    const client = new PtouchClient({
      binary: "ptouch-print",
      exec: fakeExec({ "--info": { code: 0, stdout: INFO_OUTPUT, stderr: "" } }),
    });
    await expect(client.status()).resolves.toMatchObject({ printWidthPx: 76 });
  });

  it("throws when --info exits non-zero (no printer)", async () => {
    const client = new PtouchClient({
      binary: "ptouch-print",
      exec: fakeExec({ "--info": { code: 5, stdout: "", stderr: "ptouch_open() failed" } }),
    });
    await expect(client.status()).rejects.toThrow(/exit 5.*ptouch_open/s);
  });

  it("prints via a temp file and reports success", async () => {
    let printedFile: string | undefined;
    const exec: Exec = (_binary, args) => {
      if (args[0] === "--image") {
        printedFile = args[1];
        return Promise.resolve({ code: 0, stdout: "", stderr: "" });
      }
      throw new Error("unexpected");
    };
    const client = new PtouchClient({ binary: "ptouch-print", exec });
    await expect(client.print(PNG)).resolves.toEqual({ ok: true, output: "" });
    expect(printedFile).toMatch(/labelcaster-.*label\.png$/);
  });

  it("treats 'image is too large' stdout as a failure even on exit 0", async () => {
    const client = new PtouchClient({
      binary: "ptouch-print",
      exec: fakeExec({
        "--image": {
          code: 0,
          stdout: "image is too large (900px x 100px)\nmaximum printing width for this tape is 76px\n",
          stderr: "",
        },
      }),
    });
    const result = await client.print(PNG);
    expect(result.ok).toBe(false);
  });
});
