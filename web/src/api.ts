/** Client for the labelcaster server. Shapes mirror server/src/types.ts. */

export interface ColorInfo {
  code: number;
  name: string | null;
}

export interface PrinterStatus {
  printWidthPx: number;
  mediaWidthMm: number;
  mediaType: number;
  tapeColor: ColorInfo;
  textColor: ColorInfo;
  errorCode: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === "string") return message;
    }
  } catch {
    // fall through to the generic message
  }
  return `request failed with status ${res.status}`;
}

export interface FontEntry {
  family: string;
  url: string;
  /** Variable font: register with a full weight range for real bold. */
  variable: boolean;
}

/** Bundled fonts the server found in its fonts directory; [] on any failure. */
export async function fetchFonts(): Promise<FontEntry[]> {
  try {
    const res = await fetch("/api/fonts");
    if (!res.ok) return [];
    return (await res.json()) as FontEntry[];
  } catch {
    return [];
  }
}

export async function fetchStatus(): Promise<PrinterStatus> {
  const res = await fetch("/api/status");
  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }
  return (await res.json()) as PrinterStatus;
}

export type PrintMode = "separate" | "cutmark";

export async function printPng(
  png: Uint8Array,
  copies = 1,
  mode: PrintMode = "separate",
): Promise<string> {
  const params = new URLSearchParams();
  if (copies > 1) {
    params.set("copies", String(copies));
    if (mode !== "separate") params.set("mode", mode);
  }
  const query = params.toString();
  const url = query ? `/api/print?${query}` : "/api/print";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: png as BodyInit,
  });
  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }
  const body = (await res.json()) as { output: string };
  return body.output;
}
