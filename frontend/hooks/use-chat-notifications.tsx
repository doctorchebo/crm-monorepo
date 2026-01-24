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

import { TokenManager } from "@/lib/auth/token-manager";
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
  // Last activity tracking for reactions
  lastActivityType?: string;
  lastReactionEmoji?: string | null;
  lastReactionIsOwn?: boolean;
  lastReactedMessagePreview?: string | null;
}

// Interface for new chat events from WebSocket (customer initiated conversation)
export interface NewChatEvent {
  chatId: string;
  businessPhone: string;
  participantPhone: string;
  participantName: string;
  senderId: number;
  userId?: number;
  isActive: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageTime?: string;
  createdAt: string;
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

// Interface for chat deleted events
export interface ChatDeletedEvent {
  chatId: string;
  timestamp: string;
}

// Callback type for new chat events
type NewChatCallback = (chat: NewChatEvent) => void;

// Callback type for chat deleted events
type ChatDeletedCallback = (event: ChatDeletedEvent) => void;

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
  // Remove unread count entry for a deleted chat
  removeUnreadCount: (chatId: string) => void;
  // Latest chat updates (for UI updates)
  chatUpdates: Map<string, ChatUpdateEvent>;
  // Remove chat update entry for a deleted chat
  removeChatUpdate: (chatId: string) => void;
  // Connection status
  isConnected: boolean;
  // Currently active chat (to avoid notifications for active chat)
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
  // Register callback for new chat events
  onNewChat: (callback: NewChatCallback) => () => void;
  // Register callback for chat deleted events
  // Register callback for chat deleted events
  onChatDeleted: (callback: ChatDeletedCallback) => () => void;
  // The underlying socket instance
  socket: Socket | null;
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Refs to track current values without causing effect re-runs
  const activeChatIdRef = useRef<string | null>(null);

  // Callbacks for new chat events - allows components to subscribe
  const newChatCallbacksRef = useRef<Set<NewChatCallback>>(new Set());

  // Callbacks for chat deleted events - allows components to subscribe
  const chatDeletedCallbacksRef = useRef<Set<ChatDeletedCallback>>(new Set());

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

  // Remove unread count for a deleted chat
  const removeUnreadCount = useCallback((chatId: string) => {
    setUnreadCounts((prev) => {
      const next = new Map(prev);
      next.delete(chatId);
      return next;
    });
  }, []);

  // Remove chat update entry for a deleted chat
  const removeChatUpdate = useCallback((chatId: string) => {
    setChatUpdates((prev) => {
      const next = new Map(prev);
      next.delete(chatId);
      return next;
    });
  }, []);

