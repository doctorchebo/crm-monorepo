/**
 * Image Editor Types
 * Comprehensive type definitions for the image editor component system
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Available editor tools
 */
export type EditorTool =
  | "none"
  | "crop-rotate"
  | "filter"
  | "draw"
  | "text"
  | "shapes"
  | "blur"
  | "emoji";

/**
 * Available image filters
 */
export type ImageFilter = "none" | "pop" | "bw" | "cool" | "chrome" | "film";

/**
 * Filter configuration with display information
 */
export interface FilterConfig {
  id: ImageFilter;
  label: string;
  /** CSS filter string to apply */
  cssFilter: string;
}

/**
 * All available filters with their configurations
 */
export const IMAGE_FILTERS: FilterConfig[] = [
  { id: "none", label: "None", cssFilter: "none" },
  { id: "pop", label: "Pop", cssFilter: "saturate(1.5) contrast(1.1)" },
  { id: "bw", label: "B&W", cssFilter: "grayscale(1)" },
  {
    id: "cool",
    label: "Cool",
    cssFilter: "sepia(0.2) hue-rotate(180deg) saturate(1.2)",
  },
  { id: "chrome", label: "Chrome", cssFilter: "contrast(1.2) saturate(1.4)" },
  {
    id: "film",
    label: "Film",
    cssFilter: "sepia(0.3) contrast(1.1) brightness(0.95)",
  },
];

// ============================================================================
// Shape Types
// ============================================================================

/**
 * Available shape types
 */
export type ShapeType = "rectangle" | "circle" | "line" | "arrow";

/**
 * Base shape properties shared by all shapes
 */
export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  color: string;
  strokeWidth: number;
  rotation: number;
  /** Z-index for layering (higher = on top). Assigned automatically when adding. */
  zIndex?: number;
}

/**
 * Rectangle shape
 */
export interface RectangleShape extends BaseShape {
  type: "rectangle";
  width: number;
  height: number;
}

/**
 * Circle/Ellipse shape
 */
export interface CircleShape extends BaseShape {
  type: "circle";
  radiusX: number;
  radiusY: number;
}

/**
 * Line shape
 */
export interface LineShape extends BaseShape {
  type: "line";
  endX: number;
  endY: number;
}

/**
 * Arrow shape (line with arrowhead)
 */
export interface ArrowShape extends BaseShape {
  type: "arrow";
  endX: number;
  endY: number;
}

/**
 * Union type for all shapes
 */
export type Shape = RectangleShape | CircleShape | LineShape | ArrowShape;

// ============================================================================
// Text Types
// ============================================================================

/**
 * Available font families for text elements
 */
export const TEXT_FONTS = [
  { id: "arial", label: "Arial", family: "Arial, sans-serif" },
  { id: "times", label: "Times", family: "Times New Roman, serif" },
  { id: "georgia", label: "Georgia", family: "Georgia, serif" },
  { id: "courier", label: "Courier", family: "Courier New, monospace" },
  { id: "verdana", label: "Verdana", family: "Verdana, sans-serif" },
  { id: "impact", label: "Impact", family: "Impact, sans-serif" },
  { id: "comic", label: "Comic", family: "Comic Sans MS, cursive" },
] as const;

export type TextFontId = (typeof TEXT_FONTS)[number]["id"];

/**
 * Text element on the image
 */
export interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  /** Whether to show the background behind text */
  showBackground: boolean;
  rotation: number;
  isBold: boolean;
  isItalic: boolean;
  /** Z-index for layering (higher = on top). Assigned automatically when adding. */
  zIndex?: number;
  /** Whether this text was just created and should start in edit mode */
  isNewlyCreated?: boolean;
}

// ============================================================================
// Drawing Types
// ============================================================================

/**
 * A single point in a drawing path
 */
export interface DrawPoint {
  x: number;
  y: number;
  pressure?: number;
}

/**
 * A drawing stroke (path of points)
 */
export interface DrawPath {
  id: string;
  points: DrawPoint[];
  color: string;
  strokeWidth: number;
}

// ============================================================================
// Blur Types
// ============================================================================

/**
 * Blur mode types
 */
export type BlurMode = "normal" | "pixelate";

/**
 * Blur area on the image
 */
export interface BlurArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: BlurMode;
  intensity: number; // 1-100
  rotation: number;
  /** Z-index for layering (higher = on top). Assigned automatically when adding. */
  zIndex?: number;
}

// ============================================================================
// Emoji Types
// ============================================================================

/**
 * Emoji element on the image
 */
export interface EmojiElement {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  /** Z-index for layering (higher = on top). Assigned automatically when adding. */
  zIndex?: number;
}

// ============================================================================
// Crop & Rotate Types
// ============================================================================

