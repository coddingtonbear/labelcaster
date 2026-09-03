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

export interface DesignMeta {
  name: string;
  widthPx: number;
  heightPx: number;
  updatedAt: string;
}

export interface DesignInput {
  widthPx: number;
  heightPx: number;
  canvas: unknown;
}

export interface Design extends DesignMeta {
  canvas: unknown;
}

async function checkOk(res: Response): Promise<Response> {
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return res;
}

export async function listDesigns(): Promise<DesignMeta[]> {
  const res = await checkOk(await fetch("/api/designs"));
  return (await res.json()) as DesignMeta[];
}

export async function getDesign(name: string): Promise<Design> {
  const res = await checkOk(await fetch(`/api/designs/${encodeURIComponent(name)}`));
  return (await res.json()) as Design;
}

export async function saveDesign(name: string, input: DesignInput): Promise<void> {
  await checkOk(
    await fetch(`/api/designs/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteDesign(name: string): Promise<void> {
  await checkOk(
    await fetch(`/api/designs/${encodeURIComponent(name)}`, { method: "DELETE" }),
  );
}

export async function printPng(png: Uint8Array): Promise<string> {
  const res = await fetch("/api/print", {
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
