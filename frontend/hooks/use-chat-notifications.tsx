/**
 * ChatNotificationsContext
 *
 * Global context for managing real-time chat notifications and unread counts.
 * This provider should be placed at the app layout level to work across all pages.
 *
 * Features:
 * - Listens for WebSocket chat:update events
 * - Tracks unread counts per chat
 * - Plays notification sounds for new messages
 * - Provides methods to update and reset unread counts
 * - Works even when user is not on the chats page
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useNotificationSound } from "./use-notification-sound";

// Interface for chat update events from WebSocket
export interface ChatUpdateEvent {
  chatId: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: string;
}

// Interface for the context value
interface ChatNotificationsContextValue {
  // Map of chatId -> unread count
  unreadCounts: Map<string, number>;
  // Total unread count across all chats
  totalUnreadCount: number;
  // Update unread count for a specific chat
  updateUnreadCount: (chatId: string, count: number) => void;
  // Reset unread count for a chat (when user opens it)
  resetUnreadCount: (chatId: string) => void;
  // Set all unread counts (for initial load)
  setAllUnreadCounts: (counts: Map<string, number>) => void;
  // Latest chat updates (for UI updates)
  chatUpdates: Map<string, ChatUpdateEvent>;
  // Connection status
  isConnected: boolean;
  // Currently active chat (to avoid notifications for active chat)
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
}

const ChatNotificationsContext =
  createContext<ChatNotificationsContextValue | null>(null);

interface ChatNotificationsProviderProps {
  children: ReactNode;
  soundEnabled?: boolean;
  soundVolume?: number;
}

export function ChatNotificationsProvider({
  children,
  soundEnabled = true,
  soundVolume = 0.5,
}: ChatNotificationsProviderProps) {
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [chatUpdates, setChatUpdates] = useState<Map<string, ChatUpdateEvent>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Notification sound hook
  const { playSound } = useNotificationSound({
    enabled: soundEnabled,
    volume: soundVolume,
  });

  // Calculate total unread count
  const totalUnreadCount = useMemo(() => {
    let total = 0;
    unreadCounts.forEach((count) => {
      total += count;
    });
    return total;
  }, [unreadCounts]);

  // Update unread count for a specific chat
  const updateUnreadCount = useCallback((chatId: string, count: number) => {
    setUnreadCounts((prev) => {
      const next = new Map(prev);
      next.set(chatId, count);
      return next;
    });
  }, []);

  // Reset unread count for a chat
  const resetUnreadCount = useCallback((chatId: string) => {
    setUnreadCounts((prev) => {
      const next = new Map(prev);
      next.set(chatId, 0);
      return next;
    });
  }, []);

  // Set all unread counts (for initial load)
  const setAllUnreadCounts = useCallback((counts: Map<string, number>) => {
    setUnreadCounts(new Map(counts));
  }, []);

  // Connect to WebSocket and listen for chat updates
  useEffect(() => {
    console.log("[ChatNotifications] Connecting to WebSocket...");

    const socket = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      }
    );

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ChatNotifications] ✅ Connected to WebSocket");
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[ChatNotifications] ❌ Disconnected from WebSocket");
      setIsConnected(false);
    });

    // Listen for chat updates (unread count changes, last message updates)
    socket.on("chat:update", (update: ChatUpdateEvent) => {
      console.log(
        `[ChatNotifications] 📨 Chat update: ${update.chatId}, unread: ${update.unreadCount}`
      );

      // Update unread count
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(update.chatId, update.unreadCount);
        return next;
      });

      // Store the update for UI consumption
      setChatUpdates((prev) => {
        const next = new Map(prev);
        next.set(update.chatId, update);
        return next;
      });

      // Play notification sound if:
      // 1. The unread count increased (new message)
      // 2. This is not the currently active chat
      const currentActiveChatId = activeChatIdRef.current;
      if (update.unreadCount > 0 && update.chatId !== currentActiveChatId) {
        playSound();
      }
    });

    // Also listen for new messages to trigger sound even if chat:update hasn't arrived yet
    socket.on("message:new", (message: { chatId: string }) => {
      const currentActiveChatId = activeChatIdRef.current;
      if (message.chatId !== currentActiveChatId) {
        playSound();
      }
    });

    return () => {
      console.log("[ChatNotifications] Cleaning up WebSocket connection");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [playSound]);

  const contextValue = useMemo<ChatNotificationsContextValue>(
    () => ({
      unreadCounts,
      totalUnreadCount,
      updateUnreadCount,
      resetUnreadCount,
      setAllUnreadCounts,
      chatUpdates,
      isConnected,
      activeChatId,
      setActiveChatId,
    }),
    [
      unreadCounts,
      totalUnreadCount,
      updateUnreadCount,
      resetUnreadCount,
      setAllUnreadCounts,
      chatUpdates,
      isConnected,
      activeChatId,
      setActiveChatId,
    ]
  );

  return (
    <ChatNotificationsContext.Provider value={contextValue}>
      {children}
    </ChatNotificationsContext.Provider>
  );
}

/**
 * Hook to use chat notifications context
 * Must be used within a ChatNotificationsProvider
 */
export function useChatNotifications() {
  const context = useContext(ChatNotificationsContext);
  if (!context) {
    throw new Error(
      "useChatNotifications must be used within a ChatNotificationsProvider"
    );
  }
  return context;
}

/**
 * Hook to get unread count for a specific chat
 */
export function useChatUnreadCount(chatId: string | null) {
  const { unreadCounts } = useChatNotifications();
  return chatId ? unreadCounts.get(chatId) || 0 : 0;
}
