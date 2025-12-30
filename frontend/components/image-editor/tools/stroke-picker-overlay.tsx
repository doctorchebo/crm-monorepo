/**
 * Stroke Picker Overlay Component
 * Combined color picker and stroke width slider for shapes
 *
 * Layout:
 * - Row 1: Default color circles + custom color button (horizontal)
 * - Row 2: Stroke width slider with triangle indicator (always visible)
 * - Custom color picker expands below colors when clicking the custom button
 */

"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_COLORS } from "../types";

interface StrokePickerOverlayProps {
  color: string;
  strokeWidth: number;
  minStrokeWidth?: number;
  maxStrokeWidth?: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onClose: () => void;
  className?: string;
}

export function StrokePickerOverlay({
  color,
  strokeWidth,
  minStrokeWidth = 1,
  maxStrokeWidth = 20,
  onColorChange,
  onStrokeWidthChange,
  onClose,
  className,
}: StrokePickerOverlayProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [hexInput, setHexInput] = useState(color);

  const gradientRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingGradient = useRef(false);
  const isDraggingHue = useRef(false);
  const lastSentColorRef = useRef(color);
  const isInitializedRef = useRef(false);

  // Parse initial color to HSL
  useEffect(() => {
    if (color === lastSentColorRef.current && isInitializedRef.current) {
      return;
    }

    if (color.startsWith("#")) {
      const hsl = hexToHsl(color);
      if (hsl) {
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
    }
    setHexInput(color);
    lastSentColorRef.current = color;
    isInitializedRef.current = true;
  }, [color]);

  // Update color when HSL changes in custom picker
  useEffect(() => {
    if (!isInitializedRef.current || !showCustomPicker) return;

    const hex = hslToHex(hue, saturation, lightness);
    setHexInput(hex);

    if (hex !== lastSentColorRef.current) {
      lastSentColorRef.current = hex;
      onColorChange(hex);
    }
  }, [hue, saturation, lightness, onColorChange, showCustomPicker]);

  // Handle gradient (saturation/lightness) movement
  const handleGradientMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!gradientRef.current) return;
    const rect = gradientRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setSaturation(Math.round((x / rect.width) * 100));
    setLightness(Math.round(100 - (y / rect.height) * 100));
  }, []);

  // Handle hue slider movement
  const handleHueMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHue(Math.round((x / rect.width) * 360));
  }, []);

  // Global mouse event handlers for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingGradient.current) handleGradientMove(e);
      if (isDraggingHue.current) handleHueMove(e);
    };

    const handleMouseUp = () => {
      isDraggingGradient.current = false;
      isDraggingHue.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleGradientMove, handleHueMove]);

  // Handle preset color selection
  const handlePresetColorSelect = (selectedColor: string) => {
    lastSentColorRef.current = selectedColor;
    setHexInput(selectedColor);
    const hsl = hexToHsl(selectedColor);
    if (hsl) {
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    }
    onColorChange(selectedColor);
  };

  // Handle hex input submit
  const handleHexSubmit = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      const hsl = hexToHsl(hexInput);
      if (hsl) {
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
      lastSentColorRef.current = hexInput;
      onColorChange(hexInput);
    }
  };

  // Check if current color is a preset
  const isPresetColor = DEFAULT_COLORS.slice(0, 8).some(
    (c) => c.toUpperCase() === color.toUpperCase()
  );

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 mb-2 p-3 bg-zinc-900 rounded-xl shadow-2xl border border-white/10 z-[9999] min-w-[220px]",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-3 h-3 text-white/70" />
      </button>

      {/* Color Selection Row - Always horizontal */}
      <div className="mb-3">
        <span className="text-white/60 text-xs mb-2 block">Color</span>
        <div className="flex items-center gap-1.5">
          {/* Preset Color Circles */}
          {DEFAULT_COLORS.slice(0, 8).map((presetColor) => (
            <button
              key={presetColor}
              onClick={() => handlePresetColorSelect(presetColor)}
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0",
                color.toUpperCase() === presetColor.toUpperCase()
                  ? "border-white scale-110"
                  : "border-white/30"
              )}
              style={{ backgroundColor: presetColor }}
              title={presetColor}
            />
          ))}

          {/* Custom Color Button */}
          <button
            onClick={() => setShowCustomPicker(!showCustomPicker)}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0",
              showCustomPicker || !isPresetColor
                ? "border-white"
                : "border-white/30"
            )}
            style={{
              background:
                "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
            }}
            title="Custom color"
          >
            <ChevronDown
              className={cn(
                "w-3 h-3 text-white drop-shadow-md transition-transform",
                showCustomPicker && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {/* Custom Color Picker (expandable section) */}
      {showCustomPicker && (
        <div className="mb-3 pt-3 border-t border-white/10 space-y-3">
          {/* Saturation/Lightness Gradient */}
          <div
            ref={gradientRef}
            className="w-full h-28 rounded-lg cursor-crosshair relative"
            style={{
              background: `linear-gradient(to bottom, white, transparent, black), linear-gradient(to right, #888, hsl(${hue}, 100%, 50%))`,
              backgroundBlendMode: "multiply",
            }}
            onMouseDown={(e) => {
              isDraggingGradient.current = true;
              handleGradientMove(e);
            }}
          >
            <div
              className="absolute w-4 h-4 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-md pointer-events-none"
              style={{
                left: `${saturation}%`,
                top: `${100 - lightness}%`,
                backgroundColor: hslToHex(hue, saturation, lightness),
              }}
            />
          </div>

          {/* Hue Slider */}
          <div
            ref={hueRef}
            className="w-full h-3 rounded-full cursor-pointer relative"
            style={{
              background:
                "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
            }}
            onMouseDown={(e) => {
              isDraggingHue.current = true;
              handleHueMove(e);
            }}
          >
            <div
              className="absolute w-3 h-3 border-2 border-white rounded-full -translate-x-1/2 top-0 shadow-md pointer-events-none"
              style={{
                left: `${(hue / 360) * 100}%`,
                backgroundColor: `hsl(${hue}, 100%, 50%)`,
              }}
            />
          </div>

          {/* Hex Input */}
          <input
            type="text"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value.toUpperCase())}
            onBlur={handleHexSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleHexSubmit()}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-xs font-mono uppercase"
            placeholder="#FFFFFF"
            maxLength={7}
          />
        </div>
      )}

      {/* Stroke Width Section - Always visible below colors */}
      <div className="pt-3 border-t border-white/10">
        <span className="text-white/60 text-xs mb-2 block">Stroke Width</span>
        <div className="flex items-center gap-2">
          {/* Triangle indicator background with slider */}
          <div className="relative w-full h-6 flex items-center">
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
            >
              <polygon
                points="0,20 100,4 100,20"
                fill="rgba(255,255,255,0.1)"
              />
            </svg>
            <input
              type="range"
              min={minStrokeWidth}
              max={maxStrokeWidth}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              className="relative z-10 w-full h-6 appearance-none bg-transparent cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none 
                [&::-webkit-slider-thumb]:w-4 
                [&::-webkit-slider-thumb]:h-4 
                [&::-webkit-slider-thumb]:bg-white 
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4 
                [&::-moz-range-thumb]:h-4 
                [&::-moz-range-thumb]:bg-white 
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-none
                [&::-moz-range-thumb]:shadow-md
                [&::-moz-range-thumb]:cursor-pointer"
            />
          </div>
          <span className="text-white text-xs min-w-[28px] text-right tabular-nums">
            {strokeWidth}px
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Helper Functions for Color Conversion
// ============================================

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
