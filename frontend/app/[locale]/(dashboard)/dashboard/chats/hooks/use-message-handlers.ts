"use client";

import { useRealtimeChat } from "@/hooks/use-message-status-socket";
import { useThumbnailUpdates } from "@/hooks/use-thumbnail-updates";
import { backendApi } from "@/lib/api/endpoints";
import { Attachment, ThumbnailReadyEvent } from "@/lib/media/types";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PAGE_SIZE } from "../constants";
import type {
  Chat,
  InboundMessage,
  Message,
  MessagesCacheEntry,
} from "../types";

interface UseMessageHandlersProps {
  selectedChatId: string | null;
  selectedChat: Chat | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;
  shouldAutoScroll: boolean;
  setShouldAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  setHasNewMessages: React.Dispatch<React.SetStateAction<boolean>>;
  scrollHelperRequestScroll: (smooth?: boolean) => (() => void) | undefined;
  chats: Chat[];
}

interface UseMessageHandlersReturn {
  // Reply state
  replyingToMessage: Message | null;
  setReplyingToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;

  // Template state
  templateInput: string;
  setTemplateInput: React.Dispatch<React.SetStateAction<string>>;
  templateSearch: string;
  setTemplateSearch: React.Dispatch<React.SetStateAction<string>>;

  // Socket state
  isSocketConnected: boolean;

  // Handlers
  handleReplyById: (messageId: string) => void;
  handleCancelReply: () => void;
  handleTemplateUsed: () => void;
  handleScrollToMessage: (messageId: string) => void;
  handleSendMessage: (messageText: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => void;
  handleConfirmDeleteMessage: (messageId: string) => Promise<void>;
  handleApplyTemplate: (template: any) => Promise<void>;

  // Delete dialog state
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deletingMessageId: string;
  setDeletingMessageId: React.Dispatch<React.SetStateAction<string>>;

  // Refs
  messageInputRef: React.RefObject<any>;
}

export function useMessageHandlers(
  props: UseMessageHandlersProps
): UseMessageHandlersReturn {
  const {
    selectedChatId,
    selectedChat,
    messages,
    setMessages,
    setMessageCount,
    setError,
    messagesContainerRef,
    messagesCacheRef,
    shouldAutoScroll,
    setShouldAutoScroll,
    setHasNewMessages,
    scrollHelperRequestScroll,
    chats,
  } = props;

  // Reply state
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null
  );
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messageInputRef = useRef<any>(null);

  // Template state
  const [templateInput, setTemplateInput] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string>("");

  // WebSocket for real-time updates
  const {
    statusMap: socketStatusMap,
    messages: inboundMessages,
    isConnected: isSocketConnected,
  } = useRealtimeChat(selectedChatId || undefined);

