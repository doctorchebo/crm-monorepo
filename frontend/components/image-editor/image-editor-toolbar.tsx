/**
 * Image Editor Toolbar
 * Main toolbar with tool selection, undo, and done buttons
 * Emoji tool renders its picker as an overlay from the toolbar
 */

"use client";

import { EmojiPickerContent } from "@/components/emoji-picker";
import { cn } from "@/lib/utils";
import {
  Check,
  Crop,
  Pencil,
  Smile,
  Sparkles,
  Square,
  SquareDashed,
  Type,
  Undo2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { dimensionToNormalized, pixelsToNormalized } from "./coordinate-utils";
import { useEditorContext } from "./editor-context";
import { EditorTool, generateElementId } from "./types";

interface ImageEditorToolbarProps {
  onDone: () => void;
  doneDisabled?: boolean;
  className?: string;
  /** Canvas dimensions for centering emojis */
  canvasWidth?: number;
  canvasHeight?: number;
}

// Tools that show in the panel (not emoji)
const PANEL_TOOLS: {
  id: EditorTool;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
}[] = [
  {
    id: "crop-rotate",
    icon: Crop,
    label: "Crop",
    title: "Crop & Rotate",
  },
  {
    id: "filter",
    icon: Sparkles,
    label: "Filter",
    title: "Apply Filters",
  },
  {
    id: "draw",
    icon: Pencil,
    label: "Draw",
    title: "Draw on Image",
  },
  {
    id: "text",
    icon: Type,
    label: "Text",
    title: "Add Text",
  },
  {
    id: "shapes",
    icon: Square,
    label: "Shapes",
    title: "Add Shapes",
  },
  {
    id: "blur",
    icon: SquareDashed,
    label: "Blur",
    title: "Add Blur Area",
  },
];

export function ImageEditorToolbar({
  onDone,
  doneDisabled = false,
  className,
  canvasWidth = 400,
  canvasHeight = 300,
}: ImageEditorToolbarProps) {
  const { state, setActiveTool, addEmoji, undo, canUndo } = useEditorContext();
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiOverlayRef = useRef<HTMLDivElement>(null);

  // Handle emoji selection from picker
  const handleEmojiSelect = (emoji: { native: string }) => {
    // Calculate pixel values first - center the emoji
    const pixelX = canvasWidth / 2 - 30;
    const pixelY = canvasHeight / 2 - 30;
    const pixelSize = 60;

    // Convert to normalized coordinates (0-1 range)
    const normalizedPos = pixelsToNormalized(
      pixelX,
      pixelY,
      canvasWidth,
      canvasHeight
    );
    // Normalize size relative to canvas dimensions
    const normalizedSize = dimensionToNormalized(
      pixelSize,
      canvasWidth,
      canvasHeight
    );

    const newEmoji = {
      id: generateElementId(),
      emoji: emoji.native,
      x: normalizedPos.x,
      y: normalizedPos.y,
      size: normalizedSize,
      rotation: 0,
    };
    addEmoji(newEmoji);
    // Close the emoji picker after selection
    setActiveTool("none");
  };

  // Handle click outside emoji overlay to close
  useEffect(() => {
    if (state.activeTool !== "emoji") return;

    // Don't set up click-outside for emoji if an emoji element is selected
    // (the panel will show for editing in that case)
    if (
      state.selectedElementId &&
      state.emojis.some((e) => e.id === state.selectedElementId)
    ) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the emoji overlay
      if (emojiOverlayRef.current?.contains(target)) {
        return;
      }

      // Check if click is on the emoji button
      if (emojiButtonRef.current?.contains(target)) {
        return;
      }

      // Check if click is on an emoji element on the canvas
      if (target.closest(".drag-area")) {
        return;
      }

      // Click was outside - close the emoji tool
      setActiveTool("none");
    };

    // Use setTimeout to avoid the click that opened the tool from immediately closing it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [state.activeTool, state.selectedElementId, state.emojis, setActiveTool]);

  // Check if emoji tool is active but no emoji is selected (show picker)
  const showEmojiPicker =
    state.activeTool === "emoji" &&
    !state.emojis.some((e) => e.id === state.selectedElementId);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/90 rounded-xl backdrop-blur-sm",
        className
      )}
    >
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
        {/* Regular panel tools */}
        {PANEL_TOOLS.map(({ id, icon: Icon, label, title }) => (
          <button
            key={id}
            data-tool={id}
            onClick={() => setActiveTool(state.activeTool === id ? "none" : id)}
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

        {/* Emoji Tool Button - with overlay */}
        <div className="relative">
          <button
            ref={emojiButtonRef}
            data-tool="emoji"
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

          {/* Emoji Picker Overlay - positioned below the button */}
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

      {/* Done Button - only show when a tool is active (but not emoji without selection) */}
      {state.activeTool !== "none" && !showEmojiPicker && (
        <button
          onClick={onDone}
          disabled={doneDisabled}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors",
            doneDisabled
              ? "bg-white/10 text-white/30 cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          title="Done"
        >
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Done</span>
        </button>
      )}
      {/* Spacer when no tool active or emoji picker shown to maintain toolbar balance */}
      {(state.activeTool === "none" || showEmojiPicker) && (
        <div className="w-[76px]" />
      )}
    </div>
  );
}
