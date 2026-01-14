"use client";

/**
 * Media Staging Panel
 *
 * Full-screen modal for staging media files before sending.
 * WhatsApp-style experience with:
 * - Full-screen overlay with dark background
 * - Preview of selected media with carousel navigation
 * - Integrated image editing toolbar (shows automatically for images)
 * - Caption/message input area (with auto-expanding textarea)
 * - Thumbnail carousel with send button in footer row
 *
 * Key features:
 * - Full-screen overlay for immersive media preview
 * - Built-in image editing without separate modal
 * - Tool-specific controls appear in the message input area when editing
 * - Auto-expanding textarea (up to 5 lines, then scrollable)
 * - Centered thumbnail strip with icon-only send button
 * - Auto-focus on newly added files
 * - Real-time upload progress and thumbnail status indicators
 */

import {
  EmojiPickerButton,
  EmojiPickerContent,
} from "@/components/emoji-picker";
import {
  dimensionToNormalized,
  pixelsToNormalized,
} from "@/components/image-editor/coordinate-utils";
import {
  EditorProvider,
  SavedEditorState,
  useEditorContext,
} from "@/components/image-editor/editor-context";
import { ImageEditorCanvas } from "@/components/image-editor/image-editor-canvas";
import {
  BlurTool,
  CropRotateTool,
  DrawTool,
  EmojiTool,
  FilterTool,
  ShapesTool,
  TextTool,
} from "@/components/image-editor/tools";
import { EditorTool, generateElementId } from "@/components/image-editor/types";
import { StagedFile } from "@/lib/media/staging-types";
import { formatFileSize } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  FileIcon,
  Film,
  Loader2,
  Music,
  Pencil,
  Plus,
  Send,
  Smile,
  Sparkles,
  Square,
  SquareDashed,
  Type,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

// Re-export StagedFile for backward compatibility
export type { StagedFile } from "@/lib/media/staging-types";

/**
 * Editor toolbar tools configuration
 */
const EDITOR_TOOLS: {
  id: EditorTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
}[] = [
  { id: "crop-rotate", icon: Crop, label: "Crop", title: "Crop & Rotate" },
  { id: "filter", icon: Sparkles, label: "Filter", title: "Apply Filters" },
  { id: "draw", icon: Pencil, label: "Draw", title: "Draw on Image" },
  { id: "text", icon: Type, label: "Text", title: "Add Text" },
  { id: "shapes", icon: Square, label: "Shapes", title: "Add Shapes" },
  { id: "blur", icon: SquareDashed, label: "Blur", title: "Add Blur Area" },
];

/**
 * Maximum number of visible lines in textarea before scrolling
 */
const MAX_TEXTAREA_LINES = 5;

/**
 * Approximate line height in pixels for textarea auto-resize
 */
const TEXTAREA_LINE_HEIGHT = 24;

interface MediaStagingPanelProps {
  isOpen: boolean;
  files: StagedFile[];
  onClose: () => void;
  onSend: (caption: string) => void;
  onAddMore: () => void;
  onRemove: (id: string) => void;
  /** @deprecated No longer used - editing is now integrated */
  onEditImage?: (file: StagedFile) => void;
  /** Called when an image is edited - returns Promise that resolves when re-upload is complete */
  onImageEdited?: (fileId: string, newBlob: Blob) => Promise<void>;
  disabled?: boolean;
  /** @deprecated No longer used - send button is now icon-only */
  sendButtonText?: string;
  /** ID of the file to focus on (used when adding new files) */
  focusFileId?: string | null;
}

