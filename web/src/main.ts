import { ApiError, fetchFonts, fetchStatus, printPng, type PrinterStatus } from "./api.js";
import { defaultFilename, parseDesignFile, serializeDesignFile } from "./designfile.js";
import { LabelEditor, type Selection, type Tool } from "./editor.js";
import { fittedWidth } from "./fit.js";
import { loadFonts } from "./fonts.js";
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
const editorView = element<HTMLDivElement>("editor-view");
const previewView = element<HTMLDivElement>("preview-view");
const editTab = element<HTMLButtonElement>("view-edit");
const previewTab = element<HTMLButtonElement>("view-preview");
const printButton = element<HTMLButtonElement>("print-button");
const printResult = element<HTMLSpanElement>("print-result");

const mainColumn: HTMLElement = (() => {
  const el = document.querySelector("main");
  if (!(el instanceof HTMLElement)) throw new Error("missing <main>");
  return el;
})();

/**
 * Display zoom: aim for a comfortably tall canvas (~300px), but never wider
 * than the layout column, so a typical label fits on screen — especially on
 * phones, where fixed zoom used to mean heavy horizontal scrolling.
 */
function computeZoom(heightPx: number, widthPx: number): number {
  const heightZoom = Math.max(2, Math.min(6, Math.round(300 / heightPx)));
  const available = Math.max(200, mainColumn.clientWidth - 12);
  const widthZoom = available / widthPx;
  return Math.max(0.5, Math.min(heightZoom, widthZoom));
}

let editor: LabelEditor | undefined;
let printerAvailable = false;
let currentTool: Tool = "select";
let currentSelection: Selection = null;

// --- Context row: show only the active tool's settings -----------------

const ctxSelect = element<HTMLDivElement>("ctx-select");
const ctxText = element<HTMLDivElement>("ctx-text");
const ctxDraw = element<HTMLDivElement>("ctx-draw");
const fontFamilyInput = element<HTMLSelectElement>("font-family");
const fontSizeInput = element<HTMLInputElement>("font-size");

const styleButtons = {
  bold: element<HTMLButtonElement>("style-bold"),
  italic: element<HTMLButtonElement>("style-italic"),
  underline: element<HTMLButtonElement>("style-underline"),
} as const;

function showTextStyles(styles: { bold: boolean; italic: boolean; underline: boolean }): void {
  for (const key of ["bold", "italic", "underline"] as const) {
    styleButtons[key].classList.toggle("active", styles[key]);
  }
}

for (const key of ["bold", "italic", "underline"] as const) {
  styleButtons[key].addEventListener("click", () => {
    const styles = editor?.toggleTextStyle(key);
    if (styles) showTextStyles(styles);
  });
}

function updateContext(): void {
  const showText = currentTool === "text" || currentSelection?.kind === "text";
  const showDraw = currentTool === "draw" || currentTool === "erase";
  ctxText.hidden = !showText;
  ctxDraw.hidden = !showDraw;
  ctxSelect.hidden = showText || showDraw;
}

function selectionChanged(selection: Selection): void {
  currentSelection = selection;
  if (selection?.kind === "text") {
    fontFamilyInput.value = selection.fontFamily;
    fontSizeInput.value = String(selection.fontSize);
    showTextStyles(selection);
  } else {
    showTextStyles({ bold: false, italic: false, underline: false });
  }
  updateContext();
}

function currentLengthPx(): number {
  return mmToPx(Number.parseFloat(lengthInput.value) || 60);
}

function updateLengthReadout(): void {
  const px = currentLengthPx();
  lengthReadout.textContent = `${px}px — label will be ${formatMm(pxToMm(px))} long`;
}

function setView(view: "edit" | "preview"): void {
  editorView.hidden = view !== "edit";
  previewView.hidden = view !== "preview";
  editTab.classList.toggle("active", view === "edit");
  previewTab.classList.toggle("active", view === "preview");
  if (view === "preview") schedulePreview();
}

editTab.addEventListener("click", () => setView("edit"));
previewTab.addEventListener("click", () => setView("preview"));

function schedulePreview(): void {
  requestAnimationFrame(() => {
    if (!editor || previewView.hidden) return;
    const { mask, width, height } = editor.renderMask();
    previewCanvas.width = width;
    previewCanvas.height = height;
    const context = previewCanvas.getContext("2d");
    if (!context) return;
    const imageData = context.createImageData(width, height);
    maskToRgba(mask, imageData.data);
    context.putImageData(imageData, 0, 0);
    const zoom = editor.displayZoom;
    previewCanvas.style.width = `${width * zoom}px`;
    previewCanvas.style.height = `${height * zoom}px`;
  });
}

