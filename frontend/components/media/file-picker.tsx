"use client";

/**
 * File Picker Component
 * Allows users to select files for upload with drag-drop support
 */

import { ALLOWED_FILE_TYPES, formatFileSize } from "@/lib/media/types";
import { FileIcon, Film, Music, Upload, X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";

interface FilePickerProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  className?: string;
}

export function FilePicker({
  onFilesSelected,
  disabled = false,
  multiple = true,
  maxFiles,
  className = "",
}: FilePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptedMimeTypes = Object.values(ALLOWED_FILE_TYPES).flat().join(",");

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onFilesSelected]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      className={`border-2 border-dashed border-gray-300 rounded-lg p-4 transition-colors ${
        isDragging ? "border-blue-500 bg-blue-50" : ""
      } ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        disabled={disabled}
        multiple={multiple}
        accept={acceptedMimeTypes}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-2">
        <Upload className="w-8 h-8 text-gray-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Drag and drop files here or click to select
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Images (JPG, PNG, GIF, WebP) • Videos (MP4, MOV) • Audio (MP3, OGG,
            WAV, AAC) • Documents (PDF, Word, Excel, TXT)
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Max 100MB per image/document, 300MB per video, 50MB per audio
            {maxFiles && ` • Maximum ${maxFiles} files`}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Attachment Preview Item
 */
interface AttachmentPreviewItemProps {
  file: File;
  preview?: string;
  onRemove: () => void;
  disabled?: boolean;
}

export function AttachmentPreviewItem({
  file,
  preview,
  onRemove,
  disabled = false,
}: AttachmentPreviewItemProps) {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");

  return (
    <div className="relative group">
      {isImage ? (
        <img
          src={preview}
          alt={file.name}
          className="w-24 h-24 object-cover rounded-lg"
        />
      ) : isVideo ? (
        <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center relative">
          {preview && (
            <img
              src={preview}
              alt={file.name}
              className="w-full h-full object-cover rounded-lg"
            />
          )}
          <Film className="w-6 h-6 text-gray-500 absolute" />
        </div>
      ) : isAudio ? (
        <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
          <Music className="w-6 h-6 text-gray-500" />
        </div>
      ) : (
        <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
          <FileIcon className="w-6 h-6 text-gray-500" />
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        title="Remove file"
      >
        <X className="w-4 h-4" />
      </button>

      {/* File info tooltip */}
      <div className="absolute inset-0 bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs p-1 text-center">
        <p className="font-medium truncate">{file.name}</p>
        <p>{formatFileSize(file.size)}</p>
      </div>
    </div>
  );
}

/**
 * Pending Uploads Display
 */
interface PendingUploadsDisplayProps {
  uploads: any[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function PendingUploadsDisplay({
  uploads,
  onRemove,
  disabled = false,
}: PendingUploadsDisplayProps) {
  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700">Pending Uploads</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {uploads.map((upload) => (
          <div key={upload.id} className="relative">
            <AttachmentPreviewItem
              file={upload.file}
              preview={upload.previewUrl}
              onRemove={() => onRemove(upload.id)}
              disabled={disabled}
            />

            {/* Progress indicator */}
            {upload.status === "uploading" && (
              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                <div className="w-12 h-12 border-2 border-white border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Status indicator */}
            <div className="absolute bottom-1 right-1">
              {upload.status === "uploading" && (
                <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
                  {Math.round(upload.progress)}%
                </div>
              )}
              {upload.status === "completed" && (
                <div className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                  ✓
                </div>
              )}
              {upload.status === "error" && (
                <div className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                  ✕
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
