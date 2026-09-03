# labelcaster

A web-based label designer for Brother P-Touch printers: a paint-style canvas
editor in the browser, and a thin local print server that hands the finished
bitmap to [`ptouch-print`](https://mockmoon-cybernetics.ch/computer/p-touch2430pc/).
Point it at the machine your printer is plugged into and design labels from
any device on your network — phone included.

<!-- TODO(s3): replace IMAGE_BASE with the S3 bucket URL hosting the screenshots -->
![The label editor](IMAGE_BASE/editor.png)

## Features

- **Paint-style canvas editor** — select/move/resize, inline text editing,
  freehand drawing, erasing, and image import, with keyboard shortcuts
  (`V`/`T`/`D`/`E`, `Del`). The canvas is sized to the printer's actual
  loaded tape, reported live over USB.
- **Bundled open-source fonts** — Inter, Lora, JetBrains Mono, Oswald,
  Archivo Black, Caveat, and Comic Neue ship with the app (SIL OFL 1.1), so
  every device renders the same label. Drop any `.ttf`/`.otf`/`.woff`/
  `.woff2` into `fonts/` and it appears in the picker — no rebuild
  (filename = family name; see [fonts/README.md](fonts/README.md)).
- **Honest 1-bit preview** — the Preview tab shows exactly the thresholded
  black/white raster the printer will receive, not the anti-aliased canvas.

  ![The 1-bit print preview](IMAGE_BASE/preview.png)

- **Fit** — one click trims (or grows) the label so the right margin matches
  the left, with a live "label will be X mm long" readout (180 dpi).
- **Live printer status** — the page polls the printer and follows it in both
  directions: turn the printer on and Print lights up within seconds; let it
  power itself off and the UI says so. Swapping tape resizes the canvas
  without discarding your design; with no printer ever seen, a manual
  tape-size picker (6–24 mm) lets you design offline.
- **No wasted leader** — prints pass `--precut`, so the printer cuts off the
  blank head-to-cutter leader as scrap instead of leaving ~25 mm of empty
  tape on the front of every label.
- **Responsive, light/dark** — fits phone screens (the zoom adapts so a
  typical label fits without horizontal scrolling) and follows the OS
  light/dark preference automatically. The canvas stays white either way —
  it's the tape.

  ![Dark mode](IMAGE_BASE/dark.png)

Append `?demo` to the URL to load sample content (or `?demo=preview` to land
on the Preview tab) — handy for trying the editor without a printer.

## How it works

P-Touch printers accept only raster bitmap data — a fixed-height strip
(128 px max at 180 dpi; usable height depends on the loaded tape) of 1-bit
monochrome pixels, unbounded in length. So:

1. The browser renders the label on an HTML canvas sized to the tape's pixel
   height, edited at a zoom that keeps coordinates in printer pixels.
2. On print, the canvas is rendered at true resolution, thresholded to pure
   black/white (Rec. 601 luminance, alpha composited over white), and encoded
   as a **2-color palette PNG** — `ptouch-print` compares pixels against
   palette indices, and canvas `toBlob()` only emits RGBA, so the frontend
   encodes the 1-bit indexed PNG itself (`web/src/monopng.ts`).
3. The PNG is POSTed to the server, which shells out to
   `ptouch-print --precut --image <file>`; that handles the USB protocol and
   model quirks. All CLI invocations are serialized so a status poll never
   collides with a print.

## Layout

npm workspaces:

- `server/` — Fastify server (TypeScript). `GET /api/status` parses
  `ptouch-print --info`; `POST /api/print` prints a PNG; `GET /api/fonts`
  lists the fonts directory. Serves the built web UI in production.
- `web/` — Vite + Fabric.js canvas editor.
- `fonts/` — bundled OFL fonts; scanned at request time.

## Running

```sh
npm install
npm run dev        # server on :8180, Vite dev UI on :5173 (proxies /api)
npm test           # vitest, both workspaces
npm run build      # web/dist + server/dist
PTOUCH_PRINT_BIN=/usr/local/bin/ptouch-print node server/dist/index.js
```

The `ptouch-print` binary needs libusb access to the printer — usually udev
rules or root (it detaches the `usblp` kernel driver itself). For a permanent
install, run `node server/dist/index.js` under a systemd unit and put a
reverse proxy (Caddy, nginx) in front.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `PTOUCH_PRINT_BIN` | `ptouch-print` on PATH | Path to the ptouch-print binary |
| `PORT` | `8180` | HTTP port |
| `LABELCASTER_FONTS_DIR` | repo's `fonts/` | Directory scanned for fonts |
| `LABELCASTER_PRECUT` | `1` | Set `0` for ptouch-print builds older than ~1.5, which don't know `--precut` |
| `LABELCASTER_WEB_ROOT` | `web/dist` | Built UI to serve |

## Background

**[PLAN.md](PLAN.md)** holds the findings from the feasibility investigation
(tape-width table, CLI integration surface, model quirks, prior art).
Supported printers are whatever the installed `ptouch-print` supports —
`ptouch-print --list-supported`.
