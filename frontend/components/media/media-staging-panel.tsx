"use client";

/**
 * Media Staging Panel
 * WhatsApp-style media preview panel for staging files before sending
 * This is NOT a full-screen modal - it's positioned within the messages area
 * Features:
 * - Preview of selected media within chat area
 * - Carousel navigation (left/right arrows)
 * - Thumbnail carousel at bottom with ability to add more files
 * - Caption input for the message
 * - Send button
 */

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize } from "@/lib/media/types";
import {
  ChevronLeft,
  ChevronRight,
  FileIcon,
  Film,
  Music,
  Pencil,
  Plus,
  Send,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface StagedFile {
  id: string;
  file: File;
  previewUrl?: string;
  type: "image" | "video" | "audio" | "document";
}

interface MediaStagingPanelProps {
  isOpen: boolean;
  files: StagedFile[];
  onClose: () => void;
  onSend: (caption: string) => void;
  onAddMore: () => void;
  onRemove: (id: string) => void;
  onEditImage?: (file: StagedFile) => void;
  disabled?: boolean;
  sendButtonText?: string;
}

export function MediaStagingPanel({
  isOpen,
  files,
  onClose,
  onSend,
  onAddMore,
  onRemove,
  onEditImage,
  disabled = false,
  sendButtonText = "Send",
}: MediaStagingPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const captionInputRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when panel opens
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
          if (document.activeElement !== captionInputRef.current) {
            handlePrevious();
          }
          break;
        case "ArrowRight":
          if (document.activeElement !== captionInputRef.current) {
            handleNext();
          }
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

  const handleCaptionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen || files.length === 0) return null;

  const currentFile = files[currentIndex];

  return (
    <div className="absolute inset-0 z-40 bg-background/98 flex flex-col rounded-lg overflow-hidden border shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between h-12 px-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {files.length}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="truncate max-w-[150px] text-foreground">
            {currentFile.file.name}
          </span>
          <span className="text-muted-foreground text-xs">
            ({formatFileSize(currentFile.file.size)})
          </span>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative p-3 bg-muted/20">
        {/* Previous Button */}
        {files.length > 1 && (
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="absolute left-2 z-10 p-1.5 hover:bg-muted rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Preview Content */}
        <div className="max-w-full max-h-full flex items-center justify-center relative">
          {currentFile.type === "image" && currentFile.previewUrl ? (
            <div className="relative group">
              <img
                src={currentFile.previewUrl}
                alt={currentFile.file.name}
                className="max-h-[300px] max-w-full object-contain rounded-lg shadow-md"
              />
              {/* Edit Button - shows on hover for images */}
              {onEditImage && (
                <button
                  onClick={() => onEditImage(currentFile)}
                  className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-opacity opacity-0 group-hover:opacity-100"
                  title="Edit image"
                >
                  <Pencil className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          ) : currentFile.type === "video" && currentFile.previewUrl ? (
            <video
              src={currentFile.previewUrl}
              controls
              className="max-h-[300px] max-w-full rounded-lg shadow-md"
            />
          ) : currentFile.type === "audio" ? (
            <div className="flex flex-col items-center gap-3 p-6 bg-muted rounded-xl">
              <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center shadow-sm">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium truncate max-w-[200px]">
                {currentFile.file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(currentFile.file.size)}
              </p>
              {currentFile.previewUrl && (
                <audio
                  src={currentFile.previewUrl}
                  controls
                  className="w-full max-w-[280px]"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 bg-muted rounded-xl">
              <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center shadow-sm">
                <FileIcon className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium truncate max-w-[200px]">
                {currentFile.file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(currentFile.file.size)}
              </p>
            </div>
          )}
        </div>

        {/* Next Button */}
        {files.length > 1 && (
          <button
            onClick={handleNext}
            disabled={currentIndex === files.length - 1}
            className="absolute right-2 z-10 p-1.5 hover:bg-muted rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnail Carousel */}
      <div className="border-t px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {files.map((file, index) => (
            <div key={file.id} className="relative flex-shrink-0 group">
              <button
                onClick={() => setCurrentIndex(index)}
                className={`w-12 h-12 rounded-md overflow-hidden transition border-2 ${
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
                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}

          {/* Add More Button */}
          <button
            onClick={onAddMore}
            disabled={disabled}
            className="w-12 h-12 rounded-md border-2 border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-muted-foreground transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Add more"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Caption Input & Send */}
      <div className="border-t p-3 bg-background">
        <div className="flex items-end gap-2">
          <Textarea
            ref={captionInputRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={handleCaptionKeyDown}
            placeholder="Add a caption..."
            disabled={disabled}
            className="flex-1 min-h-[40px] max-h-[100px] resize-none text-sm"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={disabled || files.length === 0}
            size="sm"
            className="gap-1.5 h-10"
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
      <div className="w-full h-full bg-muted flex items-center justify-center relative">
        <video
          src={file.previewUrl}
          className="w-full h-full object-cover"
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Film className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }

  if (file.type === "audio") {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Music className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-muted flex items-center justify-center">
      <FileIcon className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}