/**
 * Crop area definition
 */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crop and rotation state
 */
export interface CropRotateState {
  rotation: number; // Degrees: 0, 90, 180, 270
  crop: CropArea | null;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

// ============================================================================
// Editor State
// ============================================================================

/**
 * Complete editor state for a single image
 */
export interface EditorState {
  /** Original image data URL or blob URL */
  originalImage: string;
  /** Currently selected tool */
  activeTool: EditorTool;
  /** Applied filter */
  filter: ImageFilter;
  /** Crop and rotation state */
  cropRotate: CropRotateState;
  /** Drawing paths */
  drawings: DrawPath[];
  /** Text elements */
  texts: TextElement[];
  /** Shape elements */
  shapes: Shape[];
  /** Blur areas */
  blurs: BlurArea[];
  /** Emoji elements */
  emojis: EmojiElement[];
  /** Currently selected element ID (for editing) */
  selectedElementId: string | null;
  /** Current drawing color */
  drawColor: string;
  /** Current drawing stroke width */
  drawStrokeWidth: number;
  /** Current text color */
  textColor: string;
  /** Current shape color */
  shapeColor: string;
  /** Current blur mode */
  blurMode: BlurMode;
  /** Current blur intensity */
  blurIntensity: number;
  /** Actual canvas dimensions (set by canvas component) */
  canvasDimensions: { width: number; height: number };
  /** Counter for assigning z-index to new elements */
  zIndexCounter: number;
}

/**
 * Content state - the part of EditorState that should be tracked in history.
 * Excludes transient UI state like activeTool, selectedElementId, canvasDimensions.
 */
export interface ContentState {
  /** Original image data URL or blob URL */
  originalImage: string;
  /** Applied filter */
  filter: ImageFilter;
  /** Crop and rotation state */
  cropRotate: CropRotateState;
  /** Drawing paths */
  drawings: DrawPath[];
  /** Text elements */
  texts: TextElement[];
  /** Shape elements */
  shapes: Shape[];
  /** Blur areas */
  blurs: BlurArea[];
  /** Emoji elements */
  emojis: EmojiElement[];
  /** Current drawing color */
  drawColor: string;
  /** Current drawing stroke width */
  drawStrokeWidth: number;
  /** Current text color */
  textColor: string;
  /** Current shape color */
  shapeColor: string;
  /** Current blur mode */
  blurMode: BlurMode;
  /** Current blur intensity */
  blurIntensity: number;
  /** Counter for assigning z-index to new elements */
  zIndexCounter: number;
}

/**
 * History entry for undo/redo - stores only content state
 */
export interface HistoryEntry {
  state: ContentState;
  timestamp: number;
}

/**
 * Extract content state from full editor state for history storage
 */
export function extractContentState(state: EditorState): ContentState {
  return {
    originalImage: state.originalImage,
    filter: state.filter,
    cropRotate: state.cropRotate,
    drawings: state.drawings,
    texts: state.texts,
    shapes: state.shapes,
    blurs: state.blurs,
    emojis: state.emojis,
    drawColor: state.drawColor,
    drawStrokeWidth: state.drawStrokeWidth,
    textColor: state.textColor,
    shapeColor: state.shapeColor,
    blurMode: state.blurMode,
    blurIntensity: state.blurIntensity,
    zIndexCounter: state.zIndexCounter,
  };
}

/**
 * Merge content state from history with current UI state
 */
export function mergeContentWithUIState(
  content: ContentState,
  currentUIState: EditorState
): EditorState {
  return {
    ...content,
    // Preserve UI-only state that shouldn't be affected by undo/redo
    activeTool: currentUIState.activeTool,
    selectedElementId: null, // Clear selection on undo/redo for safety
    canvasDimensions: currentUIState.canvasDimensions,
  };
}

/**
 * Editor context value
 */
export interface EditorContextValue {
  /** Current editor state */
  state: EditorState;
  /** History for undo functionality */
  history: HistoryEntry[];
  /** Current position in history */
  historyIndex: number;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Update state (creates history entry) */
  updateState: (updates: Partial<EditorState>) => void;
  /** Update state without creating history entry */
  updateStateNoHistory: (updates: Partial<EditorState>) => void;
  /** Update canvas dimensions and scale all elements proportionally */
  updateCanvasDimensions: (dimensions: {
    width: number;
    height: number;
  }) => void;
  /** Undo last action */
  undo: () => void;
  /** Redo last undone action */
  redo: () => void;
  /** Reset to original image */
  reset: () => void;
  /** Set active tool */
  setActiveTool: (tool: EditorTool) => void;
  /** Set filter */
  setFilter: (filter: ImageFilter) => void;
  /** Add drawing path */
  addDrawPath: (path: DrawPath) => void;
  /** Add text element */
  addText: (text: TextElement) => void;
  /** Update text element */
  updateText: (id: string, updates: Partial<TextElement>) => void;
  /** Update text element without history (for dragging) */
  updateTextNoHistory: (id: string, updates: Partial<TextElement>) => void;
  /** Remove text element */
  removeText: (id: string) => void;
  /** Add shape */
  addShape: (shape: Shape) => void;
  /** Update shape */
  updateShape: (id: string, updates: Partial<Shape>) => void;
  /** Update shape without history (for dragging) */
  updateShapeNoHistory: (id: string, updates: Partial<Shape>) => void;
  /** Remove shape */
  removeShape: (id: string) => void;
  /** Add blur area */
  addBlur: (blur: BlurArea) => void;
  /** Update blur area */
  updateBlur: (id: string, updates: Partial<BlurArea>) => void;
  /** Update blur area without history (for dragging) */
  updateBlurNoHistory: (id: string, updates: Partial<BlurArea>) => void;
  /** Remove blur area */
  removeBlur: (id: string) => void;
  /** Add emoji */
  addEmoji: (emoji: EmojiElement) => void;
  /** Update emoji */
  updateEmoji: (id: string, updates: Partial<EmojiElement>) => void;
  /** Update emoji without history (for dragging) */
  updateEmojiNoHistory: (id: string, updates: Partial<EmojiElement>) => void;
  /** Remove emoji */
  removeEmoji: (id: string) => void;
  /** Rotate image */
  rotateImage: (direction: "left" | "right") => void;
  /** Set crop area (with history) */
  setCrop: (crop: CropArea | null) => void;
  /** Set crop area without history (for initial setup) */
  setCropNoHistory: (crop: CropArea | null) => void;
  /** Reset crop/rotate changes */
  resetCropRotate: () => void;
  /** Set selected element */
  setSelectedElement: (id: string | null) => void;
  /** Commit current state to history (after drag ends) */
  commitToHistory: () => void;
  /** Apply crop to the original image and update state */
  applyCrop: () => Promise<void>;
  /** Export final image as Blob */
  exportImage: () => Promise<Blob>;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for the main ImageEditorPanel
 */
export interface ImageEditorPanelProps {
  /** Image to edit (data URL, blob URL, or File) */
  image: string | File;
  /** Whether this is from camera (shows retake button) */
  isFromCamera?: boolean;
  /** Called when user wants to retake photo */
  onRetake?: () => void;
  /** Called when editing is complete with caption */
  onComplete: (imageBlob: Blob, caption: string) => void;
  /** Called when user cancels editing */
  onCancel: () => void;
  /** Whether the component is in a loading/sending state */
  isLoading?: boolean;
}

/**
 * Props for the CameraCapturePanel
 */
export interface CameraCapturePanelProps {
  /** Called when photo is captured */
  onCapture: (imageDataUrl: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * Props for ImageEditorCanvas
 */
export interface ImageEditorCanvasProps {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Whether to enable interactions */
  interactive?: boolean;
}

/**
 * Props for the toolbar
 */
export interface ImageEditorToolbarProps {
  /** Called when user clicks done */
  onDone: () => void;
  /** Whether done button is disabled */
  doneDisabled?: boolean;
}

/**
 * Draggable element common props
 */
export interface DraggableElementProps {
  /** Element position X */
  x: number;
  /** Element position Y */
  y: number;
  /** Called when position changes */
  onPositionChange: (x: number, y: number) => void;
  /** Called when size changes */
  onSizeChange?: (width: number, height: number) => void;
  /** Whether the element is selected */
  isSelected: boolean;
  /** Called when element is selected */
  onSelect: () => void;
  /** Called when element should be deleted */
  onDelete?: () => void;
  /** Children to render inside */
  children: React.ReactNode;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default colors for the color picker
 * Note: First color is used as default for text
 */
export const DEFAULT_COLORS = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FF8800",
  "#8800FF",
  "#00FF88",
  "#FF0088",
];

/**
 * Create initial editor state
 */
export function createInitialEditorState(imageUrl: string): EditorState {
  return {
    originalImage: imageUrl,
    activeTool: "none",
    filter: "none",
    cropRotate: {
      rotation: 0,
      crop: null,
      flipHorizontal: false,
      flipVertical: false,
    },
    drawings: [],
    texts: [],
    shapes: [],
    blurs: [],
    emojis: [],
    selectedElementId: null,
    drawColor: "#FF0000",
    drawStrokeWidth: 5,
    textColor: "#000000",
    shapeColor: "#FF0000",
    blurMode: "normal",
    blurIntensity: 50,
    canvasDimensions: { width: 0, height: 0 },
    zIndexCounter: 0,
  };
}

/**
 * Generate unique ID for elements
 */
export function generateElementId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
