"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HeaderFormat,
  isLocationHeader,
  isMediaHeader,
  isTextHeader,
  LocationHeader,
  MediaHeader,
  TemplateHeader,
} from "@/lib/types/template-components.types";
import { FileText, Image, MapPin, Type, Upload, Video, X } from "lucide-react";
import { useCallback, useState } from "react";

interface HeaderEditorProps {
  /** Current header value */
  value?: TemplateHeader;
  /** Callback when header changes */
  onChange: (header: TemplateHeader | undefined) => void;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Callback to upload media file - returns assetHandle for Meta and url for display */
  onMediaUpload?: (
    file: File,
  ) => Promise<{ assetHandle?: string; url?: string; error?: string }>;
  /** Whether media is currently uploading */
  isUploading?: boolean;
}

/** Header format options with icons and labels */
const HEADER_FORMAT_OPTIONS: Array<{
  value: HeaderFormat;
  label: string;
  icon: typeof Type;
  description: string;
}> = [
  {
    value: "TEXT",
    label: "Text",
    icon: Type,
    description: "Simple text header",
  },
  {
    value: "IMAGE",
    label: "Image",
    icon: Image,
    description: "JPEG or PNG image",
  },
  {
    value: "VIDEO",
    label: "Video",
    icon: Video,
    description: "MP4 video file",
  },
  {
    value: "DOCUMENT",
    label: "Document",
    icon: FileText,
    description: "PDF document",
  },
  {
    value: "LOCATION",
    label: "Location",
    icon: MapPin,
    description: "Geographic location",
  },
];

/**
 * HeaderEditor Component
 *
 * Allows editing template headers with support for:
 * - Text headers with variables
 * - Media headers (image, video, document)
 * - Location headers
 */