/** Re-fit the zoom after anything that changes label size or window width. */
function syncZoom(): void {
  if (!editor) return;
  const zoom = computeZoom(editor.labelHeightPx, editor.labelWidthPx);
  if (Math.abs(zoom - editor.displayZoom) > 0.01) {
    editor.setDisplayZoom(zoom);
    schedulePreview();
  }
}

// Observe the column rather than the window: it also catches the late
// layout settling after fonts/CSS load, when load-time measurements lied.
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(syncZoom, 100);
}).observe(mainColumn);

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
    zoom: computeZoom(heightPx, currentLengthPx()),
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
  newEditor.onSelectionChanged(selectionChanged);
  editor = newEditor;
  currentSelection = null;
  setActiveTool("select");
  syncZoom(); // re-measure: layout may have shifted since the zoom guess
  updateLengthReadout();
  schedulePreview();
}

// --- Printer status / tape selection -----------------------------------
//
// The printer powers itself off when idle (and may be off when the page
// loads), so status is polled and the UI follows it live in both directions.

let printing = false;

function showOfflineTapePicker(): void {
  tapePickerWrap.hidden = false;
  if (tapePicker.options.length === 0) {
    for (const tape of TAPE_SIZES) {
      const option = document.createElement("option");
      option.value = String(tape.widthMm);
      option.textContent = `${tape.widthMm} mm (${tape.printAreaPx}px)`;
      if (tape.widthMm === 12) option.selected = true;
      tapePicker.appendChild(option);
    }
  }
  tapeInfo.textContent = "no printer — pick the tape size manually";
  const selected = tapeByWidthMm(Number(tapePicker.value));
  setUpEditor(selected?.printAreaPx ?? 76);
}

function applyStatus(status: PrinterStatus): void {
  printerAvailable = true;
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
  if (!editor) {
    setUpEditor(status.printWidthPx);
  } else if (editor.labelHeightPx !== status.printWidthPx) {
    // Tape was swapped: resize the canvas but keep the design.
    editor.setLabelHeight(status.printWidthPx);
    syncZoom();
    schedulePreview();
  }
  if (!printing) printButton.disabled = false;
}

function markOffline(message: string): void {
  printerAvailable = false;
  if (!printing) printButton.disabled = true;
  statusChip.textContent = message;
  statusChip.className = "status status-error";
  // Keep an existing canvas (and its last-known tape size) untouched; only
  // fall back to the manual picker when no editor exists yet.
  if (!editor) showOfflineTapePicker();
}

async function checkStatus(): Promise<void> {
  try {
    applyStatus(await fetchStatus());
  } catch (error) {
    markOffline(
      error instanceof ApiError && error.status === 503 ? "printer off" : "server unreachable",
    );
  }
}

const STATUS_POLL_MS = 5000;
setInterval(() => {
  if (!document.hidden) void checkStatus();
}, STATUS_POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void checkStatus();
});

async function initFonts(): Promise<void> {
  const families = await loadFonts(await fetchFonts());
  const picker = element<HTMLSelectElement>("font-family");
  for (const family of families) {
    const option = document.createElement("option");
    option.value = family;
    option.textContent = family;
    option.style.fontFamily = family;
    picker.appendChild(option);
  }
  // Text objects created before the fonts finished loading re-render now.
  schedulePreview();
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
  setView("edit"); // picking a tool while previewing returns to editing
  currentTool = tool;
  editor?.setTool(tool);
  for (const [name, button] of Object.entries(toolButtons)) {
    button.classList.toggle("active", name === tool);
  }
  updateContext();
}

for (const [name, button] of Object.entries(toolButtons) as [Tool, HTMLButtonElement][]) {
  button.addEventListener("click", () => setActiveTool(name));
}

element<HTMLInputElement>("brush-width").addEventListener("input", (event) => {
  const width = Number((event.target as HTMLInputElement).value);
  editor?.setBrushWidth(width);
  element<HTMLSpanElement>("brush-readout").textContent = `${width}px`;
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

const TOOL_KEYS: Record<string, Tool> = { v: "select", t: "text", d: "draw", e: "erase" };

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
    return; // typing in a field (including fabric's text-editing textarea)
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    editor?.deleteSelection();
    return;
  }
  const tool = TOOL_KEYS[event.key.toLowerCase()];
  if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) {
    setActiveTool(tool);
  }
});

