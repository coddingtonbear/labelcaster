import { Canvas, FabricImage, IText, Path, PencilBrush } from "fabric";
import { thresholdToMask } from "./threshold.js";

export type Tool = "select" | "text" | "draw" | "erase";

export interface LabelMask {
  mask: Uint8Array;
  width: number;
  height: number;
}

export interface TextStyles {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** What is currently selected, for context-sensitive UI. */
export type Selection =
  | ({ kind: "text"; fontFamily: string; fontSize: number } & TextStyles)
  | { kind: "other" }
  | null;

function stylesOf(text: IText): TextStyles {
  return {
    bold: text.fontWeight === "bold",
    italic: text.fontStyle === "italic",
    underline: text.underline === true,
  };
}

export interface EditorOptions {
  canvasElement: HTMLCanvasElement;
  /** Label size in true printer pixels. */
  widthPx: number;
  heightPx: number;
  /** Display magnification; object coordinates stay in printer pixels. */
  zoom: number;
  /** Called after the text tool places a new text object. */
  onTextPlaced?: () => void;
}

const DEFAULT_FONT = "system-ui";

export class LabelEditor {
  private readonly canvas: Canvas;
  private zoom: number;
  private widthPx: number;
  private heightPx: number;
  private tool: Tool = "select";
  private fontFamily = DEFAULT_FONT;
  private brushWidthPx = 4;

  constructor(options: EditorOptions) {
    this.zoom = options.zoom;
    this.widthPx = options.widthPx;
    this.heightPx = options.heightPx;
    this.canvas = new Canvas(options.canvasElement, {
      width: options.widthPx * options.zoom,
      height: options.heightPx * options.zoom,
      backgroundColor: "white",
      selection: true,
    });
    this.canvas.setZoom(options.zoom);

    this.canvas.on("mouse:down", (event) => {
      if (this.tool !== "text" || event.target) {
        return;
      }
      const point = this.canvas.getScenePoint(event.e);
      const text = new IText("Text", {
        left: point.x,
        top: point.y,
        originY: "center",
        fontFamily: this.fontFamily,
        fontSize: Math.max(12, Math.round(this.heightPx * 0.6)),
        fill: "black",
      });
      this.canvas.add(text);
      this.canvas.setActiveObject(text);
      text.enterEditing();
      text.selectAll();
      options.onTextPlaced?.();
    });
  }

  get labelWidthPx(): number {
    return this.widthPx;
  }

  get labelHeightPx(): number {
    return this.heightPx;
  }

  get displayZoom(): number {
    return this.zoom;
  }

  /** Change display magnification; object coordinates stay in printer px. */
  setDisplayZoom(zoom: number): void {
    this.zoom = zoom;
    this.canvas.setZoom(zoom);
    this.canvas.setDimensions({
      width: this.widthPx * zoom,
      height: this.heightPx * zoom,
    });
    this.canvas.requestRenderAll();
  }

  onRendered(callback: () => void): void {
    this.canvas.on("after:render", callback);
  }

  onSelectionChanged(callback: (selection: Selection) => void): void {
    const emit = (): void => {
      const active = this.canvas.getActiveObject();
      if (!active) {
        callback(null);
      } else if (active instanceof IText) {
        callback({
          kind: "text",
          fontFamily: active.fontFamily,
          fontSize: active.fontSize,
          ...stylesOf(active),
        });
      } else {
        callback({ kind: "other" });
      }
    };
    this.canvas.on("selection:created", emit);
    this.canvas.on("selection:updated", emit);
    this.canvas.on("selection:cleared", () => callback(null));
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool === "draw" || tool === "erase") {
      const brush = new PencilBrush(this.canvas);
      brush.color = tool === "draw" ? "black" : "white";
      brush.width = this.brushWidthPx;
      this.canvas.freeDrawingBrush = brush;
      this.canvas.isDrawingMode = true;
    } else {
      this.canvas.isDrawingMode = false;
    }
    this.canvas.defaultCursor = tool === "text" ? "text" : "default";
  }

