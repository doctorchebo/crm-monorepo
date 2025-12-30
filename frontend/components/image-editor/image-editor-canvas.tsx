/**
 * Image Editor Canvas
 * Main canvas component that renders the image with all edits
 * Handles drawing, element interaction, and real-time preview
 *
 * COORDINATE SYSTEM:
 * - Elements are stored in NORMALIZED coordinates (0-1 range)
 * - This component converts to PIXEL coordinates for rendering
 * - Position updates from drag are converted back to normalized before storing
 */

"use client";

import { cn } from "@/lib/utils";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { pixelate, stackBlur } from "./blur-utils";
import {
  blurToPixels,
  dimensionToNormalized,
  drawPathToPixels,
  emojiToPixels,
  pixelsToNormalized,
  shapeToPixels,
  sizeToNormalized,
  textToPixels,
} from "./coordinate-utils";
import { DraggableElement } from "./draggable-element";
import { useEditorContext } from "./editor-context";
import { TextElementRenderer } from "./text-element-renderer";
import {
  DrawPath,
  EmojiElement,
  IMAGE_FILTERS,
  Shape,
  TextElement,
} from "./types";

export interface ImageEditorCanvasRef {
  getCanvas: () => HTMLCanvasElement | null;
  getDimensions: () => { width: number; height: number };
}

interface ImageEditorCanvasProps {
  className?: string;
  maxWidth?: number;
  maxHeight?: number;
}

export const ImageEditorCanvas = React.forwardRef<
  ImageEditorCanvasRef,
  ImageEditorCanvasProps
