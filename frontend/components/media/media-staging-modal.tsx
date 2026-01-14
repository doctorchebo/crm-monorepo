"use client";

/**
 * Media Staging Modal
 * WhatsApp-style media preview modal for staging files before sending
 * Features:
 * - Full-screen preview of selected media
 * - Carousel navigation (left/right arrows)
 * - Thumbnail carousel at bottom with ability to add more files
 * - Caption input for the message
 * - Send button
 * - Warning banner when multiple files are selected (WhatsApp API limitation)
 *
 * @deprecated Use MediaStagingPanel instead which has integrated image editing
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StagedFile } from "@/lib/media/staging-types";
import { formatFileSize } from "@/lib/media/types";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileIcon,
  Film,
  Music,
  Plus,
  Send,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

// Re-export StagedFile for backward compatibility
export type { StagedFile } from "@/lib/media/staging-types";

interface MediaStagingModalProps {
  isOpen: boolean;
  files: StagedFile[];
  onClose: () => void;
  onSend: (caption: string) => void;
  onAddMore: () => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  sendButtonText?: string;
}

export function MediaStagingModal({
  isOpen,
  files,
  onClose,
  onSend,
  onAddMore,
  onRemove,
  disabled = false,
  sendButtonText = "Send",
}: MediaStagingModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const captionInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setCaption("");
      // Focus caption input after a short delay
      setTimeout(() => {
        captionInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Adjust current index if files are removed
  useEffect(() => {
    if (currentIndex >= files.length && files.length > 0) {
      setCurrentIndex(files.length - 1);
    }
  }, [files.length, currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, files.length]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "Escape":
          onClose();
          break;
      }
    },
    [isOpen, handlePrevious, handleNext, onClose]
  );

  // Global keyboard event listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSend = () => {
    onSend(caption);
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen || files.length === 0) return null;

  const currentFile = files[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg text-white transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-white text-sm">
            {currentIndex + 1} of {files.length}
          </span>
        </div>

        <div className="flex items-center gap-2 text-white text-sm">
          <span className="truncate max-w-[200px]">
            {currentFile.file.name}
          </span>
          <span className="text-gray-400">
            ({formatFileSize(currentFile.file.size)})
          </span>
        </div>
      </div>

      {/* Multiple Files Warning Banner */}
      {files.length > 1 && (
        <div className="bg-amber-900/50 border-b border-amber-700/50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-amber-200 text-sm max-w-4xl mx-auto">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              Due to WhatsApp Cloud API limitations, each file will be sent as a
              separate message. The recipient will receive {files.length}{" "}
              individual messages.
            </span>
          </div>
        </div>
      )}

      {/* Main Preview Area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative p-4">
        {/* Previous Button */}
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="absolute left-4 z-10 p-2 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        {/* Preview Content */}
        <div className="max-w-full max-h-full flex items-center justify-center">
          {currentFile.type === "image" && currentFile.previewUrl ? (
            <img
              src={currentFile.previewUrl}
              alt={currentFile.file.name}
              className="max-h-[calc(100vh-280px)] max-w-full object-contain rounded-lg"
            />
          ) : currentFile.type === "video" && currentFile.previewUrl ? (
            <video
              src={currentFile.previewUrl}
              controls
              className="max-h-[calc(100vh-280px)] max-w-full rounded-lg"
            />
          ) : currentFile.type === "audio" ? (
            <div className="flex flex-col items-center gap-4 p-8 bg-gray-800 rounded-xl">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center">
                <Music className="w-12 h-12 text-gray-400" />
              </div>
              <p className="text-white text-lg font-medium truncate max-w-xs">
                {currentFile.file.name}
              </p>
              <p className="text-gray-400">
                {formatFileSize(currentFile.file.size)}
              </p>
              {currentFile.previewUrl && (
                <audio
                  src={currentFile.previewUrl}
                  controls
                  className="w-full max-w-md"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 bg-gray-800 rounded-xl">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center">
                <FileIcon className="w-12 h-12 text-gray-400" />
              </div>
              <p className="text-white text-lg font-medium truncate max-w-xs">
                {currentFile.file.name}
              </p>
              <p className="text-gray-400">
                {formatFileSize(currentFile.file.size)}
              </p>
            </div>
          )}
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={currentIndex === files.length - 1}
          className="absolute right-4 z-10 p-2 hover:bg-gray-700 rounded-lg text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>

      {/* Thumbnail Carousel */}
      <div className="border-t border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {files.map((file, index) => (
            <div key={file.id} className="relative flex-shrink-0 group">
              <button
                onClick={() => setCurrentIndex(index)}
                className={`w-16 h-16 rounded-lg overflow-hidden transition border-2 ${
                  index === currentIndex
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <ThumbnailPreview file={file} />
              </button>

              {/* Remove button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(file.id);
                }}
                disabled={disabled}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add More Button */}
          <button
            onClick={onAddMore}
            disabled={disabled}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-400 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Add more"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Caption Input & Send */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <Input
            ref={captionInputRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={handleCaptionKeyDown}
            placeholder="Add a caption..."
            disabled={disabled}
            className="flex-1 bg-gray-800 border-gray-600 text-white placeholder:text-gray-400"
          />
          <Button
            onClick={handleSend}
            disabled={disabled || files.length === 0}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sendButtonText}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Thumbnail Preview Component
 */
function ThumbnailPreview({ file }: { file: StagedFile }) {
  if (file.type === "image" && file.previewUrl) {
    return (
      <img
        src={file.previewUrl}
        alt={file.file.name}
        className="w-full h-full object-cover"
      />
    );
  }

  if (file.type === "video" && file.previewUrl) {
    return (
      <div className="w-full h-full bg-gray-700 flex items-center justify-center relative">
        <video
          src={file.previewUrl}
          className="w-full h-full object-cover"
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Film className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  if (file.type === "audio") {
    return (
      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
        <Music className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
      <FileIcon className="w-6 h-6 text-gray-400" />
    </div>
  );
}
