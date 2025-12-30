/**
 * Image Editor Panel
 * Complete image editing experience with toolbar, canvas, and message input
 * Used for both camera photos and attached images
 */

"use client";

import { Emoji, EmojiPickerButton } from "@/components/emoji-picker";
import { cn } from "@/lib/utils";
import { Download, RefreshCw, Send, X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { EditorProvider, useEditorContext } from "./editor-context";
import { ImageEditorCanvas } from "./image-editor-canvas";
import { ImageEditorToolbar } from "./image-editor-toolbar";
import {
  BlurTool,
  CropRotateTool,
  DrawTool,
  EmojiTool,
  FilterTool,
  ShapesTool,
  TextTool,
} from "./tools";

interface ImageEditorPanelProps {
  /** Image to edit (data URL or blob URL) */
  image: string;
  /** Whether this is from camera (shows retake button) */
  isFromCamera?: boolean;
  /** Whether this is editing a staged file (hides send UI) */
  isFromStaged?: boolean;
  /** Called when user wants to retake photo */
  onRetake?: () => void;
  /** Called when editing is complete with caption */
  onComplete: (imageBlob: Blob, caption: string) => void;
  /** Called when user cancels editing */
  onCancel: () => void;
  /** Whether the component is in a loading/sending state */
  isLoading?: boolean;
  /** Additional class names */
  className?: string;
}

export function ImageEditorPanel({
  image,
  isFromCamera = false,
  isFromStaged = false,
  onRetake,
  onComplete,
  onCancel,
  isLoading = false,
  className,
}: ImageEditorPanelProps) {
  return (
    <EditorProvider initialImage={image}>
      <ImageEditorPanelContent
        isFromCamera={isFromCamera}
        isFromStaged={isFromStaged}
        onRetake={onRetake}
        onComplete={onComplete}
        onCancel={onCancel}
        isLoading={isLoading}
        className={className}
      />
    </EditorProvider>
  );
}

interface ImageEditorPanelContentProps {
  isFromCamera: boolean;
  isFromStaged: boolean;
  onRetake?: () => void;
  onComplete: (imageBlob: Blob, caption: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  className?: string;
}

function ImageEditorPanelContent({
  isFromCamera,
  isFromStaged,
  onRetake,
  onComplete,
  onCancel,
  isLoading,
  className,
}: ImageEditorPanelContentProps) {
  const { state, exportImage, setActiveTool, setSelectedElement, applyCrop } =
    useEditorContext();
  const [caption, setCaption] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const captionInputRef = useRef<HTMLTextAreaElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 400,
    height: 300,
  });

  // Calculate canvas dimensions based on container
  React.useEffect(() => {
    const updateDimensions = () => {
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        setCanvasDimensions({
          width: Math.min(rect.width - 32, 600),
          height: Math.min(rect.height - 32, 400),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Handle done button - either bakes crop into image (for crop tool) or just closes the tool
  // When crop-rotate tool is active with a crop, we bake ALL edits into the original image,
  // giving a clean slate for further editing. Otherwise just close the tool.
  const handleDone = useCallback(async () => {
    setIsExporting(true);
    try {
      // If crop-rotate tool is active and has a crop, bake all edits into the image
      if (state.activeTool === "crop-rotate" && state.cropRotate.crop) {
        await applyCrop();
      }
      // Deselect any element and close the active tool when done
      setSelectedElement(null);
      setActiveTool("none");
    } catch (error) {
      console.error("Failed to apply edits:", error);
    } finally {
      setIsExporting(false);
    }
  }, [
    applyCrop,
    setActiveTool,
    setSelectedElement,
    state.activeTool,
    state.cropRotate.crop,
  ]);

  // Handle download - always exports fresh to include all current edits
  const handleDownload = useCallback(async () => {
    try {
      const blob = await exportImage();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `photo-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  }, [exportImage]);

  // Handle send - exports fresh and sends immediately
  const handleSend = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportImage();
      // Call onComplete - the parent will handle the upload
      onComplete(blob, caption);
    } catch (error) {
      console.error("Failed to export image:", error);
      setIsExporting(false);
    }
  }, [exportImage, caption, onComplete]);

  // Handle emoji selection for caption
  const handleEmojiSelect = useCallback((emoji: Emoji) => {
    setCaption((prev) => prev + emoji.native);
    captionInputRef.current?.focus();
  }, []);

  // Handle caption key down
  const handleCaptionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-40 bg-zinc-950 flex flex-col overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={onCancel}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          {/* Retake Button (camera only) */}
          {isFromCamera && onRetake && (
            <button
              onClick={onRetake}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Retake Photo"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm">Retake</span>
            </button>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar - positioned at top of canvas area */}
        <div className="px-4 py-2 border-b border-white/10 overflow-visible relative z-[100]">
          <ImageEditorToolbar
            onDone={handleDone}
            doneDisabled={isLoading || isExporting}
            canvasWidth={canvasDimensions.width}
            canvasHeight={canvasDimensions.height}
          />
        </div>

        {/* Tool-specific Panel for tools without selectable elements (crop, filter, draw) */}
        {/* Also show text/shapes/blur tools here when activated but NO element selected yet (for auto-create) */}
        {(state.activeTool === "crop-rotate" ||
          state.activeTool === "filter" ||
          state.activeTool === "draw" ||
          (state.activeTool === "text" && !state.selectedElementId) ||
          (state.activeTool === "shapes" && !state.selectedElementId) ||
          (state.activeTool === "blur" && !state.selectedElementId)) && (
          <div className="px-4 py-3 border-b border-white/10 bg-zinc-900/50 overflow-visible relative z-50">
            {state.activeTool === "crop-rotate" && <CropRotateTool />}
            {state.activeTool === "filter" && <FilterTool />}
            {state.activeTool === "draw" && <DrawTool />}
            {state.activeTool === "text" && !state.selectedElementId && (
              <TextTool
                canvasWidth={canvasDimensions.width}
                canvasHeight={canvasDimensions.height}
                selectedTextId={null}
              />
            )}
            {state.activeTool === "shapes" && !state.selectedElementId && (
              <ShapesTool
                canvasWidth={canvasDimensions.width}
                canvasHeight={canvasDimensions.height}
                selectedShapeId={null}
              />
            )}
            {state.activeTool === "blur" && !state.selectedElementId && (
              <BlurTool
                canvasWidth={canvasDimensions.width}
                canvasHeight={canvasDimensions.height}
                selectedBlurId={null}
              />
            )}
          </div>
        )}

        {/* Canvas Area */}
        <div
          ref={canvasContainerRef}
          className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        >
          <ImageEditorCanvas
            maxWidth={canvasDimensions.width}
            maxHeight={canvasDimensions.height}
          />
        </div>
      </div>

      {/* Footer - different for staged vs camera/attachment */}
      {isFromStaged ? (
        /* Save Changes Button for staged images - no caption input */
        <div className="border-t border-white/10 p-4 bg-zinc-900 overflow-visible relative z-50">
          {/* Tool-specific controls when element is selected */}
          {state.selectedElementId ? (
            <div className="flex items-center justify-center">
              {state.activeTool === "text" &&
                state.texts.some((t) => t.id === state.selectedElementId) && (
                  <TextTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedTextId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "shapes" &&
                state.shapes.some((s) => s.id === state.selectedElementId) && (
                  <ShapesTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedShapeId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "blur" &&
                state.blurs.some((b) => b.id === state.selectedElementId) && (
                  <BlurTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedBlurId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "emoji" &&
                state.emojis.some((e) => e.id === state.selectedElementId) && (
                  <EmojiTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedEmojiId={state.selectedElementId}
                  />
                )}
            </div>
          ) : (
            /* Save Changes buttons when no element selected */
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                disabled={isLoading || isExporting}
                className="px-4 py-2 text-white/70 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isLoading || isExporting}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all",
                  isLoading || isExporting
                    ? "bg-primary/50 cursor-not-allowed text-white/70"
                    : "bg-primary hover:bg-primary/90 active:scale-95 text-white"
                )}
              >
                {isLoading || isExporting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                Save Changes
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Caption Input & Send for camera/attachment - or tool controls when element selected */
        <div className="border-t border-white/10 p-4 bg-zinc-900 overflow-visible relative z-50">
          {state.selectedElementId ? (
            /* Tool-specific controls when element is selected */
            <div className="flex items-center justify-center">
              {state.activeTool === "text" &&
                state.texts.some((t) => t.id === state.selectedElementId) && (
                  <TextTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedTextId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "shapes" &&
                state.shapes.some((s) => s.id === state.selectedElementId) && (
                  <ShapesTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedShapeId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "blur" &&
                state.blurs.some((b) => b.id === state.selectedElementId) && (
                  <BlurTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedBlurId={state.selectedElementId}
                  />
                )}
              {state.activeTool === "emoji" &&
                state.emojis.some((e) => e.id === state.selectedElementId) && (
                  <EmojiTool
                    canvasWidth={canvasDimensions.width}
                    canvasHeight={canvasDimensions.height}
                    selectedEmojiId={state.selectedElementId}
                  />
                )}
            </div>
          ) : (
            /* Caption Input & Send when no element selected */
            <div className="flex items-end gap-3">
              {/* Caption Input with Emoji Button */}
              <div className="flex-1 relative">
                <textarea
                  ref={captionInputRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={handleCaptionKeyDown}
                  placeholder="Add a caption..."
                  disabled={isLoading || isExporting}
                  className="w-full min-h-[44px] max-h-[120px] px-4 py-3 pr-12 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-white/40 resize-none outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                  rows={1}
                />
                {/* Emoji Button inside input */}
                <div className="absolute right-2 bottom-2">
                  <EmojiPickerButton
                    onEmojiSelect={handleEmojiSelect}
                    disabled={isLoading || isExporting}
                    placement="top-end"
                    className="text-white/50 hover:text-white/80"
                  />
                </div>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={isLoading || isExporting}
                className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-full transition-all shadow-lg",
                  isLoading || isExporting
                    ? "bg-primary/50 cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 active:scale-95"
                )}
                title="Send"
              >
                {isLoading || isExporting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send
                    className="w-5 h-5 text-primary-foreground drop-shadow-sm"
                    strokeWidth={2}
                  />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