>(function ImageEditorCanvas(
  { className, maxWidth = 600, maxHeight = 400 },
  ref
) {
  const {
    state,
    updateStateNoHistory,
    updateCanvasDimensions,
    addDrawPath,
    updateText,
    updateTextNoHistory,
    removeText,
    updateShape,
    updateShapeNoHistory,
    removeShape,
    updateBlur,
    updateBlurNoHistory,
    updateEmoji,
    updateEmojiNoHistory,
    removeEmoji,
    setSelectedElement,
    setActiveTool,
    commitToHistory,
  } = useEditorContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPathRef = useRef<DrawPath | null>(null);

  // Convert elements from normalized to pixel coordinates for rendering
  // This ensures elements maintain relative position/size when canvas resizes
  const displayTexts = useMemo(
    () =>
      dimensions.width > 0
        ? state.texts.map((t) =>
            textToPixels(t, dimensions.width, dimensions.height)
          )
        : [],
    [state.texts, dimensions.width, dimensions.height]
  );

  const displayShapes = useMemo(
    () =>
      dimensions.width > 0
        ? state.shapes.map((s) =>
            shapeToPixels(s, dimensions.width, dimensions.height)
          )
        : [],
    [state.shapes, dimensions.width, dimensions.height]
  );

  const displayBlurs = useMemo(
    () =>
      dimensions.width > 0
        ? state.blurs.map((b) =>
            blurToPixels(b, dimensions.width, dimensions.height)
          )
        : [],
    [state.blurs, dimensions.width, dimensions.height]
  );

  const displayEmojis = useMemo(
    () =>
      dimensions.width > 0
        ? state.emojis.map((e) =>
            emojiToPixels(e, dimensions.width, dimensions.height)
          )
        : [],
    [state.emojis, dimensions.width, dimensions.height]
  );

  const displayDrawings = useMemo(
    () =>
      dimensions.width > 0
        ? state.drawings.map((d) =>
            drawPathToPixels(d, dimensions.width, dimensions.height)
          )
        : [],
    [state.drawings, dimensions.width, dimensions.height]
  );

  // Create a unified list of all draggable elements sorted by zIndex
  // This ensures proper layering where newer elements appear on top
  type ElementType = "text" | "shape" | "blur" | "emoji";
  interface UnifiedElement {
    type: ElementType;
    id: string;
    zIndex: number;
  }

  const sortedElements = useMemo(() => {
    const elements: UnifiedElement[] = [
      ...displayTexts.map((t) => ({
        type: "text" as const,
        id: t.id,
        zIndex: t.zIndex ?? 0,
      })),
      ...displayShapes.map((s) => ({
        type: "shape" as const,
        id: s.id,
        zIndex: s.zIndex ?? 0,
      })),
      ...displayBlurs.map((b) => ({
        type: "blur" as const,
        id: b.id,
        zIndex: b.zIndex ?? 0,
      })),
      ...displayEmojis.map((e) => ({
        type: "emoji" as const,
        id: e.id,
        zIndex: e.zIndex ?? 0,
      })),
    ];
    // Sort by zIndex to ensure proper layering
    return elements.sort((a, b) => a.zIndex - b.zIndex);
  }, [displayTexts, displayShapes, displayBlurs, displayEmojis]);

  // Expose canvas ref to parent
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getDimensions: () => dimensions,
  }));

  // Load and size image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      // Calculate display size maintaining aspect ratio
      let displayWidth = img.width;
      let displayHeight = img.height;

      // Handle rotation
      const isRotated =
        state.cropRotate.rotation === 90 || state.cropRotate.rotation === 270;
      if (isRotated) {
        [displayWidth, displayHeight] = [displayHeight, displayWidth];
      }

      // Scale to fit container
      const scale = Math.min(
        maxWidth / displayWidth,
        maxHeight / displayHeight,
        1
      );
      displayWidth *= scale;
      displayHeight *= scale;

      const newDimensions = {
        width: Math.round(displayWidth),
        height: Math.round(displayHeight),
      };

      setDimensions(newDimensions);

      // Update context with actual canvas dimensions (scales elements if dimensions changed)
      updateCanvasDimensions(newDimensions);
    };
    img.src = state.originalImage;
  }, [
    state.originalImage,
    state.cropRotate.rotation,
    maxWidth,
    maxHeight,
    updateCanvasDimensions,
  ]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || dimensions.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply filter
    const filterConfig = IMAGE_FILTERS.find((f) => f.id === state.filter);
    if (filterConfig && filterConfig.cssFilter !== "none") {
      ctx.filter = filterConfig.cssFilter;
    } else {
      ctx.filter = "none";
    }

    // Handle rotation and flips
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((state.cropRotate.rotation * Math.PI) / 180);

    if (state.cropRotate.flipHorizontal) {
      ctx.scale(-1, 1);
    }
    if (state.cropRotate.flipVertical) {
      ctx.scale(1, -1);
    }

    // Draw image centered
    const isRotated =
      state.cropRotate.rotation === 90 || state.cropRotate.rotation === 270;
    const drawWidth = isRotated ? canvas.height : canvas.width;
    const drawHeight = isRotated ? canvas.width : canvas.height;

    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();

    // Reset filter for overlays
    ctx.filter = "none";

    // =========================================================================
    // Z-INDEX BASED RENDERING
    // Render all elements in z-index order so blur affects everything beneath it
    // =========================================================================

    // Step 1: Render all drawings first (no z-index, always bottom layer)
    displayDrawings.forEach((path) => {
      renderDrawPath(ctx, path);
    });

    // Step 2: Collect all z-indexed elements and sort
    type PreviewElement =
      | { type: "shape"; data: (typeof displayShapes)[0]; zIndex: number }
      | { type: "blur"; data: (typeof displayBlurs)[0]; zIndex: number }
      | { type: "text"; data: (typeof displayTexts)[0]; zIndex: number }
      | { type: "emoji"; data: (typeof displayEmojis)[0]; zIndex: number };

    const allElements: PreviewElement[] = [
      ...displayShapes.map((s) => ({
        type: "shape" as const,
        data: s,
        zIndex: s.zIndex ?? 0,
      })),
      ...displayBlurs.map((b) => ({
        type: "blur" as const,
        data: b,
        zIndex: b.zIndex ?? 0,
      })),
      ...displayTexts.map((t) => ({
        type: "text" as const,
        data: t,
        zIndex: t.zIndex ?? 0,
      })),
      ...displayEmojis.map((e) => ({
        type: "emoji" as const,
        data: e,
        zIndex: e.zIndex ?? 0,
      })),
    ].sort((a, b) => a.zIndex - b.zIndex);

    // Step 3: Render each element in z-index order
    // When blur is encountered, it blurs everything rendered so far
    // ALL elements are rendered to canvas (DOM overlays are for interaction only)
    allElements.forEach((element) => {
      switch (element.type) {
        case "shape":
          // Render ALL shapes to canvas for blur to work properly
          renderShapeOutline(ctx, element.data);
          break;
        case "blur":
          renderBlurArea(ctx, element.data, canvas);
          break;
        case "text":
          // Render text to canvas for blur to work properly
          renderTextToCanvas(ctx, element.data);
          break;
        case "emoji":
          // Render emoji to canvas for blur to work properly
          renderEmojiToCanvas(ctx, element.data);
          break;
      }
    });
  }, [
    dimensions,
    state.originalImage,
    state.filter,
    state.cropRotate,
    displayDrawings,
    displayBlurs,
    displayShapes,
    displayTexts,
    displayEmojis,
  ]);

  // Drawing handlers - store paths in normalized coordinates
  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (state.activeTool !== "draw") return;

      const canvas = canvasRef.current;
      if (!canvas || dimensions.width === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;

      // Scale to canvas space then normalize
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = x * scaleX;
      const canvasY = y * scaleY;

      // Convert to normalized coordinates for storage
      const normalizedPoint = pixelsToNormalized(
        canvasX,
        canvasY,
        dimensions.width,
        dimensions.height
      );
      const avgDimension = (dimensions.width + dimensions.height) / 2;

      currentPathRef.current = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        points: [{ x: normalizedPoint.x, y: normalizedPoint.y }],
        color: state.drawColor,
        strokeWidth:
          avgDimension > 0 ? state.drawStrokeWidth / avgDimension : 0,
      };

      setIsDrawing(true);
    },
    [
      state.activeTool,
      state.drawColor,
      state.drawStrokeWidth,
      dimensions.width,
      dimensions.height,
    ]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentPathRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas || dimensions.width === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = x * scaleX;
      const canvasY = y * scaleY;

      // Store point in normalized coordinates
      const normalizedPoint = pixelsToNormalized(
        canvasX,
        canvasY,
        dimensions.width,
        dimensions.height
      );
      currentPathRef.current.points.push({
        x: normalizedPoint.x,
        y: normalizedPoint.y,
      });

      // Draw preview using pixel coordinates
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Convert current path to pixels for preview rendering
        const pixelPath = drawPathToPixels(
          currentPathRef.current,
          dimensions.width,
          dimensions.height
        );
        renderDrawPath(ctx, pixelPath);
      }
    },
    [isDrawing, dimensions.width, dimensions.height]
  );

  const stopDrawing = useCallback(() => {
    if (currentPathRef.current && currentPathRef.current.points.length > 1) {
      addDrawPath(currentPathRef.current);
    }
    currentPathRef.current = null;
    setIsDrawing(false);
  }, [addDrawPath]);

  // Handle canvas/container click for deselection
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking directly on canvas or container
      // NOT on an overlay element (text, shape, blur)
      const target = e.target as HTMLElement;

      // Check if click originated from within an overlay element
      const isOverlayClick = target.closest(".drag-area") !== null;
      if (isOverlayClick) {
        return; // Don't deselect - click was on an element
      }

      // For draw tool: only deselect if clicking on the CONTAINER (outside canvas area)
      // Don't deselect when clicking directly on the canvas - that's how you draw
      if (state.activeTool === "draw") {
        if (target === canvasRef.current) {
          return; // Don't deselect - click was on the canvas for drawing
        }
        // Clicking on container (outside canvas) should deselect draw tool
        if (target === containerRef.current) {
          setActiveTool("none");
        }
        return;
      }

      if (target === canvasRef.current || target === containerRef.current) {
        // Check if we need to remove an empty text before deselecting
        if (state.selectedElementId) {
          const selectedText = state.texts.find(
            (t) => t.id === state.selectedElementId
          );
          if (
            selectedText &&
            (selectedText.text === "Type here" ||
              selectedText.text.trim() === "")
          ) {
            removeText(selectedText.id);
          }
        }
        setSelectedElement(null);
        // Deselect tools when clicking away from their elements
        if (
          state.activeTool === "text" ||
          state.activeTool === "blur" ||
          state.activeTool === "shapes" ||
          state.activeTool === "emoji"
        ) {
          setActiveTool("none");
        }
      }
    },
    [
      setSelectedElement,
      setActiveTool,
      state.activeTool,
      state.selectedElementId,
      state.texts,
      removeText,
    ]
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{ width: dimensions.width, height: dimensions.height }}
      onClick={handleCanvasClick}
    >
      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className={cn(
          "block",
          state.activeTool === "draw" && "cursor-crosshair"
        )}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {/* Draggable Overlay Elements - rendered in z-index order */}
      {sortedElements.map((element) => {
        switch (element.type) {
          case "text": {
            const displayText = displayTexts.find((t) => t.id === element.id);
            if (!displayText) return null;

            const isSelected = state.selectedElementId === displayText.id;
            // Check if this is a newly created text that should start in edit mode
            const startInEditMode = displayText.isNewlyCreated === true;

            // Clear the isNewlyCreated flag after first render
            if (startInEditMode) {
              // Use setTimeout to avoid updating state during render
              setTimeout(() => {
                updateText(displayText.id, { isNewlyCreated: false });
              }, 0);
            }

            // Handle text selection - also activate text tool
            const handleTextSelect = () => {
              setSelectedElement(displayText.id);
              // Activate text tool when clicking on a text element
              if (state.activeTool !== "text") {
                setActiveTool("text");
              }
            };

            // Handle resize - scale font size proportionally when making smaller
            const handleSizeChange = (newWidth: number, newHeight: number) => {
              // Calculate the scale factor based on width change
              const currentWidth = displayText.width;
              const scaleFactor = newWidth / currentWidth;

              // If making smaller, scale the font size down proportionally
              if (scaleFactor < 1) {
                const newFontSize = displayText.fontSize * scaleFactor;
                // Enforce minimum font size of 12px
                const minFontSize = 12;
                const clampedFontSize = Math.max(minFontSize, newFontSize);

                const normalized = sizeToNormalized(
                  newWidth,
                  newHeight,
                  dimensions.width,
                  dimensions.height
                );

                // Update size and font size together
                updateTextNoHistory(displayText.id, {
                  ...normalized,
                  fontSize: dimensionToNormalized(
                    clampedFontSize,
                    dimensions.width,
                    dimensions.height
                  ),
                });
              } else {
                // Making larger - just update size, content will auto-fit
                const normalized = sizeToNormalized(
                  newWidth,
                  newHeight,
                  dimensions.width,
                  dimensions.height
                );
                updateTextNoHistory(displayText.id, normalized);
              }
            };

            return (
              <DraggableElement
                key={`text-${displayText.id}`}
                x={displayText.x}
                y={displayText.y}
                width={displayText.width}
                height={displayText.height}
                rotation={displayText.rotation}
                isSelected={isSelected}
                onSelect={handleTextSelect}
                onPositionChange={(x: number, y: number) => {
                  const normalized = pixelsToNormalized(
                    x,
                    y,
                    dimensions.width,
                    dimensions.height
                  );
                  updateTextNoHistory(displayText.id, normalized);
                }}
                onSizeChange={handleSizeChange}
                onRotationChange={(rotation: number) => {
                  updateTextNoHistory(displayText.id, { rotation });
                }}
                onDragEnd={commitToHistory}
                showDeleteButton={false}
                showRotationHandle
              >
                <TextElementRenderer
                  displayText={displayText}
                  isSelected={isSelected}
                  canvasWidth={dimensions.width}
                  canvasHeight={dimensions.height}
                  onSelect={handleTextSelect}
                  startInEditMode={startInEditMode}
                />
              </DraggableElement>
            );
          }

          case "shape": {
            const displayShape = displayShapes.find((s) => s.id === element.id);
            if (!displayShape) return null;

            // Calculate bounding box for the shape
            let boundingX: number;
            let boundingY: number;
            let displayWidth: number;
            let displayHeight: number;

            if (displayShape.type === "rectangle") {
              boundingX = displayShape.x;
              boundingY = displayShape.y;
              displayWidth = displayShape.width;
              displayHeight = displayShape.height;
            } else if (displayShape.type === "circle") {
              boundingX = displayShape.x;
              boundingY = displayShape.y;
              displayWidth = displayShape.radiusX * 2;
              displayHeight = displayShape.radiusY * 2;
            } else {
              // Line or Arrow - calculate proper bounding box
              boundingX = Math.min(displayShape.x, displayShape.endX);
              boundingY = Math.min(displayShape.y, displayShape.endY);
              displayWidth = Math.max(
                Math.abs(displayShape.endX - displayShape.x),
                20
              );
              displayHeight = Math.max(
                Math.abs(displayShape.endY - displayShape.y),
                20
              );
            }

            return (
              <DraggableElement
                key={`shape-${displayShape.id}`}
                x={boundingX}
                y={boundingY}
                width={displayWidth}
                height={displayHeight}
                rotation={displayShape.rotation}
                isSelected={state.selectedElementId === displayShape.id}
                showDeleteButton={false}
                showRotationHandle
                onSelect={() => {
                  setSelectedElement(displayShape.id);
                  // Activate shapes tool when clicking on a shape element
                  if (state.activeTool !== "shapes") {
                    setActiveTool("shapes");
                  }
                }}
                onPositionChange={(newX: number, newY: number) => {
                  if (
                    displayShape.type === "line" ||
                    displayShape.type === "arrow"
                  ) {
                    // Calculate delta from the bounding box position
                    const dx = newX - boundingX;
                    const dy = newY - boundingY;

                    // Move both start and end points by the delta
                    const startNormalized = pixelsToNormalized(
                      displayShape.x + dx,
                      displayShape.y + dy,
                      dimensions.width,
                      dimensions.height
                    );
                    const endNormalized = pixelsToNormalized(
                      displayShape.endX + dx,
                      displayShape.endY + dy,
                      dimensions.width,
                      dimensions.height
                    );
                    updateShapeNoHistory(displayShape.id, {
                      x: startNormalized.x,
                      y: startNormalized.y,
                      endX: endNormalized.x,
                      endY: endNormalized.y,
                    });
                  } else {
                    const normalized = pixelsToNormalized(
                      newX,
                      newY,
                      dimensions.width,
                      dimensions.height
                    );
                    updateShapeNoHistory(displayShape.id, normalized);
                  }
                }}
                onSizeChange={(newWidth: number, newHeight: number) => {
                  if (displayShape.type === "rectangle") {
                    const normalized = sizeToNormalized(
                      newWidth,
                      newHeight,
                      dimensions.width,
                      dimensions.height
                    );
                    updateShapeNoHistory(displayShape.id, normalized);
                  } else if (displayShape.type === "circle") {
                    updateShapeNoHistory(displayShape.id, {
                      radiusX: newWidth / 2 / dimensions.width,
                      radiusY: newHeight / 2 / dimensions.height,
                    });
                  } else if (
                    displayShape.type === "line" ||
                    displayShape.type === "arrow"
                  ) {
                    // Calculate scale factors based on bounding box change
                    const scaleX =
                      displayWidth > 1 ? newWidth / displayWidth : 1;
                    const scaleY =
                      displayHeight > 1 ? newHeight / displayHeight : 1;

                    // Calculate offsets from bounding box origin
                    const startOffsetX = displayShape.x - boundingX;
                    const startOffsetY = displayShape.y - boundingY;
                    const endOffsetX = displayShape.endX - boundingX;
                    const endOffsetY = displayShape.endY - boundingY;

                    // Scale the offsets
                    const newStartX = boundingX + startOffsetX * scaleX;
                    const newStartY = boundingY + startOffsetY * scaleY;
                    const newEndX = boundingX + endOffsetX * scaleX;
                    const newEndY = boundingY + endOffsetY * scaleY;

                    // Convert to normalized coordinates
                    const startNormalized = pixelsToNormalized(
                      newStartX,
                      newStartY,
                      dimensions.width,
                      dimensions.height
                    );
                    const endNormalized = pixelsToNormalized(
                      newEndX,
                      newEndY,
                      dimensions.width,
                      dimensions.height
                    );

                    updateShapeNoHistory(displayShape.id, {
                      x: startNormalized.x,
                      y: startNormalized.y,
                      endX: endNormalized.x,
                      endY: endNormalized.y,
                    });
                  }
                }}
                onRotationChange={(rotation: number) => {
                  updateShapeNoHistory(displayShape.id, { rotation });
                }}
                onDragEnd={commitToHistory}
                onDelete={() => removeShape(displayShape.id)}
              >
                {/* SVG content is invisible - canvas renders the visual.
                    This is just for maintaining size/structure for drag handles */}
                <svg
                  width="100%"
                  height="100%"
                  className="pointer-events-none"
                  viewBox={`0 0 ${displayWidth} ${displayHeight}`}
                  style={{ opacity: 0 }}
                >
                  {displayShape.type === "rectangle" && (
                    <rect
                      x={displayShape.strokeWidth / 2}
                      y={displayShape.strokeWidth / 2}
                      width={displayShape.width - displayShape.strokeWidth}
                      height={displayShape.height - displayShape.strokeWidth}
                      fill="none"
                      stroke={displayShape.color}
                      strokeWidth={displayShape.strokeWidth}
                    />
                  )}
                  {displayShape.type === "circle" && (
                    <ellipse
                      cx={displayShape.radiusX}
                      cy={displayShape.radiusY}
                      rx={displayShape.radiusX - displayShape.strokeWidth / 2}
                      ry={displayShape.radiusY - displayShape.strokeWidth / 2}
                      fill="none"
                      stroke={displayShape.color}
                      strokeWidth={displayShape.strokeWidth}
                    />
                  )}
                  {(displayShape.type === "line" ||
                    displayShape.type === "arrow") && (
                    <>
                      <line
                        x1={displayShape.x - boundingX}
                        y1={displayShape.y - boundingY}
                        x2={displayShape.endX - boundingX}
                        y2={displayShape.endY - boundingY}
                        stroke={displayShape.color}
                        strokeWidth={displayShape.strokeWidth}
                        strokeLinecap="round"
                      />
                      {displayShape.type === "arrow" && (
                        <polygon
                          points={getArrowHeadPointsLocal(
                            displayShape.x - boundingX,
                            displayShape.y - boundingY,
                            displayShape.endX - boundingX,
                            displayShape.endY - boundingY,
                            displayShape.strokeWidth
                          )}
                          fill={displayShape.color}
                        />
                      )}
                    </>
                  )}
                </svg>
              </DraggableElement>
            );
          }

          case "blur": {
            const displayBlur = displayBlurs.find((b) => b.id === element.id);
            if (!displayBlur) return null;

            return (
              <DraggableElement
                key={`blur-${displayBlur.id}`}
                x={displayBlur.x}
                y={displayBlur.y}
                width={displayBlur.width}
                height={displayBlur.height}
                rotation={displayBlur.rotation || 0}
                isSelected={state.selectedElementId === displayBlur.id}
                showRotationHandle
                onSelect={() => {
                  setSelectedElement(displayBlur.id);
                  // Activate blur tool when clicking on a blur element
                  if (state.activeTool !== "blur") {
                    setActiveTool("blur");
                  }
                }}
                onPositionChange={(x: number, y: number) => {
                  const normalized = pixelsToNormalized(
                    x,
                    y,
                    dimensions.width,
                    dimensions.height
                  );
                  updateBlurNoHistory(displayBlur.id, normalized);
                }}
                onSizeChange={(width: number, height: number) => {
                  const normalized = sizeToNormalized(
                    width,
                    height,
                    dimensions.width,
                    dimensions.height
                  );
                  updateBlurNoHistory(displayBlur.id, normalized);
                }}
                onRotationChange={(rotation: number) => {
                  updateBlurNoHistory(displayBlur.id, { rotation });
                }}
                onDragEnd={commitToHistory}
                showDeleteButton={false}
              >
                {/* Blur effect is rendered directly on canvas via renderBlurArea - 
                    this overlay is just for selection/dragging UI */}
                <div className="w-full h-full border-2 border-dashed border-white/50 rounded pointer-events-none" />
              </DraggableElement>
            );
          }

          case "emoji": {
            const displayEmoji = displayEmojis.find((e) => e.id === element.id);
            if (!displayEmoji) return null;

            const isEmojiSelected = state.selectedElementId === displayEmoji.id;

            return (
              <DraggableElement
                key={`emoji-${displayEmoji.id}`}
                x={displayEmoji.x}
                y={displayEmoji.y}
                width={displayEmoji.size}
                height={displayEmoji.size}
                rotation={displayEmoji.rotation}
                isSelected={isEmojiSelected}
                showDeleteButton={false}
                showRotationHandle
                onSelect={() => {
                  setSelectedElement(displayEmoji.id);
                  // Activate emoji tool when clicking on an emoji element
                  if (state.activeTool !== "emoji") {
                    setActiveTool("emoji");
                  }
                }}
                onPositionChange={(x: number, y: number) => {
                  const normalized = pixelsToNormalized(
                    x,
                    y,
                    dimensions.width,
                    dimensions.height
                  );
                  updateEmojiNoHistory(displayEmoji.id, normalized);
                }}
                onSizeChange={(size: number) => {
                  const avgDimension =
                    (dimensions.width + dimensions.height) / 2;
                  const normalizedSize =
                    avgDimension > 0 ? size / avgDimension : 0;
                  updateEmojiNoHistory(displayEmoji.id, {
                    size: normalizedSize,
                  });
                }}
                onRotationChange={(rotation: number) => {
                  updateEmojiNoHistory(displayEmoji.id, { rotation });
                }}
                onDragEnd={commitToHistory}
                onDelete={() => removeEmoji(displayEmoji.id)}
                maintainAspectRatio
              >
                {/* DOM content is invisible - canvas renders the visual.
                    Only show border/handles via DraggableElement when selected */}
                <span
                  className="select-none pointer-events-none"
                  style={{
                    fontSize: displayEmoji.size * 0.8,
                    opacity: 0, // Hide DOM content - canvas renders it
                  }}
                >
                  {displayEmoji.emoji}
                </span>
              </DraggableElement>
            );
          }

          default:
            return null;
        }
      })}

      {/* Crop Overlay - shown when crop-rotate tool is active */}
      {state.activeTool === "crop-rotate" && state.cropRotate.crop && (
        <InteractiveCropOverlay
          crop={state.cropRotate.crop}
          canvasWidth={dimensions.width}
          canvasHeight={dimensions.height}
          onCropChange={(crop) =>
            updateStateNoHistory({
              cropRotate: { ...state.cropRotate, crop },
            })
          }
          onCropCommit={commitToHistory}
        />
      )}
    </div>
  );
});

