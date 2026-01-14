/**
 * useMediaUpload Hook
 * Manages file upload lifecycle with progress tracking
 */

import { mediaApi } from "@/lib/media/api";
import { Attachment, PendingUpload, validateFile } from "@/lib/media/types";
import { useCallback, useState } from "react";

export interface UseMediaUploadOptions {
  onSuccess?: (attachment: Attachment) => void;
  onError?: (error: Error) => void;
  maxFiles?: number;
}

export function useMediaUpload(options: UseMediaUploadOptions = {}) {
  const [pendingUploads, setPendingUploads] = useState<
    Map<string, PendingUpload>
  >(new Map());
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Create preview URL for media file
   */
  const createPreviewUrl = useCallback((file: File): string | undefined => {
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      return URL.createObjectURL(file);
    }
    return undefined;
  }, []);

  /**
   * Queue files for upload
   */
  const queueFiles = useCallback(
    (files: File[]) => {
      const newPending = new Map(pendingUploads);

      for (const file of files) {
        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
          console.error(
            `[queueFiles] File validation failed for ${file.name}:`,
            validation.errors
          );
          options.onError?.(new Error(validation.errors.join(", ")));
          continue;
        }

        // Check max files limit
        if (options.maxFiles && newPending.size >= options.maxFiles) {
          console.error(
            `[queueFiles] Max files limit reached (${options.maxFiles})`
          );
          options.onError?.(
            new Error(`Maximum ${options.maxFiles} files allowed`)
          );
          continue;
        }

        const id = Math.random().toString(36).substring(7);
        const upload: PendingUpload = {
          id,
          file,
          progress: 0,
          uploadedBytes: 0,
          totalBytes: file.size,
          status: "queued",
          previewUrl: createPreviewUrl(file),
        };

        newPending.set(id, upload);
      }

      setPendingUploads(newPending);
    },
    [pendingUploads, options, createPreviewUrl]
  );

  /**
   * Upload file to S3
   */
  const uploadFile = useCallback(
    async (
      uploadId: string,
      messageId: string,
      senderId?: number,
      contactId?: string
    ): Promise<Attachment | null> => {
      const upload = pendingUploads.get(uploadId);
      if (!upload) {
        const error = new Error("Upload not found");
        options.onError?.(error);
        throw error;
      }

      try {
        // Update status
        const updated = { ...upload, status: "uploading" as const };
        setPendingUploads(new Map(pendingUploads).set(uploadId, updated));

        // Upload file through backend (avoids CORS issues)
        const result = await mediaApi.uploadFileToBackend(
          upload.file,
          senderId!,
          contactId!,
          messageId,
          (progress) => {
            setPendingUploads(
              new Map(pendingUploads).set(uploadId, {
                ...upload,
                progress,
                uploadedBytes: (progress / 100) * upload.file.size,
              })
            );
          }
        );

        // Get file duration for media files
        let duration: number | undefined;
        if (
          upload.file.type.startsWith("audio/") ||
          upload.file.type.startsWith("video/")
        ) {
          try {
            duration = await getMediaDuration(upload.file);
          } catch (e) {
            console.warn("Failed to get media duration:", e);
          }
        }

        // Update status
        setPendingUploads(
          new Map(pendingUploads).set(uploadId, {
            ...upload,
            status: "completed",
            progress: 100,
          })
        );

        options.onSuccess?.(result.attachment);
        return result.attachment;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[Upload] Error during upload:`, {
          fileName: upload.file.name,
          uploadId,
          error: err.message,
          stack: err.stack,
        });

        // Update status
        setPendingUploads(
          new Map(pendingUploads).set(uploadId, {
            ...upload,
            status: "error",
            error: err.message,
          })
        );

        options.onError?.(err);
        throw err;
      }
    },
    [pendingUploads, options]
  );

  /**
   * Upload all pending files
   */
  const uploadAll = useCallback(
    async (
      messageId: string,
      senderId?: number,
      contactId?: string
    ): Promise<Attachment[]> => {
      setIsUploading(true);

      try {
        const attachments: Attachment[] = [];

        for (const [uploadId, upload] of pendingUploads) {
          if (upload.status === "queued" || upload.status === "error") {
            try {
              const attachment = await uploadFile(
                uploadId,
                messageId,
                senderId,
                contactId
              );
              if (attachment) {
                attachments.push(attachment);
              }
            } catch (e) {
              // Error already logged in uploadFile
            }
          }
        }

        // Clean up completed uploads after a delay
        setTimeout(() => {
          const newPending = new Map(pendingUploads);
          for (const [id, upload] of newPending) {
            if (upload.status === "completed") {
              newPending.delete(id);
              if (upload.previewUrl) {
                URL.revokeObjectURL(upload.previewUrl);
              }
            }
          }
          setPendingUploads(newPending);
        }, 1000);

        return attachments;
      } finally {
        setIsUploading(false);
      }
    },
    [pendingUploads, uploadFile]
  );

  /**
   * Remove pending upload
   */
  const removeUpload = useCallback((uploadId: string) => {
    setPendingUploads((prev) => {
      const newMap = new Map(prev);
      const upload = newMap.get(uploadId);
      if (upload?.previewUrl) {
        URL.revokeObjectURL(upload.previewUrl);
      }
      newMap.delete(uploadId);
      return newMap;
    });
  }, []);

  /**
   * Clear all uploads
   */
  const clearUploads = useCallback(() => {
    for (const upload of pendingUploads.values()) {
      if (upload.previewUrl) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    }
    setPendingUploads(new Map());
  }, [pendingUploads]);

  return {
    pendingUploads,
    isUploading,
    queueFiles,
    uploadFile,
    uploadAll,
    removeUpload,
    clearUploads,
  };
}

/**
 * Get media duration from file
 */
function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("audio/")) {
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load audio"));
      };
      audio.src = url;
    } else if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video"));
      };
      video.src = url;
    } else {
      URL.revokeObjectURL(url);
      resolve(0);
    }
  });
}
