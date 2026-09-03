import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ColorInfo, PrinterStatus, PrintResult } from "./types.js";

/**
 * Color names for the tape/text color codes reported in the printer status
 * (tables 8 and 9 of Brother's raster command reference). Unknown codes are
 * passed through with a null name.
 */
const TAPE_COLOR_NAMES: ReadonlyMap<number, string> = new Map([
  [0x01, "white"],
  [0x02, "other"],
  [0x03, "clear"],
  [0x04, "red"],
  [0x05, "blue"],
  [0x06, "yellow"],
  [0x07, "green"],
  [0x08, "black"],
  [0x09, "clear (white text)"],
  [0x20, "matte white"],
  [0x21, "matte clear"],
  [0x22, "matte silver"],
  [0x23, "satin gold"],
  [0x24, "satin silver"],
]);

const TEXT_COLOR_NAMES: ReadonlyMap<number, string> = new Map([
  [0x01, "white"],
  [0x04, "red"],
  [0x05, "blue"],
  [0x08, "black"],
  [0x0a, "gold"],
]);

function colorInfo(code: number, names: ReadonlyMap<number, string>): ColorInfo {
  return { code, name: names.get(code) ?? null };
}

/**
 * Parse the stdout of `ptouch-print --info` (run with LC_ALL=C). Two formats
 * exist in the wild; both must parse:
 *
 * Older (e.g. the 1.4.x sibling checkout):
 *
 *   maximum printing width for this tape is 76px
 *   media type = 01
 *   media width = 12 mm
 *   tape color = 01
 *   text color = 08
 *   error = 0000
 *
 * Newer releases prefix hex with 0x and append a decoded name:
 *
 *   media type = 0x01 (Laminated tape)
 *   tape color = 0x01 (White)
 *   ...
 */
export function parseInfo(stdout: string): PrinterStatus {
  const grab = (re: RegExp): RegExpMatchArray => {
    const m = stdout.match(re);
    if (!m || m[1] === undefined) {
      throw new Error(`could not parse ptouch-print --info output (missing ${re})`);
    }
    return m;
  };
  const hexField = (label: string): { code: number; name: string | null } => {
    const m = grab(new RegExp(`${label} = (?:0x)?([0-9a-fA-F]+)(?: \\(([^)]+)\\))?`));
    return { code: Number.parseInt(m[1] ?? "", 16), name: m[2]?.trim() ?? null };
  };
  const printWidthPx = Number.parseInt(
    grab(/maximum printing width for this tape is (\d+)\s?px/)[1] ?? "",
    10,
  );
  const mediaWidthMm = Number.parseInt(grab(/media width = (\d+) mm/)[1] ?? "", 10);
  const tapeColor = hexField("tape color");
  const textColor = hexField("text color");
  return {
    printWidthPx,
    mediaWidthMm,
    mediaType: hexField("media type").code,
    // Prefer the name the printer/CLI reports; fall back to our table.
    tapeColor: tapeColor.name !== null
      ? { code: tapeColor.code, name: tapeColor.name.toLowerCase() }
      : colorInfo(tapeColor.code, TAPE_COLOR_NAMES),
    textColor: textColor.name !== null
      ? { code: textColor.code, name: textColor.name.toLowerCase() }
      : colorInfo(textColor.code, TEXT_COLOR_NAMES),
    errorCode: hexField("error").code,
  };
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Exec = (binary: string, args: string[]) => Promise<ExecResult>;

/** Default exec: run the real binary with a C locale so output is parseable. */
export const execPtouch: Exec = (binary, args) =>
  new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { env: { ...process.env, LC_ALL: "C" }, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          if (typeof error.code !== "number") {
            // Spawn failure (binary missing, timeout kill, …), not a non-zero exit.
            reject(error);
            return;
          }
          resolve({ code: error.code, stdout, stderr });
          return;
        }
        resolve({ code: 0, stdout, stderr });
      },
    );
  });

export interface PtouchClientOptions {
  /** Path to the ptouch-print binary. */
  binary: string;
  /**
   * Pass --precut so the printer cuts off the blank head-to-cutter leader as
   * scrap instead of leaving ~25mm of empty tape attached to the label start.
   * A no-op on models without cutter support, but unknown to ptouch-print
   * builds older than ~1.5 — disable for those. Default true.
   */
  precut?: boolean;
  exec?: Exec;
}

/**
 * Thin wrapper around the ptouch-print CLI — the whole v1 integration surface
 * per PLAN.md: `--info` for status, `--image <png>` for printing.
 */
export class PtouchClient {
  private readonly binary: string;
  private readonly precut: boolean;
  private readonly exec: Exec;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: PtouchClientOptions) {
    this.binary = options.binary;
    this.precut = options.precut ?? true;
    this.exec = options.exec ?? execPtouch;
  }

  /**
   * Serialize all ptouch-print invocations: the status poller and a print
   * job talk to the same USB device, and concurrent libusb claims would
   * collide mid-print.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = (): Promise<T> => task();
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  status(): Promise<PrinterStatus> {
    return this.enqueue(() => this.statusNow());
  }

  print(png: Buffer, copies = 1): Promise<PrintResult> {
    return this.enqueue(() => this.printNow(png, copies));
  }

  private async statusNow(): Promise<PrinterStatus> {
    const result = await this.exec(this.binary, ["--info"]);
    if (result.code !== 0) {
      throw new Error(
        `ptouch-print --info failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`,
      );
    }
    return parseInfo(result.stdout);
  }

  private async printNow(png: Buffer, copies: number): Promise<PrintResult> {
    const dir = await mkdtemp(join(tmpdir(), "labelcaster-"));
    const file = join(dir, "label.png");
    try {
      await writeFile(file, png);
      const args = [
        ...(this.precut ? ["--precut"] : []),
        // Only sent when >1: older ptouch-print builds don't know --copies.
        ...(copies > 1 ? [`--copies=${copies}`] : []),
        "--image",
        file,
      ];
      const result = await this.exec(this.binary, args);
      if (result.code !== 0) {
        return {
          ok: false,
          message: `ptouch-print exited ${result.code}: ${(result.stderr || result.stdout).trim()}`,
        };
      }
      // ptouch-print reports some failures on stdout with a zero exit code
      // (e.g. "image is too large"), so treat any "failed"/"too large" text
      // as an error even on success exit.
      const combined = `${result.stdout}\n${result.stderr}`;
      if (/failed|too large|nothing to print/i.test(combined)) {
        return { ok: false, message: combined.trim() };
      }
      return { ok: true, output: result.stdout.trim() };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
