/**
 * Text Tool Component
 * Comprehensive text editing with color picker, font selector, background toggle, and delete
 */

"use client";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  RectangleHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  dimensionToNormalized,
  pixelsToNormalized,
  sizeToNormalized,
} from "../coordinate-utils";
import { useEditorContext } from "../editor-context";
import {
  DEFAULT_COLORS,
  generateElementId,
  TEXT_FONTS,
  TextFontId,
} from "../types";
import { ColorPickerOverlay } from "./color-picker-overlay";

interface TextToolProps {
  className?: string;
  /** Canvas dimensions for centering */
  canvasWidth: number;
  canvasHeight: number;
  /** ID of text element that was selected when tool was activated (to skip auto-create) */
  selectedTextId?: string | null;
}

export function TextTool({
  className,
  canvasWidth,
  canvasHeight,
  selectedTextId,
}: TextToolProps) {
  const {
    addText,
    updateText,
    removeText,
    state,
    updateStateNoHistory,
    setSelectedElement,
    setActiveTool,
  } = useEditorContext();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSelector, setShowFontSelector] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSelectorRef = useRef<HTMLDivElement>(null);

  // Use a ref to track if we've already added a text element in this mount cycle
  const hasInitializedRef = useRef(false);
  // Track the ID of the text we created
  const createdTextIdRef = useRef<string | null>(null);

  // Get currently selected text if any
  const selectedText = state.texts.find(
    (t) => t.id === state.selectedElementId
  );

  // Get the text we just created (for controls when nothing is selected)
  const activeText =
    selectedText ?? state.texts.find((t) => t.id === createdTextIdRef.current);

  // Current color is from the active text, or the default text color
  const currentColor =
    activeText?.color ?? state.textColor ?? DEFAULT_COLORS[0];

  // Current font family
  const currentFont =
    activeText?.fontFamily ??
    TEXT_FONTS.find((f) => f.id === "arial")?.family ??
    TEXT_FONTS[0].family;
  const currentFontLabel =
    TEXT_FONTS.find((f) => f.family === currentFont)?.label ?? "Arial";

  // Current background state
  const showBackground = activeText?.showBackground ?? true;

  // Use a ref to track the latest texts for cleanup
  const textsRef = useRef(state.texts);
  useEffect(() => {
    textsRef.current = state.texts;
  }, [state.texts]);

  // Cleanup on unmount: remove empty text when tool is deselected
  useEffect(() => {
    return () => {
      // On unmount, check if the created text is empty and remove it
      if (createdTextIdRef.current) {
        const textToCheck = textsRef.current.find(
          (t) => t.id === createdTextIdRef.current
        );
        if (
          textToCheck &&
          (textToCheck.text === "Type here" || textToCheck.text.trim() === "")
        ) {
          removeText(textToCheck.id);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run cleanup on unmount

  // Auto-add text when tool is selected from toolbar (not when clicking existing text)
  // This effect runs once on mount. If selectedTextId is set, user clicked an existing text.
  useEffect(() => {
    // Skip if already initialized or if canvas not ready
    if (hasInitializedRef.current || canvasWidth === 0 || canvasHeight === 0) {
      return;
    }

    // Mark as initialized immediately to prevent double execution
    hasInitializedRef.current = true;

    // If a text is already selected (user clicked on existing text), don't create new
    if (selectedTextId) {
      return;
    }

    // Also check state directly as a fallback
    if (
      state.selectedElementId &&
      state.texts.some((t) => t.id === state.selectedElementId)
    ) {
      return;
    }

    // Create new text element
    const newId = generateElementId();
    createdTextIdRef.current = newId;

    // Calculate pixel values first
    const pixelX = canvasWidth / 2 - 100;
    const pixelY = canvasHeight / 2 - 25;
    const pixelWidth = 200;
    const pixelHeight = 50;
    const pixelFontSize = 24;

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
    const normalizedFontSize = dimensionToNormalized(
      pixelFontSize,
      canvasWidth,
      canvasHeight
    );

    const newText = {
      id: newId,
      text: "Type here",
      x: normalizedPos.x,
      y: normalizedPos.y,
      width: normalizedSize.width,
      height: normalizedSize.height,
      fontSize: normalizedFontSize,
      fontFamily: TEXT_FONTS[0].family,
      color: state.textColor || DEFAULT_COLORS[0],
      showBackground: true,
      rotation: 0,
      isBold: false,
      isItalic: false,
      isNewlyCreated: true, // Start in edit mode
    };
    addText(newText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Handle click outside to close pickers
  useEffect(() => {
    if (!showColorPicker && !showFontSelector) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        showColorPicker &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
      if (
        showFontSelector &&
        fontSelectorRef.current &&
        !fontSelectorRef.current.contains(e.target as Node)
      ) {
        setShowFontSelector(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showColorPicker, showFontSelector]);

  // Handle color change - updates both the preference and the active text
  const handleColorChange = (color: string) => {
    // Update the preference for future texts
    updateStateNoHistory({ textColor: color });

    // Update the active text element
    const targetText = selectedText ?? activeText;
    if (targetText) {
      updateText(targetText.id, { color });
    }
  };

  // Handle font change
  const handleFontChange = (fontId: TextFontId) => {
    const font = TEXT_FONTS.find((f) => f.id === fontId);
    if (!font) return;

    const targetText = selectedText ?? activeText;
    if (targetText) {
      updateText(targetText.id, { fontFamily: font.family });
    }
    setShowFontSelector(false);
  };

  // Handle background toggle
  const handleBackgroundToggle = () => {
    const targetText = selectedText ?? activeText;
    if (targetText) {
      updateText(targetText.id, { showBackground: !targetText.showBackground });
    }
  };

  // Handle delete
  const handleDelete = () => {
    const targetText = selectedText ?? activeText;
    if (targetText) {
      removeText(targetText.id);
      setSelectedElement(null);
      createdTextIdRef.current = null;
      // Deselect the text tool when deleting
      setActiveTool("none");
    }
  };

  // Check if we have an active text to show controls
  const hasActiveText = !!activeText;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-wrap items-center justify-center gap-3",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color Picker Overlay */}
      {showColorPicker && (
        <ColorPickerOverlay
          color={currentColor}
          onChange={handleColorChange}
          onClose={() => setShowColorPicker(false)}
        />
      )}

      {hasActiveText ? (
        <>
          {/* Color Section - no indicator, just quick colors and picker */}
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs">Color:</span>
            {/* Quick Color Circles */}
            <div className="flex gap-1">
              {DEFAULT_COLORS.slice(0, 6).map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                    currentColor === color
                      ? "border-white scale-110"
                      : "border-white/30"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            {/* More Colors Button */}
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              title={showColorPicker ? "Close Color Picker" : "More Colors"}
            >
              <ChevronUp
                className={cn(
                  "w-3 h-3 text-white transition-transform duration-200",
                  showColorPicker && "rotate-180"
                )}
              />
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/20" />

          {/* Font Selector */}
          <div className="relative" ref={fontSelectorRef}>
            <button
              onClick={() => setShowFontSelector(!showFontSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              <span className="text-white text-sm">{currentFontLabel}</span>
              <ChevronDown
                className={cn(
                  "w-3 h-3 text-white transition-transform",
                  showFontSelector && "rotate-180"
                )}
              />
            </button>

            {/* Font Dropdown */}
            {showFontSelector && (
              <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50 min-w-[140px]">
                {TEXT_FONTS.map((font) => (
                  <button
                    key={font.id}
                    onClick={() => handleFontChange(font.id)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors",
                      currentFont === font.family && "bg-white/10"
                    )}
                    style={{ fontFamily: font.family }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/20" />

          {/* Background Toggle */}
          <button
            onClick={handleBackgroundToggle}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
              showBackground
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white/60 hover:bg-white/15"
            )}
            title={showBackground ? "Hide Background" : "Show Background"}
          >
            <RectangleHorizontal className="w-4 h-4" />
            <span className="text-xs">BG</span>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-white/20" />

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete text"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </>
      ) : state.texts.length > 0 ? (
        <p className="text-white/60 text-sm">Tap on a text to edit it</p>
      ) : null}
    </div>
  );
}
