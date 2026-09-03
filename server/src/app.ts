import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { DesignStore, isDesignInput, NAME_PATTERN } from "./designs.js";
import { listFonts } from "./fonts.js";
import type { PtouchClient } from "./ptouch.js";

export interface AppOptions {
  client: PtouchClient;
  /** Directory holding the built web UI; served at / when it exists. */
  webRoot?: string;
  /** Directory of bundled font files; listed at /api/fonts, served at /fonts/. */
  fontsDir?: string;
  /** Directory where saved designs live; design routes 503 without it. */
  designsDir?: string;
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

  app.post("/api/print", async (req, reply) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.subarray(0, 8).equals(PNG_MAGIC)) {
      return reply.status(400).send({ message: "body must be a PNG (content-type image/png)" });
    }
    const result = await options.client.print(body);
    if (!result.ok) {
      return reply.status(502).send({ message: result.message });
    }
    return { ok: true, output: result.output };
  });

  const designs = options.designsDir !== undefined ? new DesignStore(options.designsDir) : null;

  app.get("/api/designs", async (_req, reply) => {
    if (!designs) return reply.status(503).send({ message: "design storage not configured" });
    return designs.list();
  });

  app.get<{ Params: { name: string } }>("/api/designs/:name", async (req, reply) => {
    if (!designs) return reply.status(503).send({ message: "design storage not configured" });
    if (!NAME_PATTERN.test(req.params.name)) {
      return reply.status(400).send({ message: "invalid design name" });
    }
    const design = await designs.load(req.params.name);
    if (!design) return reply.status(404).send({ message: "no such design" });
    return design;
  });

  app.put<{ Params: { name: string } }>("/api/designs/:name", async (req, reply) => {
    if (!designs) return reply.status(503).send({ message: "design storage not configured" });
    if (!NAME_PATTERN.test(req.params.name)) {
      return reply
        .status(400)
        .send({ message: "design names: letters, digits, spaces, _()- (max 64)" });
    }
    if (!isDesignInput(req.body)) {
      return reply
        .status(400)
        .send({ message: "body must be { widthPx, heightPx, canvas } with positive sizes" });
    }
    return designs.save(req.params.name, req.body);
  });

  app.delete<{ Params: { name: string } }>("/api/designs/:name", async (req, reply) => {
    if (!designs) return reply.status(503).send({ message: "design storage not configured" });
    if (!NAME_PATTERN.test(req.params.name)) {
      return reply.status(400).send({ message: "invalid design name" });
    }
    if (!(await designs.remove(req.params.name))) {
      return reply.status(404).send({ message: "no such design" });
    }
    return { ok: true };
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
