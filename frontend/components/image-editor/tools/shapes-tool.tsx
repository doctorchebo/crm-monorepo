/**
 * Shapes Tool Component
 * Comprehensive shape editing with type selector, outline color/width picker, and delete
 */

"use client";

import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ChevronDown,
  Circle,
  Minus,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  dimensionToNormalized,
  normalizedToDimension,
  pixelsToNormalized,
  sizeToNormalized,
} from "../coordinate-utils";
import { useEditorContext } from "../editor-context";
import {
  ArrowShape,
  CircleShape,
  generateElementId,
  LineShape,
  RectangleShape,
  ShapeType,
} from "../types";
import { StrokePickerOverlay } from "./stroke-picker-overlay";

interface ShapesToolProps {
  className?: string;
  /** Canvas dimensions for centering */
  canvasWidth: number;
  canvasHeight: number;
  /** ID of shape element that was selected when tool was activated (to skip auto-create) */
  selectedShapeId?: string | null;
}

const SHAPE_OPTIONS: {
  type: ShapeType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { type: "rectangle", icon: Square, label: "Rectangle" },
  { type: "circle", icon: Circle, label: "Circle" },
  { type: "line", icon: Minus, label: "Line" },
  { type: "arrow", icon: ArrowRight, label: "Arrow" },
];

