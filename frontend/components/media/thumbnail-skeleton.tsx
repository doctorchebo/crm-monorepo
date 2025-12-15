"use client";

/**
 * Thumbnail Skeleton Component
 * WhatsApp-style skeleton loader with optional blurhash support
 * Used while thumbnail is being generated or loading
 */

import { Loader2 } from "lucide-react";
import { Blurhash } from "react-blurhash";

type SkeletonVariant = "small" | "medium" | "large";

const variantConfig: Record<
  SkeletonVariant,
  { maxWidth: number; spinnerSize: string }
> = {
  small: { maxWidth: 150, spinnerSize: "w-4 h-4" },
  medium: { maxWidth: 280, spinnerSize: "w-6 h-6" },
  large: { maxWidth: 400, spinnerSize: "w-8 h-8" },
};

interface ThumbnailSkeletonProps {
  /** Original media width (for aspect ratio calculation) - can be number or "100%" */
  width?: number | string;
  /** Original media height (for aspect ratio calculation) - can be number or "100%" */
  height?: number | string;
  /** Blurhash string for placeholder (if available) */
  blurhash?: string;
  /** Maximum width of the skeleton */
  maxWidth?: number;
  /** Show loading spinner */
  showSpinner?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Media type for icon display */
  mediaType?: "image" | "video";
  /** Size variant */
  variant?: SkeletonVariant;
}

export function ThumbnailSkeleton({
  width,
  height,
  blurhash,
  maxWidth,
  showSpinner = true,
  className = "",
  mediaType = "image",
  variant = "medium",
}: ThumbnailSkeletonProps) {
  const config = variantConfig[variant];
  const effectiveMaxWidth = maxWidth || config.maxWidth;

  // If width/height are strings (like "100%"), use full container
  const isFluid = typeof width === "string" || typeof height === "string";

  // Calculate aspect ratio, default to 4:3 if dimensions unknown
  const numericWidth = typeof width === "number" ? width : undefined;
  const numericHeight = typeof height === "number" ? height : undefined;
  const aspectRatio =
    numericWidth && numericHeight ? numericWidth / numericHeight : 4 / 3;

  // Calculate display dimensions for fixed size
  const displayWidth = isFluid
    ? "100%"
    : Math.min(effectiveMaxWidth, numericWidth || effectiveMaxWidth);
  const displayHeight = isFluid
    ? "100%"
    : typeof displayWidth === "number"
    ? displayWidth / aspectRatio
    : undefined;

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 ${className}`}
      style={{
        width: displayWidth,
        height: displayHeight,
        minHeight: isFluid ? undefined : 100,
      }}
    >
      {/* Blurhash placeholder if available */}
      {blurhash && blurhash.length > 0 ? (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
          className="absolute inset-0"
        />
      ) : (
        /* Animated gradient placeholder */
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-shimmer bg-[length:200%_100%]" />
      )}

      {/* Loading spinner overlay */}
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
          <div className="bg-black/30 rounded-full p-2">
            <Loader2
              className={`${config.spinnerSize} text-white animate-spin`}
            />
          </div>
        </div>
      )}

      {/* Video play icon overlay */}
      {mediaType === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 rounded-full p-3">
            <svg
              className="w-6 h-6 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact thumbnail skeleton for grid layouts
 */
export function ThumbnailSkeletonCompact({
  blurhash,
  className = "",
}: {
  blurhash?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full h-full rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 ${className}`}
    >
      {blurhash && blurhash.length > 0 ? (
        <Blurhash
          hash={blurhash}
          width="100%"
          height="100%"
          resolutionX={32}
          resolutionY={32}
          punch={1}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-shimmer bg-[length:200%_100%]" />
      )}

      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
        <Loader2 className="w-4 h-4 text-white/70 animate-spin" />
      </div>
    </div>
  );
}

/**
 * Document placeholder skeleton (no thumbnail, shows icon)
 */
export function DocumentSkeleton({
  fileName,
  className = "",
}: {
  fileName?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg ${className}`}
    >
      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mt-1 animate-pulse" />
      </div>
    </div>
  );
}