// --- Label length ------------------------------------------------------

lengthInput.addEventListener("change", () => {
  editor?.setLabelWidth(currentLengthPx());
  syncZoom();
  updateLengthReadout();
  schedulePreview();
});

element<HTMLButtonElement>("fit-length").addEventListener("click", () => {
  if (!editor) return;
  const { mask, width, height } = editor.renderMask();
  const fitted = fittedWidth(mask, width, height);
  if (fitted === null) return; // empty label; nothing to fit to
  editor.setLabelWidth(fitted);
  syncZoom();
  lengthInput.value = pxToMm(fitted).toFixed(1);
  updateLengthReadout();
  schedulePreview();
});

// --- Designs: download / open as files -----------------------------------

function setFooterStatus(message: string, kind: "" | "ok" | "error" = ""): void {
  printResult.textContent = message;
  printResult.className = kind;
}

element<HTMLButtonElement>("design-download").addEventListener("click", () => {
  if (!editor) return;
  const text = serializeDesignFile(editor.serializeDesign());
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = defaultFilename();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const designFileInput = element<HTMLInputElement>("design-file");
designFileInput.addEventListener("change", () => {
  void (async () => {
    const file = designFileInput.files?.[0];
    designFileInput.value = "";
    if (!file || !editor) return;
    try {
      const design = parseDesignFile(await file.text());
      if (editor.labelHeightPx !== design.heightPx) {
        editor.setLabelHeight(design.heightPx);
      }
      editor.setLabelWidth(design.widthPx);
      await editor.loadDesign(design.canvas);
      lengthInput.value = pxToMm(design.widthPx).toFixed(1);
      syncZoom();
      updateLengthReadout();
      schedulePreview();
      setFooterStatus(`opened "${file.name}"`, "ok");
    } catch (error) {
      setFooterStatus(error instanceof Error ? error.message : String(error), "error");
    }
  })();
});

// --- Print -------------------------------------------------------------

const copiesPopover = element<HTMLDivElement>("copies-popover");
const copiesToggle = element<HTMLButtonElement>("print-copies-toggle");
const copiesInput = element<HTMLInputElement>("copies-input");
const cutmarkCheckbox = element<HTMLInputElement>("cutmark-mode");

function currentCopies(): number {
  const n = Number.parseInt(copiesInput.value, 10);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1;
}

function currentMode(): "separate" | "cutmark" {
  return cutmarkCheckbox.checked ? "cutmark" : "separate";
}

function updatePrintLabel(): void {
  const copies = currentCopies();
  const strip = copies > 1 && currentMode() === "cutmark" ? " strip" : "";
  printButton.textContent = copies > 1 ? `🖨 Print ×${copies}${strip}` : "🖨 Print";
}

copiesToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  copiesPopover.hidden = !copiesPopover.hidden;
  if (!copiesPopover.hidden) copiesInput.select();
});

copiesInput.addEventListener("input", updatePrintLabel);
cutmarkCheckbox.addEventListener("change", updatePrintLabel);
copiesPopover.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => {
  copiesPopover.hidden = true;
});

printButton.addEventListener("click", () => {
  void (async () => {
    if (!editor || !printerAvailable || printing) return;
    const copies = currentCopies();
    const mode = currentMode();
    printing = true;
    printButton.disabled = true;
    copiesPopover.hidden = true;
    printResult.textContent = copies > 1 ? `printing ${copies} copies…` : "printing…";
    printResult.className = "";
    try {
      const { mask, width, height } = editor.renderMask();
      const png = await encodeMonoPng(mask, width, height);
      await printPng(png, copies, mode);
      printResult.textContent =
        copies > 1
          ? mode === "cutmark"
            ? `printed ${copies} on one strip — cut at the marks`
            : `printed ${copies} × (${formatMm(pxToMm(width))})`
          : `printed (${formatMm(pxToMm(width))})`;
      printResult.className = "ok";
    } catch (error) {
      printResult.textContent = error instanceof Error ? error.message : String(error);
      printResult.className = "error";
    } finally {
      printing = false;
      printButton.disabled = !printerAvailable;
    }
  })();
});

updateLengthReadout();
void Promise.all([checkStatus(), initFonts()]).then(() => {
  const demo = new URLSearchParams(location.search).get("demo");
  if (demo === null) return;
  editor?.loadDemo();
  if (demo === "preview") setView("preview");
});
