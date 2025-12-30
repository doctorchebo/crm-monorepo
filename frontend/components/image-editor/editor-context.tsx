/**
 * Image Editor Context
 * Provides centralized state management for the image editor
 * Handles history/undo functionality and all editor operations
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { pixelate, stackBlur } from "./blur-utils";
import {
  blurToPixels,
  drawPathToPixels,
  emojiToPixels,
  shapeToPixels,
  textToPixels,
} from "./coordinate-utils";
import {
  BlurArea,
  createInitialEditorState,
  DrawPath,
  EditorContextValue,
  EditorState,
  EditorTool,
  EmojiElement,
  extractContentState,
  HistoryEntry,
  IMAGE_FILTERS,
  ImageFilter,
  mergeContentWithUIState,
  Shape,
  TextElement,
} from "./types";

const MAX_HISTORY_SIZE = 50;

const EditorContext = createContext<EditorContextValue | null>(null);

// ============================================================================
// Image Rendering Helper
// ============================================================================

/**
 * Unified element type for z-index sorting.
 * All renderable elements (except drawings which have no z-index) are sorted
 * and rendered in order, ensuring blur affects all elements beneath it.
 */
type RenderableElement =
  | { type: "drawing"; data: DrawPath }
  | { type: "shape"; data: Shape; zIndex: number }
  | { type: "blur"; data: BlurArea; zIndex: number }
  | { type: "text"; data: TextElement; zIndex: number }
  | { type: "emoji"; data: EmojiElement; zIndex: number };

// ============================================================================
// Element Rendering Functions
// These are the single source of truth for rendering each element type.
// Used by both preview canvas and export.
// ============================================================================

/**
 * Renders all drawing paths to the canvas.
 * Drawings have no z-index and are always rendered at the bottom layer.
 */
function renderDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: DrawPath[],
  fullWidth: number,
  fullHeight: number
): void {
  drawings.forEach((path) => {
    if (path.points.length < 2) return;

    const pixelPath = drawPathToPixels(path, fullWidth, fullHeight);

    ctx.beginPath();
    ctx.strokeStyle = pixelPath.color;
    ctx.lineWidth = pixelPath.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(pixelPath.points[0].x, pixelPath.points[0].y);
    for (let i = 1; i < pixelPath.points.length; i++) {
      ctx.lineTo(pixelPath.points[i].x, pixelPath.points[i].y);
    }
    ctx.stroke();
  });
}

/**
 * Calculates the center point of a shape for rotation
 */
function getShapeCenter(shape: Shape): { x: number; y: number } {
  switch (shape.type) {
    case "rectangle":
      return {
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
      };
    case "circle":
      return {
        x: shape.x + shape.radiusX,
        y: shape.y + shape.radiusY,
      };
    case "line":
    case "arrow":
      return {
        x: (shape.x + shape.endX) / 2,
        y: (shape.y + shape.endY) / 2,
      };
  }
}

/**
 * Renders a single shape to the canvas.
 */
function renderShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  fullWidth: number,
  fullHeight: number
): void {
  const pixelShape = shapeToPixels(shape, fullWidth, fullHeight);
  const rotation = pixelShape.rotation || 0;

  ctx.save();
  ctx.strokeStyle = pixelShape.color;
  ctx.lineWidth = pixelShape.strokeWidth;
  ctx.fillStyle = "transparent";

  // Apply rotation if needed
  if (rotation !== 0) {
    const center = getShapeCenter(pixelShape);
    ctx.translate(center.x, center.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center.x, -center.y);
  }

  switch (pixelShape.type) {
    case "rectangle": {
      ctx.strokeRect(
        pixelShape.x,
        pixelShape.y,
        pixelShape.width,
        pixelShape.height
      );
      break;
    }
    case "circle": {
      ctx.beginPath();
      ctx.ellipse(
        pixelShape.x + pixelShape.radiusX,
        pixelShape.y + pixelShape.radiusY,
        pixelShape.radiusX,
        pixelShape.radiusY,
        0,
        0,
        2 * Math.PI
      );
      ctx.stroke();
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(pixelShape.x, pixelShape.y);
      ctx.lineTo(pixelShape.endX, pixelShape.endY);
      ctx.stroke();
      break;
    case "arrow": {
      // Draw line
      ctx.beginPath();
      ctx.moveTo(pixelShape.x, pixelShape.y);
      ctx.lineTo(pixelShape.endX, pixelShape.endY);
      ctx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(
        pixelShape.endY - pixelShape.y,
        pixelShape.endX - pixelShape.x
      );
      const headLength = 15 * (fullHeight / 400); // Scale arrowhead proportionally
      ctx.beginPath();
      ctx.moveTo(pixelShape.endX, pixelShape.endY);
      ctx.lineTo(
        pixelShape.endX - headLength * Math.cos(angle - Math.PI / 6),
        pixelShape.endY - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(pixelShape.endX, pixelShape.endY);
      ctx.lineTo(
        pixelShape.endX - headLength * Math.cos(angle + Math.PI / 6),
        pixelShape.endY - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * Applies blur effect to the canvas in the specified region.
 * CRITICAL: This blurs everything currently rendered on the canvas,
 * which is why z-index ordering matters.
 */
function renderBlur(
  ctx: CanvasRenderingContext2D,
  blur: BlurArea,
  fullWidth: number,
  fullHeight: number,
  canvas: HTMLCanvasElement
): void {
  const pixelBlur = blurToPixels(blur, fullWidth, fullHeight);
  const rotation = blur.rotation || 0;

  const scaledX = Math.round(pixelBlur.x);
  const scaledY = Math.round(pixelBlur.y);
  const scaledWidth = Math.round(pixelBlur.width);
  const scaledHeight = Math.round(pixelBlur.height);

  if (scaledWidth <= 0 || scaledHeight <= 0) return;

  // Center of the blur rectangle
  const centerX = scaledX + scaledWidth / 2;
  const centerY = scaledY + scaledHeight / 2;

  // For rotated blur, we need to:
  // 1. Create a temp canvas large enough to capture the rotated area
  // 2. Copy the relevant area with inverse rotation
  // 3. Apply blur
  // 4. Draw it back with rotation

  if (rotation === 0) {
    // Non-rotated blur - use the simple approach
    const safeX = Math.max(0, Math.min(scaledX, canvas.width - 1));
    const safeY = Math.max(0, Math.min(scaledY, canvas.height - 1));
    const safeWidth = Math.min(scaledWidth, canvas.width - safeX);
    const safeHeight = Math.min(scaledHeight, canvas.height - safeY);

    if (safeWidth <= 0 || safeHeight <= 0) return;

    const imageData = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);

    const resolutionScale = Math.max(1, fullHeight / 400);

    if (blur.mode === "pixelate") {
      const pixelSize = Math.max(
        2,
        Math.floor((blur.intensity / 5) * resolutionScale)
      );
      pixelate(imageData, safeWidth, safeHeight, pixelSize);
    } else {
      const radius = Math.min(
        254,
        Math.max(1, Math.floor((blur.intensity / 10 + 1) * resolutionScale))
      );
      stackBlur(imageData, safeWidth, safeHeight, radius);
    }

    ctx.putImageData(imageData, safeX, safeY);
  } else {
    // Rotated blur - need a more complex approach
    const angleRad = (rotation * Math.PI) / 180;

    // Calculate bounding box for the rotated rectangle
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    const boundingWidth = Math.ceil(scaledWidth * cos + scaledHeight * sin);
    const boundingHeight = Math.ceil(scaledWidth * sin + scaledHeight * cos);

    // Capture area bounds (centered at rotation center)
    const captureX = Math.max(0, Math.floor(centerX - boundingWidth / 2));
    const captureY = Math.max(0, Math.floor(centerY - boundingHeight / 2));
    const captureWidth = Math.min(boundingWidth, canvas.width - captureX);
    const captureHeight = Math.min(boundingHeight, canvas.height - captureY);

    if (captureWidth <= 0 || captureHeight <= 0) return;

    // Create temp canvas for the unrotated blur area
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = scaledWidth;
    tempCanvas.height = scaledHeight;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;

    // Draw the area to temp canvas with inverse rotation to get unrotated content
    tempCtx.save();
    tempCtx.translate(scaledWidth / 2, scaledHeight / 2);
    tempCtx.rotate(-angleRad);
    tempCtx.drawImage(
      canvas,
      captureX,
      captureY,
      captureWidth,
      captureHeight,
      -captureWidth / 2,
      -captureHeight / 2,
      captureWidth,
      captureHeight
    );
    tempCtx.restore();

    // Get image data and apply blur
    const imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
    const resolutionScale = Math.max(1, fullHeight / 400);

    if (blur.mode === "pixelate") {
      const pixelSize = Math.max(
        2,
        Math.floor((blur.intensity / 5) * resolutionScale)
      );
      pixelate(imageData, scaledWidth, scaledHeight, pixelSize);
    } else {
      const radius = Math.min(
        254,
        Math.max(1, Math.floor((blur.intensity / 10 + 1) * resolutionScale))
      );
      stackBlur(imageData, scaledWidth, scaledHeight, radius);
    }

    tempCtx.putImageData(imageData, 0, 0);

    // Draw the blurred content back with rotation
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angleRad);
    ctx.drawImage(tempCanvas, -scaledWidth / 2, -scaledHeight / 2);
    ctx.restore();
  }
}

/**
 * Renders a single text element to the canvas.
 */
function renderText(
  ctx: CanvasRenderingContext2D,
  text: TextElement,
  fullWidth: number,
  fullHeight: number
): void {
  const pixelText = textToPixels(text, fullWidth, fullHeight);

  ctx.save();
  ctx.translate(
    pixelText.x + pixelText.width / 2,
    pixelText.y + pixelText.height / 2
  );
  ctx.rotate((pixelText.rotation * Math.PI) / 180);

  const fontStyle = `${pixelText.isItalic ? "italic " : ""}${
    pixelText.isBold ? "bold " : ""
  }${pixelText.fontSize}px ${pixelText.fontFamily}`;
  ctx.font = fontStyle;
  ctx.fillStyle = pixelText.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw background if showBackground is enabled
  if (pixelText.showBackground) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    const bgX = -pixelText.width / 2;
    const bgY = -pixelText.height / 2;
    const bgWidth = pixelText.width;
    const bgHeight = pixelText.height;
    const radius = Math.min(16, bgHeight / 3);

    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(
      bgX + bgWidth,
      bgY + bgHeight,
      bgX + bgWidth - radius,
      bgY + bgHeight
    );
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pixelText.color;
  }

  ctx.fillText(pixelText.text, 0, 0);
  ctx.restore();
}

/**
 * Renders a single emoji element to the canvas.
 */
function renderEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: EmojiElement,
  fullWidth: number,
  fullHeight: number
): void {
  const pixelEmoji = emojiToPixels(emoji, fullWidth, fullHeight);

  ctx.save();
  ctx.translate(
    pixelEmoji.x + pixelEmoji.size / 2,
    pixelEmoji.y + pixelEmoji.size / 2
  );
  ctx.rotate((pixelEmoji.rotation * Math.PI) / 180);
  ctx.font = `${pixelEmoji.size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pixelEmoji.emoji, 0, 0);
  ctx.restore();
}

// ============================================================================
// Render Options
// ============================================================================

interface RenderOptions {
  /** The source image element */
  image: HTMLImageElement;
  /** The editor state containing all edit data */
  state: EditorState;
  /** Whether to apply the crop (false = render full image with elements) */
  applyCrop: boolean;
}

/**
 * Renders the image with all edits to a canvas.
 * This is the single source of truth for image rendering, used by both
 * applyCrop (to bake edits into the image) and exportImage (to export final result).
 *
 * CRITICAL: Elements are rendered in z-index order so that blur effects
 * properly affect all elements beneath them. Drawings have no z-index and
 * are rendered first (bottom layer).
 *
 * Rendering order:
 * 1. Base image with rotation/flip + filter
 * 2. All drawings (no z-index, always bottom layer)
 * 3. All other elements (shapes, blurs, texts, emojis) sorted by z-index
 *    - When a blur is encountered, it blurs everything rendered so far
 * 4. Crop (optional, applied last)
 */
function renderImageToCanvas(options: RenderOptions): HTMLCanvasElement {
  const { image, state, applyCrop: shouldCrop } = options;

  // Create canvas at full image resolution
  const canvas = document.createElement("canvas");

  // Handle rotation - swap dimensions for 90/270 degree rotations
  const isRotated90or270 =
    state.cropRotate.rotation === 90 || state.cropRotate.rotation === 270;
  canvas.width = isRotated90or270 ? image.height : image.width;
  canvas.height = isRotated90or270 ? image.width : image.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  // Full resolution dimensions for converting normalized coordinates
  const fullWidth = canvas.width;
  const fullHeight = canvas.height;

  // Apply filter
  const filterConfig = IMAGE_FILTERS.find((f) => f.id === state.filter);
  if (filterConfig && filterConfig.cssFilter !== "none") {
    ctx.filter = filterConfig.cssFilter;
  }

  // Handle rotation and flip transformations
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((state.cropRotate.rotation * Math.PI) / 180);

  if (state.cropRotate.flipHorizontal) {
    ctx.scale(-1, 1);
  }
  if (state.cropRotate.flipVertical) {
    ctx.scale(1, -1);
  }

  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();

  // Reset filter for overlay elements
  ctx.filter = "none";

  // ============================================================================
  // STEP 1: Render all drawings first (no z-index, always bottom layer)
  // ============================================================================
  renderDrawings(ctx, state.drawings, fullWidth, fullHeight);

  // ============================================================================
  // STEP 2: Collect and sort all z-indexed elements
  // ============================================================================
  const sortedElements: RenderableElement[] = [
    ...state.shapes.map((s) => ({
      type: "shape" as const,
      data: s,
      zIndex: s.zIndex ?? 0,
    })),
    ...state.blurs.map((b) => ({
      type: "blur" as const,
      data: b,
      zIndex: b.zIndex ?? 0,
    })),
    ...state.texts.map((t) => ({
      type: "text" as const,
      data: t,
      zIndex: t.zIndex ?? 0,
    })),
    ...state.emojis.map((e) => ({
      type: "emoji" as const,
      data: e,
      zIndex: e.zIndex ?? 0,
    })),
  ].sort((a, b) => a.zIndex - b.zIndex);

  // ============================================================================
  // STEP 3: Render elements in z-index order
  // When blur is encountered, it blurs everything rendered so far
  // ============================================================================
  sortedElements.forEach((element) => {
    switch (element.type) {
      case "shape":
        renderShape(ctx, element.data, fullWidth, fullHeight);
        break;
      case "blur":
        renderBlur(ctx, element.data, fullWidth, fullHeight, canvas);
        break;
      case "text":
        renderText(ctx, element.data, fullWidth, fullHeight);
        break;
      case "emoji":
        renderEmoji(ctx, element.data, fullWidth, fullHeight);
        break;
    }
  });

  // Apply crop if requested
  if (shouldCrop && state.cropRotate.crop && state.canvasDimensions.width > 0) {
    const crop = state.cropRotate.crop;
    const displayWidth = state.canvasDimensions.width;
    const displayHeight = state.canvasDimensions.height;

    // Scale crop coordinates from display to full resolution
    const cropScaleX = fullWidth / displayWidth;
    const cropScaleY = fullHeight / displayHeight;

    const scaledCrop = {
      x: Math.round(crop.x * cropScaleX),
      y: Math.round(crop.y * cropScaleY),
      width: Math.round(crop.width * cropScaleX),
      height: Math.round(crop.height * cropScaleY),
    };

    // Create a new canvas for the cropped image
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = scaledCrop.width;
    croppedCanvas.height = scaledCrop.height;
    const croppedCtx = croppedCanvas.getContext("2d");

    if (croppedCtx) {
      croppedCtx.drawImage(
        canvas,
        scaledCrop.x,
        scaledCrop.y,
        scaledCrop.width,
        scaledCrop.height,
        0,
        0,
        scaledCrop.width,
        scaledCrop.height
      );
      return croppedCanvas;
    }
  }

  return canvas;
}

interface EditorProviderProps {
  children: React.ReactNode;
  initialImage: string;
}

export function EditorProvider({
  children,
  initialImage,
}: EditorProviderProps) {
  // Core state
  const [state, setState] = useState<EditorState>(() =>
    createInitialEditorState(initialImage)
  );

  // History management - stores ContentState only (excludes UI state)
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const initialState = createInitialEditorState(initialImage);
    return [
      { state: extractContentState(initialState), timestamp: Date.now() },
    ];
  });
  const [historyIndex, setHistoryIndex] = useState(0);

  // Refs to hold current values for callbacks (avoids stale closures)
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const stateRef = useRef(state);

  // Keep refs in sync with state - SYNCHRONOUSLY update stateRef before effects
  // This is critical to avoid race conditions when multiple state updates happen
  const setStateAndRef = useCallback(
    (newState: EditorState | ((prev: EditorState) => EditorState)) => {
      setState((prev) => {
        const nextState =
          typeof newState === "function" ? newState(prev) : newState;
        // Synchronously update ref so subsequent reads get the latest state
        stateRef.current = nextState;
        return nextState;
      });
    },
    []
  );

  // Keep other refs in sync with state via effects (less critical)
  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  React.useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Refs for canvas export
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load image on initial mount
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
    };
    img.src = initialImage;
  }, [initialImage]);

  // CRITICAL: Sync imageRef when state.originalImage changes (e.g., after undo/redo or crop)
  // This ensures the canvas always renders the correct image
  React.useEffect(() => {
    // Skip if the current imageRef already matches the state's originalImage
    if (imageRef.current?.src === state.originalImage) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Force a re-render to update the canvas
      setState((prev) => ({ ...prev }));
    };
    img.src = state.originalImage;
  }, [state.originalImage]);

  // Computed values
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Create history entry - stores only content state (excludes UI state like activeTool)
  const createHistoryEntry = useCallback((newState: EditorState) => {
    // Use ref to get current historyIndex to avoid stale closures
    const currentHistoryIndex = historyIndexRef.current;
    // Extract only content state for history storage
    const contentState = extractContentState(newState);

    setHistory((prev) => {
      // Remove any redo history
      const newHistory = prev.slice(0, currentHistoryIndex + 1);
      // Add new entry with content state only
      newHistory.push({ state: contentState, timestamp: Date.now() });
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, []);

  // Helper: Update state with history (properly sequenced)
  // Uses stateRef.current which is now kept in sync synchronously via setStateAndRef
  const updateStateWithHistory = useCallback(
    (getNewState: (prev: EditorState) => EditorState) => {
      // Read the latest state from ref (synchronously updated by setStateAndRef)
      const prev = stateRef.current;
      const newState = getNewState(prev);
      createHistoryEntry(newState);
      // Use setStateAndRef to ensure ref stays in sync
      setStateAndRef(newState);
    },
    [createHistoryEntry, setStateAndRef]
  );

  // Public API: Update state with history (for partial state updates)
  const updateState = useCallback(
    (updates: Partial<EditorState>) => {
      updateStateWithHistory((prev) => ({ ...prev, ...updates }));
    },
    [updateStateWithHistory]
  );

  // Helper: Update state without history (for transient updates like dragging)
  const updateStateNoHistory = useCallback(
    (updates: Partial<EditorState>) => {
      setStateAndRef((prev) => ({ ...prev, ...updates }));
    },
    [setStateAndRef]
  );

  // Helper with functional update pattern for NoHistory operations
  const updateStateNoHistoryFn = useCallback(
    (getNewState: (prev: EditorState) => EditorState) => {
      setStateAndRef((prev) => getNewState(prev));
    },
    [setStateAndRef]
  );

  // Commit current state to history (for after drag operations)
  const commitToHistory = useCallback(() => {
    createHistoryEntry(stateRef.current);
  }, [createHistoryEntry]);

  // Update canvas dimensions - just update the dimensions, don't scale elements
  // Elements are stored in display coordinates and scaled during export
  const updateCanvasDimensions = useCallback(
    (newDimensions: { width: number; height: number }) => {
      setStateAndRef((prev) => {
        // Only update if dimensions actually changed
        if (
          prev.canvasDimensions.width === newDimensions.width &&
          prev.canvasDimensions.height === newDimensions.height
        ) {
          return prev;
        }
        return { ...prev, canvasDimensions: newDimensions };
      });
    },
    [setStateAndRef]
  );

  // Undo - merges restored content state with current UI state
  const undo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex <= 0) return;

    const newIndex = currentIndex - 1;
    const currentHistory = historyRef.current;
    const historyEntry = currentHistory[newIndex];

    if (historyEntry) {
      // Batch the updates together
      setHistoryIndex(newIndex);
      // Merge content state from history with current UI state
      setStateAndRef((currentState) =>
        mergeContentWithUIState(historyEntry.state, currentState)
      );
    }
  }, [setStateAndRef]);

  // Redo - merges restored content state with current UI state
  const redo = useCallback(() => {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;

    if (currentIndex >= currentHistory.length - 1) return;

    const newIndex = currentIndex + 1;
    const historyEntry = currentHistory[newIndex];

    if (historyEntry) {
      // Batch the updates together
      setHistoryIndex(newIndex);
      // Merge content state from history with current UI state
      setStateAndRef((currentState) =>
        mergeContentWithUIState(historyEntry.state, currentState)
      );
    }
  }, [setStateAndRef]);

  // Reset to original
  const reset = useCallback(() => {
    const initialState = createInitialEditorState(initialImage);
    setStateAndRef(initialState);
    setHistory([
      { state: extractContentState(initialState), timestamp: Date.now() },
    ]);
    setHistoryIndex(0);
  }, [initialImage, setStateAndRef]);

  // Set active tool
  // Preserve selection when the tool matches the selected element type
  const setActiveTool = useCallback(
    (tool: EditorTool) => {
      setStateAndRef((prev) => {
        // Determine if we should preserve the current selection
        const shouldPreserveSelection = (() => {
          if (!prev.selectedElementId) return false;

          // Preserve selection if activating text tool and a text is selected
          if (
            tool === "text" &&
            prev.texts.some((t) => t.id === prev.selectedElementId)
          ) {
            return true;
          }
          // Preserve selection if activating shapes tool and a shape is selected
          if (
            tool === "shapes" &&
            prev.shapes.some((s) => s.id === prev.selectedElementId)
          ) {
            return true;
          }
          // Preserve selection if activating blur tool and a blur is selected
          if (
            tool === "blur" &&
            prev.blurs.some((b) => b.id === prev.selectedElementId)
          ) {
            return true;
          }
          // Preserve selection if activating emoji tool and an emoji is selected
          if (
            tool === "emoji" &&
            prev.emojis.some((e) => e.id === prev.selectedElementId)
          ) {
            return true;
          }
          return false;
        })();

        return {
          ...prev,
          activeTool: tool,
          selectedElementId: shouldPreserveSelection
            ? prev.selectedElementId
            : null,
        };
      });
    },
    [setStateAndRef]
  );

  // Set filter
  const setFilter = useCallback(
    (filter: ImageFilter) => {
      updateStateWithHistory((prev) => ({ ...prev, filter }));
    },
    [updateStateWithHistory]
  );

  // Add drawing path
  const addDrawPath = useCallback(
    (path: DrawPath) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        drawings: [...prev.drawings, path],
      }));
    },
    [updateStateWithHistory]
  );

  // Text operations
  const addText = useCallback(
    (text: TextElement) => {
      updateStateWithHistory((prev) => {
        const zIndex = prev.zIndexCounter;
        return {
          ...prev,
          texts: [...prev.texts, { ...text, zIndex }],
          selectedElementId: text.id,
          zIndexCounter: zIndex + 1,
        };
      });
    },
    [updateStateWithHistory]
  );

  const updateText = useCallback(
    (id: string, updates: Partial<TextElement>) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    },
    [updateStateWithHistory]
  );

  // Update text without creating history entry (for dragging)
  const updateTextNoHistory = useCallback(
    (id: string, updates: Partial<TextElement>) => {
      updateStateNoHistoryFn((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    },
    [updateStateNoHistoryFn]
  );

  const removeText = useCallback(
    (id: string) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        texts: prev.texts.filter((t) => t.id !== id),
        selectedElementId:
          prev.selectedElementId === id ? null : prev.selectedElementId,
      }));
    },
    [updateStateWithHistory]
  );

  // Shape operations
  const addShape = useCallback(
    (shape: Shape) => {
      updateStateWithHistory((prev) => {
        const zIndex = prev.zIndexCounter;
        return {
          ...prev,
          shapes: [...prev.shapes, { ...shape, zIndex }],
          selectedElementId: shape.id,
          zIndexCounter: zIndex + 1,
        };
      });
    },
    [updateStateWithHistory]
  );

  const updateShape = useCallback(
    (id: string, updates: Partial<Shape>) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) =>
          s.id === id ? ({ ...s, ...updates } as Shape) : s
        ),
      }));
    },
    [updateStateWithHistory]
  );

  // Update shape without creating history entry (for dragging)
  const updateShapeNoHistory = useCallback(
    (id: string, updates: Partial<Shape>) => {
      updateStateNoHistoryFn((prev) => ({
        ...prev,
        shapes: prev.shapes.map((s) =>
          s.id === id ? ({ ...s, ...updates } as Shape) : s
        ),
      }));
    },
    [updateStateNoHistoryFn]
  );

  const removeShape = useCallback(
    (id: string) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        shapes: prev.shapes.filter((s) => s.id !== id),
        selectedElementId:
          prev.selectedElementId === id ? null : prev.selectedElementId,
      }));
    },
    [updateStateWithHistory]
  );

  // Blur operations
  const addBlur = useCallback(
    (blur: BlurArea) => {
      updateStateWithHistory((prev) => {
        const zIndex = prev.zIndexCounter;
        return {
          ...prev,
          blurs: [...prev.blurs, { ...blur, zIndex }],
          selectedElementId: blur.id,
          zIndexCounter: zIndex + 1,
        };
      });
    },
    [updateStateWithHistory]
  );

  const updateBlur = useCallback(
    (id: string, updates: Partial<BlurArea>) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        blurs: prev.blurs.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }));
    },
    [updateStateWithHistory]
  );

  // Update blur without creating history entry (for dragging)
  const updateBlurNoHistory = useCallback(
    (id: string, updates: Partial<BlurArea>) => {
      updateStateNoHistoryFn((prev) => ({
        ...prev,
        blurs: prev.blurs.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }));
    },
    [updateStateNoHistoryFn]
  );

  const removeBlur = useCallback(
    (id: string) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        blurs: prev.blurs.filter((b) => b.id !== id),
        selectedElementId:
          prev.selectedElementId === id ? null : prev.selectedElementId,
      }));
    },
    [updateStateWithHistory]
  );

  // Emoji operations
  const addEmoji = useCallback(
    (emoji: EmojiElement) => {
      updateStateWithHistory((prev) => {
        const zIndex = prev.zIndexCounter;
        return {
          ...prev,
          emojis: [...prev.emojis, { ...emoji, zIndex }],
          selectedElementId: emoji.id,
          zIndexCounter: zIndex + 1,
        };
      });
    },
    [updateStateWithHistory]
  );

  const updateEmoji = useCallback(
    (id: string, updates: Partial<EmojiElement>) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        emojis: prev.emojis.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      }));
    },
    [updateStateWithHistory]
  );

  // Update emoji without creating history entry (for dragging)
  const updateEmojiNoHistory = useCallback(
    (id: string, updates: Partial<EmojiElement>) => {
      updateStateNoHistoryFn((prev) => ({
        ...prev,
        emojis: prev.emojis.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      }));
    },
    [updateStateNoHistoryFn]
  );

  const removeEmoji = useCallback(
    (id: string) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        emojis: prev.emojis.filter((e) => e.id !== id),
        selectedElementId:
          prev.selectedElementId === id ? null : prev.selectedElementId,
      }));
    },
    [updateStateWithHistory]
  );

  // Rotate image
  const rotateImage = useCallback(
    (direction: "left" | "right") => {
      updateStateWithHistory((prev) => {
        const delta = direction === "left" ? -90 : 90;
        const newRotation = (prev.cropRotate.rotation + delta + 360) % 360;
        return {
          ...prev,
          cropRotate: {
            ...prev.cropRotate,
            rotation: newRotation,
          },
        };
      });
    },
    [updateStateWithHistory]
  );

  // Set crop area (with history - for user actions)
  const setCrop = useCallback(
    (crop: { x: number; y: number; width: number; height: number } | null) => {
      updateStateWithHistory((prev) => ({
        ...prev,
        cropRotate: {
          ...prev.cropRotate,
          crop,
        },
      }));
    },
    [updateStateWithHistory]
  );

  // Set crop area without history (for initial setup / aspect ratio changes)
  const setCropNoHistory = useCallback(
    (crop: { x: number; y: number; width: number; height: number } | null) => {
      setStateAndRef((prev) => ({
        ...prev,
        cropRotate: {
          ...prev.cropRotate,
          crop,
        },
      }));
    },
    [setStateAndRef]
  );

  // Reset crop/rotate
  const resetCropRotate = useCallback(() => {
    updateStateWithHistory((prev) => ({
      ...prev,
      cropRotate: {
        rotation: 0,
        crop: null,
        flipHorizontal: false,
        flipVertical: false,
      },
    }));
  }, [updateStateWithHistory]);

  // Set selected element
  const setSelectedElement = useCallback(
    (id: string | null) => {
      setStateAndRef((prev) => ({
        ...prev,
        selectedElementId: id,
      }));
    },
    [setStateAndRef]
  );

  // Apply crop and bake all edits into the original image
  // This renders all elements (drawings, shapes, blurs, texts, emojis) onto the image,
  // applies the crop, and resets all element arrays for a clean slate.
  const applyCrop = useCallback(async (): Promise<void> => {
    const crop = state.cropRotate.crop;
    if (!crop || state.canvasDimensions.width === 0) return;

    const img = imageRef.current;
    if (!img) return;

    // Render the image with ALL edits (including elements) and apply crop
    const canvas = renderImageToCanvas({
      image: img,
      state: state,
      applyCrop: true,
    });

    // Convert to data URL
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Load the new image into the ref
    const newImg = new Image();
    await new Promise<void>((resolve) => {
      newImg.onload = () => {
        imageRef.current = newImg;
        resolve();
      };
      newImg.src = dataUrl;
    });

    // Update state: new cropped image, reset all transformations and elements
    // since they've been baked into the image
    const newState: EditorState = {
      ...stateRef.current,
      originalImage: dataUrl,
      // Reset crop/rotate since they're baked in
      cropRotate: {
        rotation: 0,
        crop: null,
        flipHorizontal: false,
        flipVertical: false,
      },
      // Reset filter since it's baked in
      filter: "none",
      // Clear all elements since they're baked into the image
      drawings: [],
      shapes: [],
      blurs: [],
      texts: [],
      emojis: [],
      selectedElementId: null,
      // Reset canvas dimensions - will be recalculated
      canvasDimensions: { width: 0, height: 0 },
    };

    // Create history entry first (using the refs for proper timing)
    createHistoryEntry(newState);
    // Then update state
    setState(newState);
  }, [state, createHistoryEntry]);

  // Export image as Blob - renders all edits and returns the final image
  const exportImage = useCallback(async (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = imageRef.current;
      if (!img) {
        reject(new Error("Image not loaded"));
        return;
      }

      try {
        // Use the shared rendering helper with crop applied
        const canvas = renderImageToCanvas({
          image: img,
          state: state,
          applyCrop: true,
        });

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create blob"));
            }
          },
          "image/jpeg",
          0.92
        );
      } catch (error) {
        reject(error);
      }
    });
  }, [state]);

  const value: EditorContextValue = useMemo(
    () => ({
      state,
      history,
      historyIndex,
      canUndo,
      canRedo,
      updateState,
      updateStateNoHistory,
      updateCanvasDimensions,
      undo,
      redo,
      reset,
      setActiveTool,
      setFilter,
      addDrawPath,
      addText,
      updateText,
      updateTextNoHistory,
      removeText,
      addShape,
      updateShape,
      updateShapeNoHistory,
      removeShape,
      addBlur,
      updateBlur,
      updateBlurNoHistory,
      removeBlur,
      addEmoji,
      updateEmoji,
      updateEmojiNoHistory,
      removeEmoji,
      rotateImage,
      setCrop,
      setCropNoHistory,
      resetCropRotate,
      setSelectedElement,
      commitToHistory,
      applyCrop,
      exportImage,
    }),
    [
      state,
      history,
      historyIndex,
      canUndo,
      canRedo,
      updateState,
      updateStateNoHistory,
      updateCanvasDimensions,
      undo,
      redo,
      reset,
      setActiveTool,
      setFilter,
      addDrawPath,
      addText,
      updateText,
      updateTextNoHistory,
      removeText,
      addShape,
      updateShape,
      updateShapeNoHistory,
      removeShape,
      addBlur,
      updateBlur,
      updateBlurNoHistory,
      removeBlur,
      addEmoji,
      updateEmoji,
      updateEmojiNoHistory,
      removeEmoji,
      rotateImage,
      setCrop,
      setCropNoHistory,
      resetCropRotate,
      setSelectedElement,
      commitToHistory,
      applyCrop,
      exportImage,
    ]
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
}

export { EditorContext };
