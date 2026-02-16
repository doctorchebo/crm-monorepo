"use client";

/**
 * usePins Hook
 *
 * Manages pinned messages state for chat including:
 * - Fetching pinned messages for a chat
 * - Pinning/unpinning messages via API
 * - Real-time updates via WebSocket
 * - Navigation between pinned messages
 * - Tracking which pinned messages are visible
 */

import { backendApi, PinnedMessageResponse } from "@/lib/api/endpoints";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import type { Message, PinDuration } from "../types";

interface PinAddedEvent extends PinnedMessageResponse {
  // Event data matches the response type
}

interface PinRemovedEvent {
  messageId: string;
  chatId: string;
  reason: "unpinned" | "expired" | "replaced";
  timestamp: string;
}

interface UsePinsOptions {
  /** Chat ID to manage pins for */
  chatId: string | null;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Shared socket instance from useChatNotifications (avoids duplicate connections) */
  socket?: Socket | null;
}

interface UsePinsReturn {
  /** List of pinned messages */
  pinnedMessages: PinnedMessageResponse[];
  /** Set of pinned message IDs for quick lookup */
  pinnedMessageIds: Set<string>;
  /** Index of currently displayed pinned message */
  currentPinIndex: number;
  /** Whether loading pins */
  isLoading: boolean;
  /** Pin count info */
  pinCount: {
    count: number;
    maxPins: number;
    canPinMore: boolean;
  };
  /** Whether socket is connected */
  isConnected: boolean;

  // Actions
  /** Pin a message */
  pinMessage: (messageId: string, duration: PinDuration) => Promise<void>;
  /** Unpin a message */
  unpinMessage: (messageId: string) => Promise<void>;
  /** Set the current pin index */
  setCurrentPinIndex: (index: number) => void;
  /** Navigate to next pinned message */
  goToNextPin: () => void;
  /** Navigate to previous pinned message */
  goToPreviousPin: () => void;
  /** Get message context for navigation - returns messages and pagination info */
  getMessageContext: (messageId: string) => Promise<{
    messages: Message[];
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
  } | null>;
  /** Refresh pinned messages */
  refreshPins: () => Promise<void>;
}

/**
 * Hook to manage pinned messages with real-time updates
 */
