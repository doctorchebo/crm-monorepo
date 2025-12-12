"use client";

import { ChatsSenderSection } from "@/components/chats-sender-section";
import { DeleteMessageDialog } from "@/components/delete-message-dialog";
import { AttachmentGallery } from "@/components/media/attachment-display";
import {
  FilePicker,
  PendingUploadsDisplay,
} from "@/components/media/file-picker";
import { MediaDownloadMenu } from "@/components/media/media-download-menu";
import { MediaPreviewModal } from "@/components/media/media-preview-modal";
import { MessageActionsMenu } from "@/components/message-actions-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesPanel } from "@/components/ui/notes-panel";
import { WhatsAppStatusIcon } from "@/components/whatsapp-status-icon";
import { useAuthProtection } from "@/hooks/use-auth";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useRealtimeChat } from "@/hooks/use-message-status-socket";
import { backendApi } from "@/lib/api/endpoints";
import { mediaApi } from "@/lib/media/api";
import { Attachment, PendingUpload } from "@/lib/media/types";
import { Loader, MessageSquare, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

interface Template {
  id: string;
  name: string;
  description?: string;
  isVisible: boolean;
  locales?: Array<{
    id: string;
    locale: string;
    body: string;
    header?: string;
    footer?: string;
    exampleVars?: Record<string, any>;
  }>;
}

interface Chat {
  id?: number;
  chatId: string;
  participantPhone: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  isActive: boolean;
  senderId: number;
  businessPhone?: string;
}

interface Message {
  id?: number;
  messageId: string;
  text?: string | null;
  sender: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  type: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  attachments?: Attachment[];
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  editedAt?: string;
}

interface InboundMessage {
  messageId: string;
  chatId: string;
  sender: string;
  text: string;
  type: string;
  timestamp: string;
  attachments?: Array<{
    type: string;
    mediaId: string;
  }>;
}

export default function ChatsPage() {
  const t = useTranslations("chats");
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);

  // Protect this route - redirect to login if token is missing or expired
  useAuthProtection();

  // Initialize media upload hook
  const hookResult = useMediaUpload();
  const pendingUploads = hookResult.pendingUploads as Map<
    string,
    PendingUpload
  >;
  const { isUploading, queueFiles, uploadAll, removeUpload, clearUploads } =
    hookResult;

  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [senders, setSenders] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [templateInput, setTemplateInput] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [notes, setNotes] = useState<any>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [notesPanelWidth, setNotesPanelWidth] = useState(320); // Default width in pixels
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true); // Control auto-scroll

  // Media preview modal state
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

  // Edit and delete message state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string>("");

  // Fetch templates from API
  const { data: templates = [], isLoading: templatesLoading } = useSWR(
    "visible-templates",
    async () => {
      try {
        return await backendApi.templates.list(true); // Only visible templates
      } catch (error) {
        console.error("Failed to fetch templates:", error);
        return [];
      }
    }
  );

  // Filter templates based on search
  const filteredTemplates = (templates as Template[]).filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  // Fetch current user on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await backendApi.user.getProfile();
        setCurrentUserId(user.id);
      } catch (error) {
        console.error("Failed to fetch current user:", error);
      }
    };

    fetchCurrentUser();
  }, []);

  const [messageCount, setMessageCount] = useState(0);

  // Auto-scroll to bottom when messages change, but only if we should auto-scroll
  useEffect(() => {
    if (messagesEndRef.current && shouldAutoScroll) {
      // Use requestAnimationFrame to ensure DOM has been painted
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({
            behavior: isInitialLoad ? "auto" : "smooth",
          });
        }
      });
      setIsInitialLoad(false);
    }
  }, [messageCount, shouldAutoScroll, isInitialLoad]);

  // Track scroll position to disable auto-scroll when user scrolls up
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // Calculate if user is at the bottom
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold

      // Set shouldAutoScroll based on whether user is at the bottom
      setShouldAutoScroll(isAtBottom);
    };

    const debouncedHandleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };

    messagesContainer.addEventListener("scroll", debouncedHandleScroll);
    return () => {
      messagesContainer.removeEventListener("scroll", debouncedHandleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Auto-scroll when content size changes (e.g., images loading)
  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;

    // Use ResizeObserver to detect when images load and container size changes
    const resizeObserver = new ResizeObserver(() => {
      // Check if we should be at the bottom
      // If shouldAutoScroll is true, always scroll to bottom
      // If shouldAutoScroll is false but user is very close to bottom (within 100px), still scroll
      if (shouldAutoScroll) {
        // User wants to stay at bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } else {
        // Check if user is close to bottom (within 100px)
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        if (distanceFromBottom < 100) {
          // User is close to bottom, scroll to bottom
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    });

    resizeObserver.observe(messagesContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [shouldAutoScroll]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get the query param from the URL directly to preserve special characters like +
        // searchParams.get() decodes the value, turning + into spaces
        // We need to parse the raw query string instead
        const urlParams = new URLSearchParams(window.location.search);
        const querySelectedChatId = urlParams.get("selectedChatId");

        console.log("Query selectedChatId:", querySelectedChatId);

        // Fetch senders
        const sendersData = await backendApi.senders.list();
        if (Array.isArray(sendersData)) {
          setSenders(sendersData);
        }

        // Fetch chats
        const data = await backendApi.whatsapp.getChats(0, 50);

        if (Array.isArray(data) && data.length > 0) {
          setChats(data);

          console.log(
            "Available chats:",
            data.map((c) => c.chatId)
          );

          let chatToSelect: string | null = null;

          if (querySelectedChatId) {
            // Check if the query selected chat exists in the fetched list
            const chatExists = data.some(
              (c) => c.chatId === querySelectedChatId
            );
            if (chatExists) {
              console.log(
                "Setting selectedChatId from query param:",
                querySelectedChatId
              );
              chatToSelect = querySelectedChatId;
            } else {
              console.warn(
                "Chat from query param not found in chat list:",
                querySelectedChatId
              );
              // The newly created chat might not be immediately indexed
              // Try to fetch it with a retry after a short delay
              console.log("Attempting to fetch chat with retry...");
              setTimeout(async () => {
                try {
                  const retryData = await backendApi.whatsapp.getChats(0, 50);
                  if (Array.isArray(retryData) && retryData.length > 0) {
                    setChats(retryData);
                    const foundChat = retryData.find(
                      (c) => c.chatId === querySelectedChatId
                    );
                    if (foundChat) {
                      console.log("Chat found on retry:", querySelectedChatId);
                      setSelectedChatId(querySelectedChatId);
                    } else {
                      console.warn("Chat still not found after retry");
                      setSelectedChatId(retryData[0].chatId);
                    }
                  }
                } catch (retryErr) {
                  console.error("Retry fetch failed:", retryErr);
                }
              }, 300);
              // Use first chat as immediate fallback
              chatToSelect = data[0].chatId;
            }
          } else {
            // If no query param, select the first chat
            chatToSelect = data[0].chatId;
          }

          setSelectedChatId(chatToSelect);
        } else {
          setChats([]);
          setSelectedChatId(null);
        }
      } catch (err) {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats");
        setChats([]);
        setSelectedChatId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch notes when chat changes
  useEffect(() => {
    if (!selectedChatId) {
      setNotes(null);
      return;
    }

    const fetchNotes = async () => {
      try {
        setNotesLoading(true);
        const notesData = await backendApi.notes.getChatNotes(selectedChatId);
        setNotes(notesData);
      } catch (error) {
        console.error("Error fetching notes:", error);
        setNotes(null);
      } finally {
        setNotesLoading(false);
      }
    };

    fetchNotes();
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;

    setIsInitialLoad(true);
    setShouldAutoScroll(true); // Enable auto-scroll when changing chats

    const fetchMessages = async () => {
      try {
        setError(null);
        const data = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          50
        );
        if (Array.isArray(data)) {
          // Sort by timestamp ascending (oldest first)
          const sorted = [...data].sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          // Check if message count changed (new messages arrived)
          const newCount = sorted.length;
          if (newCount !== messages.length) {
            setMessageCount(newCount);
          }

          setMessages(sorted);

          // Status updates now come via WebSocket in real-time
          // No need to poll or track message IDs anymore
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
        setError("Failed to load messages");
      }
    };

    fetchMessages();
    // Initial load complete - now WebSocket will provide real-time message updates
    // This initial fetch loads chat history; subsequent messages arrive via WebSocket
  }, [selectedChatId]);

  // 🔥 REAL-TIME UPDATES via WebSocket
  // Provides instant message status updates AND new inbound messages
  // Connects to backend and receives updates when webhooks arrive from Meta
  const {
    statusMap: socketStatusMap,
    messages: inboundMessages,
    isConnected: isSocketConnected,
  } = useRealtimeChat(selectedChatId || undefined);

  // Merge inbound WebSocket messages into the message list
  useEffect(() => {
    if (inboundMessages.length === 0) return;

    setMessages((prevMessages) => {
      const existingIds = new Set(prevMessages.map((m) => m.messageId));
      const newMessages = inboundMessages.filter(
        (wsMsg: InboundMessage) => !existingIds.has(wsMsg.messageId)
      );

      if (newMessages.length === 0) return prevMessages;

      // Add new inbound messages to the list
      const newMessageObjects: Message[] = newMessages.map(
        (wsMsg: InboundMessage): Message => ({
          id: undefined,
          messageId: wsMsg.messageId,
          text: wsMsg.text,
          sender: wsMsg.sender,
          direction: "inbound" as const,
          timestamp: wsMsg.timestamp,
          type: wsMsg.type,
          status: "delivered" as const,
          attachments: wsMsg.attachments
            ? wsMsg.attachments.map((att) => ({
                id: att.mediaId,
                type: att.type as "image" | "video" | "audio" | "document",
                mediaId: att.mediaId,
                fileName: "",
                mimeType: "application/octet-stream",
                size: 0,
                s3Key: att.mediaId,
                status: "success" as const,
                uploadedAt: wsMsg.timestamp,
              }))
            : undefined,
          sentAt: wsMsg.timestamp,
          deliveredAt: new Date().toISOString(),
          readAt: undefined,
          isDeleted: false,
        })
      );

      const merged = [...prevMessages, ...newMessageObjects];

      // Sort by timestamp ascending (oldest first)
      return merged.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    });

    // Trigger auto-scroll when new messages arrive
    setMessageCount((prev) => prev + inboundMessages.length);
  }, [inboundMessages]);

  // Update messages with status changes from WebSocket
  useEffect(() => {
    if (Object.keys(socketStatusMap).length === 0) return;

    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        const newStatus = socketStatusMap[msg.messageId];
        if (newStatus && newStatus.status !== msg.status) {
          return {
            ...msg,
            status: newStatus.status,
            sentAt:
              newStatus.status === "sent"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.sentAt,
            deliveredAt:
              newStatus.status === "delivered"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.deliveredAt,
            readAt:
              newStatus.status === "read"
                ? new Date(newStatus.timestamp).toISOString()
                : msg.readAt,
          };
        }
        return msg;
      })
    );
    // Don't trigger auto-scroll when just updating message statuses
  }, [socketStatusMap]);

  const handleSendMessage = async () => {
    if (
      (!messageInput.trim() &&
        !templateInput.trim() &&
        pendingUploads.size === 0) ||
      !selectedChatId
    )
      return;

    try {
      setError(null);
      const selectedChat = chats.find((c) => c.chatId === selectedChatId);
      if (!selectedChat) return;

      // Check if this is a recipient-initiated conversation (has inbound messages)
      const hasInboundMessages = messages.some(
        (m) => m.direction === "inbound"
      );

      let messagePayload: any = {
        to: selectedChat.participantPhone,
        senderId: selectedChat.senderId,
      };

      // Use template content if available, otherwise use free-form message
      if (templateInput.trim()) {
        messagePayload.body = templateInput;
      } else if (messageInput.trim()) {
        messagePayload.body = messageInput;
      }

      // For image-only messages, include placeholder attachments so validation passes
      if (pendingUploads.size > 0) {
        messagePayload.attachments = Array.from(pendingUploads.values()).map(
          (upload) => ({
            id: upload.id,
            type: upload.file.type.split("/")[0] || "file",
            fileName: upload.file.name,
            mimeType: upload.file.type || "application/octet-stream",
            size: upload.file.size,
            s3Key: "", // Will be filled after upload
            status: "pending",
            uploadedAt: new Date().toISOString(),
          })
        );
      }

      // Determine if we have text or only media
      const hasText =
        messagePayload.body && messagePayload.body.trim().length > 0;
      const hasMedia = pendingUploads.size > 0;

      // Send message first to get the messageId (only if there's text or no media)
      let sentMessage: any;

      if (hasText || !hasMedia) {
        // Send text message (or placeholder for media-only messages to record in DB)
        try {
          sentMessage = await backendApi.whatsapp.sendMessage(messagePayload);
        } catch (sendError) {
          console.error("Error sending message:", sendError);
          throw sendError;
        }
      }

      // Upload attachments after message is sent, using the real messageId
      if (hasMedia && sentMessage?.messageId) {
        try {
          console.log(
            `[Chats] Starting attachment upload for messageId: ${
              (sentMessage as any).messageId
            }`
          );
          const attachments = await uploadAll(
            (sentMessage as any).messageId,
            selectedChat.senderId,
            selectedChatId
          );
          console.log(`[Chats] Attachments uploaded:`, attachments);

          // Send the media to the recipient for each attachment
          for (const attachment of attachments) {
            try {
              console.log(
                `[Chats] Getting download URL for attachment: ${attachment.fileName}`
              );
              // Get download URL for the file in S3
              const downloadUrl = (await backendApi.whatsapp.getDownloadUrl(
                (sentMessage as any).messageId,
                attachment.id
              )) as any;

              console.log(`[Chats] Download URL received:`, downloadUrl);

              // Send media message to recipient
              if (downloadUrl && downloadUrl.url) {
                console.log(
                  `[Chats] Sending media message to WhatsApp for: ${attachment.fileName}`
                );
                await backendApi.whatsapp.sendMedia({
                  to: selectedChat.participantPhone,
                  mediaType: attachment.type,
                  mediaUrl: downloadUrl.url,
                  caption: messagePayload.body || undefined, // Include text as caption if present
                  senderId: selectedChat.senderId,
                });
                console.log(
                  `[Chats] Media message sent successfully: ${attachment.fileName}`
                );
              } else {
                console.error(
                  `[Chats] No download URL received for: ${attachment.fileName}`
                );
              }
            } catch (mediaError) {
              console.error(
                `Failed to send media attachment ${attachment.fileName}:`,
                mediaError
              );
              setError(
                `Attachment uploaded but failed to send: ${attachment.fileName}`
              );
            }
          }
        } catch (uploadError) {
          console.error("Batch upload error:", uploadError);
          // Don't throw - message was already sent, just warn about attachment upload failure
          setError(
            `Message sent but attachments failed to upload: ${
              (uploadError as Error).message
            }`
          );
        }
      }

      setMessageInput("");
      setTemplateInput("");
      clearUploads();
      // Refresh messages
      const data = await backendApi.whatsapp.getChatMessages(
        selectedChatId,
        0,
        50
      );
      if (Array.isArray(data)) {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(sorted);
        setMessageCount(sorted.length);
        // Re-enable auto-scroll when a message is sent so it scrolls to the new message
        setShouldAutoScroll(true);
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
    }
  };

  const handleAddNote = async (noteText: string, messageId?: string) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.create({
        chatId: selectedChatId,
        messageId,
        note: noteText,
      });

      // Refresh notes
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to add note:", error);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!selectedChatId) return;

    try {
      await backendApi.notes.delete(noteId);

      // Refresh notes after deletion
      const notesData = await backendApi.notes.getChatNotes(selectedChatId);
      setNotes(notesData);
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert("Failed to delete note. Please try again.");
    }
  };

  const handleApplyTemplate = (template: Template) => {
    if (template.locales && template.locales.length > 0) {
      // Use the first locale's body or render with example vars
      const locale = template.locales[0];
      let body = locale.body;

      // Replace example variables if available
      if (locale.exampleVars) {
        Object.entries(locale.exampleVars).forEach(([key, value]) => {
          body = body.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            String(value || "")
          );
        });
      }

      setTemplateInput(body);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle separator drag to resize notes panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notesPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Minimum width 250px, maximum 60% of container
      const maxWidth = containerRef.current
        ? containerRef.current.clientWidth * 0.6
        : 800;
      const newWidth = Math.max(250, Math.min(startWidth - deltaX, maxWidth));
      setNotesPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Media preview modal handlers
  const handleImageClick = (
    messageId: string,
    attachments: Attachment[],
    index: number
  ) => {
    const images = attachments.filter((a) => a.type === "image");
    setPreviewAttachments(images);
    setPreviewMessageId(messageId);
    setPreviewInitialIndex(index);
    setPreviewModalOpen(true);
  };

  // Download menu handlers
  const handleShowDownloadMenu = (
    messageId: string,
    attachments: Attachment[],
    position: { x: number; y: number }
  ) => {
    setCurrentMessageId(messageId);
    setCurrentMessageAttachments(attachments.filter((a) => a.type === "image"));
    setDownloadMenuPosition(position);
    setDownloadMenuOpen(true);
  };

  // Message delete handler
  const handleDeleteMessage = (messageId: string) => {
    setDeletingMessageId(messageId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteMessage = async (messageId: string) => {
    try {
      await backendApi.whatsapp.deleteMessage(messageId, {
        chatId: selectedChatId || undefined,
      });
      // Update local message state - mark as deleted
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.messageId === messageId
            ? {
                ...msg,
                text: null,
                isDeleted: true,
                deletedAt: new Date().toISOString(),
              }
            : msg
        )
      );
      console.log(`Message ${messageId} deleted successfully`);
    } catch (err) {
      console.error("Failed to delete message:", err);
      setError(t("deleteFailed"));
    }
  };

  const handleDownloadSingle = async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);
      const attachment = currentMessageAttachments[0];
      const urlResponse = await mediaApi.getDownloadUrl(
        currentMessageId,
        attachment.id
      );
      let url = urlResponse.url;

      let blobUrl = url;
      if (url.startsWith("cloud-api://")) {
        const mediaId = url.replace("cloud-api://", "");
        blobUrl = await mediaApi.fetchCloudAPIMedia(mediaId);
      }
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = attachment.fileName || "image";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download image:", err);
      setError("Failed to download image");
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleDownloadPack = async () => {
    if (!currentMessageAttachments.length) return;

    try {
      setDownloadLoading(true);

      // Dynamic import for JSZip
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Download all images and add to zip
      for (const attachment of currentMessageAttachments) {
        const urlResponse = await mediaApi.getDownloadUrl(
          currentMessageId,
          attachment.id
        );
        let url = urlResponse.url;

        let blobUrl = url;
        if (url.startsWith("cloud-api://")) {
          const mediaId = url.replace("cloud-api://", "");
          blobUrl = await mediaApi.fetchCloudAPIMedia(mediaId);
        }
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        zip.file(attachment.fileName || `image_${attachment.id}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const dlUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `images_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(dlUrl);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download images pack:", err);
      setError("Failed to download images pack");
    } finally {
      setDownloadLoading(false);
    }
  };

  // Close download menu on click outside or Escape key
  useEffect(() => {
    if (!downloadMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the download menu
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

    // Add event listeners
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [downloadMenuOpen]);

  const selectedChat = chats.find((c) => c.chatId === selectedChatId) || null;

  return (
    <div className="flex flex-col h-screen gap-0">
      {/* Header with Controls */}
      <div className="border-b px-6 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={automationEnabled ? "default" : "outline"}
            onClick={() => setAutomationEnabled(!automationEnabled)}
            className="gap-2"
          >
            {automationEnabled ? t("automationOn") : t("automateReplies")}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="border-b bg-red-50 dark:bg-red-950 p-4">
          <p className="text-sm text-red-700 dark:text-red-200">⚠ {error}</p>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/30">
          <div className="p-4 border-b">
            <Input placeholder={t("searchChats")} className="w-full" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading chats...
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground">{t("noChats")}</p>
              </div>
            ) : (
              // Group chats by sender
              senders.map((sender) => {
                const senderChats = chats.filter(
                  (c) => c.senderId === sender.id
                );
                return (
                  <ChatsSenderSection
                    key={sender.id}
                    senderPhoneNumber={sender.phoneNumber}
                    senderDisplayName={sender.displayName}
                    chats={senderChats}
                    selectedChatId={selectedChatId}
                    onSelectChat={(chatId) => setSelectedChatId(chatId)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Chat Detail + Notes */}
        <div className="hidden lg:flex flex-1 flex-col bg-background overflow-hidden min-h-0">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b px-6 py-2 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selectedChat.participantName ||
                      selectedChat.participantPhone}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedChat.participantPhone}
                  </p>
                </div>
              </div>

              {/* Messages + Notes Container */}
              <div className="flex flex-1 overflow-hidden" ref={containerRef}>
                {/* Messages Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div
                    ref={messagesContainerRef}
                    className="overflow-y-auto p-3 space-y-2 flex-1"
                    style={{
                      scrollBehavior: "smooth",
                    }}
                  >
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground">No messages yet</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((message) => {
                          const isOutbound = message.direction === "outbound";
                          const timestamp = new Date(message.timestamp);
                          const timeString = timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const isDeleted = message.isDeleted;

                          return (
                            <div
                              key={message.messageId || message.id}
                              className={`flex ${
                                isOutbound ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`group px-3 py-1 rounded-lg text-xs relative ${
                                  // For image-only messages, use standard image width
                                  message.attachments?.length === 1 &&
                                  message.attachments[0].type === "image" &&
                                  !message.text &&
                                  !isDeleted
                                    ? "max-w-md"
                                    : "max-w-xs"
                                } ${
                                  isOutbound
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                {/* Chevron positioned in top-right corner - visible on hover */}
                                {/* Show for messages with images, and for outbound text messages */}
                                {!isDeleted &&
                                  (message.attachments?.some(
                                    (a) => a.type === "image"
                                  ) ||
                                    isOutbound) && (
                                    <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <MessageActionsMenu
                                        messageId={message.messageId}
                                        messageTimestamp={message.timestamp}
                                        isOutbound={isOutbound}
                                        onDelete={
                                          isOutbound
                                            ? handleDeleteMessage
                                            : undefined
                                        }
                                        onDownload={
                                          message.attachments?.some(
                                            (a) => a.type === "image"
                                          )
                                            ? () =>
                                                handleShowDownloadMenu(
                                                  message.messageId ||
                                                    message.id?.toString() ||
                                                    "",
                                                  message.attachments || [],
                                                  {
                                                    x:
                                                      typeof window !==
                                                      "undefined"
                                                        ? window.innerWidth / 2
                                                        : 0,
                                                    y:
                                                      typeof window !==
                                                      "undefined"
                                                        ? window.innerHeight / 2
                                                        : 0,
                                                  }
                                                )
                                            : undefined
                                        }
                                      />
                                    </div>
                                  )}

                                {isDeleted ? (
                                  <p className="text-xs italic opacity-60">
                                    {t("thisMessageWasDeleted")}
                                  </p>
                                ) : (
                                  <>
                                    {message.text && (
                                      <p className="text-xs">{message.text}</p>
                                    )}

                                    {/* Display attachments if present */}
                                    {message.attachments &&
                                      message.attachments.length > 0 && (
                                        <div className="mt-2">
                                          <AttachmentGallery
                                            attachments={message.attachments}
                                            messageId={
                                              message.messageId ||
                                              message.id?.toString() ||
                                              ""
                                            }
                                            onImageClick={(index) =>
                                              handleImageClick(
                                                message.messageId ||
                                                  message.id?.toString() ||
                                                  "",
                                                message.attachments || [],
                                                index
                                              )
                                            }
                                            onShowDownloadMenu={(position) =>
                                              handleShowDownloadMenu(
                                                message.messageId ||
                                                  message.id?.toString() ||
                                                  "",
                                                message.attachments || [],
                                                position
                                              )
                                            }
                                            isOutbound={isOutbound}
                                            onMessageDelete={
                                              handleDeleteMessage
                                            }
                                          />
                                        </div>
                                      )}
                                  </>
                                )}

                                <div
                                  className={`text-xs mt-0.5 flex items-center justify-between gap-1 ${
                                    isOutbound
                                      ? "text-primary-foreground/70"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  <span>
                                    {timeString}
                                    {message.editedAt && (
                                      <span className="ml-1 opacity-60">
                                        ({t("messageEdited")})
                                      </span>
                                    )}
                                  </span>
                                  {isOutbound && !isDeleted && (
                                    <WhatsAppStatusIcon
                                      status={message.status || "pending"}
                                      deliveredAt={message.deliveredAt}
                                      readAt={message.readAt}
                                      className="ml-1"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Template Buttons */}
                  <div
                    className="border-t p-3 bg-muted/30 flex flex-col overflow-hidden flex-shrink-0"
                    style={{ maxHeight: "160px" }}
                  >
                    {templatesLoading ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="flex items-center justify-center py-2">
                          <Loader className="h-4 w-4 animate-spin" />
                        </div>
                      </>
                    ) : Array.isArray(filteredTemplates) &&
                      filteredTemplates.length > 0 ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1 overflow-y-auto">
                          {filteredTemplates.map((template) => (
                            <Button
                              key={template.id}
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyTemplate(template)}
                              className="text-left justify-start h-auto py-1 px-2 text-xs"
                            >
                              <span className="truncate">{template.name}</span>
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : templateSearch ? (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground py-1">
                          No templates match your search.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mb-2 space-y-1 flex-shrink-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("availableTemplates")}
                          </p>
                          <Input
                            placeholder={t("searchTemplates")}
                            className="h-7 text-xs"
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground py-1">
                          {t("noTemplatesAvailable")}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="border-t p-3 flex-shrink-0">
                    {/* File Picker */}
                    <FilePicker
                      onFilesSelected={queueFiles}
                      disabled={isUploading}
                    />

                    {/* Pending Uploads Display */}
                    {pendingUploads.size > 0 && (
                      <div className="mb-4">
                        <PendingUploadsDisplay
                          uploads={Array.from(pendingUploads.values())}
                          onRemove={removeUpload}
                          disabled={isUploading}
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder={t("typeMessageOrUseTemplates")}
                        className="flex-1"
                        value={templateInput || messageInput}
                        onChange={(e) => {
                          if (templateInput) {
                            setTemplateInput("");
                          }
                          setMessageInput(e.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={isUploading}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={
                          (!messageInput.trim() &&
                            !templateInput.trim() &&
                            pendingUploads.size === 0) ||
                          isUploading
                        }
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {t("send")}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Resizable Separator */}
                <div
                  ref={separatorRef}
                  onMouseDown={handleMouseDown}
                  className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors"
                  title="Drag to resize"
                />

                {/* Notes Panel (Right Sidebar) - Dynamic Width */}
                <div
                  className="hidden xl:flex flex-col overflow-hidden"
                  style={{ width: `${notesPanelWidth}px` }}
                >
                  {selectedChatId && currentUserId && (
                    <NotesPanel
                      chatId={selectedChatId}
                      currentUserId={currentUserId}
                      notes={notes}
                      loading={notesLoading}
                      onAddNote={handleAddNote}
                      onDeleteNote={handleDeleteNote}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-muted-foreground text-lg">
                  {loading ? "Loading chat..." : t("selectChat")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info about Automation */}
      {automationEnabled && (
        <div className="border-t bg-blue-50 dark:bg-blue-950 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-200">
            ✓ Automatic replies are enabled. Messages matching automation rules
            will be responded to automatically.
          </p>
        </div>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        isOpen={previewModalOpen}
        attachments={previewAttachments}
        messageId={previewMessageId}
        initialIndex={previewInitialIndex}
        onClose={() => setPreviewModalOpen(false)}
      />

      {/* Download Menu */}
      <MediaDownloadMenu
        isOpen={downloadMenuOpen}
        position={downloadMenuPosition}
        isSingleImage={currentMessageAttachments.length === 1}
        isLoading={downloadLoading}
        onDownloadSingle={handleDownloadSingle}
        onDownloadPack={handleDownloadPack}
        onClose={() => setDownloadMenuOpen(false)}
      />

      {/* Delete Message Dialog */}
      <DeleteMessageDialog
        open={deleteDialogOpen}
        messageId={deletingMessageId}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDeleteMessage}
      />
    </div>
  );
}
