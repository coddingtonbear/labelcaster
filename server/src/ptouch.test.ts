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

  it("parses the newer --info format (0x prefixes, decoded names)", () => {
    // As emitted by e.g. the ptouch-print on seldon, driving a PT-P710BT.
    const output = `PT-P710BT found on USB bus 1, device 4
printer has 180 dpi, maximum printing width is 128 px
maximum printing width for this tape is 76px
media type = 0x01 (Laminated tape)
media width = 12 mm
tape color = 0x01 (White)
text color = 0x08 (Black)
error = 0x0000
`;
    expect(parseInfo(output)).toEqual({
      printWidthPx: 76,
      mediaWidthMm: 12,
      mediaType: 1,
      tapeColor: { code: 1, name: "white" },
      textColor: { code: 8, name: "black" },
      errorCode: 0,
    });
  });

  it("prefers the CLI-reported color name over the built-in table", () => {
    const output = INFO_OUTPUT.replace("tape color = 01", "tape color = 0x01 (Pearlescent)");
    expect(parseInfo(output).tapeColor).toEqual({ code: 1, name: "pearlescent" });
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

  it("prints via a temp file with --precut and reports success", async () => {
    let printArgs: string[] | undefined;
    const exec: Exec = (_binary, args) => {
      printArgs = args;
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    };
    const client = new PtouchClient({ binary: "ptouch-print", exec });
    await expect(client.print(PNG)).resolves.toEqual({ ok: true, output: "" });
    expect(printArgs?.slice(0, 2)).toEqual(["--precut", "--image"]);
    expect(printArgs?.[2]).toMatch(/labelcaster-.*label\.png$/);
  });

  it("omits --precut when disabled (older ptouch-print builds)", async () => {
    let printArgs: string[] | undefined;
    const exec: Exec = (_binary, args) => {
      printArgs = args;
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    };
    const client = new PtouchClient({ binary: "ptouch-print", precut: false, exec });
    await client.print(PNG);
    expect(printArgs?.[0]).toBe("--image");
  });

  it("treats 'image is too large' stdout as a failure even on exit 0", async () => {
    const client = new PtouchClient({
      binary: "ptouch-print",
      exec: fakeExec({
        "--precut": {
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
