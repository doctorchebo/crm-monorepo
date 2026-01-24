"use client";

/**
 * useReactions Hook
 *
 * Manages reactions state for chat messages including:
 * - Fetching initial reactions for messages
 * - Adding/updating reactions via API
 * - Removing reactions via API
 * - Real-time updates via WebSocket
 * - Optimistic UI updates for immediate feedback
 * - Animation tracking for pop effects
 */

import { backendApi } from "@/lib/api/endpoints";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { MessageReaction } from "../types";

interface ReactionAddedEvent {
  id: number;
  messageId: string;
  userId: number;
  emoji: string;
  userName?: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ReactionRemovedEvent {
  messageId: string;
  userId: number;
  timestamp: string;
}

/**
 * Event for customer reactions (from WhatsApp user)
 * These are different from CRM user reactions
 */
interface CustomerReactionEvent {
  chatId: string;
  messageId: string;
  emoji: string | null;
  senderPhone: string;
  action: "added" | "removed";
  timestamp: string;
}

type ReactionsMap = Record<string, MessageReaction[]>;

interface UseReactionsOptions {
  /** Current user's ID */
  currentUserId?: number;
  /** Current user's name (for optimistic updates) */
  currentUserName?: string;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Current chat ID (for filtering customer reactions) */
  chatId?: string;
}

/**
 * Customer reaction representation (from WhatsApp users)
 * Distinguished from CRM user reactions by having senderPhone instead of userId
 */
interface CustomerReaction {
  messageId: string;
  emoji: string;
  senderPhone: string;
  timestamp: string;
}

/**
 * Map of message ID to customer reactions (from WhatsApp users)
 */
type CustomerReactionsMap = Record<string, CustomerReaction | null>;

interface UseReactionsReturn {
  /** Map of message ID to reactions */
  reactionsMap: ReactionsMap;
  /** Map of message ID to customer reaction (from WhatsApp user) */
  customerReactionsMap: CustomerReactionsMap;
  /** Set of message IDs currently animating */
  animatingReactionIds: Set<string>;
  /** Handle reaction selection (add/update/remove) */
  handleReactionSelect: (messageId: string, emoji: string) => Promise<void>;
  /** Load reactions for given messages */
  loadReactionsForMessages: (messageIds: string[]) => Promise<void>;
  /** Load customer reactions for a chat */
  loadCustomerReactionsForChat: (chatId: string) => Promise<void>;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Clear all reactions (on chat change) */
  clearReactions: () => void;
}

/**
 * Hook to manage message reactions with real-time updates
 */
export function useReactions(
  options: UseReactionsOptions = {},
): UseReactionsReturn {
  const { currentUserId, currentUserName, enabled = true, chatId } = options;

  const socketRef = useRef<Socket | null>(null);
  const [reactionsMap, setReactionsMap] = useState<ReactionsMap>({});
  const [customerReactionsMap, setCustomerReactionsMap] =
    useState<CustomerReactionsMap>({});
  const [animatingReactionIds, setAnimatingReactionIds] = useState<Set<string>>(
    new Set(),
  );
  const [isConnected, setIsConnected] = useState(false);

  // Track loaded message IDs to avoid re-fetching
  const loadedMessageIdsRef = useRef<Set<string>>(new Set());

  // Use refs for values that change but shouldn't cause socket reconnection
  // This prevents stale closures in socket event handlers
  const chatIdRef = useRef<string | undefined>(chatId);
  const currentUserIdRef = useRef<number | undefined>(currentUserId);

  // Keep refs in sync with props
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    if (!enabled) return;

    console.log("[useReactions] Connecting to WebSocket...");

    const socket = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      },
    );

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[useReactions] Connected");
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("[useReactions] Disconnected:", reason);
      setIsConnected(false);
    });

    // Handle reaction added/updated
    socket.on("reaction:added", (event: ReactionAddedEvent) => {
      console.log("[useReactions] Reaction added:", event);

      // Skip if this is our own reaction (we already applied optimistically)
      // Use ref to get current value to avoid stale closure
      if (event.userId === currentUserIdRef.current) {
        return;
      }

      setReactionsMap((prev) => {
        const messageReactions = prev[event.messageId] || [];

        // Check if this user already has a reaction
        const existingIndex = messageReactions.findIndex(
          (r) => r.userId === event.userId,
        );

        let updated: MessageReaction[];
        if (existingIndex >= 0) {
          updated = [...messageReactions];
          updated[existingIndex] = {
            id: event.id,
            messageId: event.messageId,
            userId: event.userId,
            emoji: event.emoji,
            userName: event.userName,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          };
        } else {
          updated = [
            ...messageReactions,
            {
              id: event.id,
              messageId: event.messageId,
              userId: event.userId,
              emoji: event.emoji,
              userName: event.userName,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
            },
          ];
        }

        return { ...prev, [event.messageId]: updated };
      });

      // Trigger animation
      triggerAnimation(event.messageId);
    });

    // Handle reaction removed
    socket.on("reaction:removed", (event: ReactionRemovedEvent) => {
      console.log("[useReactions] Reaction removed:", event);

      // Skip if this is our own reaction (we already applied optimistically)
      // Use ref to get current value to avoid stale closure
      if (event.userId === currentUserIdRef.current) {
        return;
      }

      setReactionsMap((prev) => {
        const messageReactions = prev[event.messageId];
        if (!messageReactions) return prev;

        const updated = messageReactions.filter(
          (r) => r.userId !== event.userId,
        );

        return { ...prev, [event.messageId]: updated };
      });
    });

    // Handle customer reaction (from WhatsApp user)
    // These are different from CRM user reactions - they come from the contact
    socket.on("customer-reaction", (event: CustomerReactionEvent) => {
      // Use ref to get current chatId to avoid stale closure
      const currentChatId = chatIdRef.current;

      // Only process reactions for the current chat
      // Use ref value to get the current chatId (not stale closure)
      if (currentChatId && event.chatId !== currentChatId) {
        return;
      }

      if (event.action === "removed" || !event.emoji) {
        // Customer removed their reaction
        setCustomerReactionsMap((prev) => ({
          ...prev,
          [event.messageId]: null,
        }));
      } else {
        // Customer added/updated their reaction
        // At this point, event.emoji is guaranteed to be non-null
        const emoji = event.emoji;
        setCustomerReactionsMap((prev) => ({
          ...prev,
          [event.messageId]: {
            messageId: event.messageId,
            emoji,
            senderPhone: event.senderPhone,
            timestamp: event.timestamp,
          },
        }));

        // Trigger animation
        triggerAnimation(event.messageId);
      }
    });

    return () => {
      // Firefox fix: Only disconnect if connection is open
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, [enabled]); // Only depend on enabled - use refs for other values to avoid stale closures

  /**
   * Trigger pop animation for a message's reaction
   */
  const triggerAnimation = useCallback((messageId: string) => {
    setAnimatingReactionIds((prev) => {
      const updated = new Set(prev);
      updated.add(messageId);
      return updated;
    });

    // Clear animation after it completes
    setTimeout(() => {
      setAnimatingReactionIds((prev) => {
        const updated = new Set(prev);
        updated.delete(messageId);
        return updated;
      });
    }, 350); // Match CSS animation duration + buffer
  }, []);

  /**
   * Load reactions for a batch of messages
   */
  const loadReactionsForMessages = useCallback(async (messageIds: string[]) => {
    // Filter out already loaded messages
    const newMessageIds = messageIds.filter(
      (id) => !loadedMessageIdsRef.current.has(id),
    );

    if (newMessageIds.length === 0) return;

    try {
      const results = await backendApi.reactions.getForMessages(newMessageIds);

      // Mark as loaded
      newMessageIds.forEach((id) => loadedMessageIdsRef.current.add(id));

      // Update reactions map
      setReactionsMap((prev) => {
        const updated = { ...prev };
        for (const { messageId, reactions } of results) {
          updated[messageId] = reactions.map((r) => ({
            id: r.id,
            messageId: r.messageId,
            userId: r.userId,
            emoji: r.emoji,
            userName: r.userName,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }));
        }
        return updated;
      });
    } catch (error) {
      console.error("[useReactions] Failed to load reactions:", error);
    }
  }, []);

  /**
   * Handle reaction selection (add, update, or toggle off)
   */
  const handleReactionSelect = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) {
        console.warn("[useReactions] No currentUserId, cannot add reaction");
        return;
      }

      const existingReactions = reactionsMap[messageId] || [];
      const userReaction = existingReactions.find(
        (r) => r.userId === currentUserId,
      );

      // If clicking the same emoji, remove it
      if (userReaction?.emoji === emoji) {
        // Optimistic removal
        setReactionsMap((prev) => {
          const updated = (prev[messageId] || []).filter(
            (r) => r.userId !== currentUserId,
          );
          return { ...prev, [messageId]: updated };
        });

        try {
          await backendApi.reactions.remove(messageId);
        } catch (error) {
          console.error("[useReactions] Failed to remove reaction:", error);
          // Rollback on error
          if (userReaction) {
            setReactionsMap((prev) => ({
              ...prev,
              [messageId]: [...(prev[messageId] || []), userReaction],
            }));
          }
        }
        return;
      }

      // Optimistic add/update
      const optimisticReaction: MessageReaction = {
        id: userReaction?.id || -Date.now(),
        messageId,
        userId: currentUserId,
        emoji,
        userName: currentUserName,
        createdAt: userReaction?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setReactionsMap((prev) => {
        const existing = prev[messageId] || [];
        const withoutUser = existing.filter((r) => r.userId !== currentUserId);
        return {
          ...prev,
          [messageId]: [...withoutUser, optimisticReaction],
        };
      });

      // Trigger animation
      triggerAnimation(messageId);

      try {
        const result = await backendApi.reactions.add({ messageId, emoji });

        // Update with actual server response
        setReactionsMap((prev) => {
          const existing = prev[messageId] || [];
          const withoutUser = existing.filter(
            (r) => r.userId !== currentUserId,
          );
          return {
            ...prev,
            [messageId]: [
              ...withoutUser,
              {
                id: result.id,
                messageId: result.messageId,
                userId: result.userId,
                emoji: result.emoji,
                userName: result.userName,
                createdAt: result.createdAt,
                updatedAt: result.updatedAt,
              },
            ],
          };
        });
      } catch (error) {
        console.error("[useReactions] Failed to add reaction:", error);
        // Rollback on error - restore previous reaction or remove
        setReactionsMap((prev) => {
          const existing = prev[messageId] || [];
          const withoutOptimistic = existing.filter(
            (r) => r.id !== optimisticReaction.id,
          );
          if (userReaction) {
            return {
              ...prev,
              [messageId]: [...withoutOptimistic, userReaction],
            };
          }
          return { ...prev, [messageId]: withoutOptimistic };
        });
      }
    },
    [currentUserId, currentUserName, reactionsMap, triggerAnimation],
  );

  /**
   * Load customer reactions for a chat
   * Called when chat is opened or switched
   */
  const loadCustomerReactionsForChat = useCallback(
    async (targetChatId: string) => {
      try {
        const customerReactionsList =
          await backendApi.reactions.getCustomerReactionsForChat(targetChatId);

        // Convert array to map by messageId
        setCustomerReactionsMap((prev) => {
          const updated = { ...prev };
          for (const reaction of customerReactionsList) {
            if (reaction.emoji) {
              updated[reaction.messageId] = {
                messageId: reaction.messageId,
                emoji: reaction.emoji,
                senderPhone: reaction.senderPhone,
                timestamp: reaction.updatedAt || new Date().toISOString(),
              };
            }
          }
          return updated;
        });
      } catch (error) {
        console.error(
          "[useReactions] Failed to load customer reactions:",
          error,
        );
      }
    },
    [],
  );

  // Load customer reactions when chat changes
  useEffect(() => {
    if (chatId) {
      loadCustomerReactionsForChat(chatId);
    }
  }, [chatId, loadCustomerReactionsForChat]);

  /**
   * Clear all reactions (e.g., when switching chats)
   */
  const clearReactions = useCallback(() => {
    setReactionsMap({});
    setCustomerReactionsMap({});
    loadedMessageIdsRef.current.clear();
  }, []);

  return {
    reactionsMap,
    customerReactionsMap,
    animatingReactionIds,
    handleReactionSelect,
    loadReactionsForMessages,
    loadCustomerReactionsForChat,
    isConnected,
    clearReactions,
  };
}
