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
import { scrollContainerToAbsoluteBottom } from "./scroll-utils";

interface UseMessageHandlersProps {
  selectedChatId: string | null;
  selectedChat: Chat | null;
  selectedContactId: string | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>;
  /**
   * Ref to track which chat the current messages belong to.
   * Use this to validate before updating messages to prevent cross-chat contamination.
   */
  currentMessagesChatIdRef: React.MutableRefObject<string | null>;
  shouldAutoScroll: boolean;
  setShouldAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  setHasNewMessages: React.Dispatch<React.SetStateAction<boolean>>;
  scrollHelperRequestScroll: (smooth?: boolean) => (() => void) | undefined;
  chats: Chat[];
  /**
   * Callback to trigger input focus
   * Centralizes focus logic outside of this hook
   */
  onFocusInput?: () => void;
}

interface UseMessageHandlersReturn {
  // Reply state
  replyingToMessage: Message | null;
  setReplyingToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;

  // Template state
  templateInput: string;
  setTemplateInput: React.Dispatch<React.SetStateAction<string>>;

  // Socket state
  isSocketConnected: boolean;

  // Handlers
  handleReplyById: (messageId: string) => void;
  handleCancelReply: () => void;
  handleTemplateUsed: () => void;
  /**
   * Scroll to a specific message with proper alignment.
   * For the last message, scrolls to bottom; for others, centers in viewport.
   *
   * @param messageId - The ID of the message to scroll to
   * @param messagesContainerRef - Optional ref to the messages container for better scrolling
   * @param contextMessages - Optional messages array to use for "is last message" check.
   *                          Use this when messages were just updated and the hook's
   *                          internal messages array might be stale.
   */
  handleScrollToMessage: (
    messageId: string,
    messagesContainerRef?: React.RefObject<HTMLDivElement | null>,
    contextMessages?: Array<{ messageId: string }>
  ) => void;
  handleSendMessage: (messageText: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => void;
  handleConfirmDeleteMessage: (messageId: string) => Promise<void>;
  handleApplyTemplate: (template: any) => Promise<void>;

  // Delete dialog state
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deletingMessageId: string;
  setDeletingMessageId: React.Dispatch<React.SetStateAction<string>>;
}

export function useMessageHandlers(
  props: UseMessageHandlersProps
): UseMessageHandlersReturn {
  const {
    selectedChatId,
    selectedChat,
    selectedContactId,
    messages,
    setMessages,
    setMessageCount,
    setError,
    messagesContainerRef,
    messagesCacheRef,
    currentMessagesChatIdRef,
    shouldAutoScroll,
    setShouldAutoScroll,
    setHasNewMessages,
    scrollHelperRequestScroll,
    chats,
    onFocusInput,
  } = props;

  // Reply state
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null
  );
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Template state
  const [templateInput, setTemplateInput] = useState("");

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

