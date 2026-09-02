import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import type { PtouchClient } from "./ptouch.js";

export interface AppOptions {
  client: PtouchClient;
  /** Directory holding the built web UI; served at / when it exists. */
  webRoot?: string;
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

  if (options.webRoot !== undefined && existsSync(options.webRoot)) {
    app.register(fastifyStatic, { root: options.webRoot });
  }

  return app;
}
