"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { LABEL_COLORS, getContrastTextColor } from "./label-colors";

interface LabelColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  className?: string;
}

/**
 * A color picker component for selecting label colors
 * Displays a 5x4 grid of predefined colors
 */
export function LabelColorPicker({
  selectedColor,
  onColorSelect,
  className,
}: LabelColorPickerProps) {
  return (
    <div className={cn("grid grid-cols-5 gap-2", className)}>
      {LABEL_COLORS.map((color) => {
        const isSelected = selectedColor === color;
        const textColor = getContrastTextColor(color);

        return (
          <button
            key={color}
            type="button"
            onClick={() => onColorSelect(color)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all",
              "hover:scale-110 hover:ring-2 hover:ring-offset-2 hover:ring-offset-background",
              isSelected && "ring-2 ring-offset-2 ring-offset-background",
            )}
            style={{
              backgroundColor: color,
              ["--tw-ring-color" as string]: color,
            }}
            aria-label={`Select color ${color}`}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <Check
                className="w-4 h-4"
                style={{ color: textColor }}
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface LabelColorDotProps {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * A simple color dot indicator for labels
 */
export function LabelColorDot({
  color,
  size = "md",
  className,
}: LabelColorDotProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={cn(
        "rounded-full inline-block flex-shrink-0",
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}
