/**
 * Image Editor Module
 *
 * A comprehensive image editing system for WhatsApp-style messaging
 *
 * ## Features
 * - Camera capture with permission handling
 * - Image editing with filters, drawing, text, shapes, blur, and emojis
 * - Crop and rotate functionality
 * - Undo/redo support
 * - Export to JPEG blob
 *
 * ## Components
 *
 * ### ImageEditorPanel
 * Main component for editing images. Includes toolbar, canvas, and message input.
 *
 * ```tsx
 * import { ImageEditorPanel } from "@/components/image-editor";
 *
 * <ImageEditorPanel
 *   image={imageDataUrl}
 *   isFromCamera={true}
 *   onRetake={() => setShowCamera(true)}
 *   onComplete={(blob, caption) => handleSend(blob, caption)}
 *   onCancel={() => setShowEditor(false)}
 * />
 * ```
 *
 * ### CameraCapturePanel
 * Camera preview with photo capture functionality.
 *
 * ```tsx
 * import { CameraCapturePanel } from "@/components/image-editor";
 *
 * <CameraCapturePanel
 *   onCapture={(dataUrl) => {
 *     setImage(dataUrl);
 *     setShowEditor(true);
 *   }}
 *   onCancel={() => setShowCamera(false)}
 * />
 * ```
 */

// Main components
export { CameraCapturePanel } from "./camera-capture-panel";
export { ImageEditorPanel } from "./image-editor-panel";

// Sub-components (for advanced usage)
export { DraggableElement } from "./draggable-element";
export { EditorProvider, useEditorContext } from "./editor-context";
export { ImageEditorCanvas } from "./image-editor-canvas";
export { ImageEditorToolbar } from "./image-editor-toolbar";

// Tools
export {
  BlurTool,
  ColorPickerOverlay,
  CropRotateTool,
  DrawTool,
  EmojiTool,
  FilterTool,
  ShapesTool,
  TextTool,
} from "./tools";

// Types
export type {
  ArrowShape,
  BlurArea,
  BlurMode,
  CameraCapturePanelProps,
  CircleShape,
  CropArea,
  CropRotateState,
  DrawPath,
  DrawPoint,
  EditorContextValue,
  EditorState,
  EditorTool,
  EmojiElement,
  FilterConfig,
  HistoryEntry,
  ImageEditorCanvasProps,
  ImageEditorPanelProps,
  ImageEditorToolbarProps,
  ImageFilter,
  LineShape,
  RectangleShape,
  Shape,
  ShapeType,
  TextElement,
} from "./types";

export {
  DEFAULT_COLORS,
  IMAGE_FILTERS,
  createInitialEditorState,
  generateElementId,
} from "./types";
