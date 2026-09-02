import { ApiError, fetchStatus, printPng, type PrinterStatus } from "./api.js";
import { LabelEditor, type Tool } from "./editor.js";
import { formatMm, mmToPx, pxToMm } from "./length.js";
import { encodeMonoPng } from "./monopng.js";
import { TAPE_SIZES, tapeByWidthMm } from "./tapes.js";
import { maskToRgba } from "./threshold.js";
import "./style.css";

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const statusChip = element<HTMLSpanElement>("printer-status");
const tapePickerWrap = element<HTMLLabelElement>("tape-picker-wrap");
const tapePicker = element<HTMLSelectElement>("tape-picker");
const tapeInfo = element<HTMLSpanElement>("tape-info");
const lengthInput = element<HTMLInputElement>("label-length");
const lengthReadout = element<HTMLSpanElement>("length-readout");
const previewCanvas = element<HTMLCanvasElement>("preview");
const printButton = element<HTMLButtonElement>("print-button");
const printResult = element<HTMLSpanElement>("print-result");

function displayZoom(heightPx: number): number {
  return Math.max(2, Math.min(6, Math.round(300 / heightPx)));
}

let editor: LabelEditor | undefined;
let printerAvailable = false;

function currentLengthPx(): number {
  return mmToPx(Number.parseFloat(lengthInput.value) || 60);
}

function updateLengthReadout(): void {
  const px = currentLengthPx();
  lengthReadout.textContent = `${px}px — label will be ${formatMm(pxToMm(px))} long`;
}

function schedulePreview(): void {
  requestAnimationFrame(() => {
    if (!editor) return;
    const { mask, width, height } = editor.renderMask();
    previewCanvas.width = width;
    previewCanvas.height = height;
    const context = previewCanvas.getContext("2d");
    if (!context) return;
    const imageData = context.createImageData(width, height);
    maskToRgba(mask, imageData.data);
    context.putImageData(imageData, 0, 0);
    const zoom = displayZoom(height);
    previewCanvas.style.width = `${width * zoom}px`;
    previewCanvas.style.height = `${height * zoom}px`;
  });
}

function setUpEditor(heightPx: number): void {
  void editor?.dispose();
  // Fabric wraps the canvas element; recreate a fresh one for each editor.
  const holder = element<HTMLDivElement>("canvas-holder");
  holder.innerHTML = '<canvas id="editor"></canvas>';
  const canvasElement = element<HTMLCanvasElement>("editor");

  const newEditor = new LabelEditor({
    canvasElement,
    widthPx: currentLengthPx(),
    heightPx,
    zoom: displayZoom(heightPx),
    onTextPlaced: () => setActiveTool("select"),
  });
  let previewQueued = false;
  newEditor.onRendered(() => {
    if (previewQueued) return;
    previewQueued = true;
    setTimeout(() => {
      previewQueued = false;
      schedulePreview();
    }, 150);
  });
  editor = newEditor;
  setActiveTool("select");
  updateLengthReadout();
  schedulePreview();
}

// --- Printer status / tape selection -----------------------------------

function showOfflineTapePicker(message: string): void {
  statusChip.textContent = message;
  statusChip.className = "status status-error";
  tapePickerWrap.hidden = false;
  tapePicker.innerHTML = "";
  for (const tape of TAPE_SIZES) {
    const option = document.createElement("option");
    option.value = String(tape.widthMm);
    option.textContent = `${tape.widthMm} mm (${tape.printAreaPx}px)`;
    if (tape.widthMm === 12) option.selected = true;
    tapePicker.appendChild(option);
  }
  tapeInfo.textContent = "no printer — pick the tape size manually";
  const selected = tapeByWidthMm(Number(tapePicker.value));
  setUpEditor(selected?.printAreaPx ?? 76);
}

function applyStatus(status: PrinterStatus): void {
  printerAvailable = true;
  printButton.disabled = false;
  statusChip.textContent = "printer connected";
  statusChip.className = "status status-ok";
  tapePickerWrap.hidden = true;
  const colors = [
    status.textColor.name ? `${status.textColor.name} text` : null,
    status.tapeColor.name ? `on ${status.tapeColor.name} tape` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  tapeInfo.textContent = `${status.mediaWidthMm} mm tape, ${status.printWidthPx}px printable${colors ? ` — ${colors}` : ""}`;
  setUpEditor(status.printWidthPx);
}

async function initStatus(): Promise<void> {
  try {
    applyStatus(await fetchStatus());
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 503 ? "printer not found" : "server offline";
    printerAvailable = false;
    printButton.disabled = true;
    showOfflineTapePicker(message);
  }
}

tapePicker.addEventListener("change", () => {
  const tape = tapeByWidthMm(Number(tapePicker.value));
  if (tape) setUpEditor(tape.printAreaPx);
});

// --- Toolbar -----------------------------------------------------------

const toolButtons: Record<Tool, HTMLButtonElement> = {
  select: element("tool-select"),
  text: element("tool-text"),
  draw: element("tool-draw"),
  erase: element("tool-erase"),
};

function setActiveTool(tool: Tool): void {
  editor?.setTool(tool);
  for (const [name, button] of Object.entries(toolButtons)) {
    button.classList.toggle("active", name === tool);
  }
}

for (const [name, button] of Object.entries(toolButtons) as [Tool, HTMLButtonElement][]) {
  button.addEventListener("click", () => setActiveTool(name));
}

element<HTMLInputElement>("brush-width").addEventListener("input", (event) => {
  editor?.setBrushWidth(Number((event.target as HTMLInputElement).value));
});

element<HTMLSelectElement>("font-family").addEventListener("change", (event) => {
  editor?.setFontFamily((event.target as HTMLSelectElement).value);
});

element<HTMLInputElement>("font-size").addEventListener("change", (event) => {
  editor?.setFontSize(Number((event.target as HTMLInputElement).value));
});

const imageInput = element<HTMLInputElement>("image-file");
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file && editor) {
    void editor.addImage(file);
    imageInput.value = "";
  }
});
// The label wrapping the hidden input opens the file picker natively.

element<HTMLButtonElement>("delete-selection").addEventListener("click", () => {
  editor?.deleteSelection();
});

element<HTMLButtonElement>("clear-canvas").addEventListener("click", () => {
  editor?.clear();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
      return;
    }
    editor?.deleteSelection();
  }
});

// --- Label length ------------------------------------------------------

lengthInput.addEventListener("change", () => {
  editor?.setLabelWidth(currentLengthPx());
  updateLengthReadout();
  schedulePreview();
});

// --- Print -------------------------------------------------------------

printButton.addEventListener("click", () => {
  void (async () => {
    if (!editor || !printerAvailable) return;
    printButton.disabled = true;
    printResult.textContent = "printing…";
    printResult.className = "";
    try {
      const { mask, width, height } = editor.renderMask();
      const png = await encodeMonoPng(mask, width, height);
      await printPng(png);
      printResult.textContent = `printed (${formatMm(pxToMm(width))})`;
      printResult.className = "ok";
    } catch (error) {
      printResult.textContent = error instanceof Error ? error.message : String(error);
      printResult.className = "error";
    } finally {
      printButton.disabled = false;
    }
  })();
});

updateLengthReadout();
void initStatus();
