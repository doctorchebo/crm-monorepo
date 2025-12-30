"use client";

import { AttachmentType } from "@/components/media/attachment-menu";
import { StagedFile } from "@/components/media/media-staging-panel";
import { PendingMediaUpload } from "@/components/media/pending-upload-bubble";
import { backendApi } from "@/lib/api/endpoints";
import { mediaApi } from "@/lib/media/api";
import { Attachment } from "@/lib/media/types";
import { useCallback, useEffect, useRef, useState } from "react";
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

interface UseMediaHandlersReturn {
  // Media staging state
  mediaStagingOpen: boolean;
  setMediaStagingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stagedFiles: StagedFile[];
  setStagedFiles: React.Dispatch<React.SetStateAction<StagedFile[]>>;
  currentAttachmentType: AttachmentType;

  // Pending uploads
  pendingMediaUploads: PendingMediaUpload[];
  pendingCaption: string;

  // Preview modal state
  previewModalOpen: boolean;
  setPreviewModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  previewAttachments: Attachment[];
  previewMessageId: string;
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
  imageEditorSource: "camera" | "attachment" | "staged" | null;
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
  handleEditStagedImage: (file: StagedFile) => void;
  handleStagedImageEdited: (imageBlob: Blob) => void;
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
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // Pending uploads
  const [pendingMediaUploads, setPendingMediaUploads] = useState<
    PendingMediaUpload[]
  >([]);
  const [pendingCaption, setPendingCaption] = useState("");

  // Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>(
    []
  );
  const [previewMessageId, setPreviewMessageId] = useState<string>("");
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);

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
    "camera" | "attachment" | "staged" | null
  >(null);
  const [editingStagedFileId, setEditingStagedFileId] = useState<string | null>(
    null
  );

  // Handle files selected from attachment menu
  const handleFilesSelected = useCallback(
    (files: File[], type: AttachmentType) => {
      setCurrentAttachmentType(type);

      const newStagedFiles: StagedFile[] = files.map((file) => {
        const fileType = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
          ? "audio"
          : "document";

        return {
          id: Math.random().toString(36).substring(7),
          file,
          previewUrl:
            fileType === "image" || fileType === "video"
              ? URL.createObjectURL(file)
              : fileType === "audio"
              ? URL.createObjectURL(file)
              : undefined,
          type: fileType,
        };
      });

      setStagedFiles((prev) => [...prev, ...newStagedFiles]);
      setMediaStagingOpen(true);
    },
    []
  );

  // Handle removing a staged file
  const handleRemoveStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      const newFiles = prev.filter((f) => f.id !== id);
      if (newFiles.length === 0) {
        setMediaStagingOpen(false);
      }
      return newFiles;
    });
  }, []);

  // Handle closing the staging modal
  const handleCloseStagingModal = useCallback(() => {
    setStagedFiles([]);
    setMediaStagingOpen(false);
  }, []);

  // Handle sending media from staging modal
  const handleSendMediaFromStaging = useCallback(
    async (caption: string) => {
      if (stagedFiles.length === 0 || !selectedChatId) return;

      try {
        setError(null);
        const selectedChat = chats.find((c) => c.chatId === selectedChatId);
        if (!selectedChat) return;

        const newPendingUploads: PendingMediaUpload[] = stagedFiles.map(
          (sf) => ({
            id: sf.id,
            file: sf.file,
            previewUrl: sf.previewUrl,
            type: sf.type,
            progress: 0,
            status: "queued" as const,
          })
        );

        setPendingMediaUploads(newPendingUploads);
        setPendingCaption(caption);
        setStagedFiles([]);
        setMediaStagingOpen(false);

        setShouldAutoScroll(true);
        scrollHelperRequestScroll(true);

        let messagePayload: any = {
          to: selectedChat.participantPhone,
          senderId: selectedChat.senderId,
        };

        if (caption.trim()) {
          messagePayload.body = caption;
        }

        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        messagePayload.attachments = newPendingUploads.map((upload) => ({
          id: upload.id,
          type: upload.type,
          fileName: upload.file.name,
          mimeType: upload.file.type || "application/octet-stream",
          size: upload.file.size,
          s3Key: "",
          status: "pending",
          uploadedAt: new Date().toISOString(),
        }));

        const sentMessage = (await backendApi.whatsapp.sendMessage(
          messagePayload
        )) as { messageId?: string };

        if (!sentMessage?.messageId) {
          throw new Error("Failed to get message ID");
        }

        const messageId = sentMessage.messageId;

        for (let i = 0; i < newPendingUploads.length; i++) {
          const upload = newPendingUploads[i];

          setPendingMediaUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id ? { ...u, status: "uploading" as const } : u
            )
          );

          try {
            const result = await mediaApi.uploadFileToBackend(
              upload.file,
              selectedChat.senderId,
              selectedChatId,
              messageId,
              (progress) => {
                setPendingMediaUploads((prev) =>
                  prev.map((u) => (u.id === upload.id ? { ...u, progress } : u))
                );
              },
              upload.id
            );

            const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
              messageId,
              result.uploadId
            )) as { url?: string };

            if (downloadUrl?.url) {
              await backendApi.whatsapp.sendMedia({
                to: selectedChat.participantPhone,
                mediaType: upload.type,
                mediaUrl: downloadUrl.url,
                caption: i === 0 ? caption : undefined,
                senderId: selectedChat.senderId,
                fileName: upload.file.name,
                originalMessageId: messageId,
              });
            }

            setPendingMediaUploads((prev) =>
              prev.map((u) =>
                u.id === upload.id
                  ? { ...u, status: "completed" as const, progress: 100 }
                  : u
              )
            );
          } catch (uploadError) {
            console.error(`Failed to upload ${upload.file.name}:`, uploadError);
            setPendingMediaUploads((prev) =>
              prev.map((u) =>
                u.id === upload.id
                  ? { ...u, status: "error" as const, error: "Upload failed" }
                  : u
              )
            );
          }
        }

        // Refresh messages - but only if we're still on the same chat
        if (currentMessagesChatIdRef.current !== selectedChatId) {
          console.log(
            "[MediaHandlers] Skipping message refresh - chat changed during upload"
          );
          return;
        }

        const response = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          PAGE_SIZE
        );

        // Double-check after async operation
        if (currentMessagesChatIdRef.current !== selectedChatId) {
          console.log(
            "[MediaHandlers] Skipping message update - chat changed during fetch"
          );
          return;
        }

        if (response && response.messages) {
          const sorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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

        setTimeout(() => {
          newPendingUploads.forEach((u) => {
            if (u.previewUrl) {
              URL.revokeObjectURL(u.previewUrl);
            }
          });
          setPendingMediaUploads([]);
          setPendingCaption("");
        }, 500);

        setReplyingToMessage(null);
      } catch (err: any) {
        console.error("Error sending media:", err);

        // Check if this is a conversation window violation error from the backend
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

        setPendingMediaUploads([]);
        setPendingCaption("");
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

        const pendingUpload: PendingMediaUpload = {
          id: uploadId,
          file: voiceFile,
          previewUrl: undefined,
          type: "audio",
          progress: 0,
          status: "queued" as const,
        };

        setPendingMediaUploads([pendingUpload]);
        setPendingCaption("");
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

        setPendingMediaUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: "uploading" as const } : u
          )
        );

        try {
          const result = await mediaApi.uploadFileToBackend(
            voiceFile,
            selectedChat.senderId,
            selectedChatId,
            messageId,
            (progress) => {
              setPendingMediaUploads((prev) =>
                prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
              );
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
            });
          }

          setPendingMediaUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "completed" as const, progress: 100 }
                : u
            )
          );
        } catch (uploadError) {
          console.error("Failed to upload voice note:", uploadError);
          setPendingMediaUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "error" as const, error: "Upload failed" }
                : u
            )
          );
        }

        setReplyingToMessage(null);

        // Refresh messages - but only if we're still on the same chat
        if (currentMessagesChatIdRef.current !== selectedChatId) {
          console.log(
            "[MediaHandlers] Skipping voice note message refresh - chat changed"
          );
          return;
        }

        const response = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          PAGE_SIZE
        );

        // Double-check after async operation
        if (currentMessagesChatIdRef.current !== selectedChatId) {
          console.log(
            "[MediaHandlers] Skipping voice note message update - chat changed"
          );
          return;
        }

        if (response && response.messages) {
          const sorted = [...response.messages].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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

        setTimeout(() => {
          setPendingMediaUploads([]);
        }, 2000);
      } catch (err: any) {
        console.error("Error sending voice note:", err);

        // Check if this is a conversation window violation error from the backend
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

        setPendingMediaUploads([]);
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
      const visualMedia = attachments.filter(
        (a) => a.type === "image" || a.type === "video"
      );
      setPreviewAttachments(visualMedia);
      setPreviewMessageId(messageId);
      const adjustedIndex = Math.min(index, visualMedia.length - 1);
      setPreviewInitialIndex(adjustedIndex >= 0 ? adjustedIndex : 0);
      setPreviewModalOpen(true);
    },
    []
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

        // Add pending upload for UI feedback
        const pendingUpload: PendingMediaUpload = {
          id: tempId,
          file,
          type: "image",
          previewUrl,
          status: "uploading",
          progress: 0,
        };
        setPendingMediaUploads((prev) => [...prev, pendingUpload]);

        // Auto-scroll when sending
        setShouldAutoScroll(true);
        const cancelScroll = scrollHelperRequestScroll(true);

        // First, create a message record to get an ID (matching existing pattern)
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

        if (caption.trim()) {
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

        // Upload the file
        const result = await mediaApi.uploadFileToBackend(
          file,
          selectedChat.senderId,
          selectedChatId,
          messageId,
          (progress) => {
            setPendingMediaUploads((prev) =>
              prev.map((u) => (u.id === tempId ? { ...u, progress } : u))
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

        // Update pending upload status
        setPendingMediaUploads((prev) =>
          prev.map((upload) =>
            upload.id === tempId
              ? { ...upload, status: "completed" as const, progress: 100 }
              : upload
          )
        );

        // Refresh messages to get the newly sent message from the server
        // This ensures the message persists in the UI after the pending upload is cleared
        if (currentMessagesChatIdRef.current === selectedChatId) {
          try {
            const response = await backendApi.whatsapp.getChatMessages(
              selectedChatId,
              0,
              PAGE_SIZE
            );

            if (
              response &&
              response.messages &&
              currentMessagesChatIdRef.current === selectedChatId
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
          } catch (refreshErr) {
            console.error("Failed to refresh messages after send:", refreshErr);
          }
        }

        // Remove pending upload after a short delay
        setTimeout(() => {
          setPendingMediaUploads((prev) =>
            prev.filter((upload) => upload.id !== tempId)
          );
          URL.revokeObjectURL(previewUrl);
        }, 2000);

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

        // Update pending upload to show error
        setPendingMediaUploads((prev) =>
          prev.map((upload) =>
            upload.id.startsWith("temp-")
              ? { ...upload, status: "error" as const, error: "Upload failed" }
              : upload
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
      currentMessagesChatIdRef,
      messagesCacheRef,
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

  // Handler to edit a staged image from the staging panel
  const handleEditStagedImage = useCallback((file: StagedFile) => {
    if (file.previewUrl) {
      setImageToEdit(file.previewUrl);
      setEditingStagedFileId(file.id);
      setImageEditorSource("staged");
      setImageEditorOpen(true);
    }
  }, []);

  // Handler when a staged image has been edited - replace the file in staging
  const handleStagedImageEdited = useCallback(
    (imageBlob: Blob) => {
      if (!editingStagedFileId) return;

      // Create a new File from the edited blob
      const editedFile = new File([imageBlob], `edited-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      // Create new preview URL
      const newPreviewUrl = URL.createObjectURL(imageBlob);

      // Update the staged file
      setStagedFiles((prev) =>
        prev.map((sf) => {
          if (sf.id === editingStagedFileId) {
            // Revoke old preview URL
            if (sf.previewUrl) {
              URL.revokeObjectURL(sf.previewUrl);
            }
            return {
              ...sf,
              file: editedFile,
              previewUrl: newPreviewUrl,
            };
          }
          return sf;
        })
      );

      // Close editor and reset state
      setImageEditorOpen(false);
      setImageToEdit(null);
      setImageEditorSource(null);
      setEditingStagedFileId(null);
    },
    [editingStagedFileId]
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
    pendingMediaUploads,
    pendingCaption,
    previewModalOpen,
    setPreviewModalOpen,
    previewAttachments,
    previewMessageId,
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
