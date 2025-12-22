"use client";

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useRef, useState } from "react";
import type { Message, MessagesCacheEntry } from "../types";

interface UseMessageSearchReturn {
  // State
  isSearchOpen: boolean;
  highlightedMessageId: string | null;

  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  scrollToMessage: (
    messageId: string,
    messages: Message[],
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>,
    currentMessagesChatIdRef: React.MutableRefObject<string | null>,
    chatId: string,
    messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
    messagesContainerRef: React.RefObject<HTMLDivElement | null>
  ) => Promise<void>;
  clearHighlight: () => void;
}

/**
 * Hook for managing message search functionality
 * Handles opening/closing search panel, scrolling to messages, and highlighting
 */
export function useMessageSearch(): UseMessageSearchReturn {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

  // Ref to track highlight timeout
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedMessageId(null);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  /**
   * Scroll to a specific message by ID
   * If the message is not loaded, fetches the messages around it first
   */
  const scrollToMessage = useCallback(
    async (
      messageId: string,
      currentMessages: Message[],
      setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
      messagesCacheRef: React.MutableRefObject<Map<string, MessagesCacheEntry>>,
      currentMessagesChatIdRef: React.MutableRefObject<string | null>,
      chatId: string,
      messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
      messagesContainerRef: React.RefObject<HTMLDivElement | null>
    ) => {
      // Clear any existing highlight
      clearHighlight();

      // Check if message is already in the current messages
      const existingMessage = currentMessages.find(
        (m) => m.messageId === messageId
      );

      if (existingMessage) {
        // Message is already loaded, scroll to it
        const messageElement = messageRefs.current.get(messageId);
        if (messageElement && messagesContainerRef.current) {
          // Scroll the message into view
          messageElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          // Highlight the message
          setHighlightedMessageId(messageId);

          // Clear highlight after animation
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedMessageId(null);
          }, 2000);
        }
        return;
      }

      // Message is not loaded - fetch messages around it
      try {
        const positionData = await backendApi.chats.getMessagePosition(
          chatId,
          messageId
        );

        if (!positionData.found) {
          console.warn("Message not found:", messageId);
          return;
        }

        // Update messages with the surrounding messages
        const newMessages = positionData.surroundingMessages as Message[];

        // Only update if we're still on the same chat
        if (currentMessagesChatIdRef.current === chatId) {
          // Merge new messages with existing ones, avoiding duplicates
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.messageId));
            const uniqueNewMessages = newMessages.filter(
              (m) => !existingIds.has(m.messageId)
            );

            // Combine and sort by timestamp
            const combined = [...prev, ...uniqueNewMessages].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );

            return combined;
          });

          // Update cache
          const cachedEntry = messagesCacheRef.current.get(chatId);
          if (cachedEntry) {
            const existingIds = new Set(
              cachedEntry.messages.map((m) => m.messageId)
            );
            const uniqueNewMessages = newMessages.filter(
              (m) => !existingIds.has(m.messageId)
            );
            const combined = [
              ...cachedEntry.messages,
              ...uniqueNewMessages,
            ].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
            messagesCacheRef.current.set(chatId, {
              ...cachedEntry,
              messages: combined,
            });
          }

          // Wait for DOM to update, then scroll to the message
          setTimeout(() => {
            const messageElement = messageRefs.current.get(messageId);
            if (messageElement && messagesContainerRef.current) {
              messageElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });

              // Highlight the message
              setHighlightedMessageId(messageId);

              // Clear highlight after animation
              highlightTimeoutRef.current = setTimeout(() => {
                setHighlightedMessageId(null);
              }, 2000);
            }
          }, 100);
        }
      } catch (error) {
        console.error("Error scrolling to message:", error);
      }
    },
    [clearHighlight]
  );

  return {
    isSearchOpen,
    highlightedMessageId,
    openSearch,
    closeSearch,
    toggleSearch,
    scrollToMessage,
    clearHighlight,
  };
}

export default useMessageSearch;
