"use client";

/**
 * Media Download Menu
 * Dropdown menu showing download options for single or multiple media files (images/videos)
 */

import { Download, Loader2 } from "lucide-react";
import { useRef } from "react";

interface MediaDownloadMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onDownloadSingle: () => void;
  onDownloadPack: () => void;
  isSingleImage: boolean; // Kept for backwards compatibility, actually means single media
  isLoading?: boolean;
  onClose: () => void;
}

export function MediaDownloadMenu({
  isOpen,
  position,
  onDownloadSingle,
  onDownloadPack,
  isSingleImage,
  isLoading = false,
  onClose,
}: MediaDownloadMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      data-download-menu
      className="fixed z-40 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 min-w-max"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translateY(8px)",
      }}
    >
      {isSingleImage ? (
        <button
          onClick={() => {
            onDownloadSingle();
            onClose();
          }}
          disabled={isLoading}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download
        </button>
      ) : (
        <>
          <button
            onClick={() => {
              onDownloadPack();
              onClose();
            }}
            disabled={isLoading}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download All (ZIP)
          </button>
        </>
      )}
    </div>
  );
}
