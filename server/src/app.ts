import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { listFonts } from "./fonts.js";
import type { PtouchClient } from "./ptouch.js";

export interface AppOptions {
  client: PtouchClient;
  /** Directory holding the built web UI; served at / when it exists. */
  webRoot?: string;
  /** Directory of bundled font files; listed at /api/fonts, served at /fonts/. */
  fontsDir?: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });

  app.addContentTypeParser(
    "image/png",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.get("/api/status", async (_req, reply) => {
    try {
      return await options.client.status();
    } catch (error) {
      return reply
        .status(503)
        .send({ message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post<{ Querystring: { copies?: string; mode?: string } }>("/api/print", async (req, reply) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.subarray(0, 8).equals(PNG_MAGIC)) {
      return reply.status(400).send({ message: "body must be a PNG (content-type image/png)" });
    }
    const copies = req.query.copies === undefined ? 1 : Number(req.query.copies);
    if (!Number.isInteger(copies) || copies < 1 || copies > 100) {
      return reply.status(400).send({ message: "copies must be an integer from 1 to 100" });
    }
    const mode = req.query.mode ?? "separate";
    if (mode !== "separate" && mode !== "cutmark") {
      return reply.status(400).send({ message: "mode must be 'separate' or 'cutmark'" });
    }
    const result = await options.client.print(body, copies, mode);
    if (!result.ok) {
      return reply.status(502).send({ message: result.message });
    }
    return { ok: true, output: result.output };
  });

  const fontsDir = options.fontsDir;
  app.get("/api/fonts", async () => {
    if (fontsDir === undefined) return [];
    const fonts = await listFonts(fontsDir);
    return fonts.map(({ family, file }) => ({
      family,
      url: `/fonts/${encodeURIComponent(file)}`,
    }));
  });

  if (fontsDir !== undefined && existsSync(fontsDir)) {
    app.register(fastifyStatic, {
      root: fontsDir,
      prefix: "/fonts/",
      decorateReply: false,
    });
  }

  if (options.webRoot !== undefined && existsSync(options.webRoot)) {
    app.register(fastifyStatic, { root: options.webRoot });
  }

  return app;
}