  setBrushWidth(px: number): void {
    this.brushWidthPx = px;
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.width = px;
    }
  }

  setFontFamily(family: string): void {
    this.fontFamily = family;
    const active = this.canvas.getActiveObject();
    if (active instanceof IText) {
      active.set("fontFamily", family);
      this.canvas.requestRenderAll();
    }
  }

  setFontSize(px: number): void {
    const active = this.canvas.getActiveObject();
    if (active instanceof IText) {
      active.set("fontSize", px);
      this.canvas.requestRenderAll();
    }
  }

  /**
   * Toggle a style on the selected text; returns the new styles, or null when
   * no text is selected. Bold uses the real face for variable fonts (loaded
   * with a full weight range) and browser synthesis otherwise; italic is
   * always synthesized — no italic faces are bundled.
   */
  toggleTextStyle(style: keyof TextStyles): TextStyles | null {
    const active = this.canvas.getActiveObject();
    if (!(active instanceof IText)) return null;
    // Clear any per-character styling so the object-level toggle wins.
    active.styles = {};
    if (style === "bold") {
      active.set("fontWeight", active.fontWeight === "bold" ? "normal" : "bold");
    } else if (style === "italic") {
      active.set("fontStyle", active.fontStyle === "italic" ? "normal" : "italic");
    } else {
      active.set("underline", active.underline !== true);
    }
    active.initDimensions();
    this.canvas.requestRenderAll();
    return stylesOf(active);
  }

  async addImage(file: File): Promise<void> {
    // A data URL (not an object URL) so the image survives design
    // serialization: fabric stores the src in toJSON().
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("could not read image file"));
      reader.readAsDataURL(file);
    });
    const image = await FabricImage.fromURL(dataUrl);
    const maxHeight = this.heightPx * 0.95;
    if (image.height > maxHeight) {
      image.scaleToHeight(maxHeight);
    }
    image.set({ left: 4, top: this.heightPx / 2, originY: "center" });
    this.canvas.add(image);
    this.canvas.setActiveObject(image);
  }

  /** Everything needed to reproduce the design: sizes + fabric canvas JSON. */
  serializeDesign(): { widthPx: number; heightPx: number; canvas: unknown } {
    return {
      widthPx: this.widthPx,
      heightPx: this.heightPx,
      canvas: this.canvas.toJSON() as unknown,
    };
  }

  /** Replace the canvas contents with a previously serialized design. */
  async loadDesign(canvasJson: unknown): Promise<void> {
    await this.canvas.loadFromJSON(canvasJson as Record<string, unknown>);
    this.canvas.backgroundColor = "white";
    this.canvas.setZoom(this.zoom); // loadFromJSON resets the viewport
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /** Populate sample content (?demo) — for screenshots and printerless demos. */
  loadDemo(): void {
    const h = this.heightPx;
    const text = new IText("Hello, labelcaster!", {
      left: 10,
      top: h / 2,
      originY: "center",
      fontFamily: "Oswald",
      fontSize: Math.max(12, Math.round(h * 0.6)),
      fill: "black",
    });
    this.canvas.add(text);
    const heart = new Path(
      "M12 21s-8-4.5-8-11a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6.5-8 11-8 11z",
      { fill: "black", originY: "center" },
    );
    heart.scaleToHeight(h * 0.55);
    heart.set({ left: 10 + (text.width ?? 0) + h * 0.25, top: h / 2 });
    this.canvas.add(heart);
    this.canvas.requestRenderAll();
  }

  deleteSelection(): void {
    const active = this.canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) {
      return; // don't delete the object while typing in it
    }
    for (const object of this.canvas.getActiveObjects()) {
      this.canvas.remove(object);
    }
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  clear(): void {
    this.canvas.remove(...this.canvas.getObjects());
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  /** Resize for a different tape without discarding the label's objects. */
  setLabelHeight(heightPx: number): void {
    this.heightPx = heightPx;
    this.canvas.setDimensions({
      width: this.widthPx * this.zoom,
      height: heightPx * this.zoom,
    });
    this.canvas.requestRenderAll();
  }

  setLabelWidth(widthPx: number): void {
    this.widthPx = widthPx;
    this.canvas.setDimensions({
      width: widthPx * this.zoom,
      height: this.heightPx * this.zoom,
    });
    this.canvas.requestRenderAll();
  }

  /** Render at true printer resolution and threshold to a 1-bit mask. */
  renderMask(): LabelMask {
    const element = this.canvas.toCanvasElement(1 / this.zoom);
    const context = element.getContext("2d");
    if (!context) {
      throw new Error("could not get 2d context for export");
    }
    const imageData = context.getImageData(0, 0, element.width, element.height);
    return {
      mask: thresholdToMask(imageData),
      width: element.width,
      height: element.height,
    };
  }

  dispose(): Promise<boolean> {
    return this.canvas.dispose();
  }
}
