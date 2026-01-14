"use client";

import { AttachmentType } from "@/components/media/attachment-menu";
import {
  invalidateCacheForAttachment,
  invalidateStagingCaches,
} from "@/hooks/use-media-url";
import { backendApi } from "@/lib/api/endpoints";
import { mediaCache } from "@/lib/cache/media-cache";
import { mediaApi } from "@/lib/media/api";
import {
  createStagedFile,
  getStagingIds,
  StagedFile,
} from "@/lib/media/staging-types";
import { Attachment, hasAccessibleMediaSource } from "@/lib/media/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE } from "../constants";
import type { Chat, Message, MessagesCacheEntry } from "../types";

interface UseMediaHandlersProps {
  selectedChatId: string | null;
  chats: Chat[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;
  /**
   * Ref to track which chat the current messages belong to.
   * Use this to validate before updating messages to prevent cross-chat contamination.
   */
  currentMessagesChatIdRef: React.MutableRefObject<string | null>;
  setShouldAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  scrollHelperRequestScroll: (smooth?: boolean) => (() => void) | undefined;
  replyingToMessage: Message | null;
  setReplyingToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
}

/**
 * Previewable media item interface
 */
export interface PreviewableMediaItem {
  attachment: Attachment;
  messageId: string;
  attachmentIndex: number;
}

interface UseMediaHandlersReturn {
  // Media staging state
  mediaStagingOpen: boolean;
  setMediaStagingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stagedFiles: StagedFile[];
  setStagedFiles: React.Dispatch<React.SetStateAction<StagedFile[]>>;
  currentAttachmentType: AttachmentType;
  /** ID of the staged file that should be focused (used when adding more files) */
  focusFileId: string | null;

  // Preview modal state
  previewModalOpen: boolean;
  setPreviewModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** All previewable media items from current messages batch */
  previewMediaItems: PreviewableMediaItem[];
  previewInitialIndex: number;

  // Download menu state
  downloadMenuOpen: boolean;
  setDownloadMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  downloadMenuPosition: { x: number; y: number };
  currentMessageAttachments: Attachment[];
  currentMessageId: string;
  downloadLoading: boolean;

  // Video preview
  videoPreview: { videoId: string; url: string; title?: string } | null;
  setVideoPreview: React.Dispatch<
    React.SetStateAction<{
      videoId: string;
      url: string;
      title?: string;
    } | null>
  >;

  // Camera capture state
  cameraOpen: boolean;
  setCameraOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Image editor state
  imageEditorOpen: boolean;
  setImageEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  imageToEdit: string | null;
  imageEditorSource: "camera" | "attachment" | null;
  /** @deprecated No longer needed - editing is now integrated in staging panel */
  editingStagedFileId: string | null;

  // Refs
  addMoreInputRef: React.RefObject<HTMLInputElement | null>;

  // Handlers
  handleFilesSelected: (files: File[], type: AttachmentType) => void;
  handleRemoveStagedFile: (id: string) => void;
  handleCloseStagingModal: () => void;
  handleSendMediaFromStaging: (caption: string) => Promise<void>;
  handleAddMoreMedia: () => void;
  handleSendVoiceNote: (
    audioBlob: Blob,
    duration: number,
    waveformData: number[]
  ) => Promise<void>;
  handleImageClick: (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => void;
  handleShowDownloadMenu: (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => void;
  handleVideoPlay: (videoId: string, url: string) => void;
  handleDownloadSingle: () => Promise<void>;
  handleDownloadPack: () => Promise<void>;
  handleDownloadById: (messageId: string) => void;

  // Camera handlers
  handleCameraClick: () => void;
  handleCameraCapture: (imageDataUrl: string) => void;
  handleCameraClose: () => void;

  // Image editor handlers
  handleImageEditorSend: (imageBlob: Blob, caption: string) => Promise<void>;
  handleImageEditorRetake: () => void;
  handleImageEditorClose: () => void;
  handleEditAttachedImage: (imageUrl: string) => void;
  /** @deprecated No longer needed - editing is now integrated in staging panel */
  handleEditStagedImage: (file: StagedFile) => void;
  /** Called when an image is edited in the staging panel - returns Promise that resolves when re-upload is complete */
  handleStagedImageEdited: (fileId: string, imageBlob: Blob) => Promise<void>;
}

export function useMediaHandlers(
  props: UseMediaHandlersProps
): UseMediaHandlersReturn {
  const {
    selectedChatId,
    chats,
    messages,
    setMessages,
    setMessageCount,
    setError,
    messagesCacheRef,
    currentMessagesChatIdRef,
    setShouldAutoScroll,
    scrollHelperRequestScroll,
    replyingToMessage,
    setReplyingToMessage,
  } = props;

  // Media staging state
  const [mediaStagingOpen, setMediaStagingOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [currentAttachmentType, setCurrentAttachmentType] =
    useState<AttachmentType>("photos-videos");
  const [focusFileId, setFocusFileId] = useState<string | null>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);

  // Build previewable media items from all messages in the current batch
  // Only includes visual media (images/videos) that have accessible media sources
  // Excludes deleted messages - their attachments should not be shown in the preview
  const previewMediaItems = useMemo<PreviewableMediaItem[]>(() => {
    const items: PreviewableMediaItem[] = [];

    for (const message of messages) {
      // Skip deleted messages - their attachments should not be shown
      if (message.isDeleted) continue;
      if (!message.attachments || !Array.isArray(message.attachments)) continue;

      message.attachments.forEach((attachment, index) => {
        // Only include visual media (images and videos)
        // AND only if the attachment has accessible media source (s3Key or cloud-api reference)
        if (
          (attachment.type === "image" || attachment.type === "video") &&
          hasAccessibleMediaSource(attachment)
        ) {
          items.push({
            attachment,
            messageId: message.messageId,
            attachmentIndex: index,
          });
        }
      });
    }

    return items;
  }, [messages]);

  // Download menu state
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadMenuPosition, setDownloadMenuPosition] = useState({
    x: 0,
    y: 0,
  });
  const [currentMessageAttachments, setCurrentMessageAttachments] = useState<
    Attachment[]
  >([]);
  const [currentMessageId, setCurrentMessageId] = useState<string>("");
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Video preview
  const [videoPreview, setVideoPreview] = useState<{
    videoId: string;
    url: string;
    title?: string;
  } | null>(null);

  // Camera capture state
  const [cameraOpen, setCameraOpen] = useState(false);

  // Image editor state
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string | null>(null);
  const [imageEditorSource, setImageEditorSource] = useState<
    "camera" | "attachment" | null
  >(null);
  // @deprecated - no longer needed with integrated editing
  const [editingStagedFileId, setEditingStagedFileId] = useState<string | null>(
    null
  );

  // Track mounted state for async operations
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Get current staged files for cleanup on unmount
  const stagedFilesRef = useRef(stagedFiles);
  stagedFilesRef.current = stagedFiles;

  // Track staging IDs that have been committed to messages AND promoted
  // These should NOT be cleaned up on unmount because:
  // 1. The files have been copied to the final message path in S3
  // 2. The database s3Key has been updated to the promoted path
  // 3. Staging records can be safely cleaned up by the scheduled task
  const committedStagingIdsRef = useRef<Set<string>>(new Set());

  // Cleanup staged files on unmount (user navigated away without sending)
  // This handles the case where user adds files to staging but never sends.
  // Committed files (successfully promoted) are excluded from cleanup.
  useEffect(() => {
    return () => {
      const allStagingIds = getStagingIds(stagedFilesRef.current);
      const committedIds = committedStagingIdsRef.current;

      // Only cleanup staging files that were NOT committed to messages
      const stagingIdsToCleanup = allStagingIds.filter(
        (id) => !committedIds.has(id)
      );

      if (stagingIdsToCleanup.length > 0) {
        console.log(
          "[MediaHandlers] Cleaning up uncommitted staged files on unmount:",
          stagingIdsToCleanup
        );
        console.log(
          "[MediaHandlers] Skipping committed staging IDs:",
          Array.from(committedIds)
        );
        mediaApi.cleanupBatchStagedFiles(stagingIdsToCleanup).catch((err) => {
          console.error("[MediaHandlers] Cleanup on unmount failed:", err);
        });
      } else if (allStagingIds.length > 0) {
        console.log(
          "[MediaHandlers] All staged files were committed, skipping cleanup:",
          allStagingIds
        );
      }
    };
  }, []);

  /**
   * Upload a file to staging area for thumbnail pre-generation
   * Returns a Promise that resolves with the upload result
   */
  const uploadToStaging = useCallback(
    async (
      file: StagedFile
    ): Promise<{
      success: boolean;
      stagingId?: string;
      s3Key?: string;
      thumbnailKey?: string;
      error?: string;
    }> => {
      const selectedChat = chats.find((c) => c.chatId === selectedChatId);
      if (!selectedChat || !selectedChatId) {
        console.error("[Staging] Cannot upload - no chat selected");
        setStagedFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, uploadStatus: "failed", error: "No chat selected" }
              : f
          )
        );
        return { success: false, error: "No chat selected" };
      }

