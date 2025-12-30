/**
 * Coordinate Utilities for Image Editor
 *
 * All element coordinates are stored in NORMALIZED form (0-1 range) representing
 * percentage of the canvas dimensions. This ensures elements maintain their relative
 * position and size when the canvas is resized.
 *
 * - When creating/updating elements from user interaction (pixels), convert TO normalized
 * - When rendering elements on canvas (display), convert FROM normalized to pixels
 * - When exporting to full resolution, convert FROM normalized to full resolution pixels
 */

// ============================================================================
// Core Conversion Functions
// ============================================================================

/**
 * Convert pixel coordinates to normalized (0-1) coordinates
 */
export function pixelsToNormalized(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  if (canvasWidth === 0 || canvasHeight === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: x / canvasWidth,
    y: y / canvasHeight,
  };
}

/**
 * Convert normalized (0-1) coordinates to pixel coordinates
 */
export function normalizedToPixels(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  return {
    x: x * canvasWidth,
    y: y * canvasHeight,
  };
}

/**
 * Convert a pixel size to normalized size
 */
export function sizeToNormalized(
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } {
  if (canvasWidth === 0 || canvasHeight === 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: width / canvasWidth,
    height: height / canvasHeight,
  };
}

/**
 * Convert a normalized size to pixel size
 */
export function normalizedToSize(
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } {
  return {
    width: width * canvasWidth,
    height: height * canvasHeight,
  };
}

/**
 * Convert a single dimension value from pixels to normalized
 * Uses the average of width and height for uniform scaling (useful for stroke width, font size)
 */
export function dimensionToNormalized(
  value: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  const avgDimension = (canvasWidth + canvasHeight) / 2;
  if (avgDimension === 0) return 0;
  return value / avgDimension;
}

/**
 * Convert a single dimension value from normalized to pixels
 */
export function normalizedToDimension(
  value: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  const avgDimension = (canvasWidth + canvasHeight) / 2;
  return value * avgDimension;
}

// ============================================================================
// Element-Specific Converters: Pixels → Normalized (for storage)
// ============================================================================

import type {
  BlurArea,
  DrawPath,
  EmojiElement,
  Shape,
  TextElement,
} from "./types";

/**
 * Convert a TextElement from pixel coordinates to normalized
 */
export function textToNormalized(
  text: TextElement,
  canvasWidth: number,
  canvasHeight: number
): TextElement {
  const pos = pixelsToNormalized(text.x, text.y, canvasWidth, canvasHeight);
  const size = sizeToNormalized(
    text.width,
    text.height,
    canvasWidth,
    canvasHeight
  );
  return {
    ...text,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    fontSize: dimensionToNormalized(text.fontSize, canvasWidth, canvasHeight),
  };
}

/**
 * Convert a TextElement from normalized to pixel coordinates
 */
export function textToPixels(
  text: TextElement,
  canvasWidth: number,
  canvasHeight: number
): TextElement {
  const pos = normalizedToPixels(text.x, text.y, canvasWidth, canvasHeight);
  const size = normalizedToSize(
    text.width,
    text.height,
    canvasWidth,
    canvasHeight
  );
  return {
    ...text,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    fontSize: normalizedToDimension(text.fontSize, canvasWidth, canvasHeight),
  };
}

/**
 * Convert a Shape from pixel coordinates to normalized
 */
export function shapeToNormalized(
  shape: Shape,
  canvasWidth: number,
  canvasHeight: number
): Shape {
  const pos = pixelsToNormalized(shape.x, shape.y, canvasWidth, canvasHeight);
  const strokeWidth = dimensionToNormalized(
    shape.strokeWidth,
    canvasWidth,
    canvasHeight
  );

  switch (shape.type) {
    case "rectangle": {
      const size = sizeToNormalized(
        shape.width,
        shape.height,
        canvasWidth,
        canvasHeight
      );
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        strokeWidth,
      };
    }
    case "circle": {
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        radiusX: shape.radiusX / canvasWidth,
        radiusY: shape.radiusY / canvasHeight,
        strokeWidth,
      };
    }
    case "line":
    case "arrow": {
      const endPos = pixelsToNormalized(
        shape.endX,
        shape.endY,
        canvasWidth,
        canvasHeight
      );
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        endX: endPos.x,
        endY: endPos.y,
        strokeWidth,
      };
    }
  }
}

/**
 * Convert a Shape from normalized to pixel coordinates
 */