  /**
   * Handle incoming chat update from WebSocket
   * This is extracted to keep the effect clean and testable
   */
  const handleChatUpdate = useCallback((update: ChatUpdateEvent) => {
    const currentActiveChatId = activeChatIdRef.current;
    const isActiveChat = update.chatId === currentActiveChatId;

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

  /**
   * Handle incoming new chat from WebSocket (customer initiated conversation)
   */
  const handleNewChat = useCallback((chat: NewChatEvent) => {
    // Initialize unread count for the new chat
    setUnreadCounts((prev) => {
      const next = new Map(prev);
      next.set(chat.chatId, chat.unreadCount);
      return next;
    });

    // Notify all registered callbacks about the new chat
    newChatCallbacksRef.current.forEach((callback) => {
      try {
        callback(chat);
      } catch (error) {
        console.error("[ChatNotifications] Error in new chat callback:", error);
      }
    });

    // Play sound and show notification for new chat (always notify for new conversations)
    const currentSettings = settingsRef.current;

    if (currentSettings.soundEnabled) {
      playSoundRef.current();
    }

    if (currentSettings.browserNotificationsEnabled && isGrantedRef.current) {
      const senderName = chat.participantName || chat.participantPhone;
      const messagePreview = chat.lastMessage || "Started a new conversation";

      showNotificationRef.current({
        title: `New conversation from ${senderName}`,
        body: messagePreview,
        tag: `chat-${chat.chatId}`,
        data: {
          chatId: chat.chatId,
        },
      });
    }
  }, []);

  /**
   * Register a callback for new chat events
   * Returns a cleanup function to unregister the callback
   */
  const onNewChat = useCallback((callback: NewChatCallback): (() => void) => {
    newChatCallbacksRef.current.add(callback);
    return () => {
      newChatCallbacksRef.current.delete(callback);
    };
  }, []);

  /**
   * Handle incoming chat deleted from WebSocket
   * Cleans up local state and notifies registered callbacks
   */
  const handleChatDeleted = useCallback(
    (event: ChatDeletedEvent) => {
      // Remove unread count for the deleted chat
      removeUnreadCount(event.chatId);

      // Remove chat update entry
      removeChatUpdate(event.chatId);

      // Notify all registered callbacks about the deleted chat
      chatDeletedCallbacksRef.current.forEach((callback) => {
        try {
          callback(event);
        } catch (error) {
          console.error(
            "[ChatNotifications] Error in chat deleted callback:",
            error
          );
        }
      });
    },
    [removeUnreadCount, removeChatUpdate]
  );

  /**
   * Register a callback for chat deleted events
   * Returns a cleanup function to unregister the callback
   */
  const onChatDeleted = useCallback(
    (callback: ChatDeletedCallback): (() => void) => {
      chatDeletedCallbacksRef.current.add(callback);
      return () => {
        chatDeletedCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  // Store handlers in refs for the WebSocket effect
  const handleChatUpdateRef = useRef(handleChatUpdate);
  const handleNewMessageRef = useRef(handleNewMessage);
  const handleNewChatRef = useRef(handleNewChat);
  const handleChatDeletedRef = useRef(handleChatDeleted);
  useEffect(() => {
    handleChatUpdateRef.current = handleChatUpdate;
    handleNewMessageRef.current = handleNewMessage;
    handleNewChatRef.current = handleNewChat;
    handleChatDeletedRef.current = handleChatDeleted;
  }, [handleChatUpdate, handleNewMessage, handleNewChat, handleChatDeleted]);

  // Connect to WebSocket and listen for chat updates
  // This effect should only run once on mount and cleanup on unmount
  // Only connect if user is authenticated
  useEffect(() => {
    // Check if user is authenticated before connecting
    const isAuthenticated = TokenManager.isAccessTokenValid();

    if (!isAuthenticated) {
      return;
    }

    const newSocket = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      }
    );

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Listen for chat updates - use ref to always get latest handler
    newSocket.on("chat:update", (update: ChatUpdateEvent) => {
      handleChatUpdateRef.current(update);
    });

    // Listen for new messages - use ref to always get latest handler
    newSocket.on("message:new", (message: NewMessageEvent) => {
      handleNewMessageRef.current(message);
    });

    // Listen for new chats (customer initiated conversations) - use ref to always get latest handler
    newSocket.on("chat:new", (chat: NewChatEvent) => {
      handleNewChatRef.current(chat);
    });

    // Listen for chat deletions - use ref to always get latest handler
    newSocket.on("chat:deleted", (event: ChatDeletedEvent) => {
      handleChatDeletedRef.current(event);
    });

    return () => {
      // Firefox fix: Only disconnect if connection is open
      if (newSocket.connected) {
        newSocket.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
    };
  }, []); // Empty deps - socket connection is stable

  const contextValue = useMemo<ChatNotificationsContextValue>(
    () => ({
      unreadCounts,
      totalUnreadCount,
      updateUnreadCount,
      resetUnreadCount,
      setAllUnreadCounts,
      removeUnreadCount,
      chatUpdates,
      removeChatUpdate,
      isConnected,
      activeChatId,
      setActiveChatId,
      onNewChat,
      onChatDeleted,
      socket,
    }),
    [
      unreadCounts,
      totalUnreadCount,
      updateUnreadCount,
      resetUnreadCount,
      setAllUnreadCounts,
      removeUnreadCount,
      chatUpdates,
      removeChatUpdate,
      isConnected,
      activeChatId,
      setActiveChatId,
      onNewChat,
      onChatDeleted,
      socket,
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
