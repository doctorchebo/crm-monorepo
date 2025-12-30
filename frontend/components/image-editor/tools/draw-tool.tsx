/**
 * Draw Tool Component
 * Provides color picker and stroke width controls for drawing
 */

"use client";

import { cn } from "@/lib/utils";
import { ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEditorContext } from "../editor-context";
import { DEFAULT_COLORS } from "../types";
import { ColorPickerOverlay } from "./color-picker-overlay";

interface DrawToolProps {
  className?: string;
}

export function DrawTool({ className }: DrawToolProps) {
  const { state, updateStateNoHistory, setActiveTool } = useEditorContext();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleColorChange = (color: string) => {
    updateStateNoHistory({ drawColor: color });
  };

  // Handle click outside to close color picker
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };

    // Use setTimeout to avoid immediate close from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColorPicker]);

  // Handle click outside the draw tool panel AND canvas to deselect the tool
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the draw tool container
      if (containerRef.current?.contains(target)) {
        return;
      }

      // Check if click is on the canvas (where drawing happens)
      if (target.tagName === "CANVAS") {
        return;
      }

      // Check if click is on the draw tool button in the toolbar
      if (target.closest('[data-tool="draw"]')) {
        return;
      }

      // Click was outside - deselect the draw tool
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
  }, [setActiveTool]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Color Picker Overlay - fixed positioned modal */}
      {showColorPicker && (
        <ColorPickerOverlay
          color={state.drawColor}
          onChange={handleColorChange}
          onClose={() => setShowColorPicker(false)}
        />
      )}

      <div className="flex items-center justify-center gap-2">
        {/* Quick Color Circles */}
        {DEFAULT_COLORS.slice(0, 8).map((color) => (
          <button
            key={color}
            onClick={() => handleColorChange(color)}
            className={cn(
              "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
              state.drawColor === color
                ? "border-white scale-110"
                : "border-white/30"
            )}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}

        {/* More Colors Button with rotating chevron */}
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          title={showColorPicker ? "Close Color Picker" : "More Colors"}
        >
          <ChevronUp
            className={cn(
              "w-4 h-4 text-white transition-transform duration-200",
              showColorPicker && "rotate-180"
            )}
          />
        </button>
      </div>
    </div>
  );
}
