import { Canvas, FabricImage, IText, PencilBrush } from "fabric";
import { thresholdToMask } from "./threshold.js";

export type Tool = "select" | "text" | "draw" | "erase";

export interface LabelMask {
  mask: Uint8Array;
  width: number;
  height: number;
}

/** What is currently selected, for context-sensitive UI. */
export type Selection =
  | { kind: "text"; fontFamily: string; fontSize: number }
  | { kind: "other" }
  | null;

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
  private readonly zoom: number;
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

  onRendered(callback: () => void): void {
    this.canvas.on("after:render", callback);
  }

  onSelectionChanged(callback: (selection: Selection) => void): void {
    const emit = (): void => {
      const active = this.canvas.getActiveObject();
      if (!active) {
        callback(null);
      } else if (active instanceof IText) {
        callback({ kind: "text", fontFamily: active.fontFamily, fontSize: active.fontSize });
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

  async addImage(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const image = await FabricImage.fromURL(url);
      const maxHeight = this.heightPx * 0.95;
      if (image.height > maxHeight) {
        image.scaleToHeight(maxHeight);
      }
      image.set({ left: 4, top: this.heightPx / 2, originY: "center" });
      this.canvas.add(image);
      this.canvas.setActiveObject(image);
    } finally {
      URL.revokeObjectURL(url);
    }
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
