# labelcaster — kickoff plan

Findings and decisions from the feasibility session (2026-08-31), recorded so a
fresh session can start building without re-deriving them.

## Goal

A web UI for designing P-Touch labels: a paint-style canvas editor (text,
freehand drawing, images) with a Print button. Browser designs the label;
a thin local server hands the bitmap to the printer.

## Ground truth about the printer (verified in the ptouch-print source)

The sibling checkout at `../ptouch-print` is the protocol reference.

- The printer accepts **only raster bitmap data** — even "text" printing is
  render-to-bitmap. Print path: `print_img()` in `src/ptouch-print.c` walks the
  image left-to-right, sending one vertical raster line per horizontal pixel
  via `ptouch_sendraster()` in `src/libptouch.c` (a `G` command, length header,
  16 data bytes, with a fake single-run PackBits wrapper on newer models).
  Total protocol is ~60 lines of C.
- **1-bit monochrome only.** No grayscale; threshold/dither before sending.
- **Fixed height, unbounded length.** Printhead is 128px @ 180dpi on all
  supported models. Usable height depends on loaded tape
  (`tape_info[]`, `src/libptouch.c`):

  | Tape (mm) | Print area (px) | Default margins (mm) |
  |-----------|-----------------|----------------------|
  | 6         | 32              | 1.0                  |
  | 9         | 52              | 1.0                  |
  | 12        | 76              | 2.0                  |
  | 18        | 120             | 3.0                  |
  | 24        | 128             | 3.0                  |
  | 36       | 192 (unsupported head) | 4.5           |

- The status request reports loaded tape width (mm), tape color, and text
  color — so the UI can size its canvas to the actual tape at runtime.
- Label length in mm = width_px / 180 * 25.4.
- Model quirks noted in `src/libptouch.c` comments: PT-1230PC wants leading
  blank pixels; PT-2730 reportedly needs ~48px whitespace before content;
  PT-D600 has premature-cut / max-length quirks. `print_img()` always centers
  vertically (offset 64 - h/2).

## Integration surface (v1: shell out, don't reimplement)

- `ptouch-print --image <file.png>` — prints any **2-color PNG** whose height
  ≤ the tape's print area; centers vertically. This is the whole v1 API.
- `ptouch-print --info` — prints max width for loaded tape, media type/width,
  tape/text color. Parse this for `GET /status`.
- `ptouch-print --writepng <file>` — render without printer; useful for tests.
- Requires the printer on USB with the binary's libusb access (it detaches the
  kernel driver itself; usually needs udev rules or root).

## Architecture

1. **Backend** (~100 lines; runs on the box with the printer — a Pi is ideal):
   - `GET /status` → shells out to `ptouch-print --info`, returns tape width
     in px (canvas height) and tape/text color.
   - `POST /print` → receives PNG, writes temp file, runs
     `ptouch-print --image <file>`, returns success/failure with stderr.
2. **Frontend**: HTML canvas sized to reported tape height; horizontal strip
   that grows in width. Fabric.js or Konva for draggable/editable text objects
   and freehand drawing (browser fonts give a free font picker). Before
   sending: threshold `getImageData` to pure black/white (also use this for an
   honest on-screen preview), then `canvas.toBlob('image/png')`.
   Show a live "label will be X mm long" readout.
3. **Stretch (later, not v1)**: WebUSB direct-from-Chrome, no server. Caveats:
   Chromium-only, needs udev rules, and WebUSB cannot detach the `usblp`
   kernel driver (libusb can), so it needs the driver unbound.

## Decisions made

- Name: **labelcaster**.
- Peer folder of `ptouch-print`; v1 wraps the CLI rather than reimplementing
  the USB protocol.
- The user's standing preferences apply: solid types (no unjustified `any`),
  test coverage.

## Prior art (proves the shape works)

- <https://github.com/PhilippMundhenk/labeler> — web UI wrapping this same CLI
- <https://github.com/tanvach/ptouch-esp32> — same idea on an ESP32-S3
- <https://github.com/kyasu1/node-ptouch> — print proxy server
- <https://github.com/mnakada/ptouch-print> — fork accepting SVG, preview mode
