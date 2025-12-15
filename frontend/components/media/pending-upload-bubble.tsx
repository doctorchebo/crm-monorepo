"use client";

/**
 * Pending Upload Message Bubble
 * Shows media being uploaded with progress indicator
 * Like WhatsApp - shows the image/video thumbnail with an upload overlay
 */

import { formatFileSize } from "@/lib/media/types";
import { FileIcon, Film, Loader2, Music, X } from "lucide-react";

export interface PendingMediaUpload {
  id: string;
  file: File;
  previewUrl?: string;
  type: "image" | "video" | "audio" | "document";
  progress: number; // 0-100
  status: "queued" | "uploading" | "completed" | "error";
  error?: string;
}

interface PendingUploadBubbleProps {
  upload: PendingMediaUpload;
  caption?: string;
  onCancel?: (id: string) => void;
  timestamp: string;
}

export function PendingUploadBubble({
  upload,
  caption,
  onCancel,
  timestamp,
}: PendingUploadBubbleProps) {
  const isUploading =
    upload.status === "uploading" || upload.status === "queued";
  const hasError = upload.status === "error";

  return (
    <div className="flex justify-end">
      <div className="max-w-xs bg-primary text-primary-foreground rounded-lg overflow-hidden">
        {/* Media Preview */}
        <div className="relative">
          {upload.type === "image" && upload.previewUrl ? (
            <img
              src={upload.previewUrl}
              alt={upload.file.name}
              className={`w-full max-h-[200px] object-cover ${
                isUploading ? "opacity-70" : ""
              }`}
            />
          ) : upload.type === "video" && upload.previewUrl ? (
            <div className="relative">
              <video
                src={upload.previewUrl}
                className={`w-full max-h-[200px] object-cover ${
                  isUploading ? "opacity-70" : ""
                }`}
                muted
              />
              <div className="absolute bottom-2 left-2 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                <Film className="w-3 h-3 text-white" />
                <span className="text-xs text-white">Video</span>
              </div>
            </div>
          ) : upload.type === "audio" ? (
            <div className="p-4 flex items-center gap-3 bg-primary/90">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                <Music className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {upload.file.name}
                </p>
                <p className="text-xs opacity-70">
                  {formatFileSize(upload.file.size)}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 flex items-center gap-3 bg-primary/90">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                <FileIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {upload.file.name}
                </p>
                <p className="text-xs opacity-70">
                  {formatFileSize(upload.file.size)}
                </p>
              </div>
            </div>
          )}

          {/* Upload Overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
              {/* Circular Progress */}
              <div className="relative w-14 h-14">
                {/* Background circle */}
                <svg className="w-14 h-14 transform -rotate-90">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-white/30"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 24}`}
                    strokeDashoffset={`${
                      2 * Math.PI * 24 * (1 - upload.progress / 100)
                    }`}
                    className="text-white transition-all duration-300"
                    strokeLinecap="round"
                  />
                </svg>
                {/* Percentage text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">
                    {Math.round(upload.progress)}%
                  </span>
                </div>
              </div>

              {/* Cancel button */}
              {onCancel && (
                <button
                  onClick={() => onCancel(upload.id)}
                  className="p-1 bg-white/20 hover:bg-white/30 rounded-full transition"
                  title="Cancel upload"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          )}

          {/* Error Overlay */}
          {hasError && (
            <div className="absolute inset-0 bg-red-500/60 flex flex-col items-center justify-center gap-1 p-2">
              <X className="w-6 h-6 text-white" />
              <p className="text-white text-xs text-center">
                {upload.error || "Upload failed"}
              </p>
            </div>
          )}
        </div>

        {/* Caption */}
        {caption && (
          <div className="px-3 py-1.5">
            <p className="text-xs">{caption}</p>
          </div>
        )}

        {/* Timestamp & Status */}
        <div className="px-3 py-1 flex items-center justify-end gap-1.5 text-xs text-primary-foreground/70">
          <span>{timestamp}</span>
          {isUploading && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
      </div>
    </div>
  );
}

/**
 * Multiple Pending Uploads Display
 * Shows a group of files being uploaded in WhatsApp-style 4-square grid
 */
interface PendingUploadGroupProps {
  uploads: PendingMediaUpload[];
  caption?: string;
  onCancel?: (id: string) => void;
  timestamp: string;
}

export function PendingUploadGroup({
  uploads,
  caption,
  onCancel,
  timestamp,
}: PendingUploadGroupProps) {
  if (uploads.length === 0) return null;

  // Calculate overall progress
  const overallProgress =
    uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length;
  const isUploading = uploads.some(
    (u) => u.status === "uploading" || u.status === "queued"
  );
  const hasError = uploads.some((u) => u.status === "error");

  // Separate media types - combine images and videos for grid
  const visualMedia = uploads.filter(
    (u) => u.type === "image" || u.type === "video"
  );
  const others = uploads.filter(
    (u) => u.type !== "image" && u.type !== "video"
  );

  const displayCount = Math.min(visualMedia.length, 4);
  const extraCount = visualMedia.length - 4;

  // Determine grid layout
  const getGridClass = () => {
    if (displayCount === 1) return "grid-cols-1";
    if (displayCount === 2) return "grid-cols-2";
    return "grid-cols-2 grid-rows-2";
  };

  return (
    <div className="flex justify-end">
      <div className="max-w-[280px] bg-primary text-primary-foreground rounded-lg overflow-hidden relative">
        {/* Visual Media Grid (Images/Videos) */}
        {visualMedia.length > 0 && (
          <div className={`grid ${getGridClass()} gap-0.5`}>
            {visualMedia.slice(0, 4).map((upload, index) => {
              const isLastWithMore = index === 3 && extraCount > 0;
              const gridItemClass =
                displayCount === 1
                  ? "aspect-[4/3]"
                  : displayCount === 2
                  ? "aspect-square"
                  : displayCount === 3 && index === 0
                  ? "col-span-2 aspect-[2/1]"
                  : "aspect-square";

              return (
                <div
                  key={upload.id}
                  className={`relative overflow-hidden ${gridItemClass}`}
                >
                  {upload.type === "image" && upload.previewUrl ? (
                    <img
                      src={upload.previewUrl}
                      alt={upload.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : upload.type === "video" && upload.previewUrl ? (
                    <div className="relative w-full h-full">
                      <video
                        src={upload.previewUrl}
                        className="w-full h-full object-cover"
                        muted
                      />
                      {/* Video indicator */}
                      <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1">
                        <Film className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-primary/80 flex items-center justify-center">
                      {upload.type === "video" ? (
                        <Film className="w-8 h-8 text-primary-foreground/50" />
                      ) : (
                        <FileIcon className="w-8 h-8 text-primary-foreground/50" />
                      )}
                    </div>
                  )}

                  {/* +N overlay for additional items */}
                  {isLastWithMore && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white text-2xl font-bold">
                        +{extraCount}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Other files (audio, documents) */}
        {others.map((upload) => (
          <div
            key={upload.id}
            className="p-3 flex items-center gap-2 border-t border-primary-foreground/10 first:border-t-0"
          >
            <div className="w-8 h-8 bg-primary-foreground/20 rounded flex items-center justify-center">
              {upload.type === "audio" ? (
                <Music className="w-4 h-4" />
              ) : (
                <FileIcon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{upload.file.name}</p>
              <p className="text-xs opacity-70">
                {formatFileSize(upload.file.size)}
              </p>
            </div>
          </div>
        ))}

        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 transform -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-white/30"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 24 * (1 - overallProgress / 100)
                  }`}
                  className="text-white transition-all duration-300"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {Math.round(overallProgress)}%
                </span>
              </div>
            </div>

            {/* Cancel button */}
            {onCancel && (
              <button
                onClick={() => uploads.forEach((u) => onCancel(u.id))}
                className="p-1 bg-white/20 hover:bg-white/30 rounded-full transition"
                title="Cancel uploads"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        )}

        {/* Caption */}
        {caption && (
          <div className="px-3 py-1.5 border-t border-primary-foreground/10">
            <p className="text-xs">{caption}</p>
          </div>
        )}

        {/* Timestamp & Status */}
        <div className="px-3 py-1 flex items-center justify-end gap-1.5 text-xs text-primary-foreground/70">
          <span>{timestamp}</span>
          {isUploading && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
      </div>
    </div>
  );
}