  // Handler for replying to a message
  const handleReplyById = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.messageId === messageId);
      if (!message || message.isDeleted) return;

      startTransition(() => {
        setReplyingToMessage(message);
      });

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 0);
    },
    [messages]
  );

  // Focus the message input when reply is set
  useEffect(() => {
    if (replyingToMessage) {
      messageInputRef.current?.focus();
    }
  }, [replyingToMessage]);

  // Handler for canceling reply
  const handleCancelReply = useCallback(() => {
    startTransition(() => {
      setReplyingToMessage(null);
    });
  }, []);

  // Handler for clearing template
  const handleTemplateUsed = useCallback(() => {
    setTemplateInput("");
  }, []);

  // Handler for scrolling to a replied message
  const handleScrollToMessage = useCallback((messageId: string) => {
    const messageElement = messageRefs.current.get(messageId);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      messageElement.classList.add("bg-primary/10", "transition-colors");
      setTimeout(() => {
        messageElement.classList.remove("bg-primary/10");
      }, 1500);
    }
  }, []);

  // Send text message
  const handleSendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || !selectedChatId) return;

      try {
        setError(null);
        const chat = chats.find((c) => c.chatId === selectedChatId);
        if (!chat) return;

        const messagePayload: any = {
          to: chat.participantPhone,
          senderId: chat.senderId,
          body: messageText,
        };

        if (replyingToMessage?.messageId) {
          messagePayload.replyToMessageId = replyingToMessage.messageId;
        }

        await backendApi.whatsapp.sendMessage(messagePayload);

        setTemplateInput("");
        setReplyingToMessage(null);

        // Refresh messages
        const response = await backendApi.whatsapp.getChatMessages(
          selectedChatId,
          0,
          PAGE_SIZE
        );
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
          setShouldAutoScroll(true);
          scrollHelperRequestScroll(true);
        }
      } catch (err) {
        console.error("Error sending message:", err);
        setError("Failed to send message");
      }
    },
    [
      selectedChatId,
      chats,
      replyingToMessage,
      messagesCacheRef,
      setMessages,
      setMessageCount,
      setError,
      setShouldAutoScroll,
      scrollHelperRequestScroll,
    ]
  );

  // Delete message handler
  const handleDeleteMessage = useCallback((messageId: string) => {
    setDeletingMessageId(messageId);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await backendApi.whatsapp.deleteMessage(messageId, {
          chatId: selectedChatId || undefined,
        });
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
      } catch (err) {
        console.error("Failed to delete message:", err);
        setError("Failed to delete message");
      }
    },
    [selectedChatId, setMessages, setError]
  );

  // Apply template
  const handleApplyTemplate = useCallback(
    async (template: any) => {
      if (template.locales && template.locales.length > 0) {
        const locale = template.locales[0];
        const chat = chats.find((c) => c.chatId === selectedChatId);

        // If we have a contact, resolve variables against actual contact data
        // Note: selectedContactId would need to be passed in for full functionality
        // For now, we use template body with example vars

        let body = locale.body;
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
    },
    [chats, selectedChatId]
  );

  // Merge inbound WebSocket messages into the message list
  useEffect(() => {
    if (inboundMessages.length === 0) return;

    const container = messagesContainerRef.current;
    const isCurrentlyAtBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight <
        100
      : true;

    setMessages((prevMessages) => {
      const existingIds = new Set(prevMessages.map((m) => m.messageId));
      const newMessages = inboundMessages.filter(
        (wsMsg: InboundMessage) => !existingIds.has(wsMsg.messageId)
      );

      if (newMessages.length === 0) return prevMessages;

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
            ? wsMsg.attachments.map((att: any) => ({
                id: att.id || att.mediaId,
                type: att.type as "image" | "video" | "audio" | "document",
                mediaId: att.id || att.mediaId,
                fileName: att.fileName || "",
                mimeType: att.mimeType || "application/octet-stream",
                size: att.size || 0,
                s3Key: att.s3Key || att.id || att.mediaId,
                thumbnailStatus: att.thumbnailStatus,
                status: att.status || ("success" as const),
                uploadedAt: wsMsg.timestamp,
                isVoiceNote: att.isVoiceNote || false,
              }))
            : undefined,
          sentAt: wsMsg.timestamp,
          deliveredAt: new Date().toISOString(),
          readAt: undefined,
          isDeleted: false,
        })
      );

      const merged = [...prevMessages, ...newMessageObjects];
      return merged.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    });

    if (!isCurrentlyAtBottom) {
      setHasNewMessages(true);
    } else {
      setHasNewMessages(false);
      setShouldAutoScroll(true);
      scrollHelperRequestScroll(true);
    }

    setMessageCount((prev) => prev + inboundMessages.length);
  }, [
    inboundMessages,
    messagesContainerRef,
    setMessages,
    setMessageCount,
    setHasNewMessages,
    setShouldAutoScroll,
    scrollHelperRequestScroll,
  ]);

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
  }, [socketStatusMap, setMessages]);

  // Listen for thumbnail ready events via WebSocket
  const handleThumbnailReady = useCallback(
    (event: ThumbnailReadyEvent) => {
      console.log("📷 Thumbnail ready event received:", event);

      setMessages((prevMessages) =>
        prevMessages.map((message) => {
          if (message.messageId !== event.messageId) {
            return message;
          }

          const updatedAttachments = (message.attachments || []).map(
            (attachment: Attachment) => {
              if (attachment.id !== event.attachmentId) {
                return attachment;
              }

              return {
                ...attachment,
                thumbnailKey: event.thumbnailKey,
                thumbnailStatus: "ready" as const,
                width: event.width,
                height: event.height,
                blurhash: event.blurhash,
                ...(event.duration
                  ? { pageCount: event.duration, duration: event.duration }
                  : {}),
              };
            }
          );

          return {
            ...message,
            attachments: updatedAttachments,
          };
        })
      );

      const container = messagesContainerRef.current;
      if (container) {
        const isAtBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;
        if (isAtBottom) {
          setTimeout(() => {
            container.scrollTop = container.scrollHeight;
          }, 100);
        }
      }
    },
    [setMessages, messagesContainerRef]
  );

  useThumbnailUpdates({
    onThumbnailReady: handleThumbnailReady,
  });

  // Clear reply state when switching chats
  useEffect(() => {
    setReplyingToMessage(null);
  }, [selectedChatId]);

  return {
    replyingToMessage,
    setReplyingToMessage,
    messageRefs,
    templateInput,
    setTemplateInput,
    templateSearch,
    setTemplateSearch,
    isSocketConnected,
    handleReplyById,
    handleCancelReply,
    handleTemplateUsed,
    handleScrollToMessage,
    handleSendMessage,
    handleDeleteMessage,
    handleConfirmDeleteMessage,
    handleApplyTemplate,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deletingMessageId,
    setDeletingMessageId,
    messageInputRef,
  };
}