      // Trigger focus via centralized callback
      onFocusInput?.();
    },
    [messages, onFocusInput]
  );

  // Focus the message input when reply is set
  useEffect(() => {
    if (replyingToMessage) {
      onFocusInput?.();
    }
  }, [replyingToMessage, onFocusInput]);

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

  /**
   * Handler for scrolling to a specific message (e.g., when navigating to pinned messages or replies).
   * Uses a polling approach to wait for the element to appear in the DOM.
   * This is necessary because React may not have rendered the element yet after state updates.
   *
   * For messages at the bottom of the list, scrolls the container to bottom since
   * scrollIntoView({ block: "center" }) can't center the last message.
   *
   * @param messageId - The ID of the message to scroll to
   * @param messagesContainerRef - Optional ref to the messages container
   * @param contextMessages - Optional messages array to use for "is last message" check
   */
  const handleScrollToMessage = useCallback(
    (
      messageId: string,
      messagesContainerRef?: React.RefObject<HTMLDivElement | null>,
      contextMessages?: Array<{ messageId: string }>
    ) => {
      // Use provided context messages if available, otherwise fall back to hook's messages
      const messagesForCheck = contextMessages || messages;

      /**
       * Check if the message is the last message in the messages array.
       */
      const isLastMessage = (targetMessageId: string): boolean => {
        if (messagesForCheck.length === 0) return false;
        const lastMessage = messagesForCheck[messagesForCheck.length - 1];
        return lastMessage.messageId === targetMessageId;
      };

      /**
       * Perform the scroll to make the message visible.
       * For the last message, we scroll the container to absolute bottom.
       * For other messages, we center them in the viewport.
       */
      const performScroll = (element: HTMLElement) => {
        const isLast = isLastMessage(messageId);
        const container = messagesContainerRef?.current;

        if (isLast && container) {
          // For the last message: scroll container to absolute bottom
          // Uses shared utility with retry mechanism
          scrollContainerToAbsoluteBottom(container, true);
        } else if (isLast) {
          // Fallback if no container ref
          element.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        } else {
          // For other messages, center them in the viewport
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }

        // Add highlight effect
        element.classList.add("bg-primary/10", "transition-colors");
        setTimeout(() => {
          element.classList.remove("bg-primary/10");
        }, 1500);
      };

      /**
       * Poll for the element to appear in DOM.
       * Returns true if element found and scroll initiated.
       */
      const tryScroll = () => {
        const messageElement = messageRefs.current.get(messageId);
        if (messageElement) {
          performScroll(messageElement);
          return true;
        }
        return false;
      };

      // Try immediately
      if (tryScroll()) return;

      // If not found, poll for the element (DOM may not be updated yet)
      let attempts = 0;
      const maxAttempts = 30; // Max 1.5 seconds (30 * 50ms)
      const intervalId = setInterval(() => {
        attempts++;
        if (tryScroll() || attempts >= maxAttempts) {
          clearInterval(intervalId);
          if (attempts >= maxAttempts) {
            console.warn(
              `[handleScrollToMessage] Message element not found after ${maxAttempts} attempts:`,
              messageId
            );
          }
        }
      }, 50);
    },
    [messages]
  );

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

        // Refresh messages - but only if we're still on the same chat
        if (currentMessagesChatIdRef.current !== selectedChatId) {
          console.log(
            "[MessageHandlers] Skipping message refresh - chat changed"
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
            "[MessageHandlers] Skipping message update - chat changed"
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
          setShouldAutoScroll(true);
          scrollHelperRequestScroll(true);
        }
      } catch (err: any) {
        console.error("Error sending message:", err);

        // Check if this is a conversation window violation error from the backend
        if (
          err?.response?.data?.error === "CONVERSATION_WINDOW_VIOLATION" ||
          err?.response?.data?.errorCode === "OUTSIDE_CONVERSATION_WINDOW" ||
          err?.response?.data?.errorCode === "NO_CUSTOMER_MESSAGES"
        ) {
          const errorData = err.response.data;
          setError(
            errorData.message ||
              "Cannot send message: Outside 24-hour conversation window. Use an approved template."
          );
        } else {
          setError("Failed to send message");
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

  // Apply template - resolves variables against actual contact data via backend API
  const handleApplyTemplate = useCallback(
    async (template: any) => {
      if (!template.locales || template.locales.length === 0) {
        return;
      }

      const chat = chats.find((c) => c.chatId === selectedChatId);

      // Smart locale selection based on customer's preferred language
      // Priority: customer language > 'en' > first available locale
      let locale = template.locales[0]; // Default to first locale

      if (selectedContactId && template.locales.length > 1) {
        try {
          // Fetch contact's preferred language
          const contactProfile = await backendApi.contacts.getProfile(
            selectedContactId
          );
          const customerLanguage = contactProfile?.contact?.language;

          console.log(
            "[Template Selection] Customer language:",
            customerLanguage
          );
          console.log(
            "[Template Selection] Available locales:",
            template.locales.map((l: any) => ({
              locale: l.locale,
              status: l.approvalStatus,
            }))
          );

          if (customerLanguage) {
            // Try to find a locale matching the customer's language (check both approved and draft for flexibility)
            const matchingLocale = template.locales.find(
              (l: any) => l.locale === customerLanguage
            );
            console.log(
              "[Template Selection] Matching locale found:",
              matchingLocale?.locale
            );
            if (matchingLocale) {
              locale = matchingLocale;
            }
          }

          // If no matching locale found and customer language isn't English, try English as fallback
          if (
            locale === template.locales[0] &&
            customerLanguage &&
            customerLanguage !== "en"
          ) {
            const englishLocale = template.locales.find(
              (l: any) => l.locale === "en"
            );
            if (englishLocale) {
              locale = englishLocale;
            }
          }

          console.log("[Template Selection] Selected locale:", locale.locale);
        } catch (error) {
          console.error("Failed to fetch contact language preference:", error);
          // Continue with default locale
        }
      }

      // If we have a contact, resolve variables via the backend API
      if (selectedContactId && template.id && locale.locale) {
        try {
          const resolved = await backendApi.templates.resolve(template.id, {
            locale: locale.locale,
            contactId: selectedContactId,
            senderId: chat?.senderId,
            chatId: selectedChatId || undefined,
          });

          if (resolved.success || resolved.body) {
            // Use the resolved body from the backend
            setTemplateInput(resolved.body);
            return;
          }

          // If resolution partially failed but we have some resolved variables,
          // still use the resolved body (may have some unresolved placeholders)
          if (resolved.body && resolved.body !== locale.body) {
            setTemplateInput(resolved.body);
            return;
          }
        } catch (error) {
          console.error("Failed to resolve template variables:", error);
          // Fall through to fallback logic below
        }
      }

      // Fallback: Use example vars if available, otherwise use raw template body
      let body = locale.body;
      if (locale.exampleVars && Object.keys(locale.exampleVars).length > 0) {
        Object.entries(locale.exampleVars).forEach(([key, value]) => {
          body = body.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            String(value || "")
          );
        });
      }
      setTemplateInput(body);
    },
    [chats, selectedChatId, selectedContactId]
  );

  // Merge inbound WebSocket messages into the message list
  // CRITICAL: This effect only runs when we have inbound messages AND a selected chat
  // The currentMessagesChatIdRef ensures we don't update messages for a different chat
  useEffect(() => {
    if (inboundMessages.length === 0 || !selectedChatId) return;

    // CRITICAL: Validate that we're updating the correct chat's messages
    // This prevents race conditions where the effect fires after chat switch
    if (currentMessagesChatIdRef.current !== selectedChatId) {
      console.log(
        `[MessageHandlers] Skipping inbound message merge - chat mismatch`,
        {
          selectedChatId,
          currentMessagesChatId: currentMessagesChatIdRef.current,
        }
      );
      return;
    }

    const container = messagesContainerRef.current;
    const isCurrentlyAtBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight <
        100
      : true;

    // Track how many messages were actually added
    let addedCount = 0;

    setMessages((prevMessages) => {
      // Double-check chat ID inside the state updater to handle timing issues
      if (currentMessagesChatIdRef.current !== selectedChatId) {
        return prevMessages;
      }

      const existingIds = new Set(prevMessages.map((m) => m.messageId));
      // Filter for messages that belong to the current chat and don't already exist
      const newMessages = inboundMessages.filter(
        (wsMsg: InboundMessage) =>
          !existingIds.has(wsMsg.messageId) && wsMsg.chatId === selectedChatId
      );

      if (newMessages.length === 0) return prevMessages;

      addedCount = newMessages.length;

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

    if (addedCount > 0) {
      setMessageCount((prev) => prev + addedCount);
    }
  }, [
    inboundMessages,
    selectedChatId,
    currentMessagesChatIdRef,
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
  };
}