      // Update status to uploading
      setStagedFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, uploadStatus: "uploading" } : f
        )
      );

      try {
        const result = await mediaApi.stageFile(
          file.file,
          selectedChat.senderId,
          selectedChatId,
          (progress) => {
            if (isMountedRef.current) {
              setStagedFiles((prev) =>
                prev.map((f) =>
                  f.id === file.id ? { ...f, uploadProgress: progress } : f
                )
              );
            }
          }
        );

        if (!isMountedRef.current) {
          return { success: false, error: "Component unmounted" };
        }

        console.log(`[Staging] Upload complete for ${file.id}:`, result);

        // Update state and ref synchronously so that handleSendMediaFromStaging
        // can read the latest data immediately after upload completes
        setStagedFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  uploadStatus: "uploaded" as const,
                  uploadProgress: 100,
                  stagingId: result.stagingId,
                  s3Key: result.s3Key,
                  thumbnailKey: result.thumbnailKey,
                  thumbnailStatus: result.thumbnailQueued
                    ? ("processing" as const)
                    : ("pending" as const),
                }
              : f
          );
          // Update ref synchronously within the state updater
          stagedFilesRef.current = updated;
          return updated;
        });

        // Start polling for thumbnail if queued
        if (result.thumbnailQueued) {
          pollThumbnailStatus(file.id, result.stagingId);
        }

        return {
          success: true,
          stagingId: result.stagingId,
          s3Key: result.s3Key,
          thumbnailKey: result.thumbnailKey,
        };
      } catch (error) {
        console.error(`[Staging] Upload failed for ${file.id}:`, error);

        if (!isMountedRef.current) {
          return { success: false, error: "Component unmounted" };
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        setStagedFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, uploadStatus: "failed", error: errorMessage }
              : f
          )
        );

        return { success: false, error: errorMessage };
      }
    },
    [selectedChatId, chats]
  );

  /**
   * Poll for thumbnail generation status
   */
  const thumbnailPollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const pollThumbnailStatus = useCallback(
    (fileId: string, stagingId: string) => {
      let pollCount = 0;
      const maxPolls = 30;
      const pollInterval = 2000;

      const poll = async () => {
        if (!isMountedRef.current || pollCount >= maxPolls) {
          thumbnailPollingRef.current.delete(stagingId);
          if (pollCount >= maxPolls) {
            setStagedFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, thumbnailStatus: "failed" } : f
              )
            );
          }
          return;
        }

        pollCount++;

        try {
          const status = await mediaApi.getStagingStatus(stagingId);

          if (!isMountedRef.current) return;

          if (status) {
            setStagedFiles((prev) =>
              prev.map((f) =>
                f.id === fileId
                  ? {
                      ...f,
                      thumbnailStatus: status.thumbnailStatus as
                        | "pending"
                        | "processing"
                        | "completed"
                        | "failed",
                      thumbnailUrl: status.thumbnailUrl,
                    }
                  : f
              )
            );

            if (
              status.thumbnailStatus === "completed" ||
              status.thumbnailStatus === "failed"
            ) {
              thumbnailPollingRef.current.delete(stagingId);
              return;
            }
          }

          // Continue polling
          if (isMountedRef.current) {
            const timerId = setTimeout(poll, pollInterval);
            thumbnailPollingRef.current.set(stagingId, timerId);
          }
        } catch (error) {
          console.error(`[Staging] Poll error for ${stagingId}:`, error);
          if (isMountedRef.current && pollCount < maxPolls) {
            const timerId = setTimeout(poll, pollInterval);
            thumbnailPollingRef.current.set(stagingId, timerId);
          }
        }
      };

      // Start initial poll
      const timerId = setTimeout(poll, pollInterval);
      thumbnailPollingRef.current.set(stagingId, timerId);
    },
    []
  );

  // Handle files selected from attachment menu
  // Now immediately starts staging uploads for thumbnail pre-generation
  const handleFilesSelected = useCallback(
    (files: File[], type: AttachmentType) => {
      setCurrentAttachmentType(type);

      // Create staged files with upload tracking
      const newStagedFiles: StagedFile[] = files.map((file) =>
        createStagedFile(file)
      );

      // Set focus to the first new file when adding more
      if (newStagedFiles.length > 0) {
        setFocusFileId(newStagedFiles[0].id);
      }

      setStagedFiles((prev) => [...prev, ...newStagedFiles]);
      setMediaStagingOpen(true);

      // Start staging uploads for each file immediately
      newStagedFiles.forEach((file) => {
        uploadToStaging(file);
      });
    },
    [uploadToStaging]
  );

  // Handle removing a staged file - cleans up from S3 if uploaded
  const handleRemoveStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find((f) => f.id === id);

      if (file) {
        // Clean up blob URL
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }

        // Clean up from S3 if staged
        if (file.stagingId) {
          console.log(`[Staging] Cleaning up ${file.stagingId}`);

          // Stop thumbnail polling
          const timerId = thumbnailPollingRef.current.get(file.stagingId);
          if (timerId) {
            clearTimeout(timerId);
            thumbnailPollingRef.current.delete(file.stagingId);
          }

          // Cleanup from S3 (fire and forget)
          mediaApi.cleanupStagedFile(file.stagingId).catch((err) => {
            console.error(`[Staging] Cleanup failed:`, err);
          });
        }
      }

      const newFiles = prev.filter((f) => f.id !== id);
      if (newFiles.length === 0) {
        setMediaStagingOpen(false);
      }
      return newFiles;
    });
  }, []);

  // Handle closing the staging modal - cleans up all staged files from S3
  const handleCloseStagingModal = useCallback(() => {
    // Get staging IDs before clearing
    const currentFiles = stagedFilesRef.current;
    const stagingIds = getStagingIds(currentFiles);

    // Clean up blob URLs
    currentFiles.forEach((file) => {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    });

    // Stop all thumbnail polling
    thumbnailPollingRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    thumbnailPollingRef.current.clear();

    // Clear state
    setStagedFiles([]);
    setMediaStagingOpen(false);
    setFocusFileId(null);

    // Cleanup from S3
    if (stagingIds.length > 0) {
      console.log(`[Staging] Batch cleanup:`, stagingIds);
      mediaApi.cleanupBatchStagedFiles(stagingIds).catch((err) => {
        console.error(`[Staging] Batch cleanup failed:`, err);
      });
    }
  }, []);

  // Handle sending media from staging modal
  // Each file is sent as a separate message due to WhatsApp Cloud API limitation
  // Files are already pre-uploaded to staging - we promote them to the message path
  const handleSendMediaFromStaging = useCallback(
    async (caption: string) => {
      if (stagedFiles.length === 0 || !selectedChatId) return;

      // Check if all files are uploaded (staged)
      const hasFailedUploads = stagedFiles.some(
        (f) => f.uploadStatus === "failed"
      );
      const hasUploading = stagedFiles.some(
        (f) => f.uploadStatus === "uploading" || f.uploadStatus === "pending"
      );

      if (hasFailedUploads) {
        setError("Some files failed to upload. Remove them to continue.");
        return;
      }

      if (hasUploading) {
        setError("Please wait for uploads to complete.");
        return;
      }

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        // Stop all thumbnail polling
        thumbnailPollingRef.current.forEach((timerId) => {
          clearTimeout(timerId);
        });
        thumbnailPollingRef.current.clear();

        // Close modal and clear staging immediately for better UX
        // IMPORTANT: Use stagedFilesRef.current to ensure we get the latest data
        // (including any edited files that were just re-uploaded)
        const filesToSend = [...stagedFilesRef.current];

        // Debug: Log the files we're about to send
        console.log(
          `[Staging] Preparing to send ${filesToSend.length} files:`,
          filesToSend.map((f) => ({
            id: f.id,
            stagingId: f.stagingId,
            uploadStatus: f.uploadStatus,
            s3Key: f.s3Key,
            fileName: f.file.name,
          }))
        );

        setStagedFiles([]);
        setMediaStagingOpen(false);

        // Track all created messages for cleanup
        const previewUrlsToCleanup: string[] = [];

        // =========================================================
        // PHASE 1: Create messages AND promote staging files immediately
        // This ensures each message has the correct s3Key before proceeding.
        // If page refreshes mid-loop, completed messages have correct paths.
        // =========================================================
        interface PreparedMessage {
          messageId: string;
          stagedFile: StagedFile;
          isFirstMessage: boolean;
          optimisticMessage: Message;
          promotedS3Key: string;
          promotedThumbnailKey?: string;
        }

        const preparedMessages: PreparedMessage[] = [];

        for (let i = 0; i < filesToSend.length; i++) {
          const stagedFile = filesToSend[i];
          const isFirstMessage = i === 0;

          // Track preview URL for cleanup
          if (stagedFile.previewUrl) {
            previewUrlsToCleanup.push(stagedFile.previewUrl);
          }

          // Create message payload for this single attachment
          const messagePayload: any = {
            to: selectedChat.participantPhone,
            senderId: selectedChat.senderId,
            attachments: [
              {
                id: stagedFile.id,
                type: stagedFile.type,
                fileName: stagedFile.file.name,
                mimeType: stagedFile.file.type || "application/octet-stream",
                size: stagedFile.file.size,
                s3Key: stagedFile.s3Key || "",
                status:
                  stagedFile.uploadStatus === "uploaded"
                    ? "success"
                    : "pending",
                uploadedAt: new Date().toISOString(),
                stagingId: stagedFile.stagingId,
                thumbnailKey: stagedFile.thumbnailKey,
              },
            ],
          };

          if (isFirstMessage && caption.trim()) {
            messagePayload.body = caption;
          }

          if (isFirstMessage && replyingToMessage?.messageId) {
            messagePayload.replyToMessageId = replyingToMessage.messageId;
          }

          // Create message record in backend
          const sentMessage = (await backendApi.whatsapp.sendMessage(
            messagePayload
          )) as { messageId?: string };

          if (!sentMessage?.messageId) {
            throw new Error(`Failed to get message ID for file ${i + 1}`);
          }

          const messageId = sentMessage.messageId;

          // =========================================================
          // CRITICAL: Promote staging file IMMEDIATELY after message creation
          // This ensures the database has the correct s3Key even if
          // the page refreshes before PHASE 3 completes.
          // =========================================================
          let promotedS3Key = stagedFile.s3Key || "";
          let promotedThumbnailKey = stagedFile.thumbnailKey;

          // Debug: Log staging state to understand why promotion might be skipped
          console.log(`[Staging] File ${i + 1}/${filesToSend.length} state:`, {
            id: stagedFile.id,
            stagingId: stagedFile.stagingId,
            uploadStatus: stagedFile.uploadStatus,
            s3Key: stagedFile.s3Key,
            fileName: stagedFile.file.name,
          });

          if (stagedFile.stagingId && stagedFile.uploadStatus === "uploaded") {
            try {
              console.log(
                `[Staging] Promoting ${stagedFile.stagingId} for message ${messageId}, attachment ${stagedFile.id}`
              );

              const promoted = await mediaApi.promoteStagedFile(
                stagedFile.stagingId,
                messageId,
                selectedChat.senderId,
                selectedChatId,
                stagedFile.id
              );

              promotedS3Key = promoted.s3Key;
              promotedThumbnailKey =
                promoted.thumbnailKey || promotedThumbnailKey;
              console.log(`[Staging] Promoted to ${promotedS3Key}`);

              // CRITICAL: Invalidate all caches for this attachment
              // The staging URLs are now invalid - files have been moved.
              // This clears both module-level cache (use-media-url.ts) and
              // singleton cache (media-cache.ts) to ensure fresh URLs are fetched.
              invalidateCacheForAttachment(messageId, stagedFile.id);
              mediaCache.invalidateAttachmentUrl(messageId, stagedFile.id);

              // Mark as committed (file has been promoted, safe to cleanup staging record)
              committedStagingIdsRef.current.add(stagedFile.stagingId);
            } catch (promoteError) {
              console.error(
                `[Staging] Promotion failed for ${stagedFile.stagingId}:`,
                promoteError
              );
              // Continue with original s3Key - WhatsApp send will still work
              // but future loads may fail if staging files get cleaned up
            }
          }

          // Create optimistic message for UI with PROMOTED s3Key
          // Map staging thumbnailStatus to attachment thumbnailStatus:
          // "completed" -> "ready", others map directly
          const attachmentThumbnailStatus =
            stagedFile.thumbnailStatus === "completed"
              ? ("ready" as const)
              : stagedFile.thumbnailStatus === "failed"
                ? ("failed" as const)
                : ("pending" as const);

          const optimisticMessage: Message = {
            messageId: messageId,
            text: isFirstMessage && caption.trim() ? caption : null,
            sender: selectedChat.businessPhone || "",
            direction: "outbound" as const,
            timestamp: new Date().toISOString(),
            type: stagedFile.type,
            status: "pending" as const,
            attachments: [
              {
                id: stagedFile.id,
                type: stagedFile.type,
                fileName: stagedFile.file.name,
                mimeType: stagedFile.file.type || "application/octet-stream",
                size: stagedFile.file.size,
                s3Key: promotedS3Key,
                thumbnailKey: promotedThumbnailKey,
                // CRITICAL: Include thumbnailStatus so useMediaUrl can load the thumbnail
                // Without this, hasThumbnail is false and it falls back to loading full image
                thumbnailStatus: attachmentThumbnailStatus,
                status:
                  stagedFile.uploadStatus === "uploaded"
                    ? "success"
                    : ("uploading" as const),
                uploadedAt: new Date().toISOString(),
                // DON'T include previewUrl once we have a promoted s3Key
                // The blob URL will be revoked soon, and useMediaUrl should load from S3 instead
                // Only keep previewUrl if promotion failed (s3Key still starts with "staging/")
                previewUrl: promotedS3Key.startsWith("staging/")
                  ? stagedFile.previewUrl
                  : undefined,
                progress: stagedFile.uploadStatus === "uploaded" ? 100 : 0,
              },
            ],
            replyToMessageId:
              isFirstMessage && replyingToMessage?.messageId
                ? replyingToMessage.messageId
                : null,
            replyPreview:
              isFirstMessage && replyingToMessage
                ? {
                    messageId: replyingToMessage.messageId,
                    senderType:
                      replyingToMessage.direction === "inbound"
                        ? ("customer" as const)
                        : ("agent" as const),
                    senderName:
                      replyingToMessage.direction === "inbound"
                        ? selectedChat.participantName || "Contact"
                        : "You",
                    type:
                      (replyingToMessage.type as
                        | "text"
                        | "image"
                        | "video"
                        | "audio"
                        | "document"
                        | "contacts"
                        | "sticker"
                        | "gif") || "text",
                    text: replyingToMessage.text || undefined,
                  }
                : null,
          };

          preparedMessages.push({
            messageId,
            stagedFile,
            isFirstMessage,
            optimisticMessage,
            promotedS3Key,
            promotedThumbnailKey,
          });
        }

        // CRITICAL: After all promotions, clear any remaining staging URLs from caches
        // This ensures no stale staging URLs are served from any cache layer
        invalidateStagingCaches();
        mediaCache.invalidateStagingUrls();

        // =========================================================
        // PHASE 2: Add ALL optimistic messages to UI in one batch
        // This ensures scroll request sees all messages at once
        // =========================================================
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.messageId));
          const newMessages = preparedMessages
            .map((pm) => pm.optimisticMessage)
            .filter((m) => !existingIds.has(m.messageId));
          return [...prev, ...newMessages];
        });
        setMessageCount((prev) => prev + preparedMessages.length);

        // Request scroll AFTER messages are added to state
        // Use setTimeout to ensure React has processed the state update
        setShouldAutoScroll(true);
        setTimeout(() => {
          scrollHelperRequestScroll(true);
        }, 50);

        // =========================================================
        // PHASE 3: Send to WhatsApp API in background (don't await)
        // Promotion already happened in PHASE 1, so we just need to:
        // 1. Handle fallback upload for files that weren't staged
        // 2. Get download URL and send to WhatsApp
        // =========================================================
        (async () => {
          for (const {
            messageId,
            stagedFile,
            isFirstMessage,
            promotedS3Key,
          } of preparedMessages) {
            // Helper to update this message's attachment status
            const updateMessageStatus = (
              status: "uploading" | "success" | "failed",
              additionalData?: {
                progress?: number;
                s3Key?: string;
                errorMessage?: string;
              }
            ) => {
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.messageId !== messageId) return msg;
                  return {
                    ...msg,
                    status:
                      status === "success"
                        ? "sent"
                        : status === "failed"
                          ? "failed"
                          : msg.status,
                    attachments: msg.attachments?.map((att) => ({
                      ...att,
                      status,
                      ...additionalData,
                      // CRITICAL: Clear previewUrl when s3Key is updated
                      // This ensures useMediaUrl loads the actual thumbnail from S3
                      // instead of continuing to use the local blob URL
                      previewUrl: additionalData?.s3Key
                        ? undefined
                        : att.previewUrl,
                    })),
                  };
                })
              );
            };

            try {
              let s3Key = promotedS3Key;

              // Fallback: upload fresh if not staged (shouldn't happen normally)
              if (
                !stagedFile.stagingId ||
                stagedFile.uploadStatus !== "uploaded"
              ) {
                console.log(
                  `[Staging] Fallback upload for ${stagedFile.file.name}`
                );

                const result = await mediaApi.uploadFileToBackend(
                  stagedFile.file,
                  selectedChat.senderId,
                  selectedChatId,
                  messageId,
                  (progress) => {
                    updateMessageStatus("uploading", { progress });
                  },
                  stagedFile.id
                );
                s3Key = result.s3Key;
              }

              // Get download URL and send via WhatsApp
              const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
                messageId,
                stagedFile.id
              )) as { url?: string };

              if (downloadUrl?.url) {
                await backendApi.whatsapp.sendMedia({
                  to: selectedChat.participantPhone,
                  mediaType: stagedFile.type,
                  mediaUrl: downloadUrl.url,
                  caption: isFirstMessage ? caption : undefined,
                  senderId: selectedChat.senderId,
                  fileName: stagedFile.file.name,
                  originalMessageId: messageId,
                  attachmentId: stagedFile.id,
                });
              }

              // Mark as success
              updateMessageStatus("success", {
                progress: 100,
                s3Key: s3Key,
              });
            } catch (uploadError) {
              console.error(
                `Failed to send ${stagedFile.file.name}:`,
                uploadError
              );
              updateMessageStatus("failed", { errorMessage: "Send failed" });
            }
          }

          // Refresh messages from backend after all uploads complete
          if (currentMessagesChatIdRef.current === selectedChatId) {
            const response = await backendApi.whatsapp.getChatMessages(
              selectedChatId,
              0,
              PAGE_SIZE
            );

            if (
              currentMessagesChatIdRef.current === selectedChatId &&
              response?.messages
            ) {
              const sorted = [...response.messages].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              );
              const cachedData = messagesCacheRef.current.get(selectedChatId);
              let combined = sorted;
              if (cachedData && cachedData.cursor > PAGE_SIZE) {
                const existingIds = new Set(sorted.map((m) => m.messageId));
                const olderMessages = cachedData.messages.filter(
                  (m) => !existingIds.has(m.messageId)
                );
                combined = [...olderMessages, ...sorted].sort(
                  (a, b) =>
                    new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime()
                );
              }
              setMessages(combined);
              setMessageCount(combined.length);
              messagesCacheRef.current.set(selectedChatId, {
                messages: combined,
                hasMore: cachedData?.hasMore ?? response.hasMore,
                cursor: cachedData?.cursor ?? response.nextCursor,
              });
            }
          }

          // Clean up preview blob URLs
          setTimeout(() => {
            previewUrlsToCleanup.forEach((url) => {
              URL.revokeObjectURL(url);
            });
          }, 2000);
        })(); // End of async IIFE for background uploads

        // Clear reply state immediately (UI feedback)
        setReplyingToMessage(null);
      } catch (err: any) {
        console.error("Error sending media:", err);

        if (
          err?.response?.data?.error === "CONVERSATION_WINDOW_VIOLATION" ||
          err?.response?.data?.errorCode === "OUTSIDE_CONVERSATION_WINDOW" ||
          err?.response?.data?.errorCode === "NO_CUSTOMER_MESSAGES"
        ) {
          const errorData = err.response.data;
          setError(
            errorData.message ||
              "Cannot send media: Outside 24-hour conversation window. Use an approved template."
          );
        } else {
          setError("Failed to send media");
        }
      }
    },
    [
      stagedFiles,
      selectedChatId,
      chats,
      replyingToMessage,
      messagesCacheRef,
      currentMessagesChatIdRef,
      setMessages,
      setMessageCount,
      setError,
      setShouldAutoScroll,
      scrollHelperRequestScroll,
      setReplyingToMessage,
    ]
  );

  // Handle "Add More" from staging modal
  const handleAddMoreMedia = useCallback(() => {
    addMoreInputRef.current?.click();
  }, []);

  // Handle sending a voice note
  const handleSendVoiceNote = useCallback(
    async (audioBlob: Blob, duration: number, waveformData: number[]) => {
      if (!selectedChatId) return;

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        const uploadId = `voice-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const voiceFile = new File([audioBlob], `voice-note-${uploadId}.webm`, {
          type: audioBlob.type || "audio/webm",
        });

        setShouldAutoScroll(true);
        scrollHelperRequestScroll(true);

        const messagePayload: any = {
          to: selectedChat.participantPhone,
          senderId: selectedChat.senderId,
          attachments: [
            {
              id: uploadId,
              type: "audio",
              fileName: voiceFile.name,
              mimeType: voiceFile.type || "audio/webm",
              size: voiceFile.size,
              s3Key: "",
              status: "pending",
              uploadedAt: new Date().toISOString(),
              isVoiceNote: true,
              waveformData: waveformData,
              duration: duration,
            },
          ],
        };

        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        const sentMessage = (await backendApi.whatsapp.sendMessage(
          messagePayload
        )) as { messageId?: string };

        if (!sentMessage?.messageId) {
          throw new Error("Failed to get message ID");
        }

        const messageId = sentMessage.messageId;

        // Create optimistic message for immediate UI display
        const optimisticMessage = {
          messageId: messageId,
          text: null,
          sender: selectedChat.businessPhone || "",
          direction: "outbound" as const,
          timestamp: new Date().toISOString(),
          type: "audio",
          status: "pending" as const,
          attachments: [
            {
              id: uploadId,
              type: "audio" as const,
              fileName: voiceFile.name,
              mimeType: voiceFile.type || "audio/webm",
              size: voiceFile.size,
              s3Key: "",
              status: "uploading" as const,
              uploadedAt: new Date().toISOString(),
              isVoiceNote: true,
              waveformData: waveformData,
              duration: duration,
              progress: 0,
            },
          ],
          replyToMessageId: replyingToMessage?.messageId || null,
          replyPreview: replyingToMessage
            ? {
                messageId: replyingToMessage.messageId,
                senderType:
                  replyingToMessage.direction === "inbound"
                    ? ("customer" as const)
                    : ("agent" as const),
                senderName:
                  replyingToMessage.direction === "inbound"
                    ? selectedChat.participantName || "Contact"
                    : "You",
                type:
                  (replyingToMessage.type as
                    | "text"
                    | "image"
                    | "video"
                    | "audio"
                    | "document"
                    | "contacts"
                    | "sticker"
                    | "gif") || "text",
                text: replyingToMessage.text || undefined,
              }
            : null,
        };

        // Add optimistic message to the UI
        setMessages((prev) => {
          if (prev.some((m) => m.messageId === messageId)) {
            return prev;
          }
          return [...prev, optimisticMessage];
        });
        setMessageCount((prev) => prev + 1);

        // Helper to update message status
        const updateMessageStatus = (
          status: "uploading" | "success" | "failed",
          additionalData?: {
            progress?: number;
            s3Key?: string;
            errorMessage?: string;
          }
        ) => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.messageId !== messageId) return msg;
              return {
                ...msg,
                status:
                  status === "success"
                    ? "sent"
                    : status === "failed"
                      ? "failed"
                      : msg.status,
                attachments: msg.attachments?.map((att) => ({
                  ...att,
                  status,
                  ...additionalData,
                })),
              };
            })
          );
        };

        try {
          const result = await mediaApi.uploadFileToBackend(
            voiceFile,
            selectedChat.senderId,
            selectedChatId,
            messageId,
            (progress) => {
              updateMessageStatus("uploading", { progress });
            },
            uploadId
          );

          const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
            messageId,
            result.uploadId
          )) as { url?: string };

          if (downloadUrl?.url) {
            await backendApi.whatsapp.sendMedia({
              to: selectedChat.participantPhone,
              mediaType: "audio",
              mediaUrl: downloadUrl.url,
              senderId: selectedChat.senderId,
              originalMessageId: messageId,
              attachmentId: uploadId,
            });
          }

          updateMessageStatus("success", {
            progress: 100,
            s3Key: result.s3Key,
          });
        } catch (uploadError) {
          console.error("Failed to upload voice note:", uploadError);
          updateMessageStatus("failed", { errorMessage: "Upload failed" });
        }

        setReplyingToMessage(null);

        // Refresh messages from backend
        if (currentMessagesChatIdRef.current === selectedChatId) {
          const response = await backendApi.whatsapp.getChatMessages(
            selectedChatId,
            0,
            PAGE_SIZE
          );

          if (
            currentMessagesChatIdRef.current === selectedChatId &&
            response?.messages
          ) {
            const sorted = [...response.messages].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
            setMessages(sorted);
            setMessageCount(sorted.length);
            messagesCacheRef.current.set(selectedChatId, {
              messages: sorted,
              hasMore: response.hasMore,
              cursor: response.nextCursor,
            });
            scrollHelperRequestScroll(true);
          }
        }
      } catch (err: any) {
        console.error("Error sending voice note:", err);

        if (
          err?.response?.data?.error === "CONVERSATION_WINDOW_VIOLATION" ||
          err?.response?.data?.errorCode === "OUTSIDE_CONVERSATION_WINDOW" ||
          err?.response?.data?.errorCode === "NO_CUSTOMER_MESSAGES"
        ) {
          const errorData = err.response.data;
          setError(
            errorData.message ||
              "Cannot send voice note: Outside 24-hour conversation window. Use an approved template."
          );
        } else {
          setError("Failed to send voice note");
        }
      }
    },
    [
      selectedChatId,
      chats,
      replyingToMessage,
      messagesCacheRef,
      currentMessagesChatIdRef,
      setMessages,
      setMessageCount,
      setError,
      setShouldAutoScroll,
      scrollHelperRequestScroll,
      setReplyingToMessage,
    ]
  );

  // Media preview modal handlers
  const handleImageClick = useCallback(
    (messageId: string, attachments: Attachment[], index: number) => {
      // Get the attachment at the clicked index (within the message)
      const clickedAttachment = attachments[index];
      if (!clickedAttachment) return;

      // Only open preview for visual media
      if (
        clickedAttachment.type !== "image" &&
        clickedAttachment.type !== "video"
      ) {
        return;
      }

      // Check if the attachment has accessible media source
      // Don't open preview for inaccessible media (deleted, expired, etc.)
      if (!hasAccessibleMediaSource(clickedAttachment)) {
        console.warn(
          `Cannot preview attachment ${clickedAttachment.id}: no accessible media source`
        );
        return;
      }

      // Find the index of this attachment in the previewMediaItems array
      const previewIndex = previewMediaItems.findIndex(
        (item) =>
          item.messageId === messageId &&
          item.attachment.id === clickedAttachment.id
      );

      // If not found in preview items, don't open (shouldn't happen due to above check)
      if (previewIndex < 0) {
        console.warn(
          `Attachment ${clickedAttachment.id} not found in preview items`
        );
        return;
      }

      setPreviewInitialIndex(previewIndex);
      setPreviewModalOpen(true);
    },
    [previewMediaItems]
  );

  const handleShowDownloadMenu = useCallback(
    (
      messageId: string,
      attachments: Attachment[],
      position: { x: number; y: number }
    ) => {
      setCurrentMessageId(messageId);
      setCurrentMessageAttachments(
        attachments.filter((a) => a.type === "image" || a.type === "video")
      );
      setDownloadMenuPosition(position);
      setDownloadMenuOpen(true);
    },
    []
  );

  const handleVideoPlay = useCallback((videoId: string, url: string) => {
    setVideoPreview({ videoId, url });
  }, []);

  const handleDownloadSingle = useCallback(async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);
      const attachment = currentMessageAttachments[0];

      const blob = await mediaApi.downloadMediaViaStream(
        currentMessageId,
        attachment.id
      );

      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download =
        attachment.fileName ||
        (attachment.type === "video" ? "video.mp4" : "image.jpg");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media:", err);
      setError("Failed to download media");
    } finally {
      setDownloadLoading(false);
    }
  }, [currentMessageAttachments, currentMessageId, setError]);

  const handleDownloadPack = useCallback(async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const attachment of currentMessageAttachments) {
        const blob = await mediaApi.downloadMediaViaStream(
          currentMessageId,
          attachment.id
        );
        zip.file(attachment.fileName || `media_${attachment.id}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const dlUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `media_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download media pack:", err);
      setError("Failed to download media pack");
    } finally {
      setDownloadLoading(false);
    }
  }, [currentMessageAttachments, currentMessageId, setError]);

  // Handler for download - accepts messageId and looks up the message
  const handleDownloadById = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.messageId === messageId);
      if (!message?.attachments?.length) return;

      const downloadableAttachments = message.attachments.filter(
        (a) => a.type === "image" || a.type === "video"
      );
      if (!downloadableAttachments.length) return;

      setCurrentMessageId(messageId);
      setCurrentMessageAttachments(downloadableAttachments);
      setDownloadMenuPosition({
        x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
        y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
      });
      setDownloadMenuOpen(true);
    },
    [messages]
  );

  // Camera handlers
  const handleCameraClick = useCallback(() => {
    setCameraOpen(true);
  }, []);

  const handleCameraCapture = useCallback((imageDataUrl: string) => {
    setImageToEdit(imageDataUrl);
    setImageEditorSource("camera");
    setCameraOpen(false);
    setImageEditorOpen(true);
  }, []);

  const handleCameraClose = useCallback(() => {
    setCameraOpen(false);
  }, []);

  // Image editor handlers
  const handleImageEditorSend = useCallback(
    async (imageBlob: Blob, caption: string) => {
      if (!selectedChatId) return;

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        // Create a temporary message ID for optimistic update
        const tempId = `temp-${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}`;
        const previewUrl = URL.createObjectURL(imageBlob);

        // Create File from Blob for upload
        const file = new File([imageBlob], `camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        // Auto-scroll when sending
        setShouldAutoScroll(true);
        const cancelScroll = scrollHelperRequestScroll(true);

        // Create optimistic message for immediate UI feedback
        const optimisticAttachment: Attachment = {
          id: tempId,
          type: "image",
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          size: file.size,
          s3Key: "",
          status: "pending",
          progress: 0,
          uploadedAt: new Date().toISOString(),
          previewUrl: previewUrl,
        };

        const optimisticMessage: Message = {
          messageId: tempId,
          direction: "outbound",
          status: "pending",
          timestamp: new Date().toISOString(),
          text: caption?.trim() || undefined,
          type: "image",
          sender: "agent",
          attachments: [optimisticAttachment],
          replyToMessageId: replyingToMessage?.messageId,
        };

        // Add optimistic message to UI
        setMessages((prev) => [...prev, optimisticMessage]);
        setMessageCount((prev) => prev + 1);

        // Create message record on backend
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messagePayload: any = {
          to: selectedChat.participantPhone,
          senderId: selectedChat.senderId,
          attachments: [
            {
              id: tempId,
              type: "image" as const,
              fileName: file.name,
              mimeType: file.type || "image/jpeg",
              size: file.size,
              s3Key: "",
              status: "pending",
              uploadedAt: new Date().toISOString(),
            },
          ],
        };

        if (caption?.trim()) {
          messagePayload.body = caption;
        }

        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        const sentMessage = (await backendApi.whatsapp.sendMessage(
          messagePayload
        )) as { messageId?: string };

        if (!sentMessage?.messageId) {
          throw new Error("Failed to get message ID");
        }

        const messageId = sentMessage.messageId;

        // Update optimistic message with real ID
        setMessages((prev) =>
          prev.map((m) => (m.messageId === tempId ? { ...m, messageId } : m))
        );

        // Upload the file with progress tracking
        const result = await mediaApi.uploadFileToBackend(
          file,
          selectedChat.senderId,
          selectedChatId,
          messageId,
          (progress) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === messageId
                  ? {
                      ...m,
                      attachments: m.attachments?.map((a) =>
                        a.id === tempId ? { ...a, uploadProgress: progress } : a
                      ),
                    }
                  : m
              )
            );
          },
          tempId
        );

        // Get download URL and send via WhatsApp
        const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
          messageId,
          result.uploadId
        )) as { url?: string };

        if (downloadUrl?.url) {
          await backendApi.whatsapp.sendMedia({
            to: selectedChat.participantPhone,
            mediaType: "image",
            mediaUrl: downloadUrl.url,
            caption: caption || undefined,
            senderId: selectedChat.senderId,
            fileName: file.name,
            originalMessageId: messageId,
          });
        }

        // Update optimistic message to show completion
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? {
                  ...m,
                  status: "sent",
                  attachments: m.attachments?.map((a) =>
                    a.id === tempId
                      ? {
                          ...a,
                          status: "success",
                          progress: 100,
                          s3Key: result.s3Key,
                          // Clear previewUrl once we have a real s3Key
                          // The blob URL will be revoked and we should use S3 URLs
                          previewUrl: undefined,
                        }
                      : a
                  ),
                }
              : m
          )
        );

        // Cleanup local preview URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(previewUrl);
        }, 5000);

        // Clear reply state
        if (replyingToMessage) {
          setReplyingToMessage(null);
        }

        // Close image editor
        setImageEditorOpen(false);
        setImageToEdit(null);
        setImageEditorSource(null);

        cancelScroll?.();
      } catch (err) {
        console.error("Failed to send camera image:", err);
        setError("Failed to send image. Please try again.");

        // Update optimistic message to show error
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId.startsWith("temp-")
              ? {
                  ...m,
                  status: "failed",
                  attachments: m.attachments?.map((a) => ({
                    ...a,
                    status: "failed",
                    errorMessage: "Upload failed",
                  })),
                }
              : m
          )
        );
      }
    },
    [
      selectedChatId,
      chats,
      setError,
      setMessages,
      setMessageCount,
      setShouldAutoScroll,
      scrollHelperRequestScroll,
      replyingToMessage,
      setReplyingToMessage,
    ]
  );

  const handleImageEditorRetake = useCallback(() => {
    setImageEditorOpen(false);
    setImageToEdit(null);
    setEditingStagedFileId(null);
    setCameraOpen(true);
  }, []);

  const handleImageEditorClose = useCallback(() => {
    setImageEditorOpen(false);
    setImageToEdit(null);
    setImageEditorSource(null);
    setEditingStagedFileId(null);
  }, []);

  const handleEditAttachedImage = useCallback((imageUrl: string) => {
    setImageToEdit(imageUrl);
    setImageEditorSource("attachment");
    setImageEditorOpen(true);
  }, []);

  // @deprecated - Handler to edit a staged image from the staging panel
  // No longer used - editing is now integrated in staging panel
  const handleEditStagedImage = useCallback((_file: StagedFile) => {
    // Deprecated - do nothing
    console.warn(
      "handleEditStagedImage is deprecated. Image editing is now integrated in the staging panel."
    );
  }, []);

  // Handler when a staged image has been edited - replace the file in staging
  // Cleans up old staging and re-uploads the edited file
  // Returns Promise that resolves when upload is complete
  const handleStagedImageEdited = useCallback(
    async (fileId: string, imageBlob: Blob): Promise<void> => {
      if (!fileId) return;

      // Create a new File from the edited blob
      const editedFile = new File([imageBlob], `edited-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      // Create new preview URL
      const newPreviewUrl = URL.createObjectURL(imageBlob);

      // Find the old file to clean up staging
      const oldFile = stagedFilesRef.current.find((f) => f.id === fileId);

      // Clean up old staging from S3 if exists
      if (oldFile?.stagingId) {
        console.log(
          `[Staging] Cleaning up old staging ${oldFile.stagingId} for edited file`
        );

        // Stop thumbnail polling
        const timerId = thumbnailPollingRef.current.get(oldFile.stagingId);
        if (timerId) {
          clearTimeout(timerId);
          thumbnailPollingRef.current.delete(oldFile.stagingId);
        }

        // Cleanup from S3 (fire and forget)
        mediaApi.cleanupStagedFile(oldFile.stagingId).catch((err) => {
          console.error(`[Staging] Cleanup failed:`, err);
        });
      }

      // Revoke old preview URL
      if (oldFile?.previewUrl) {
        URL.revokeObjectURL(oldFile.previewUrl);
      }

      // Update the staged file - reset staging status
      setStagedFiles((prev) =>
        prev.map((sf) => {
          if (sf.id === fileId) {
            return {
              ...sf,
              file: editedFile,
              previewUrl: newPreviewUrl,
              // Reset staging status - will be re-uploaded
              stagingId: undefined,
              s3Key: undefined,
              thumbnailKey: undefined,
              uploadStatus: "uploading",
              uploadProgress: 0,
              thumbnailStatus: "pending",
              thumbnailUrl: undefined,
              error: undefined,
            };
          }
          return sf;
        })
      );

      // Start new upload for the edited file and WAIT for it to complete
      const updatedFile: StagedFile = {
        id: fileId,
        file: editedFile,
        previewUrl: newPreviewUrl,
        type: "image",
        uploadStatus: "pending",
        uploadProgress: 0,
        thumbnailStatus: "pending",
      };

      const result = await uploadToStaging(updatedFile);

      if (!result.success) {
        throw new Error(result.error || "Failed to upload edited image");
      }

      console.log(`[Staging] Edited image uploaded successfully:`, result);
    },
    [uploadToStaging]
  );

  // Close download menu on click outside or Escape key
  useEffect(() => {
    if (!downloadMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest("[data-download-menu]") &&
        !target.closest('button[title="Download options"]')
      ) {
        setDownloadMenuOpen(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [downloadMenuOpen]);

  return {
    mediaStagingOpen,
    setMediaStagingOpen,
    stagedFiles,
    setStagedFiles,
    currentAttachmentType,
    focusFileId,
    previewModalOpen,
    setPreviewModalOpen,
    previewMediaItems,
    previewInitialIndex,
    downloadMenuOpen,
    setDownloadMenuOpen,
    downloadMenuPosition,
    currentMessageAttachments,
    currentMessageId,
    downloadLoading,
    videoPreview,
    setVideoPreview,
    addMoreInputRef,
    handleFilesSelected,
    handleRemoveStagedFile,
    handleCloseStagingModal,
    handleSendMediaFromStaging,
    handleAddMoreMedia,
    handleSendVoiceNote,
    handleImageClick,
    handleShowDownloadMenu,
    handleVideoPlay,
    handleDownloadSingle,
    handleDownloadPack,
    handleDownloadById,
    // Camera state and handlers
    cameraOpen,
    setCameraOpen,
    handleCameraClick,
    handleCameraCapture,
    handleCameraClose,
    // Image editor state and handlers
    imageEditorOpen,
    setImageEditorOpen,
    imageToEdit,
    imageEditorSource,
    editingStagedFileId,
    handleImageEditorSend,
    handleImageEditorRetake,
    handleImageEditorClose,
    handleEditAttachedImage,
    handleEditStagedImage,
    handleStagedImageEdited,
  };
}
