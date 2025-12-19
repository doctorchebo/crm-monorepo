/**
 * ChatNotificationsContext
 *
 * Global context for managing real-time chat notifications and unread counts.
 * This provider should be placed at the app layout level to work across all pages.
 *
 * Features:
 * - Listens for WebSocket chat:update events
 * - Tracks unread counts per chat
 * - Plays notification sounds for new messages (based on settings)
 * - Shows browser notifications (based on settings)
 * - Provides methods to update and reset unread counts
 * - Works even when user is not on the chats page
 *
 * Key Design Decisions:
 * - Uses refs for settings/callbacks in WebSocket effect to avoid reconnections
 * - Tracks active chat to prevent notifications/count updates for current chat
 * - Settings are fetched via SWR and used reactively via refs
 */

"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { useBrowserNotifications } from "./use-browser-notifications";
import { useNotificationSettings } from "./use-notification-settings";
import { useNotificationSound } from "./use-notification-sound";

// Interface for chat update events from WebSocket
export interface ChatUpdateEvent {
  chatId: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: string;
  participantName?: string;
}

// Interface for new message events
interface NewMessageEvent {
  chatId: string;
  messageId: string;
  sender: string;
  text?: string;
  type: string;
  participantName?: string;
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

/**
 * Get a human-readable label for message types
 */
function getMessageTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: "Message",
    image: "📷 Photo",
    video: "🎬 Video",
    audio: "🎵 Audio message",
    document: "📄 Document",
    contacts: "👤 Contact",
    location: "📍 Location",
    sticker: "🎭 Sticker",
    gif: "🎞️ GIF",
  };
  return labels[type] || "Message";
}

interface ChatNotificationsProviderProps {
  children: ReactNode;
}

export function ChatNotificationsProvider({
  children,
}: ChatNotificationsProviderProps) {
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [chatUpdates, setChatUpdates] = useState<Map<string, ChatUpdateEvent>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Refs to track current values without causing effect re-runs
  const activeChatIdRef = useRef<string | null>(null);

  // Get notification settings from user preferences
  const { settings, isLoading: isLoadingSettings } = useNotificationSettings();

  // Refs for settings to use in WebSocket handlers without re-creating the effect
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Notification sound hook - uses settings
  const { playSound } = useNotificationSound({
    enabled: settings.soundEnabled,
    volume: settings.soundVolume,
  });

  // Ref for playSound to avoid effect dependencies
  const playSoundRef = useRef(playSound);
  useEffect(() => {
    playSoundRef.current = playSound;
  }, [playSound]);

  // Browser notifications hook
  const { showNotification, isGranted } = useBrowserNotifications();

  // Refs for browser notification to avoid effect dependencies
  const showNotificationRef = useRef(showNotification);
  const isGrantedRef = useRef(isGranted);
  useEffect(() => {
    showNotificationRef.current = showNotification;
    isGrantedRef.current = isGranted;
  }, [showNotification, isGranted]);

  // Wrapper for setActiveChatId that also updates the ref synchronously
  const setActiveChatId = useCallback((chatId: string | null) => {
    activeChatIdRef.current = chatId;
    setActiveChatIdState(chatId);
  }, []);

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

  /**
   * Handle incoming chat update from WebSocket
   * This is extracted to keep the effect clean and testable
   */
  const handleChatUpdate = useCallback((update: ChatUpdateEvent) => {
    const currentActiveChatId = activeChatIdRef.current;
    const isActiveChat = update.chatId === currentActiveChatId;

    console.log(
      `[ChatNotifications] 📨 Chat update: ${update.chatId}, unread: ${update.unreadCount}, isActiveChat: ${isActiveChat}`
    );

    // Update unread count - but SKIP if this is the currently active chat
    // The active chat should always show 0 unread since the user is viewing it
    if (!isActiveChat) {
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(update.chatId, update.unreadCount);
        return next;
      });
    }

    // Store the update for UI consumption (always, for last message updates)
    setChatUpdates((prev) => {
      const next = new Map(prev);
      next.set(update.chatId, update);
      return next;
    });

    // Play notification sound and show browser notification if:
    // 1. The unread count increased (new message)
    // 2. This is NOT the currently active chat
    if (update.unreadCount > 0 && !isActiveChat) {
      // Get current settings from ref (always up-to-date)
      const currentSettings = settingsRef.current;

      // Play sound if enabled
      if (currentSettings.soundEnabled) {
        playSoundRef.current();
      }

      // Show browser notification if enabled and permission granted
      if (currentSettings.browserNotificationsEnabled && isGrantedRef.current) {
        const senderName = update.participantName || "New message";
        const messagePreview = update.lastMessage || "You have a new message";

        showNotificationRef.current({
          title: senderName,
          body: messagePreview,
          tag: `chat-${update.chatId}`,
          data: {
            chatId: update.chatId,
          },
        });
      }
    }
  }, []);

  /**
   * Handle incoming new message from WebSocket
   */
  const handleNewMessage = useCallback((message: NewMessageEvent) => {
    const currentActiveChatId = activeChatIdRef.current;
    const isActiveChat = message.chatId === currentActiveChatId;

    // Skip notifications for the active chat
    if (isActiveChat) {
      return;
    }

    // Get current settings from ref
    const currentSettings = settingsRef.current;

    // Play sound if enabled
    if (currentSettings.soundEnabled) {
      playSoundRef.current();
    }

    // Show browser notification if enabled and permission granted
    if (currentSettings.browserNotificationsEnabled && isGrantedRef.current) {
      const senderName =
        message.participantName || message.sender || "New message";
      const messagePreview = message.text || getMessageTypeLabel(message.type);

      showNotificationRef.current({
        title: senderName,
        body: messagePreview,
        tag: `chat-${message.chatId}`,
        data: {
          chatId: message.chatId,
          messageId: message.messageId,
        },
      });
    }
  }, []);

  // Store handlers in refs for the WebSocket effect
  const handleChatUpdateRef = useRef(handleChatUpdate);
  const handleNewMessageRef = useRef(handleNewMessage);
  useEffect(() => {
    handleChatUpdateRef.current = handleChatUpdate;
    handleNewMessageRef.current = handleNewMessage;
  }, [handleChatUpdate, handleNewMessage]);

  // Connect to WebSocket and listen for chat updates
  // This effect should only run once on mount and cleanup on unmount
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

    // Listen for chat updates - use ref to always get latest handler
    socket.on("chat:update", (update: ChatUpdateEvent) => {
      handleChatUpdateRef.current(update);
    });

    // Listen for new messages - use ref to always get latest handler
    socket.on("message:new", (message: NewMessageEvent) => {
      handleNewMessageRef.current(message);
    });

    return () => {
      console.log("[ChatNotifications] Cleaning up WebSocket connection");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Empty deps - socket connection is stable

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
