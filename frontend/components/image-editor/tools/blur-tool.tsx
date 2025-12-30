/**
 * Blur Tool Component
 * Auto-adds blur area when tool is selected
 */

"use client";

import { cn } from "@/lib/utils";
import { ChevronUp, Grid3X3, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pixelsToNormalized, sizeToNormalized } from "../coordinate-utils";
import { useEditorContext } from "../editor-context";
import { BlurMode, generateElementId } from "../types";

interface BlurToolProps {
  className?: string;
  /** Canvas dimensions for centering */
  canvasWidth: number;
  canvasHeight: number;
  /** ID of blur element that was selected when tool was activated (to skip auto-create) */
  selectedBlurId?: string | null;
}

export function BlurTool({
  className,
  canvasWidth,
  canvasHeight,
  selectedBlurId,
}: BlurToolProps) {
  const {
    addBlur,
    removeBlur,
    updateBlur,
    updateBlurNoHistory,
    commitToHistory,
    state,
    setSelectedElement,
    setActiveTool,
  } = useEditorContext();
  const [showModeSelector, setShowModeSelector] = useState(false);
  // Use a ref to track if we've already added a blur element in this mount cycle
  const hasInitializedRef = useRef(false);
  // Track the ID of the blur we created so we can ensure it's selected
  const createdBlurIdRef = useRef<string | null>(null);
  // Track if we're dragging the slider to avoid creating history entries
  const isDraggingSliderRef = useRef(false);

  // Get currently selected blur if any
  const selectedBlur = state.blurs.find(
    (b) => b.id === state.selectedElementId
  );

  // Get the most recently created blur (for controls display)
  // This handles the case where selection might not be synced yet
  const activeBlur =
    selectedBlur ?? state.blurs.find((b) => b.id === createdBlurIdRef.current);

  // Auto-add blur when tool is selected - only once per mount
  useEffect(() => {
    // Skip if already initialized or if canvas not ready
    if (hasInitializedRef.current || canvasWidth === 0 || canvasHeight === 0) {
      return;
    }

    // Skip if tool was activated by clicking on an existing blur element
    // Check both the prop AND the current state to handle timing issues
    const hasExistingBlurSelected =
      selectedBlurId ||
      (state.selectedElementId &&
        state.blurs.some((b) => b.id === state.selectedElementId));

    if (hasExistingBlurSelected) {
      hasInitializedRef.current = true;
      return;
    }

    // Mark as initialized immediately to prevent double execution in StrictMode
    hasInitializedRef.current = true;

    const newId = generateElementId();
    createdBlurIdRef.current = newId;

    // Calculate pixel values first
    const pixelX = canvasWidth / 2 - 75;
    const pixelY = canvasHeight / 2 - 50;
    const pixelWidth = 150;
    const pixelHeight = 100;

    // Convert to normalized coordinates (0-1 range)
    const normalizedPos = pixelsToNormalized(
      pixelX,
      pixelY,
      canvasWidth,
      canvasHeight
    );
    const normalizedSize = sizeToNormalized(
      pixelWidth,
      pixelHeight,
      canvasWidth,
      canvasHeight
    );

    const newBlur = {
      id: newId,
      x: normalizedPos.x,
      y: normalizedPos.y,
      width: normalizedSize.width,
      height: normalizedSize.height,
      mode: state.blurMode,
      intensity: state.blurIntensity,
      rotation: 0,
    };
    addBlur(newBlur);

    // Ensure the blur is selected after state settles
    // This handles race conditions with state updates
    requestAnimationFrame(() => {
      setSelectedElement(newId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  const handleModeChange = (mode: BlurMode) => {
    const targetBlur = selectedBlur ?? activeBlur;
    if (targetBlur) {
      updateBlur(targetBlur.id, { mode });
    }
    setShowModeSelector(false);
  };

  // Handle intensity change during slider drag (no history)
  const handleIntensityChange = (intensity: number) => {
    const targetBlur = selectedBlur ?? activeBlur;
    if (targetBlur) {
      isDraggingSliderRef.current = true;
      updateBlurNoHistory(targetBlur.id, { intensity });
    }
  };

  // Commit intensity change when slider is released
  const handleIntensityCommit = () => {
    if (isDraggingSliderRef.current) {
      isDraggingSliderRef.current = false;
      commitToHistory();
    }
  };

  const handleDeleteBlur = () => {
    const targetBlur = selectedBlur ?? activeBlur;
    if (targetBlur) {
      removeBlur(targetBlur.id);
      setSelectedElement(null);
      createdBlurIdRef.current = null;
      // Deselect the blur tool when deleting
      setActiveTool("none");
    }
  };

  // Check if there are any blurs to show controls for
  const hasBlurs = state.blurs.length > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-4",
        className
      )}
    >
      {/* Show controls when there's an active blur, otherwise show hint to select */}
      {activeBlur ? (
        <>
          {/* Mode Selector */}
          <div className="relative">
            <button
              onClick={() => setShowModeSelector(!showModeSelector)}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              {activeBlur.mode === "normal" ? (
                <Sparkles className="w-4 h-4 text-white" />
              ) : (
                <Grid3X3 className="w-4 h-4 text-white" />
              )}
              <span className="text-white text-sm capitalize">
                {activeBlur.mode}
              </span>
              <ChevronUp
                className={cn(
                  "w-4 h-4 text-white transition-transform",
                  showModeSelector && "rotate-180"
                )}
              />
            </button>

            {/* Mode Dropdown */}
            {showModeSelector && (
              <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50">
                <button
                  onClick={() => handleModeChange("normal")}
                  className={cn(
                    "flex items-center gap-2 w-full px-4 py-2 text-sm text-white hover:bg-white/10",
                    activeBlur.mode === "normal" && "bg-white/10"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  Normal Blur
                </button>
                <button
                  onClick={() => handleModeChange("pixelate")}
                  className={cn(
                    "flex items-center gap-2 w-full px-4 py-2 text-sm text-white hover:bg-white/10",
                    activeBlur.mode === "pixelate" && "bg-white/10"
                  )}
                >
                  <Grid3X3 className="w-4 h-4" />
                  Pixelate
                </button>
              </div>
            )}
          </div>

          {/* Intensity Slider */}
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs">Intensity</span>
            <input
              type="range"
              min="10"
              max="100"
              value={activeBlur.intensity}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              onMouseUp={handleIntensityCommit}
              onTouchEnd={handleIntensityCommit}
              className="w-24 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          {/* Delete Button */}
          <button
            onClick={handleDeleteBlur}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Remove blur area"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </>
      ) : state.blurs.length > 0 ? (
        <p className="text-white/60 text-sm">Tap on a blur area to edit it</p>
      ) : null}
    </div>
  );
}
