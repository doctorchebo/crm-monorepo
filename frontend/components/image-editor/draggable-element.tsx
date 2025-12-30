/**
 * Draggable Element Component
 * A wrapper that makes any element draggable, resizable, and rotatable with anchor points
 */

"use client";

import { cn } from "@/lib/utils";
import { RotateCw, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface DraggableElementProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  isSelected: boolean;
  onSelect: () => void;
  onPositionChange: (x: number, y: number) => void;
  onSizeChange?: (width: number, height: number) => void;
  onRotationChange?: (rotation: number) => void;
  onDelete?: () => void;
  /** Called when drag/resize/rotate ends - for committing to history */
  onDragEnd?: () => void;
  children: React.ReactNode;
  className?: string;
  /** Whether to maintain aspect ratio when resizing */
  maintainAspectRatio?: boolean;
  /** Whether to show delete button */
  showDeleteButton?: boolean;
  /** Whether to show rotation handle */
  showRotationHandle?: boolean;
}

type ResizeHandle = "nw" | "n" | "ne" | "w" | "e" | "sw" | "s" | "se";

export function DraggableElement({
  x,
  y,
  width,
  height,
  rotation = 0,
  isSelected,
  onSelect,
  onPositionChange,
  onSizeChange,
  onRotationChange,
  onDelete,
  onDragEnd,
  children,
  className,
  maintainAspectRatio = false,
  showDeleteButton = true,
  showRotationHandle = true,
}: DraggableElementProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });
  const startMousePos = useRef({ x: 0, y: 0 });
  const startRotation = useRef(0);
  const centerRef = useRef({ x: 0, y: 0 });
  const aspectRatio = useRef(width / height);

  // Handle mouse down for dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();

      // Allow dragging from any part of the element that has drag-area class
      const target = e.target as HTMLElement;
      const dragArea = elementRef.current?.querySelector(".drag-area");
      if (!dragArea?.contains(target) && target !== dragArea) {
        return;
      }

      setIsDragging(true);
      startPos.current = { x, y };
      startMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [x, y, onSelect]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      e.preventDefault();

      setIsResizing(true);
      setActiveHandle(handle);
      startPos.current = { x, y };
      startSize.current = { width, height };
      startMousePos.current = { x: e.clientX, y: e.clientY };
      aspectRatio.current = width / height;
    },
    [x, y, width, height]
  );

  // Handle rotation start
  const handleRotationStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!elementRef.current) return;

      setIsRotating(true);
      startRotation.current = rotation;

      // Calculate element center in screen coordinates
      const rect = elementRef.current.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      startMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [rotation]
  );

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - startMousePos.current.x;
        const dy = e.clientY - startMousePos.current.y;
        onPositionChange(startPos.current.x + dx, startPos.current.y + dy);
      }

      if (isResizing && activeHandle && onSizeChange) {
        const dx = e.clientX - startMousePos.current.x;
        const dy = e.clientY - startMousePos.current.y;

        let newWidth = startSize.current.width;
        let newHeight = startSize.current.height;
        let newX = startPos.current.x;
        let newY = startPos.current.y;

        // Calculate new size based on handle
        switch (activeHandle) {
          case "e":
            newWidth = Math.max(20, startSize.current.width + dx);
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio.current;
            }
            break;
          case "w":
            newWidth = Math.max(20, startSize.current.width - dx);
            newX = startPos.current.x + dx;
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio.current;
            }
            break;
          case "s":
            newHeight = Math.max(20, startSize.current.height + dy);
            if (maintainAspectRatio) {
              newWidth = newHeight * aspectRatio.current;
            }
            break;
          case "n":
            newHeight = Math.max(20, startSize.current.height - dy);
            newY = startPos.current.y + dy;
            if (maintainAspectRatio) {
              newWidth = newHeight * aspectRatio.current;
            }
            break;
          case "se":
            if (maintainAspectRatio) {
              const delta = Math.max(dx, dy);
              newWidth = Math.max(20, startSize.current.width + delta);
              newHeight = newWidth / aspectRatio.current;
            } else {
              newWidth = Math.max(20, startSize.current.width + dx);
              newHeight = Math.max(20, startSize.current.height + dy);
            }
            break;
          case "sw":
            if (maintainAspectRatio) {
              newWidth = Math.max(20, startSize.current.width - dx);
              newHeight = newWidth / aspectRatio.current;
              newX = startPos.current.x + dx;
            } else {
              newWidth = Math.max(20, startSize.current.width - dx);
              newHeight = Math.max(20, startSize.current.height + dy);
              newX = startPos.current.x + dx;
            }
            break;
          case "ne":
            if (maintainAspectRatio) {
              newWidth = Math.max(20, startSize.current.width + dx);
              newHeight = newWidth / aspectRatio.current;
              const heightDiff = newHeight - startSize.current.height;
              newY = startPos.current.y - heightDiff;
            } else {
              newWidth = Math.max(20, startSize.current.width + dx);
              newHeight = Math.max(20, startSize.current.height - dy);
              newY = startPos.current.y + dy;
            }
            break;
          case "nw":
            if (maintainAspectRatio) {
              const delta = Math.max(-dx, -dy);
              newWidth = Math.max(20, startSize.current.width + delta);
              newHeight = newWidth / aspectRatio.current;
              newX = startPos.current.x - delta;
              newY =
                startPos.current.y - (newHeight - startSize.current.height);
            } else {
              newWidth = Math.max(20, startSize.current.width - dx);
              newHeight = Math.max(20, startSize.current.height - dy);
              newX = startPos.current.x + dx;
              newY = startPos.current.y + dy;
            }
            break;
        }

        onSizeChange(newWidth, newHeight);
        if (newX !== x || newY !== y) {
          onPositionChange(newX, newY);
        }
      }

      // Handle rotation
      if (isRotating && onRotationChange) {
        // Calculate angle from center to current mouse position
        const currentAngle = Math.atan2(
          e.clientY - centerRef.current.y,
          e.clientX - centerRef.current.x
        );
        // Calculate angle from center to start mouse position
        const startAngle = Math.atan2(
          startMousePos.current.y - centerRef.current.y,
          startMousePos.current.x - centerRef.current.x
        );
        // Calculate rotation delta in degrees
        const angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
        // Apply rotation, keeping it in 0-360 range
        let newRotation = (startRotation.current + angleDelta) % 360;
        if (newRotation < 0) newRotation += 360;

        // Snap to 15-degree increments when holding Shift
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }

        onRotationChange(newRotation);
      }
    };

    const handleMouseUp = () => {
      const wasInteracting = isDragging || isResizing || isRotating;
      setIsDragging(false);
      setIsResizing(false);
      setIsRotating(false);
      setActiveHandle(null);

      // Commit to history after drag/resize/rotate ends
      if (wasInteracting && onDragEnd) {
        onDragEnd();
      }
    };

    if (isDragging || isResizing || isRotating) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [
    isDragging,
    isResizing,
    isRotating,
    activeHandle,
    maintainAspectRatio,
    onPositionChange,
    onSizeChange,
    onRotationChange,
    onDragEnd,
    x,
    y,
  ]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSelected && (e.key === "Delete" || e.key === "Backspace")) {
        // Don't delete if typing in an input
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }
        e.preventDefault();
        onDelete?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, onDelete]);

  return (
    <div
      ref={elementRef}
      className={cn("absolute", isDragging && "cursor-grabbing", className)}
      style={{
        left: x,
        top: y,
        width,
        height,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
        zIndex: isSelected ? 1000 : 1, // Ensure elements are above canvas, selected on top
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drag Area */}
      <div
        className={cn(
          "drag-area w-full h-full cursor-grab flex items-center justify-center",
          isSelected && "ring-2 ring-primary ring-offset-1",
          isDragging && "cursor-grabbing"
        )}
      >
        {children}
      </div>

      {/* Resize Handles - only show when selected */}
      {isSelected && onSizeChange && (
        <>
          {/* Corner Handles */}
          <ResizeHandleCorner
            position="nw"
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <ResizeHandleCorner
            position="ne"
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <ResizeHandleCorner
            position="sw"
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <ResizeHandleCorner
            position="se"
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />

          {/* Edge Handles */}
          {!maintainAspectRatio && (
            <>
              <ResizeHandleEdge
                position="n"
                onMouseDown={(e) => handleResizeStart(e, "n")}
              />
              <ResizeHandleEdge
                position="s"
                onMouseDown={(e) => handleResizeStart(e, "s")}
              />
              <ResizeHandleEdge
                position="w"
                onMouseDown={(e) => handleResizeStart(e, "w")}
              />
              <ResizeHandleEdge
                position="e"
                onMouseDown={(e) => handleResizeStart(e, "e")}
              />
            </>
          )}

          {/* Rotation Handle - positioned below the element */}
          {showRotationHandle && onRotationChange && (
            <div
              className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center"
              onMouseDown={handleRotationStart}
            >
              {/* Connecting line */}
              <div className="w-px h-4 bg-primary" />
              {/* Rotation circle */}
              <div
                className="w-5 h-5 rounded-full bg-white border-2 border-primary flex items-center justify-center cursor-grab hover:bg-primary hover:text-white transition-colors shadow-md"
                title="Drag to rotate (hold Shift for 15° snap)"
              >
                <RotateCw className="w-3 h-3" />
              </div>
            </div>
          )}

          {/* Delete Button */}
          {showDeleteButton && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 p-1.5 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors shadow-lg"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Corner resize handle component
function ResizeHandleCorner({
  position,
  onMouseDown,
}: {
  position: "nw" | "ne" | "sw" | "se";
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const positionClasses = {
    nw: "-top-1.5 -left-1.5 cursor-nw-resize",
    ne: "-top-1.5 -right-1.5 cursor-ne-resize",
    sw: "-bottom-1.5 -left-1.5 cursor-sw-resize",
    se: "-bottom-1.5 -right-1.5 cursor-se-resize",
  };

  return (
    <div
      className={cn(
        "absolute w-3 h-3 bg-white border-2 border-primary rounded-full z-10",
        positionClasses[position]
      )}
      onMouseDown={onMouseDown}
    />
  );
}

// Edge resize handle component
function ResizeHandleEdge({
  position,
  onMouseDown,
}: {
  position: "n" | "s" | "w" | "e";
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const positionClasses = {
    n: "-top-1 left-1/2 -translate-x-1/2 cursor-n-resize w-6 h-2",
    s: "-bottom-1 left-1/2 -translate-x-1/2 cursor-s-resize w-6 h-2",
    w: "top-1/2 -left-1 -translate-y-1/2 cursor-w-resize w-2 h-6",
    e: "top-1/2 -right-1 -translate-y-1/2 cursor-e-resize w-2 h-6",
  };

  return (
    <div
      className={cn(
        "absolute bg-white border border-primary rounded-sm z-10",
        positionClasses[position]
      )}
      onMouseDown={onMouseDown}
    />
  );
}
