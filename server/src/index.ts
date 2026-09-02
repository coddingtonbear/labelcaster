import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildApp } from "./app.js";
import { PtouchClient } from "./ptouch.js";

const here = dirname(fileURLToPath(import.meta.url));

const binary = process.env.PTOUCH_PRINT_BIN ?? "ptouch-print";
const port = Number.parseInt(process.env.PORT ?? "8180", 10);
const webRoot = process.env.LABELCASTER_WEB_ROOT ?? resolve(here, "../../web/dist");

const app = buildApp({ client: new PtouchClient({ binary }), webRoot });

app.listen({ port, host: "0.0.0.0" }).then(
  (address) => {
    app.log.info(`labelcaster listening on ${address} (ptouch-print: ${binary})`);
    console.log(`labelcaster listening on ${address} (ptouch-print: ${binary})`);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
