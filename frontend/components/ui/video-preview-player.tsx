"use client";

/**
 * Video Preview Player Component
 * A draggable, resizable video player for YouTube and other video content
 * Similar to WhatsApp Web's picture-in-picture video preview
 */

import { Maximize2, Minimize2, Move, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface VideoPreviewPlayerProps {
  videoId: string;
  url: string;
  title?: string;
  onClose: () => void;
}

type Position = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

export function VideoPreviewPlayer({
  videoId,
  url,
  title,
  onClose,
}: VideoPreviewPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ x: 100, y: 100 });
  const [size, setSize] = useState<Size>({ width: 480, height: 270 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });

  // Initialize position to bottom-right corner
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPosition({
        x: window.innerWidth - size.width - 24,
        y: window.innerHeight - size.height - 100,
      });
    }
  }, [size.width, size.height]);

  // Handle dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".no-drag")) return;

      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = Math.max(
        0,
        Math.min(e.clientX - dragStart.x, window.innerWidth - size.width)
      );
      const newY = Math.max(
        0,
        Math.min(e.clientY - dragStart.y, window.innerHeight - size.height)
      );

      setPosition({ x: newX, y: newY });
    },
    [isDragging, dragStart, size]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove global mouse listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Touch support for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if ((e.target as HTMLElement).closest(".no-drag")) return;

      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      });
    },
    [position]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const newX = Math.max(
        0,
        Math.min(touch.clientX - dragStart.x, window.innerWidth - size.width)
      );
      const newY = Math.max(
        0,
        Math.min(touch.clientY - dragStart.y, window.innerHeight - size.height)
      );

      setPosition({ x: newX, y: newY });
    },
    [isDragging, dragStart, size]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  // Toggle minimize
  const toggleMinimize = () => {
    if (isMinimized) {
      setSize({ width: 480, height: 270 });
    } else {
      setSize({ width: 240, height: 135 });
    }
    setIsMinimized(!isMinimized);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Determine embed URL based on platform
  const getEmbedUrl = () => {
    if (url.includes("youtube") || url.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    // Add other platforms as needed
    return url;
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 shadow-2xl rounded-lg overflow-hidden bg-black"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      {/* Header/Drag Handle */}
      <div
        className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-2 flex items-center justify-between cursor-grab"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center gap-2 text-white/90">
          <Move className="w-3 h-3" />
          <span className="text-xs truncate max-w-[200px]">
            {title || "Video Preview"}
          </span>
        </div>

        <div className="flex items-center gap-1 no-drag">
          <button
            onClick={toggleMinimize}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? (
              <Maximize2 className="w-3 h-3 text-white" />
            ) : (
              <Minimize2 className="w-3 h-3 text-white" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Video iframe */}
      <iframe
        src={getEmbedUrl()}
        className="w-full h-full no-drag"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title || "Video Preview"}
      />
    </div>
  );
}
