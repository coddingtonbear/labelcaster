# labelcaster

A web-based label designer for Brother P-Touch printers: a paint-style canvas
editor in the browser, and a thin local print server that hands the finished
bitmap to [`ptouch-print`](https://mockmoon-cybernetics.ch/computer/p-touch2430pc/).

## How it works

P-Touch printers accept only raster bitmap data — a fixed-height strip
(128px max at 180dpi; usable height depends on the loaded tape) of
1-bit monochrome pixels, unbounded in length. So:

1. The browser renders the label on an HTML canvas sized to the tape's
   pixel height (reported live by the printer).
2. On print, the canvas is thresholded to pure black/white, exported as a
   2-color PNG, and POSTed to the local server.
3. The server shells out to `ptouch-print --image <file>`, which handles the
   USB protocol and model quirks.

The upload is a genuine 2-color *palette* PNG — `ptouch-print` compares pixels
against palette indices, and canvas `toBlob()` only emits RGBA — so the
frontend encodes a 1-bit indexed PNG itself (`web/src/monopng.ts`).

## Layout

npm workspaces:

- `server/` — Fastify server (TypeScript). `GET /api/status` parses
  `ptouch-print --info`; `POST /api/print` writes the PNG to a temp file and
  runs `ptouch-print --image`. Serves the built web UI in production.
- `web/` — Vite + Fabric.js canvas editor: select/text/draw/erase tools,
  image import, font picker, live 1-bit print preview, and a
  "label will be X mm long" readout. Canvas height comes from the printer's
  reported tape; without a printer it falls back to a manual tape picker
  (print disabled).
- `fonts/` — bundled OFL fonts. Drop any `.ttf`/`.otf`/`.woff`/`.woff2` in
  here and it appears in the font picker (filename = family name); see
  `fonts/README.md`.

## Running

```sh
npm install
npm run dev        # server on :8180, Vite dev UI on :5173 (proxies /api)
npm test           # vitest, both workspaces
npm run build      # web/dist + server/dist
PTOUCH_PRINT_BIN=../ptouch-print/ptouch-print node server/dist/index.js
```

Environment: `PTOUCH_PRINT_BIN` (default `ptouch-print` on PATH), `PORT`
(default 8180), `LABELCASTER_FONTS_DIR` (default the repo's `fonts/`). The binary needs libusb access to the printer — usually udev
rules or root (it detaches the `usblp` kernel driver itself).

## Background

**[PLAN.md](PLAN.md)** holds the findings from the feasibility investigation
(tape-width table, CLI integration surface, model quirks, prior art). The
sibling `ptouch-print` checkout is the protocol layer this builds on.
