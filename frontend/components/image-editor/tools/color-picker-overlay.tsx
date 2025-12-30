/**
 * Color Picker Overlay Component
 * Full color spectrum picker with hex input
 */

"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ColorPickerOverlayProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  className?: string;
}

export function ColorPickerOverlay({
  color,
  onChange,
  onClose,
  className,
}: ColorPickerOverlayProps) {
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [hexInput, setHexInput] = useState(color);
  const gradientRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingGradient = useRef(false);
  const isDraggingHue = useRef(false);
  // Track the last color we sent to parent to avoid infinite loops
  const lastSentColorRef = useRef(color);
  // Track if this is the initial mount
  const isInitializedRef = useRef(false);

  // Parse initial color - only on mount or when color prop changes from external source
  useEffect(() => {
    // Skip if the color matches what we last sent (avoid loop)
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

  // Update hex when HSL changes - only notify parent if color actually changed
  useEffect(() => {
    // Skip on initial render before initialization
    if (!isInitializedRef.current) return;

    const hex = hslToHex(hue, saturation, lightness);
    setHexInput(hex);

    // Only call onChange if the color actually changed
    if (hex !== lastSentColorRef.current) {
      lastSentColorRef.current = hex;
      onChange(hex);
    }
  }, [hue, saturation, lightness, onChange]);

  const handleGradientMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!gradientRef.current) return;
    const rect = gradientRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    setSaturation(Math.round((x / rect.width) * 100));
    setLightness(Math.round(100 - (y / rect.height) * 100));
  }, []);

  const handleHueMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHue(Math.round((x / rect.width) * 360));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingGradient.current) {
        handleGradientMove(e);
      }
      if (isDraggingHue.current) {
        handleHueMove(e);
      }
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

  const handleHexSubmit = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      const hsl = hexToHsl(hexInput);
      if (hsl) {
        setHue(hsl.h);
        setSaturation(hsl.s);
        setLightness(hsl.l);
      }
    }
  };

  return (
    <div
      className={cn(
        "fixed p-4 bg-zinc-900 rounded-xl shadow-2xl border border-white/10",
        className
      )}
      style={{
        zIndex: 9999,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4 text-white/70" />
      </button>

      {/* Saturation/Lightness Gradient */}
      <div
        ref={gradientRef}
        className="w-48 h-36 rounded-lg cursor-crosshair relative mb-3"
        style={{
          background: `linear-gradient(to bottom, white, transparent, black), linear-gradient(to right, #888, hsl(${hue}, 100%, 50%))`,
          backgroundBlendMode: "multiply",
        }}
        onMouseDown={(e) => {
          isDraggingGradient.current = true;
          handleGradientMove(e);
        }}
      >
        {/* Picker Handle */}
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
        className="w-48 h-4 rounded-full cursor-pointer relative mb-4"
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
          className="absolute w-4 h-4 border-2 border-white rounded-full -translate-x-1/2 top-0 shadow-md pointer-events-none"
          style={{
            left: `${(hue / 360) * 100}%`,
            backgroundColor: `hsl(${hue}, 100%, 50%)`,
          }}
        />
      </div>

      {/* Color Preview & Hex Input */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-2 border-white/30"
          style={{ backgroundColor: hslToHex(hue, saturation, lightness) }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value.toUpperCase())}
          onBlur={handleHexSubmit}
          onKeyDown={(e) => e.key === "Enter" && handleHexSubmit()}
          className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm font-mono uppercase"
          placeholder="#FFFFFF"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// Helper functions
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
