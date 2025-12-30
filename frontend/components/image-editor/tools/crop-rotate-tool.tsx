/**
 * Crop & Rotate Tool Component
 * Provides crop handles, rotate buttons, and flip buttons
 */

"use client";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Maximize2,
  Monitor,
  RotateCcw,
  RotateCw,
  Smartphone,
  Square,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEditorContext } from "../editor-context";

interface CropRotateToolProps {
  className?: string;
}

type AspectRatioPreset =
  | "free"
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "original";

const ASPECT_RATIO_OPTIONS: {
  id: AspectRatioPreset;
  label: string;
  ratio: number | null;
  icon?: React.ReactNode;
}[] = [
  {
    id: "free",
    label: "Free",
    ratio: null,
    icon: <Maximize2 className="w-4 h-4" />,
  },
  { id: "1:1", label: "1:1", ratio: 1, icon: <Square className="w-4 h-4" /> },
  {
    id: "4:3",
    label: "4:3",
    ratio: 4 / 3,
    icon: <Monitor className="w-4 h-4" />,
  },
  {
    id: "3:4",
    label: "3:4",
    ratio: 3 / 4,
    icon: <Smartphone className="w-4 h-4" />,
  },
  {
    id: "16:9",
    label: "16:9",
    ratio: 16 / 9,
    icon: <Monitor className="w-4 h-4" />,
  },
  {
    id: "9:16",
    label: "9:16",
    ratio: 9 / 16,
    icon: <Smartphone className="w-4 h-4" />,
  },
  { id: "original", label: "Original", ratio: null },
];

export function CropRotateTool({ className }: CropRotateToolProps) {
  const { rotateImage, setCrop, setCropNoHistory, resetCropRotate, state } =
    useEditorContext();
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>("free");
  const [showCropOverlay, setShowCropOverlay] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use canvas dimensions from state
  const canvasWidth = state.canvasDimensions.width;
  const canvasHeight = state.canvasDimensions.height;

  const hasChanges =
    state.cropRotate.rotation !== 0 ||
    state.cropRotate.flipHorizontal ||
    state.cropRotate.flipVertical ||
    state.cropRotate.crop !== null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize crop overlay when tool is selected
  // This effect runs whenever the component mounts or canvas dimensions change
  // It ensures the crop area is always set when dimensions are available
  useEffect(() => {
    // Wait for valid canvas dimensions before initializing crop
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }

    // If no crop area is set, initialize it to full canvas
    // This handles both initial mount and undo scenarios where crop becomes null
    if (!state.cropRotate.crop) {
      setCropNoHistory({
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      });
    } else {
      // If crop exists but doesn't match current dimensions (e.g., after undo with different image),
      // validate and adjust if necessary
      const currentCrop = state.cropRotate.crop;
      const needsAdjustment =
        currentCrop.x + currentCrop.width > canvasWidth ||
        currentCrop.y + currentCrop.height > canvasHeight ||
        currentCrop.width <= 0 ||
        currentCrop.height <= 0;

      if (needsAdjustment) {
        // Reset to full canvas if current crop is invalid for these dimensions
        setCropNoHistory({
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        });
      }
    }

    setShowCropOverlay(true);
    return () => setShowCropOverlay(false);
  }, [canvasWidth, canvasHeight, state.cropRotate.crop, setCropNoHistory]);

  const handleAspectRatioChange = (preset: AspectRatioPreset) => {
    setAspectRatio(preset);
    setDropdownOpen(false);

    if (!canvasWidth || !canvasHeight) return;

    const option = ASPECT_RATIO_OPTIONS.find((o) => o.id === preset);
    if (!option) return;

    let newCrop: { x: number; y: number; width: number; height: number };

    if (preset === "original" || preset === "free") {
      // Full image
      newCrop = {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      };
    } else if (option.ratio) {
      // Calculate crop area based on aspect ratio
      const targetRatio = option.ratio;
      const currentRatio = canvasWidth / canvasHeight;

      let cropWidth: number;
      let cropHeight: number;

      if (currentRatio > targetRatio) {
        // Canvas is wider than target - fit to height
        cropHeight = canvasHeight;
        cropWidth = cropHeight * targetRatio;
      } else {
        // Canvas is taller than target - fit to width
        cropWidth = canvasWidth;
        cropHeight = cropWidth / targetRatio;
      }

      newCrop = {
        x: (canvasWidth - cropWidth) / 2,
        y: (canvasHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
      };
    } else {
      newCrop = state.cropRotate.crop || {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
      };
    }

    setCrop(newCrop);
  };

  const currentOption = ASPECT_RATIO_OPTIONS.find((o) => o.id === aspectRatio);

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      {/* Aspect Ratio Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            "bg-white/10 text-white hover:bg-white/20"
          )}
        >
          {currentOption?.icon}
          <span>{currentOption?.label || "Free"}</span>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              dropdownOpen && "rotate-180"
            )}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 py-1 bg-zinc-800 rounded-lg shadow-lg border border-white/10 min-w-[140px] z-50">
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleAspectRatioChange(option.id)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left",
                  aspectRatio === option.id
                    ? "bg-primary/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                {option.icon || <div className="w-4 h-4" />}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/20" />

      {/* Rotate Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => rotateImage("left")}
          className="flex flex-col items-center gap-1 p-2.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Rotate Left"
        >
          <RotateCcw className="w-5 h-5 text-white" />
        </button>

        <button
          onClick={() => rotateImage("right")}
          className="flex flex-col items-center gap-1 p-2.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Rotate Right"
        >
          <RotateCw className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/20" />

      {/* Reset Button */}
      <button
        onClick={resetCropRotate}
        disabled={!hasChanges}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors",
          hasChanges
            ? "hover:bg-white/10 text-white"
            : "text-white/30 cursor-not-allowed"
        )}
        title="Reset All"
      >
        <Undo2 className="w-4 h-4" />
        <span className="text-sm">Reset</span>
      </button>
    </div>
  );
}