// Interactive Crop Overlay Component with drag handles
interface InteractiveCropOverlayProps {
  crop: { x: number; y: number; width: number; height: number };
  canvasWidth: number;
  canvasHeight: number;
  onCropChange: (crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onCropCommit: () => void;
}

function InteractiveCropOverlay({
  crop,
  canvasWidth,
  canvasHeight,
  onCropChange,
  onCropCommit,
}: InteractiveCropOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<
    "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null
  >(null);
  const startRef = useRef({ x: 0, y: 0, crop: { ...crop } });

  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      type: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      setDragType(type);
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        crop: { ...crop },
      };
    },
    [crop]
  );

  useEffect(() => {
    if (!isDragging || !dragType) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const startCrop = startRef.current.crop;

      let newCrop = { ...crop };
      const minSize = 50;

      switch (dragType) {
        case "move":
          newCrop.x = Math.max(
            0,
            Math.min(canvasWidth - crop.width, startCrop.x + dx)
          );
          newCrop.y = Math.max(
            0,
            Math.min(canvasHeight - crop.height, startCrop.y + dy)
          );
          break;
        case "nw":
          newCrop.x = Math.max(
            0,
            Math.min(startCrop.x + dx, startCrop.x + startCrop.width - minSize)
          );
          newCrop.y = Math.max(
            0,
            Math.min(startCrop.y + dy, startCrop.y + startCrop.height - minSize)
          );
          newCrop.width = startCrop.width - (newCrop.x - startCrop.x);
          newCrop.height = startCrop.height - (newCrop.y - startCrop.y);
          break;
        case "ne":
          newCrop.y = Math.max(
            0,
            Math.min(startCrop.y + dy, startCrop.y + startCrop.height - minSize)
          );
          newCrop.width = Math.max(
            minSize,
            Math.min(canvasWidth - startCrop.x, startCrop.width + dx)
          );
          newCrop.height = startCrop.height - (newCrop.y - startCrop.y);
          break;
        case "sw":
          newCrop.x = Math.max(
            0,
            Math.min(startCrop.x + dx, startCrop.x + startCrop.width - minSize)
          );
          newCrop.width = startCrop.width - (newCrop.x - startCrop.x);
          newCrop.height = Math.max(
            minSize,
            Math.min(canvasHeight - startCrop.y, startCrop.height + dy)
          );
          break;
        case "se":
          newCrop.width = Math.max(
            minSize,
            Math.min(canvasWidth - startCrop.x, startCrop.width + dx)
          );
          newCrop.height = Math.max(
            minSize,
            Math.min(canvasHeight - startCrop.y, startCrop.height + dy)
          );
          break;
        case "n":
          newCrop.y = Math.max(
            0,
            Math.min(startCrop.y + dy, startCrop.y + startCrop.height - minSize)
          );
          newCrop.height = startCrop.height - (newCrop.y - startCrop.y);
          break;
        case "s":
          newCrop.height = Math.max(
            minSize,
            Math.min(canvasHeight - startCrop.y, startCrop.height + dy)
          );
          break;
        case "w":
          newCrop.x = Math.max(
            0,
            Math.min(startCrop.x + dx, startCrop.x + startCrop.width - minSize)
          );
          newCrop.width = startCrop.width - (newCrop.x - startCrop.x);
          break;
        case "e":
          newCrop.width = Math.max(
            minSize,
            Math.min(canvasWidth - startCrop.x, startCrop.width + dx)
          );
          break;
      }

      onCropChange(newCrop);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      // Commit the crop change to history when drag ends
      onCropCommit();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    dragType,
    crop,
    canvasWidth,
    canvasHeight,
    onCropChange,
    onCropCommit,
  ]);

  return (
    <div className="absolute inset-0" style={{ zIndex: 20 }}>
      {/* Dark overlay outside crop area */}
      <svg
        width={canvasWidth}
        height={canvasHeight}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 21 }}
      >
        <defs>
          <mask id="cropMask">
            <rect width={canvasWidth} height={canvasHeight} fill="white" />
            <rect
              x={crop.x}
              y={crop.y}
              width={crop.width}
              height={crop.height}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={canvasWidth}
          height={canvasHeight}
          fill="rgba(0,0,0,0.6)"
          mask="url(#cropMask)"
        />
      </svg>

      {/* Crop area - draggable */}
      <div
        className="absolute cursor-move"
        style={{
          left: crop.x,
          top: crop.y,
          width: crop.width,
          height: crop.height,
          zIndex: 22,
          border: "2px solid white",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.3)",
        }}
        onMouseDown={(e) => handleMouseDown(e, "move")}
      >
        {/* Grid lines (rule of thirds) */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="border border-white/30" />
          ))}
        </div>

        {/* Corner handles */}
        <div
          className="absolute w-5 h-5 bg-white rounded-sm cursor-nw-resize"
          style={{
            top: -10,
            left: -10,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "nw")}
        />
        <div
          className="absolute w-5 h-5 bg-white rounded-sm cursor-ne-resize"
          style={{
            top: -10,
            right: -10,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "ne")}
        />
        <div
          className="absolute w-5 h-5 bg-white rounded-sm cursor-sw-resize"
          style={{
            bottom: -10,
            left: -10,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "sw")}
        />
        <div
          className="absolute w-5 h-5 bg-white rounded-sm cursor-se-resize"
          style={{
            bottom: -10,
            right: -10,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "se")}
        />

        {/* Edge handles */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-8 h-3 bg-white rounded-sm cursor-n-resize"
          style={{
            top: -6,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "n")}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-8 h-3 bg-white rounded-sm cursor-s-resize"
          style={{
            bottom: -6,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "s")}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-8 bg-white rounded-sm cursor-w-resize"
          style={{
            left: -6,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "w")}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-8 bg-white rounded-sm cursor-e-resize"
          style={{
            right: -6,
            zIndex: 25,
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
          onMouseDown={(e) => handleMouseDown(e, "e")}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Canvas Rendering Helper Functions
// These render elements in pixel coordinates (already converted from normalized)
// ============================================================================

function renderDrawPath(ctx: CanvasRenderingContext2D, path: DrawPath) {
  if (path.points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = path.color;
  ctx.lineWidth = path.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  ctx.stroke();
}

/**
 * Calculates the center point of a shape for rotation
 */
function getShapeCenterPixels(shape: Shape): { x: number; y: number } {
  switch (shape.type) {
    case "rectangle":
      return {
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
      };
    case "circle":
      return {
        x: shape.x + shape.radiusX,
        y: shape.y + shape.radiusY,
      };
    case "line":
    case "arrow":
      return {
        x: (shape.x + shape.endX) / 2,
        y: (shape.y + shape.endY) / 2,
      };
  }
}

function renderShapeOutline(ctx: CanvasRenderingContext2D, shape: Shape) {
  const rotation = shape.rotation || 0;

  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.strokeWidth;

  // Apply rotation if needed
  if (rotation !== 0) {
    const center = getShapeCenterPixels(shape);
    ctx.translate(center.x, center.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center.x, -center.y);
  }

  switch (shape.type) {
    case "rectangle":
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      break;
    case "circle":
      ctx.beginPath();
      ctx.ellipse(
        shape.x + shape.radiusX,
        shape.y + shape.radiusY,
        shape.radiusX,
        shape.radiusY,
        0,
        0,
        2 * Math.PI
      );
      ctx.stroke();
      break;
    case "line":
    case "arrow":
      ctx.beginPath();
      ctx.moveTo(shape.x, shape.y);
      ctx.lineTo(shape.endX, shape.endY);
      ctx.stroke();

      if (shape.type === "arrow") {
        const angle = Math.atan2(shape.endY - shape.y, shape.endX - shape.x);
        const headLength = 15;
        ctx.beginPath();
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(
          shape.endX - headLength * Math.cos(angle - Math.PI / 6),
          shape.endY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(
          shape.endX - headLength * Math.cos(angle + Math.PI / 6),
          shape.endY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

function renderBlurArea(
  ctx: CanvasRenderingContext2D,
  blur: {
    x: number;
    y: number;
    width: number;
    height: number;
    mode: string;
    intensity: number;
    rotation?: number;
  },
  canvas: HTMLCanvasElement
) {
  // Ensure dimensions are valid
  const x = Math.round(blur.x);
  const y = Math.round(blur.y);
  const width = Math.round(blur.width);
  const height = Math.round(blur.height);
  const rotation = blur.rotation || 0;

  if (width <= 0 || height <= 0) return;

  const centerX = x + width / 2;
  const centerY = y + height / 2;

  try {
    if (rotation === 0) {
      // Non-rotated blur - use the simple approach
      const safeX = Math.max(0, Math.min(x, canvas.width - 1));
      const safeY = Math.max(0, Math.min(y, canvas.height - 1));
      const safeWidth = Math.min(width, canvas.width - safeX);
      const safeHeight = Math.min(height, canvas.height - safeY);

      if (safeWidth <= 0 || safeHeight <= 0) return;

      const imageData = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);

      if (blur.mode === "pixelate") {
        const pixelSize = Math.max(2, Math.floor(blur.intensity / 5));
        pixelate(imageData, safeWidth, safeHeight, pixelSize);
      } else {
        const radius = Math.min(
          254,
          Math.max(1, Math.floor(blur.intensity / 10 + 1))
        );
        stackBlur(imageData, safeWidth, safeHeight, radius);
      }

      ctx.putImageData(imageData, safeX, safeY);
    } else {
      // Rotated blur - need a more complex approach
      const angleRad = (rotation * Math.PI) / 180;

      // Calculate bounding box for the rotated rectangle
      const cos = Math.abs(Math.cos(angleRad));
      const sin = Math.abs(Math.sin(angleRad));
      const boundingWidth = Math.ceil(width * cos + height * sin);
      const boundingHeight = Math.ceil(width * sin + height * cos);

      // Capture area bounds (centered at rotation center)
      const captureX = Math.max(0, Math.floor(centerX - boundingWidth / 2));
      const captureY = Math.max(0, Math.floor(centerY - boundingHeight / 2));
      const captureWidth = Math.min(boundingWidth, canvas.width - captureX);
      const captureHeight = Math.min(boundingHeight, canvas.height - captureY);

      if (captureWidth <= 0 || captureHeight <= 0) return;

      // Create temp canvas for the unrotated blur area
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Draw the area to temp canvas with inverse rotation to get unrotated content
      tempCtx.save();
      tempCtx.translate(width / 2, height / 2);
      tempCtx.rotate(-angleRad);
      tempCtx.drawImage(
        canvas,
        captureX,
        captureY,
        captureWidth,
        captureHeight,
        -captureWidth / 2,
        -captureHeight / 2,
        captureWidth,
        captureHeight
      );
      tempCtx.restore();

      // Get image data and apply blur
      const imageData = tempCtx.getImageData(0, 0, width, height);

      if (blur.mode === "pixelate") {
        const pixelSize = Math.max(2, Math.floor(blur.intensity / 5));
        pixelate(imageData, width, height, pixelSize);
      } else {
        const radius = Math.min(
          254,
          Math.max(1, Math.floor(blur.intensity / 10 + 1))
        );
        stackBlur(imageData, width, height, radius);
      }

      tempCtx.putImageData(imageData, 0, 0);

      // Draw the blurred content back with rotation
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);
      ctx.drawImage(tempCanvas, -width / 2, -height / 2);
      ctx.restore();
    }
  } catch {
    // Ignore errors when canvas is tainted or area is outside bounds
  }
}

/**
 * Renders a text element to the canvas (pixel coordinates)
 */
function renderTextToCanvas(
  ctx: CanvasRenderingContext2D,
  text: TextElement & { x: number; y: number; width: number; height: number }
) {
  ctx.save();
  ctx.translate(text.x + text.width / 2, text.y + text.height / 2);
  ctx.rotate((text.rotation * Math.PI) / 180);

  const fontStyle = `${text.isItalic ? "italic " : ""}${
    text.isBold ? "bold " : ""
  }${text.fontSize}px ${text.fontFamily}`;
  ctx.font = fontStyle;
  ctx.fillStyle = text.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw background if showBackground is enabled
  if (text.showBackground) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    const bgX = -text.width / 2;
    const bgY = -text.height / 2;
    const bgWidth = text.width;
    const bgHeight = text.height;
    const radius = Math.min(8, bgHeight / 3);

    ctx.beginPath();
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(
      bgX + bgWidth,
      bgY + bgHeight,
      bgX + bgWidth - radius,
      bgY + bgHeight
    );
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = text.color;
  }

  ctx.fillText(text.text, 0, 0);
  ctx.restore();
}

/**
 * Renders an emoji element to the canvas (pixel coordinates)
 */
function renderEmojiToCanvas(
  ctx: CanvasRenderingContext2D,
  emoji: EmojiElement & { x: number; y: number; size: number }
) {
  ctx.save();
  ctx.translate(emoji.x + emoji.size / 2, emoji.y + emoji.size / 2);
  ctx.rotate((emoji.rotation * Math.PI) / 180);
  ctx.font = `${emoji.size}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji.emoji, 0, 0);
  ctx.restore();
}

/**
 * Calculate arrow head points using local (relative to bounding box) coordinates
 */
function getArrowHeadPointsLocal(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  strokeWidth: number
) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = Math.max(15, strokeWidth * 3);
  const headAngle = Math.PI / 6;

  const p1x = endX - headLength * Math.cos(angle - headAngle);
  const p1y = endY - headLength * Math.sin(angle - headAngle);
  const p2x = endX - headLength * Math.cos(angle + headAngle);
  const p2y = endY - headLength * Math.sin(angle + headAngle);

  return `${endX},${endY} ${p1x},${p1y} ${p2x},${p2y}`;
}

function getArrowHeadPoints(shape: {
  x: number;
  y: number;
  endX: number;
  endY: number;
}) {
  const angle = Math.atan2(shape.endY - shape.y, shape.endX - shape.x);
  const headLength = 15;
  const headAngle = Math.PI / 6;

  const endX = Math.abs(shape.endX - shape.x);
  const endY = shape.endY > shape.y ? Math.abs(shape.endY - shape.y) : 0;

  const p1x = endX - headLength * Math.cos(angle - headAngle);
  const p1y = endY - headLength * Math.sin(angle - headAngle);
  const p2x = endX - headLength * Math.cos(angle + headAngle);
  const p2y = endY - headLength * Math.sin(angle + headAngle);

  return `${endX},${endY} ${p1x},${p1y} ${p2x},${p2y}`;
}