export function HeaderEditor({
  value,
  onChange,
  disabled = false,
  onMediaUpload,
  isUploading = false,
}: HeaderEditorProps) {
  const [dragActive, setDragActive] = useState(false);

  const currentFormat = value?.format || "TEXT";

  // Handle format change
  const handleFormatChange = useCallback(
    (format: HeaderFormat) => {
      switch (format) {
        case "TEXT":
          onChange({ format: "TEXT", text: "" });
          break;
        case "IMAGE":
        case "VIDEO":
        case "DOCUMENT":
          onChange({ format, handle: undefined, url: undefined });
          break;
        case "LOCATION":
          onChange({
            format: "LOCATION",
            latitude: undefined,
            longitude: undefined,
            name: undefined,
            address: undefined,
          });
          break;
      }
    },
    [onChange],
  );

  // Handle text change for TEXT headers
  const handleTextChange = useCallback(
    (text: string) => {
      if (isTextHeader(value)) {
        onChange({ ...value, text });
      } else {
        onChange({ format: "TEXT", text });
      }
    },
    [value, onChange],
  );

  // Handle file drop/select for media headers
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!onMediaUpload || !isMediaHeader(value)) return;

      // Capture the current format before any async operations
      const currentHeaderFormat = value.format;

      // Create local preview URL immediately for instant feedback
      const localPreviewUrl = URL.createObjectURL(file);

      // Update state with preview URL first (for instant visual feedback)
      onChange({
        format: currentHeaderFormat,
        url: localPreviewUrl,
        filename: file.name,
      } as MediaHeader);

      try {
        // Upload to backend (Meta + S3)
        const result = await onMediaUpload(file);

        // Only revoke the blob URL after we have the S3 URL
        // This prevents the broken image flash
        if (result.url) {
          // We have a persistent S3 URL - safe to revoke blob and update
          URL.revokeObjectURL(localPreviewUrl);
          onChange({
            format: currentHeaderFormat,
            handle: result.assetHandle,
            assetHandle: result.assetHandle,
            url: result.url,
            filename: file.name,
          } as MediaHeader);
        } else if (result.assetHandle) {
          // We have an asset handle but no URL - keep the blob URL for preview
          // This shouldn't happen normally, but handles edge cases
          console.warn(
            "[HeaderEditor] Upload returned assetHandle but no URL - keeping blob preview",
          );
          onChange({
            format: currentHeaderFormat,
            handle: result.assetHandle,
            assetHandle: result.assetHandle,
            url: localPreviewUrl, // Keep blob URL as fallback
            filename: file.name,
          } as MediaHeader);
        } else if (result.error) {
          // On error, revoke blob URL and clear the header media
          URL.revokeObjectURL(localPreviewUrl);
          onChange({
            format: currentHeaderFormat,
            url: undefined,
            handle: undefined,
            assetHandle: undefined,
            filename: undefined,
          } as MediaHeader);
        } else {
          // Unknown state - keep blob URL for now
          console.warn(
            "[HeaderEditor] Upload returned unexpected result:",
            result,
          );
        }
      } catch (error) {
        // On exception, revoke blob URL and clear the header
        URL.revokeObjectURL(localPreviewUrl);
        console.error("[HeaderEditor] Upload failed:", error);
        onChange({
          format: currentHeaderFormat,
          url: undefined,
          handle: undefined,
          assetHandle: undefined,
          filename: undefined,
        } as MediaHeader);
      }
    },
    [value, onChange, onMediaUpload],
  );

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle file drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        await handleFileSelect(e.dataTransfer.files[0]);
      }
    },
    [handleFileSelect],
  );

  // Handle location field changes
  const handleLocationChange = useCallback(
    (field: keyof LocationHeader, fieldValue: string | number) => {
      if (isLocationHeader(value)) {
        onChange({ ...value, [field]: fieldValue });
      } else {
        onChange({
          format: "LOCATION",
          [field]: fieldValue,
        } as LocationHeader);
      }
    },
    [value, onChange],
  );

  // Clear header
  const handleClear = useCallback(() => {
    onChange(undefined);
  }, [onChange]);

  // Get accepted file types for current format
  const getAcceptedTypes = () => {
    switch (currentFormat) {
      case "IMAGE":
        return "image/jpeg,image/png";
      case "VIDEO":
        return "video/mp4";
      case "DOCUMENT":
        return "application/pdf";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Type Selector */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Header Type</Label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="h-8 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1" />
            Remove
          </Button>
        )}
      </div>

      <Select
        value={currentFormat}
        onValueChange={(v) => handleFormatChange(v as HeaderFormat)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select header type" />
        </SelectTrigger>
        <SelectContent>
          {HEADER_FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="h-4 w-4" />
                <div>
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {option.description}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Content Editor based on format */}
      {currentFormat === "TEXT" && (
        <div className="space-y-2">
          <Label htmlFor="header-text">Header Text</Label>
          <Input
            id="header-text"
            value={isTextHeader(value) ? value.text : ""}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Enter header text (max 60 characters)"
            maxLength={60}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            You can use variables like {"{{1}}"} for dynamic content
          </p>
        </div>
      )}

      {(currentFormat === "IMAGE" ||
        currentFormat === "VIDEO" ||
        currentFormat === "DOCUMENT") && (
        <div className="space-y-2">
          <Label>Upload {currentFormat.toLowerCase()}</Label>

          {/* Drop zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
              ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => {
              if (!disabled && !isUploading) {
                document.getElementById("header-file-input")?.click();
              }
            }}
          >
            <input
              id="header-file-input"
              type="file"
              accept={getAcceptedTypes()}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              disabled={disabled || isUploading}
            />

            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            ) : isMediaHeader(value) && (value.handle || value.url) ? (
              <div className="flex flex-col items-center gap-2">
                {/* Show actual image preview if URL is available */}
                {currentFormat === "IMAGE" && value.url ? (
                  <div className="relative w-full max-w-[200px]">
                    <img
                      src={value.url}
                      alt={value.filename || "Header preview"}
                      className="w-full h-auto rounded-lg object-cover max-h-[150px]"
                      onError={(e) => {
                        console.error("[HeaderEditor] Image failed to load:", {
                          url: value.url,
                          filename: value.filename,
                          error: e,
                        });
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                      <p className="text-white text-sm font-medium">
                        Click to replace
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    {currentFormat === "IMAGE" && (
                      <Image className="h-6 w-6 text-primary" />
                    )}
                    {currentFormat === "VIDEO" && (
                      <Video className="h-6 w-6 text-primary" />
                    )}
                    {currentFormat === "DOCUMENT" && (
                      <FileText className="h-6 w-6 text-primary" />
                    )}
                  </div>
                )}
                <p className="text-sm font-medium">
                  {value.filename || "File uploaded"}
                </p>
                {!(currentFormat === "IMAGE" && value.url) && (
                  <p className="text-xs text-muted-foreground">
                    Click to replace
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentFormat === "IMAGE" && "JPEG or PNG, max 5MB"}
                  {currentFormat === "VIDEO" && "MP4, max 16MB"}
                  {currentFormat === "DOCUMENT" && "PDF, max 100MB"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {currentFormat === "LOCATION" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location-lat">Latitude</Label>
            <Input
              id="location-lat"
              type="number"
              step="any"
              value={isLocationHeader(value) ? (value.latitude ?? "") : ""}
              onChange={(e) =>
                handleLocationChange(
                  "latitude",
                  parseFloat(e.target.value) || 0,
                )
              }
              placeholder="-90 to 90"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-lng">Longitude</Label>
            <Input
              id="location-lng"
              type="number"
              step="any"
              value={isLocationHeader(value) ? (value.longitude ?? "") : ""}
              onChange={(e) =>
                handleLocationChange(
                  "longitude",
                  parseFloat(e.target.value) || 0,
                )
              }
              placeholder="-180 to 180"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-name">Location Name</Label>
            <Input
              id="location-name"
              value={isLocationHeader(value) ? (value.name ?? "") : ""}
              onChange={(e) => handleLocationChange("name", e.target.value)}
              placeholder="e.g., Our Office"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-address">Address</Label>
            <Input
              id="location-address"
              value={isLocationHeader(value) ? (value.address ?? "") : ""}
              onChange={(e) => handleLocationChange("address", e.target.value)}
              placeholder="Street address"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default HeaderEditor;
