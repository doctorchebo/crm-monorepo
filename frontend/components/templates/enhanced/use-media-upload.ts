"use client";

import { useNotification } from "@/hooks/use-notification";
import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useState } from "react";

/** Media upload constraints by type */
const MEDIA_CONSTRAINTS = {
  IMAGE: {
    accept: ["image/jpeg", "image/png"],
    maxSize: 5 * 1024 * 1024, // 5MB
    maxSizeLabel: "5MB",
    extensions: "JPEG or PNG",
  },
  VIDEO: {
    accept: ["video/mp4"],
    maxSize: 16 * 1024 * 1024, // 16MB
    maxSizeLabel: "16MB",
    extensions: "MP4",
  },
  DOCUMENT: {
    accept: ["application/pdf"],
    maxSize: 100 * 1024 * 1024, // 100MB
    maxSizeLabel: "100MB",
    extensions: "PDF",
  },
} as const;

type MediaType = keyof typeof MEDIA_CONSTRAINTS;

interface UploadResult {
  success: boolean;
  assetHandle?: string;
  mediaId?: string;
  url?: string;
  error?: string;
}

/**
 * Hook for handling media uploads to Meta's Resumable Upload API
 *
 * Usage:
 * ```tsx
 * const { upload, isUploading } = useMediaUpload('templateId', 'localeId');
 *
 * const result = await upload(file, 'HEADER', 'IMAGE');
 * ```
 */
export function useMediaUpload(templateId?: string, localeId?: string) {
  const { addNotification } = useNotification();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUpload, setCurrentUpload] = useState<{
    filename: string;
    mediaType: MediaType;
  } | null>(null);

  /**
   * Validate file before upload
   */
  const validateFile = useCallback(
    (file: File, mediaType: MediaType): { valid: boolean; error?: string } => {
      const constraints = MEDIA_CONSTRAINTS[mediaType];

      // Check file type
      if (!(constraints.accept as readonly string[]).includes(file.type)) {
        return {
          valid: false,
          error: `Invalid file type. Expected ${constraints.extensions}`,
        };
      }

      // Check file size
      if (file.size > constraints.maxSize) {
        return {
          valid: false,
          error: `File too large. Maximum size is ${constraints.maxSizeLabel}`,
        };
      }

      return { valid: true };
    },
    [],
  );

  /**
   * Convert file to base64
   */
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  /**
   * Upload media file
   * @param file The file to upload
   * @param componentType Where this media is used (HEADER or carousel card index as string)
   * @param mediaType The type of media (IMAGE, VIDEO, DOCUMENT)
   */
  const upload = useCallback(
    async (
      file: File,
      componentType: string,
      mediaType: MediaType,
    ): Promise<UploadResult> => {
      // Validate
      const validation = validateFile(file, mediaType);
      if (!validation.valid) {
        addNotification(validation.error!, "error");
        return { success: false, error: validation.error };
      }

      try {
        setIsUploading(true);
        setUploadProgress(0);
        setCurrentUpload({ filename: file.name, mediaType });

        // Convert to base64
        setUploadProgress(20);
        const base64Data = await fileToBase64(file);

        // Determine if we should use temporary upload (no template/locale yet)
        const useTemporaryUpload = !templateId || !localeId;

        setUploadProgress(50);

        if (useTemporaryUpload) {
          // Use temporary upload endpoint (direct to Meta, no DB record)
          const response = await backendApi.templates.uploadMediaTemporary({
            filename: file.name,
            mimeType: file.type,
            base64Data,
          });

          setUploadProgress(100);

          // Log the response for debugging
          console.log("[useMediaUpload] Temporary upload response:", {
            success: response.success,
            assetHandle: response.assetHandle,
            url: response.url,
            error: response.error,
          });

          const result: UploadResult = {
            success: response.success,
            assetHandle: response.assetHandle,
            url: response.url, // URL from S3 for display
            error: response.error,
          };

          if (result.success) {
            addNotification("Media uploaded successfully", "success");
          } else {
            addNotification(result.error || "Upload failed", "error");
          }

          return result;
        } else {
          // Use standard upload endpoint (with DB tracking)
          const isCarousel = componentType.startsWith("carousel_");
          const cardIndex = isCarousel
            ? parseInt(componentType.split("_")[1], 10)
            : undefined;

          const response = await backendApi.templates.uploadMedia(
            templateId,
            localeId,
            {
              componentType: isCarousel ? "CAROUSEL_CARD" : "HEADER",
              filename: file.name,
              mimeType: file.type,
              base64Data,
              cardIndex,
            },
          );

          setUploadProgress(100);

          // Log the response for debugging
          console.log("[useMediaUpload] Standard upload response:", {
            success: response.success,
            assetHandle: response.assetHandle,
            mediaId: response.mediaId,
            url: response.url,
            error: response.error,
          });

          const result: UploadResult = {
            success: response.success,
            assetHandle: response.assetHandle,
            mediaId: response.mediaId,
            url: response.url,
            error: response.error,
          };

          if (result.success) {
            addNotification("Media uploaded successfully", "success");
          } else {
            addNotification(result.error || "Upload failed", "error");
          }

          return result;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        addNotification(errorMessage, "error");
        return { success: false, error: errorMessage };
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        setCurrentUpload(null);
      }
    },
    [templateId, localeId, validateFile, fileToBase64, addNotification],
  );

  /**
   * Get constraints for a media type
   */
  const getConstraints = useCallback((mediaType: MediaType) => {
    return MEDIA_CONSTRAINTS[mediaType];
  }, []);

  return {
    upload,
    isUploading,
    uploadProgress,
    currentUpload,
    validateFile,
    getConstraints,
  };
}

/**
 * Get the accept string for file input
 */
export function getAcceptString(mediaType: MediaType): string {
  return MEDIA_CONSTRAINTS[mediaType].accept.join(",");
}

/**
 * Get human-readable constraints for a media type
 */
export function getMediaConstraints(mediaType: MediaType) {
  return MEDIA_CONSTRAINTS[mediaType];
}

export { MEDIA_CONSTRAINTS };
export type { MediaType, UploadResult };