export function MediaStagingPanel({
  isOpen,
  files,
  onClose,
  onSend,
  onAddMore,
  onRemove,
  onImageEdited,
  disabled = false,
  focusFileId,
}: MediaStagingPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const captionInputRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);
  // Track the last processed focusFileId to prevent re-running the effect
  const lastProcessedFocusId = useRef<string | null>(null);

  // Per-file editor state cache - persists undo history across file switches
  const editorStateCacheRef = useRef<Map<string, SavedEditorState>>(new Map());

  // Reset state when panel opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setCaption("");
      lastProcessedFocusId.current = null;
      // Clear the editor state cache when panel opens fresh
      editorStateCacheRef.current.clear();
    }
  }, [isOpen]);

  // Focus on newly added file - only process each focusFileId once
  useEffect(() => {
    // Skip if no focusFileId, or if we've already processed this one
    if (!focusFileId || lastProcessedFocusId.current === focusFileId) {
      return;
    }

    if (files.length > 0) {
      const newIndex = files.findIndex((f) => f.id === focusFileId);
      if (newIndex !== -1) {
        setCurrentIndex(newIndex);
        lastProcessedFocusId.current = focusFileId;
        // Scroll thumbnail into view
        setTimeout(() => {
          const container = thumbnailContainerRef.current;
          if (container) {
            const thumbnail = container.querySelector(
              `[data-file-id="${focusFileId}"]`
            );
            thumbnail?.scrollIntoView({ behavior: "smooth", inline: "center" });
          }
        }, 100);
      }
    }
  }, [focusFileId, files]);

  // Adjust current index if files are removed
  useEffect(() => {
    if (currentIndex >= files.length && files.length > 0) {
      setCurrentIndex(files.length - 1);
    }
  }, [files.length, currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, files.length]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowLeft":
          if (document.activeElement !== captionInputRef.current) {
            handlePrevious();
          }
          break;
        case "ArrowRight":
          if (document.activeElement !== captionInputRef.current) {
            handleNext();
          }
          break;
        case "Escape":
          onClose();
          break;
      }
    },
    [isOpen, handlePrevious, handleNext, onClose]
  );

  // Global keyboard event listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSend = () => {
    onSend(caption);
  };

  const handleCaptionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen || files.length === 0) return null;

  const currentFile = files[currentIndex];
  const isCurrentImage = currentFile.type === "image" && currentFile.previewUrl;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={onClose}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 text-white">
          <span className="text-sm text-white/60">
            {currentIndex + 1} / {files.length}
          </span>
          <span className="text-sm truncate max-w-[200px]">
            {currentFile.file.name}
          </span>
          <span className="text-xs text-white/50">
            ({formatFileSize(currentFile.file.size)})
          </span>
        </div>
        <div className="w-9" /> {/* Spacer for balance */}
      </div>

      {/* Main Content - Render different content based on file type */}
      {isCurrentImage ? (
        <ImageEditorContent
          key={currentFile.id}
          file={currentFile}
          files={files}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          caption={caption}
          setCaption={setCaption}
          captionInputRef={captionInputRef}
          thumbnailContainerRef={thumbnailContainerRef}
          disabled={disabled}
          onSend={handleSend}
          onAddMore={onAddMore}
          onRemove={onRemove}
          onImageEdited={onImageEdited}
          handleCaptionKeyDown={handleCaptionKeyDown}
          handlePrevious={handlePrevious}
          handleNext={handleNext}
          savedState={editorStateCacheRef.current.get(currentFile.id) ?? null}
          onStateChange={(newState) => {
            editorStateCacheRef.current.set(currentFile.id, newState);
          }}
        />
      ) : (
        <NonImageContent
          file={currentFile}
          files={files}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          caption={caption}
          setCaption={setCaption}
          captionInputRef={captionInputRef}
          thumbnailContainerRef={thumbnailContainerRef}
          disabled={disabled}
          onSend={handleSend}
          onAddMore={onAddMore}
          onRemove={onRemove}
          handleCaptionKeyDown={handleCaptionKeyDown}
          handlePrevious={handlePrevious}
          handleNext={handleNext}
        />
      )}
    </div>
  );
}

/**
 * Image editor content - wraps the image in EditorProvider
 */