export function ShapesTool({
  className,
  canvasWidth,
  canvasHeight,
  selectedShapeId,
}: ShapesToolProps) {
  const {
    addShape,
    updateShape,
    removeShape,
    state,
    updateStateNoHistory,
    setSelectedElement,
    setActiveTool,
  } = useEditorContext();

  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokePickerRef = useRef<HTMLDivElement>(null);

  // Track the ID of the shape we created
  const createdShapeIdRef = useRef<string | null>(null);

  // Get currently selected shape if any
  const selectedShape = state.shapes.find(
    (s) => s.id === state.selectedElementId
  );

  // Get the shape we just created (for controls when nothing is selected)
  const activeShape =
    selectedShape ??
    state.shapes.find((s) => s.id === createdShapeIdRef.current);

  // Current color and stroke width from active shape or defaults
  const currentColor = activeShape?.color ?? state.shapeColor ?? "#FF0000";
  const currentStrokeWidth = activeShape
    ? normalizedToDimension(activeShape.strokeWidth, canvasWidth, canvasHeight)
    : 3;

  // Handle click outside to close stroke picker
  useEffect(() => {
    if (!showStrokePicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        strokePickerRef.current &&
        !strokePickerRef.current.contains(e.target as Node)
      ) {
        setShowStrokePicker(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStrokePicker]);

  const createShape = (
    type: ShapeType
  ): RectangleShape | CircleShape | LineShape | ArrowShape => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const defaultSize = 100;

    const normalizedStrokeWidth = dimensionToNormalized(
      3,
      canvasWidth,
      canvasHeight
    );

    switch (type) {
      case "rectangle": {
        const pixelX = centerX - defaultSize / 2;
        const pixelY = centerY - defaultSize / 2;
        const normalizedPos = pixelsToNormalized(
          pixelX,
          pixelY,
          canvasWidth,
          canvasHeight
        );
        const normalizedSize = sizeToNormalized(
          defaultSize,
          defaultSize * 0.7,
          canvasWidth,
          canvasHeight
        );
        return {
          id: generateElementId(),
          type: "rectangle",
          x: normalizedPos.x,
          y: normalizedPos.y,
          width: normalizedSize.width,
          height: normalizedSize.height,
          color: state.shapeColor,
          strokeWidth: normalizedStrokeWidth,
          rotation: 0,
        };
      }
      case "circle": {
        const pixelX = centerX - defaultSize / 2;
        const pixelY = centerY - defaultSize / 2;
        const normalizedPos = pixelsToNormalized(
          pixelX,
          pixelY,
          canvasWidth,
          canvasHeight
        );
        const normalizedRadiusX = defaultSize / 2 / canvasWidth;
        const normalizedRadiusY = defaultSize / 2 / canvasHeight;
        return {
          id: generateElementId(),
          type: "circle",
          x: normalizedPos.x,
          y: normalizedPos.y,
          radiusX: normalizedRadiusX,
          radiusY: normalizedRadiusY,
          color: state.shapeColor,
          strokeWidth: normalizedStrokeWidth,
          rotation: 0,
        };
      }
      case "line": {
        const startX = centerX - defaultSize / 2;
        const startY = centerY;
        const endX = centerX + defaultSize / 2;
        const endY = centerY;
        const normalizedStart = pixelsToNormalized(
          startX,
          startY,
          canvasWidth,
          canvasHeight
        );
        const normalizedEnd = pixelsToNormalized(
          endX,
          endY,
          canvasWidth,
          canvasHeight
        );
        return {
          id: generateElementId(),
          type: "line",
          x: normalizedStart.x,
          y: normalizedStart.y,
          endX: normalizedEnd.x,
          endY: normalizedEnd.y,
          color: state.shapeColor,
          strokeWidth: normalizedStrokeWidth,
          rotation: 0,
        };
      }
      case "arrow": {
        const startX = centerX - defaultSize / 2;
        const startY = centerY;
        const endX = centerX + defaultSize / 2;
        const endY = centerY;
        const normalizedStart = pixelsToNormalized(
          startX,
          startY,
          canvasWidth,
          canvasHeight
        );
        const normalizedEnd = pixelsToNormalized(
          endX,
          endY,
          canvasWidth,
          canvasHeight
        );
        return {
          id: generateElementId(),
          type: "arrow",
          x: normalizedStart.x,
          y: normalizedStart.y,
          endX: normalizedEnd.x,
          endY: normalizedEnd.y,
          color: state.shapeColor,
          strokeWidth: normalizedStrokeWidth,
          rotation: 0,
        };
      }
    }
  };

  // Handle adding a new shape (when clicking shape type buttons)
  const handleAddShape = (type: ShapeType) => {
    const newShape = createShape(type);
    createdShapeIdRef.current = newShape.id;
    addShape(newShape);
    setSelectedElement(newShape.id);
  };

  // Handle color change
  const handleColorChange = (color: string) => {
    // Update the preference for future shapes
    updateStateNoHistory({ shapeColor: color });

    // Update the active shape element
    const targetShape = selectedShape ?? activeShape;
    if (targetShape) {
      updateShape(targetShape.id, { color });
    }
  };

  // Handle stroke width change
  const handleStrokeWidthChange = (pixelWidth: number) => {
    const targetShape = selectedShape ?? activeShape;
    if (targetShape) {
      const normalizedWidth = dimensionToNormalized(
        pixelWidth,
        canvasWidth,
        canvasHeight
      );
      updateShape(targetShape.id, { strokeWidth: normalizedWidth });
    }
  };

  // Handle delete
  const handleDelete = () => {
    const targetShape = selectedShape ?? activeShape;
    if (targetShape) {
      removeShape(targetShape.id);
      setSelectedElement(null);
      createdShapeIdRef.current = null;
      // Deselect the shapes tool when deleting
      setActiveTool("none");
    }
  };

  // Check if we have an active shape to show controls
  const hasActiveShape = !!activeShape;

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
      {/* Shape Type Buttons */}
      <div className="flex items-center gap-1">
        {SHAPE_OPTIONS.map(({ type, icon: Icon, label }) => (
          <button
            key={type}
            onClick={() => handleAddShape(type)}
            className={cn(
              "flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all",
              activeShape?.type === type
                ? "bg-white/20 ring-1 ring-white/40"
                : "hover:bg-white/10"
            )}
            title={label}
          >
            <Icon className="w-5 h-5 text-white" />
            <span className="text-[10px] text-white/70">{label}</span>
          </button>
        ))}
      </div>

      {hasActiveShape && (
        <>
          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Stroke Picker Button */}
          <div className="relative" ref={strokePickerRef}>
            <button
              onClick={() => setShowStrokePicker(!showStrokePicker)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              title="Outline color & width"
            >
              {/* Color circle with current color */}
              <div
                className="w-5 h-5 rounded-full border-2 border-white/50"
                style={{ backgroundColor: currentColor }}
              />
              <ChevronDown
                className={cn(
                  "w-3 h-3 text-white transition-transform",
                  showStrokePicker && "rotate-180"
                )}
              />
            </button>

            {/* Stroke Picker Overlay */}
            {showStrokePicker && (
              <StrokePickerOverlay
                color={currentColor}
                strokeWidth={Math.round(currentStrokeWidth)}
                minStrokeWidth={1}
                maxStrokeWidth={20}
                onColorChange={handleColorChange}
                onStrokeWidthChange={handleStrokeWidthChange}
                onClose={() => setShowStrokePicker(false)}
              />
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-white/20" />

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete shape"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