export function shapeToPixels(
  shape: Shape,
  canvasWidth: number,
  canvasHeight: number
): Shape {
  const pos = normalizedToPixels(shape.x, shape.y, canvasWidth, canvasHeight);
  const strokeWidth = normalizedToDimension(
    shape.strokeWidth,
    canvasWidth,
    canvasHeight
  );

  switch (shape.type) {
    case "rectangle": {
      const size = normalizedToSize(
        shape.width,
        shape.height,
        canvasWidth,
        canvasHeight
      );
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        strokeWidth,
      };
    }
    case "circle": {
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        radiusX: shape.radiusX * canvasWidth,
        radiusY: shape.radiusY * canvasHeight,
        strokeWidth,
      };
    }
    case "line":
    case "arrow": {
      const endPos = normalizedToPixels(
        shape.endX,
        shape.endY,
        canvasWidth,
        canvasHeight
      );
      return {
        ...shape,
        x: pos.x,
        y: pos.y,
        endX: endPos.x,
        endY: endPos.y,
        strokeWidth,
      };
    }
  }
}

/**
 * Convert a BlurArea from pixel coordinates to normalized
 */
export function blurToNormalized(
  blur: BlurArea,
  canvasWidth: number,
  canvasHeight: number
): BlurArea {
  const pos = pixelsToNormalized(blur.x, blur.y, canvasWidth, canvasHeight);
  const size = sizeToNormalized(
    blur.width,
    blur.height,
    canvasWidth,
    canvasHeight
  );
  return {
    ...blur,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
}

/**
 * Convert a BlurArea from normalized to pixel coordinates
 */
export function blurToPixels(
  blur: BlurArea,
  canvasWidth: number,
  canvasHeight: number
): BlurArea {
  const pos = normalizedToPixels(blur.x, blur.y, canvasWidth, canvasHeight);
  const size = normalizedToSize(
    blur.width,
    blur.height,
    canvasWidth,
    canvasHeight
  );
  return {
    ...blur,
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
}

/**
 * Convert an EmojiElement from pixel coordinates to normalized
 */
export function emojiToNormalized(
  emoji: EmojiElement,
  canvasWidth: number,
  canvasHeight: number
): EmojiElement {
  const pos = pixelsToNormalized(emoji.x, emoji.y, canvasWidth, canvasHeight);
  return {
    ...emoji,
    x: pos.x,
    y: pos.y,
    size: dimensionToNormalized(emoji.size, canvasWidth, canvasHeight),
  };
}

/**
 * Convert an EmojiElement from normalized to pixel coordinates
 */
export function emojiToPixels(
  emoji: EmojiElement,
  canvasWidth: number,
  canvasHeight: number
): EmojiElement {
  const pos = normalizedToPixels(emoji.x, emoji.y, canvasWidth, canvasHeight);
  return {
    ...emoji,
    x: pos.x,
    y: pos.y,
    size: normalizedToDimension(emoji.size, canvasWidth, canvasHeight),
  };
}

/**
 * Convert DrawPath points from pixel to normalized coordinates
 */
export function drawPathToNormalized(
  path: DrawPath,
  canvasWidth: number,
  canvasHeight: number
): DrawPath {
  return {
    ...path,
    points: path.points.map((point) => ({
      ...point,
      ...pixelsToNormalized(point.x, point.y, canvasWidth, canvasHeight),
    })),
    strokeWidth: dimensionToNormalized(
      path.strokeWidth,
      canvasWidth,
      canvasHeight
    ),
  };
}

/**
 * Convert DrawPath points from normalized to pixel coordinates
 */
export function drawPathToPixels(
  path: DrawPath,
  canvasWidth: number,
  canvasHeight: number
): DrawPath {
  return {
    ...path,
    points: path.points.map((point) => ({
      ...point,
      ...normalizedToPixels(point.x, point.y, canvasWidth, canvasHeight),
    })),
    strokeWidth: normalizedToDimension(
      path.strokeWidth,
      canvasWidth,
      canvasHeight
    ),
  };
}

// ============================================================================
// Batch Converters for Full State
// ============================================================================

/**
 * Convert all elements in arrays from normalized to pixel coordinates
 * Used when rendering elements on the canvas
 */
export function convertElementsToPixels(
  elements: {
    texts: TextElement[];
    shapes: Shape[];
    blurs: BlurArea[];
    emojis: EmojiElement[];
    drawings: DrawPath[];
  },
  canvasWidth: number,
  canvasHeight: number
) {
  return {
    texts: elements.texts.map((t) =>
      textToPixels(t, canvasWidth, canvasHeight)
    ),
    shapes: elements.shapes.map((s) =>
      shapeToPixels(s, canvasWidth, canvasHeight)
    ),
    blurs: elements.blurs.map((b) =>
      blurToPixels(b, canvasWidth, canvasHeight)
    ),
    emojis: elements.emojis.map((e) =>
      emojiToPixels(e, canvasWidth, canvasHeight)
    ),
    drawings: elements.drawings.map((d) =>
      drawPathToPixels(d, canvasWidth, canvasHeight)
    ),
  };
}