export function usePins(options: UsePinsOptions): UsePinsReturn {
  const { chatId, enabled = true, socket } = options;

  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageResponse[]>(
    [],
  );
  const [currentPinIndex, setCurrentPinIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Use a ref for chatId in socket handlers to prevent stale closures
  const chatIdRef = useRef<string | null>(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Memoized set of pinned message IDs — only recreated when pinnedMessages changes
  const pinnedMessageIds = useMemo(
    () => new Set(pinnedMessages.map((p) => p.messageId)),
    [pinnedMessages],
  );

  // Pin count info — memoized to avoid object recreation
  const pinCount = useMemo(
    () => ({
      count: pinnedMessages.length,
      maxPins: 3,
      canPinMore: pinnedMessages.length < 3,
    }),
    [pinnedMessages.length],
  );

  // Load pinned messages for a chat
  const loadPinnedMessages = useCallback(async (chatIdToLoad: string) => {
    setIsLoading(true);
    try {
      const pins = await backendApi.pins.getForChat(chatIdToLoad);
      setPinnedMessages(pins);
      // Reset index if it's out of bounds
      setCurrentPinIndex((prev) =>
        Math.min(prev, Math.max(0, pins.length - 1)),
      );
    } catch (error) {
      console.error("[usePins] Failed to load pinned messages:", error);
      setPinnedMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load pins when chat changes
  useEffect(() => {
    if (!enabled || !chatId) {
      setPinnedMessages([]);
      setCurrentPinIndex(0);
      return;
    }

    loadPinnedMessages(chatId);
  }, [chatId, enabled, loadPinnedMessages]);

  // Derive isConnected from the shared socket
  const isConnected = !!socket?.connected;

  // Listen for pin events on the shared socket
  useEffect(() => {
    if (!enabled || !socket) return;

    const handlePinAdded = (event: PinAddedEvent) => {
      const currentChatId = chatIdRef.current;
      if (event.chatId !== currentChatId) return;

      setPinnedMessages((prev) => {
        const exists = prev.some((p) => p.messageId === event.messageId);
        if (exists) return prev;

        const updated = [...prev, event].sort(
          (a, b) =>
            new Date(a.pinnedAt).getTime() - new Date(b.pinnedAt).getTime(),
        );

        return updated;
      });
    };

    const handlePinRemoved = (event: PinRemovedEvent) => {
      const currentChatId = chatIdRef.current;
      if (event.chatId !== currentChatId) return;

      setPinnedMessages((prev) => {
        const updated = prev.filter((p) => p.messageId !== event.messageId);
        return updated;
      });

      setCurrentPinIndex((prev) =>
        Math.min(prev, Math.max(0, pinnedMessages.length - 2)),
      );
    };

    socket.on("pin:added", handlePinAdded);
    socket.on("pin:removed", handlePinRemoved);

    return () => {
      socket.off("pin:added", handlePinAdded);
      socket.off("pin:removed", handlePinRemoved);
    };
  }, [enabled, socket, pinnedMessages.length]);

  // Pin a message
  const pinMessage = useCallback(
    async (messageId: string, duration: PinDuration) => {
      if (!chatId) return;

      try {
        const newPin = await backendApi.pins.pin({
          messageId,
          chatId,
          duration,
        });

        // Optimistic update
        setPinnedMessages((prev) => {
          const exists = prev.some((p) => p.messageId === messageId);
          if (exists) return prev;

          // If at max, remove oldest
          let updated = [...prev];
          if (updated.length >= 3) {
            updated = updated.slice(1);
          }

          return [...updated, newPin].sort(
            (a, b) =>
              new Date(a.pinnedAt).getTime() - new Date(b.pinnedAt).getTime(),
          );
        });
      } catch (error) {
        console.error("[usePins] Failed to pin message:", error);
        throw error;
      }
    },
    [chatId],
  );

  // Unpin a message
  const unpinMessage = useCallback(
    async (messageId: string) => {
      if (!chatId) return;

      try {
        await backendApi.pins.unpin({ messageId, chatId });

        // Optimistic update
        setPinnedMessages((prev) =>
          prev.filter((p) => p.messageId !== messageId),
        );

        // Adjust current index
        setCurrentPinIndex((prev) =>
          Math.min(prev, Math.max(0, pinnedMessages.length - 2)),
        );
      } catch (error) {
        console.error("[usePins] Failed to unpin message:", error);
        throw error;
      }
    },
    [chatId, pinnedMessages.length],
  );

  // Navigation helpers
  const goToNextPin = useCallback(() => {
    setCurrentPinIndex((prev) =>
      prev < pinnedMessages.length - 1 ? prev + 1 : 0,
    );
  }, [pinnedMessages.length]);

  const goToPreviousPin = useCallback(() => {
    setCurrentPinIndex((prev) =>
      prev > 0 ? prev - 1 : pinnedMessages.length - 1,
    );
  }, [pinnedMessages.length]);

  // Simple function to get message context for navigation
  const getMessageContext = useCallback(
    async (messageId: string) => {
      if (!chatId) return null;

      try {
        const context = await backendApi.pins.getMessageContext(
          chatId,
          messageId,
        );

        if (!context.found) {
          return null;
        }

        return {
          messages: context.surroundingMessages as Message[],
          hasMoreBefore: context.hasMoreBefore,
          hasMoreAfter: context.hasMoreAfter,
        };
      } catch (error) {
        console.error("[usePins] Failed to get message context:", error);
        throw error;
      }
    },
    [chatId],
  );

  // Refresh pins
  const refreshPins = useCallback(async () => {
    if (!chatId) return;
    await loadPinnedMessages(chatId);
  }, [chatId, loadPinnedMessages]);

  return {
    pinnedMessages,
    pinnedMessageIds,
    currentPinIndex,
    isLoading,
    pinCount,
    isConnected,
    pinMessage,
    unpinMessage,
    setCurrentPinIndex,
    goToNextPin,
    goToPreviousPin,
    getMessageContext,
    refreshPins,
  };
}

export default usePins;