interface ImageEditorContentProps {
  file: StagedFile;
  files: StagedFile[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  caption: string;
  setCaption: (caption: string) => void;
  captionInputRef: React.RefObject<HTMLTextAreaElement | null>;
  thumbnailContainerRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onSend: () => void;
  onAddMore: () => void;
  onRemove: (id: string) => void;
  onImageEdited?: (fileId: string, newBlob: Blob) => Promise<void>;
  handleCaptionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePrevious: () => void;
  handleNext: () => void;
  /** Saved editor state for this file (undo history persistence) */
  savedState?: SavedEditorState | null;
  /** Callback when editor state changes (for persistence) */
  onStateChange?: (state: SavedEditorState) => void;
}

function ImageEditorContent({
  file,
  files,
  currentIndex,
  setCurrentIndex,
  caption,
  setCaption,
  captionInputRef,
  thumbnailContainerRef,
  disabled,
  onSend,
  onAddMore,
  onRemove,
  onImageEdited,
  handleCaptionKeyDown,
  handlePrevious,
  handleNext,
  savedState,
  onStateChange,
}: ImageEditorContentProps) {
  return (
    <EditorProvider
      initialImage={file.previewUrl!}
      savedState={savedState}
      onStateChange={onStateChange}
    >
      <ImageEditorContentInner
        file={file}
        files={files}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        caption={caption}
        setCaption={setCaption}
        captionInputRef={captionInputRef}
        thumbnailContainerRef={thumbnailContainerRef}
        disabled={disabled}
        onSend={onSend}
        onAddMore={onAddMore}
        onRemove={onRemove}
        onImageEdited={onImageEdited}
        handleCaptionKeyDown={handleCaptionKeyDown}
        handlePrevious={handlePrevious}
        handleNext={handleNext}
      />
    </EditorProvider>
  );
}

/**
 * Inner content that has access to EditorContext
 */
function ImageEditorContentInner({
  file,
  files,
  currentIndex,
  setCurrentIndex,
  caption,
  setCaption,
  captionInputRef,
  thumbnailContainerRef,
  disabled,
  onSend,
  onAddMore,
  onRemove,
  onImageEdited,
  handleCaptionKeyDown,
  handlePrevious,
  handleNext,
}: ImageEditorContentProps) {
  const {
    state,
    setActiveTool,
    addEmoji,
    undo,
    canUndo,
    setSelectedElement,
    applyCrop,
    exportImage,
  } = useEditorContext();

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiOverlayRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: 600,
    height: 400,
  });
  const [isExporting, setIsExporting] = useState(false);

  // Calculate canvas dimensions based on container using ResizeObserver for reliability
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      // Only update if we have valid dimensions
      if (rect.width > 0 && rect.height > 0) {
        setCanvasDimensions({
          width: Math.min(rect.width - 48, 800),
          height: Math.min(rect.height - 48, 600),
        });
      }
    };

    // Use ResizeObserver for more reliable dimension tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    // Also update on window resize as backup
    window.addEventListener("resize", updateDimensions);

    // Initial update
    updateDimensions();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  // Handle emoji selection
  const handleEmojiSelect = useCallback(
    (emoji: { native: string }) => {
      const pixelX = canvasDimensions.width / 2 - 30;
      const pixelY = canvasDimensions.height / 2 - 30;
      const pixelSize = 60;

      const normalizedPos = pixelsToNormalized(
        pixelX,
        pixelY,
        canvasDimensions.width,
        canvasDimensions.height
      );
      const normalizedSize = dimensionToNormalized(
        pixelSize,
        canvasDimensions.width,
        canvasDimensions.height
      );

      addEmoji({
        id: generateElementId(),
        emoji: emoji.native,
        x: normalizedPos.x,
        y: normalizedPos.y,
        size: normalizedSize,
        rotation: 0,
      });
      setActiveTool("none");
    },
    [canvasDimensions, addEmoji, setActiveTool]
  );

  // Handle done button - apply crop if active, then close tool
  const handleDone = useCallback(async () => {
    setIsExporting(true);
    try {
      if (state.activeTool === "crop-rotate" && state.cropRotate.crop) {
        await applyCrop();
      }
      setSelectedElement(null);
      setActiveTool("none");
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

  // Handle send - export image if edited, then send
  const handleSendWithEdits = useCallback(async () => {
    setIsExporting(true);
    try {
      // Export the edited image if there are changes (canUndo indicates edits were made)
      if (canUndo && onImageEdited) {
        const blob = await exportImage();
        // Wait for the re-upload to complete before sending
        await onImageEdited(file.id, blob);
      }
      onSend();
    } finally {
      setIsExporting(false);
    }
  }, [canUndo, onImageEdited, exportImage, file.id, onSend]);

  // Handle emoji selection for caption
  const handleCaptionEmojiSelect = useCallback(
    (emoji: { native: string }) => {
      setCaption(caption + emoji.native);
      captionInputRef.current?.focus();
    },
    [caption, setCaption, captionInputRef]
  );

  // Handle click outside emoji overlay
  useEffect(() => {
    if (state.activeTool !== "emoji") return;
    if (
      state.selectedElementId &&
      state.emojis.some((e) => e.id === state.selectedElementId)
    ) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (emojiOverlayRef.current?.contains(target)) return;
      if (emojiButtonRef.current?.contains(target)) return;
      if (target.closest(".drag-area")) return;
      setActiveTool("none");
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [state.activeTool, state.selectedElementId, state.emojis, setActiveTool]);

  const showEmojiPicker =
    state.activeTool === "emoji" &&
    !state.emojis.some((e) => e.id === state.selectedElementId);

  // Determine if we should show tool controls instead of caption input
  // Tool controls show when:
  // 1. An element is selected and being edited (text, shape, blur, emoji)
  // 2. A tool is active that needs controls in the input area
  const showToolControls = state.selectedElementId !== null;

  // Tools that show their controls in the input area (below image)
  // These replace the text input when active
  const showToolPanelInInputArea =
    state.activeTool === "crop-rotate" ||
    state.activeTool === "filter" ||
    state.activeTool === "draw" ||
    (state.activeTool === "text" && !state.selectedElementId) ||
    (state.activeTool === "shapes" && !state.selectedElementId) ||
    (state.activeTool === "blur" && !state.selectedElementId);

  return (
    <>
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-white/10 overflow-visible relative z-[100]">
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/90 rounded-xl backdrop-blur-sm">
          {/* Undo Button */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className={cn(
              "p-2 rounded-lg transition-colors",
              canUndo
                ? "text-white hover:bg-white/10"
                : "text-white/30 cursor-not-allowed"
            )}
            title="Undo"
          >
            <Undo2 className="w-5 h-5" />
          </button>

          {/* Tool Buttons */}
          <div className="flex items-center gap-1">
            {EDITOR_TOOLS.map(({ id, icon: Icon, label, title }) => (
              <button
                key={id}
                onClick={() =>
                  setActiveTool(state.activeTool === id ? "none" : id)
                }
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all",
                  state.activeTool === id
                    ? "bg-primary text-primary-foreground"
                    : "text-white hover:bg-white/10"
                )}
                title={title}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px]">{label}</span>
              </button>
            ))}

            {/* Emoji Tool Button */}
            <div className="relative">
              <button
                ref={emojiButtonRef}
                onClick={() =>
                  setActiveTool(state.activeTool === "emoji" ? "none" : "emoji")
                }
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all",
                  state.activeTool === "emoji"
                    ? "bg-primary text-primary-foreground"
                    : "text-white hover:bg-white/10"
                )}
                title="Add Emoji"
              >
                <Smile className="w-5 h-5" />
                <span className="text-[10px]">Emoji</span>
              </button>

              {showEmojiPicker && (
                <div
                  ref={emojiOverlayRef}
                  className="absolute top-full right-0 mt-2 z-[9999]"
                >
                  <div className="bg-zinc-900/95 rounded-xl shadow-2xl border border-white/10 overflow-hidden max-h-[320px]">
                    <EmojiPickerContent
                      onEmojiSelect={handleEmojiSelect}
                      theme="dark"
                      compact={false}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Done Button - show when tool is active */}
          {state.activeTool !== "none" && !showEmojiPicker && (
            <button
              onClick={handleDone}
              disabled={disabled || isExporting}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors",
                disabled || isExporting
                  ? "bg-white/10 text-white/30 cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              title="Done"
            >
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">Done</span>
            </button>
          )}
          {(state.activeTool === "none" || showEmojiPicker) && (
            <div className="w-[76px]" />
          )}
        </div>
      </div>

      {/* Canvas Area with Navigation */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {/* Previous Button */}
        {files.length > 1 && (
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="absolute left-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Canvas Container */}
        <div
          ref={canvasContainerRef}
          className="flex-1 flex items-center justify-center p-6 max-w-full max-h-full"
        >
          <ImageEditorCanvas
            maxWidth={canvasDimensions.width}
            maxHeight={canvasDimensions.height}
          />
        </div>

        {/* Next Button */}
        {files.length > 1 && (
          <button
            onClick={handleNext}
            disabled={currentIndex === files.length - 1}
            className="absolute right-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>

      {/* Message Input Area - Shows caption textarea OR tool controls (both for active tools and selected elements) */}
      <MessageInputArea
        showToolControls={showToolControls}
        showToolPanelInInputArea={showToolPanelInInputArea}
        state={state}
        canvasDimensions={canvasDimensions}
        caption={caption}
        setCaption={setCaption}
        captionInputRef={captionInputRef}
        disabled={disabled}
        isExporting={isExporting}
        handleCaptionKeyDown={handleCaptionKeyDown}
        handleCaptionEmojiSelect={handleCaptionEmojiSelect}
      />

      {/* Footer - Thumbnail carousel with centered thumbnails and send button */}
      <FooterWithThumbnails
        files={files}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        thumbnailContainerRef={thumbnailContainerRef}
        disabled={disabled}
        isExporting={isExporting}
        onRemove={onRemove}
        onAddMore={onAddMore}
        onSend={handleSendWithEdits}
      />
    </>
  );
}

/**
 * Non-image content (videos, audio, documents)
 */
interface NonImageContentProps {
  file: StagedFile;
  files: StagedFile[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  caption: string;
  setCaption: (caption: string) => void;
  captionInputRef: React.RefObject<HTMLTextAreaElement | null>;
  thumbnailContainerRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onSend: () => void;
  onAddMore: () => void;
  onRemove: (id: string) => void;
  handleCaptionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePrevious: () => void;
  handleNext: () => void;
}

function NonImageContent({
  file,
  files,
  currentIndex,
  setCurrentIndex,
  caption,
  setCaption,
  captionInputRef,
  thumbnailContainerRef,
  disabled,
  onSend,
  onAddMore,
  onRemove,
  handleCaptionKeyDown,
  handlePrevious,
  handleNext,
}: NonImageContentProps) {
  const handleCaptionEmojiSelect = useCallback(
    (emoji: { native: string }) => {
      setCaption(caption + emoji.native);
      captionInputRef.current?.focus();
    },
    [caption, setCaption, captionInputRef]
  );

  return (
    <>
      {/* Preview Area with Navigation */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative p-6">
        {/* Previous Button */}
        {files.length > 1 && (
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="absolute left-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Preview Content */}
        <div className="max-w-full max-h-full flex items-center justify-center">
          {file.type === "video" && file.previewUrl ? (
            <video
              src={file.previewUrl}
              controls
              className="max-h-[60vh] max-w-full rounded-lg shadow-2xl"
            />
          ) : file.type === "audio" ? (
            <div className="flex flex-col items-center gap-4 p-8 bg-zinc-900 rounded-2xl">
              <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center shadow-lg">
                <Music className="w-12 h-12 text-white/60" />
              </div>
              <p className="text-white font-medium truncate max-w-[300px]">
                {file.file.name}
              </p>
              <p className="text-white/50 text-sm">
                {formatFileSize(file.file.size)}
              </p>
              {file.previewUrl && (
                <audio
                  src={file.previewUrl}
                  controls
                  className="w-full max-w-[320px]"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 bg-zinc-900 rounded-2xl">
              <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center shadow-lg">
                <FileIcon className="w-12 h-12 text-white/60" />
              </div>
              <p className="text-white font-medium truncate max-w-[300px]">
                {file.file.name}
              </p>
              <p className="text-white/50 text-sm">
                {formatFileSize(file.file.size)}
              </p>
            </div>
          )}
        </div>

        {/* Next Button */}
        {files.length > 1 && (
          <button
            onClick={handleNext}
            disabled={currentIndex === files.length - 1}
            className="absolute right-4 z-10 p-2 bg-black/40 hover:bg-black/60 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>

      {/* Message Input Area - Caption only for non-images */}
      <MessageInputArea
        showToolControls={false}
        showToolPanelInInputArea={false}
        state={null}
        canvasDimensions={{ width: 0, height: 0 }}
        caption={caption}
        setCaption={setCaption}
        captionInputRef={captionInputRef}
        disabled={disabled}
        isExporting={false}
        handleCaptionKeyDown={handleCaptionKeyDown}
        handleCaptionEmojiSelect={handleCaptionEmojiSelect}
      />

      {/* Footer - Thumbnail carousel with centered thumbnails and send button */}
      <FooterWithThumbnails
        files={files}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
        thumbnailContainerRef={thumbnailContainerRef}
        disabled={disabled}
        isExporting={false}
        onRemove={onRemove}
        onAddMore={onAddMore}
        onSend={onSend}
      />
    </>
  );
}

/**
 * Message Input Area Component
 * Shows either:
 * 1. Tool controls for active tools (crop, filter, draw, etc.) when showToolPanelInInputArea is true
 * 2. Tool controls for selected elements (text, shapes, blur, emoji) when showToolControls is true
 * 3. Caption textarea when no tool is active and no element is selected
 *
 * The textarea auto-expands up to MAX_TEXTAREA_LINES lines, then becomes scrollable.
 */
interface MessageInputAreaProps {
  showToolControls: boolean;
  showToolPanelInInputArea?: boolean;
  state: ReturnType<typeof useEditorContext>["state"] | null;
  canvasDimensions: { width: number; height: number };
  caption: string;
  setCaption: (caption: string) => void;
  captionInputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  isExporting: boolean;
  handleCaptionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleCaptionEmojiSelect: (emoji: { native: string }) => void;
}

function MessageInputArea({
  showToolControls,
  showToolPanelInInputArea = false,
  state,
  canvasDimensions,
  caption,
  setCaption,
  captionInputRef,
  disabled,
  isExporting,
  handleCaptionKeyDown,
  handleCaptionEmojiSelect,
}: MessageInputAreaProps) {
  // Track whether textarea needs scrollbar
  const [needsScroll, setNeedsScroll] = useState(false);

  // Auto-resize textarea based on content
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = e.target;
      setCaption(textarea.value);

      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";

      // Calculate max height based on line count
      const maxHeight = TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_LINES + 24; // 24px for padding
      const contentNeedsScroll = textarea.scrollHeight > maxHeight;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);

      textarea.style.height = `${newHeight}px`;
      setNeedsScroll(contentNeedsScroll);
    },
    [setCaption]
  );

  // Reset textarea height and scroll when caption is cleared
  useEffect(() => {
    if (captionInputRef.current && caption === "") {
      captionInputRef.current.style.height = "auto";
      setNeedsScroll(false);
    }
  }, [caption, captionInputRef]);

  // Determine what to show:
  // 1. Tool panel controls (crop, filter, draw, etc.) - these are for unselected active tools
  // 2. Selected element controls (text, shapes, blur, emoji) - these are for selected elements
  // 3. Caption textarea - default when nothing else is active

  const shouldShowToolPanel = showToolPanelInInputArea && state;
  const shouldShowElementControls = showToolControls && state;
  const shouldShowCaption = !shouldShowToolPanel && !shouldShowElementControls;

  return (
    <div className="border-t border-white/10 px-4 py-3 bg-zinc-900 overflow-visible relative z-50">
      {shouldShowToolPanel ? (
        // Tool panel controls for active tools (crop, filter, draw, text/shapes/blur when no element selected)
        <div className="flex items-center justify-center">
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
      ) : shouldShowElementControls ? (
        // Tool controls for selected elements
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
        // Caption textarea - centered with reasonable max width
        <div className="flex justify-center">
          <div className="w-full max-w-xl relative">
            <textarea
              ref={captionInputRef}
              value={caption}
              onChange={handleTextareaChange}
              onKeyDown={handleCaptionKeyDown}
              placeholder="Type a message"
              disabled={disabled || isExporting}
              className={cn(
                "w-full min-h-[48px] px-4 py-3 pr-12 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-white/40 resize-none outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50",
                needsScroll ? "overflow-y-auto" : "overflow-y-hidden"
              )}
              rows={1}
              style={{
                maxHeight: `${TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_LINES + 24}px`,
              }}
            />
            <div className="absolute right-2 bottom-2">
              <EmojiPickerButton
                onEmojiSelect={handleCaptionEmojiSelect}
                disabled={disabled || isExporting}
                placement="top-end"
                className="text-white/50 hover:text-white/80"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Footer with centered thumbnail carousel and icon-only send button
 */
interface FooterWithThumbnailsProps {
  files: StagedFile[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  thumbnailContainerRef: React.RefObject<HTMLDivElement | null>;
  disabled: boolean;
  isExporting: boolean;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onSend: () => void;
}

function FooterWithThumbnails({
  files,
  currentIndex,
  setCurrentIndex,
  thumbnailContainerRef,
  disabled,
  isExporting,
  onRemove,
  onAddMore,
  onSend,
}: FooterWithThumbnailsProps) {
  // Check if any files are still uploading
  const hasUploadingFiles = files.some(
    (f) => f.uploadStatus === "uploading" || f.uploadStatus === "pending"
  );
  const hasFailedFiles = files.some((f) => f.uploadStatus === "failed");
  const allUploaded = files.every((f) => f.uploadStatus === "uploaded");

  // Send button disabled if uploading or has failures
  const sendDisabled =
    disabled || isExporting || hasUploadingFiles || hasFailedFiles;

  return (
    <div className="border-t border-white/10 px-4 py-3 bg-zinc-900/50">
      <div className="flex items-center justify-center gap-4">
        {/* Centered thumbnail container */}
        <div
          ref={thumbnailContainerRef}
          className="flex items-center justify-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent max-w-[calc(100%-80px)]"
        >
          {files.map((file, index) => (
            <div
              key={file.id}
              data-file-id={file.id}
              className="relative flex-shrink-0 group"
            >
              <button
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  "w-14 h-14 rounded-lg overflow-hidden transition border-2",
                  index === currentIndex
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent opacity-60 hover:opacity-100"
                )}
              >
                <ThumbnailPreview file={file} />
              </button>

              {/* Upload status overlay */}
              <UploadStatusOverlay file={file} />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(file.id);
                }}
                disabled={disabled}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 shadow-lg"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add More Button */}
          <button
            onClick={onAddMore}
            disabled={disabled}
            className="w-14 h-14 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Add more"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* Icon-only Send Button - uses WhatsApp-like green for consistent dark panel styling */}
        <button
          onClick={onSend}
          disabled={sendDisabled}
          className={cn(
            "flex items-center justify-center w-12 h-12 rounded-full font-medium transition-all shadow-lg flex-shrink-0",
            sendDisabled
              ? "bg-emerald-600/50 cursor-not-allowed text-white/70"
              : "bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white"
          )}
          title={
            hasUploadingFiles
              ? "Uploading..."
              : hasFailedFiles
                ? "Some uploads failed"
                : "Send"
          }
        >
          {isExporting || hasUploadingFiles ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Upload status message */}
      {hasUploadingFiles && (
        <div className="text-center text-xs text-white/50 mt-2">
          Uploading {files.filter((f) => f.uploadStatus === "uploading").length}{" "}
          of {files.length} files...
        </div>
      )}
      {hasFailedFiles && !hasUploadingFiles && (
        <div className="text-center text-xs text-red-400 mt-2">
          Some files failed to upload. Remove them to continue.
        </div>
      )}
    </div>
  );
}

/**
 * Upload status overlay for thumbnails
 */
function UploadStatusOverlay({ file }: { file: StagedFile }) {
  // No overlay if uploaded or no status yet (backward compatibility)
  if (!file.uploadStatus || file.uploadStatus === "uploaded") {
    return null;
  }

  if (file.uploadStatus === "uploading") {
    const progress = file.uploadProgress || 0;
    return (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
        <div className="relative w-8 h-8">
          {/* Progress ring */}
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="3"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray={`${(progress / 100) * 75.4} 75.4`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-medium">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    );
  }

  if (file.uploadStatus === "pending") {
    return (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
        <Loader2 className="w-5 h-5 text-white/70 animate-spin" />
      </div>
    );
  }

  if (file.uploadStatus === "failed") {
    return (
      <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-300" />
      </div>
    );
  }

  return null;
}

/**
 * Thumbnail Preview Component
 */
function ThumbnailPreview({ file }: { file: StagedFile }) {
  if (file.type === "image" && file.previewUrl) {
    return (
      <img
        src={file.previewUrl}
        alt={file.file.name}
        className="w-full h-full object-cover"
      />
    );
  }

  if (file.type === "video" && file.previewUrl) {
    return (
      <div className="w-full h-full bg-zinc-800 flex items-center justify-center relative">
        <video
          src={file.previewUrl}
          className="w-full h-full object-cover"
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Film className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  if (file.type === "audio") {
    return (
      <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
        <Music className="w-5 h-5 text-white/60" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
      <FileIcon className="w-5 h-5 text-white/60" />
    </div>
  );
}
